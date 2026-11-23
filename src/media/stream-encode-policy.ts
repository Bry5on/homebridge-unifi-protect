/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * stream-encode-policy.ts: the pure decisions of whether and how a live view's video is encoded, for UniFi Protect.
 *
 * Once the transport a live view draws from is settled (stream-source-policy.ts), a handful of questions remain before an FFmpeg command line can be assembled: whether
 * the video is re-encoded at all, what source channel to ask the camera for, and - when we do re-encode - the exact encoder parameters. Each is a small decision over
 * plain facts about the HomeKit request and the camera, so each lives here as a pure function - no `this`, no I/O - and every cell is exhaustively unit-testable with
 * constructed inputs, matching the pure-module voice of stream-source-policy.ts, livestream-recovery-policy.ts, and resolution.ts. The streaming delegate keeps the
 * impure half: the `this`-state reads that feed these, the channel selection itself, and the FFmpeg argument rendering that consumes the results.
 *
 * The results:
 *
 *   - TranscodeDecision: whether we re-encode, plus the high-latency reading of the connection that shapes the bitrate below.
 *   - ChannelRequest: the dimensions to hunt a source channel with, and the posture to select it under, higher for a transcode and nearest for copy mode. The
 *     delegate makes the selection call itself, and the host's source-pixel cap it applies with the higher posture alone is a hardware capability rather than a
 *     decision, so that read stays there too.
 *   - VideoEncodingDecision: either a copy of the camera's own stream (carrying whether the fMP4 input needs its Annex B bitstream conversion) or a full
 *     encoder-options bag for homebridge-plugin-utils to render, plus the target bitrate the streaming-request log reports either way. A portrait transcode that
 *     sends a larger frame than HomeKit asked for also carries the realized size the delegate narrates.
 *
 * Every bitrate this module accepts and returns is in kilobits per second. The camera's channel ceiling arrives from the controller in bits per second, so the delegate
 * converts before handing it over and the module stays unit-uniform.
 */
import type { H264Level, H264Profile, VideoEncoderOptions } from "homebridge-plugin-utils";
import { PROTECT_MAX_SOURCE_HEIGHT, PROTECT_MAX_SOURCE_WIDTH, PROTECT_PORTRAIT_LIVESTREAM_HIGH_LATENCY_MIN_HEIGHT, PROTECT_PORTRAIT_LIVESTREAM_MIN_HEIGHT }
  from "../settings.ts";
import type { ChannelBias } from "./resolution.ts";
import { HOMEKIT_IDR_INTERVAL } from "homebridge-plugin-utils";

// Whether this live view re-encodes the camera's video, and whether HomeKit negotiated a high-latency connection. The latency reading is returned alongside because the
// bitrate decision downstream consumes it, so it is derived once here rather than twice from the raw packet time.
export interface TranscodeDecision {

  isHighLatency: boolean;
  isTranscoding: boolean;
}

// What to ask the camera's channel selection for: the dimensions to match against, and the posture to select under - higher when transcoding, since an encoder wants
// a richer input than its target, and nearest in copy mode, which re-encodes nothing and so serves the channel closest to the request.
export interface ChannelRequest {

  bias: ChannelBias;
  height: number;
  width: number;
}

// How the video reaches HomeKit. A "copy" passes the camera's own encode through untouched, and `transmux` states that the input is the livestream API's fMP4 and needs
// the Annex B bitstream conversion on the way out; a "transcode" carries the full encoder-options bag. The FFmpeg tokens for either arm are rendered by the delegate -
// this module decides, it does not spell command lines.
export type VideoEncoding = { mode: "copy"; transmux: boolean } |
  { encoderOptions: VideoEncoderOptions; mode: "transcode" };

// The resolved encoding decision: how the video is encoded, plus the target bitrate in kbps. The bitrate sits alongside rather than inside the transcode arm because
// the streaming-request log reports it for every session, copy-mode ones included. A portrait transcode that sends a larger frame than HomeKit asked for also carries
// `portraitOutput`, the realized frame the delegate narrates; every other decision omits it.
export type VideoEncodingDecision = VideoEncoding & { portraitOutput?: { height: number; width: number }; targetBitrate: number };

/**
 * Resolve whether this live view's video is re-encoded, and read the connection's latency from the negotiated audio packet time. Pure and exhaustively testable.
 *
 * We transcode in the following circumstances:
 *
 *   1. The user has explicitly configured transcoding.
 *   2. The user has configured cropping for the video stream.
 *   3. We are on a high latency streaming session (e.g. cellular). If we're high latency, we'll transcode by default unless the user has asked us not to. Why? It
 *      generally results in a speedier experience, at the expense of some stream quality (HomeKit tends to request far lower bitrates than Protect is capable of
 *      producing).
 *   4. The codec in use on the Protect camera isn't H.264.
 *
 * How do we determine if we're a high latency connection? We look at the RTP packet time of the audio packet time for a hint. HomeKit uses values of 20, 30, 40, and
 * 60ms. We make an assumption, validated by lots of real-world testing, that when we see 60ms used by HomeKit, it's a high latency connection and act accordingly.
 *
 * @param input.crop                 - Whether the user has configured cropping for this camera's video stream.
 * @param input.packetTime           - The RTP audio packet time HomeKit negotiated for this session, in milliseconds.
 * @param input.transcode            - Whether the user has explicitly asked us to transcode this camera.
 * @param input.transcodeHighLatency - Whether high-latency transcoding is enabled for this camera.
 * @param input.videoCodec           - The camera's negotiated video codec; anything other than "h264" forces a transcode.
 *
 * @returns The resolved {@link TranscodeDecision}.
 */
export function resolveTranscodeDecision(input: { crop: boolean; packetTime: number; transcode: boolean; transcodeHighLatency: boolean;
  videoCodec: string; }): TranscodeDecision {

  const isHighLatency = input.packetTime >= 60;

  return {

    isHighLatency,
    isTranscoding: input.transcode || input.crop || (isHighLatency && input.transcodeHighLatency) || (input.videoCodec !== "h264")
  };
}

/**
 * Resolve the source channel to hunt for: the dimensions to match against, and the posture to select under. Pure and exhaustively testable.
 *
 * A transcode selects under the higher posture, the smallest channel at or over the dimensions, because an encoder fed a richer source produces the better stream.
 * When the live encode runs on the host's hardware encoder we hunt the highest-quality source the pipeline can ingest, at PROTECT_MAX_SOURCE_WIDTH by
 * PROTECT_MAX_SOURCE_HEIGHT, because fixed-function encoders perform better with higher-bitrate sources; a software encode is fed a source matched to the requested
 * resolution instead, so the CPU cost tracks what HomeKit actually asked for. A copy-mode session selects under the nearest posture at the requested dimensions:
 * nothing is re-encoded, so the stream HomeKit receives untouched should be the channel whose pixel count is closest to what it asked for.
 *
 * The delegate applies the host's source-pixel cap with the higher posture alone, because hunting a rich source under whatever ceiling this host's encoder can ingest is
 * one posture rather than two independent choices, and a copy-mode stream feeds no encoder for the ceiling to protect.
 *
 * @param input.isTranscoding       - Whether this session re-encodes the video, from {@link resolveTranscodeDecision}.
 * @param input.requestHeight       - The frame height HomeKit requested, in pixels.
 * @param input.requestWidth        - The frame width HomeKit requested, in pixels.
 * @param input.usesHardwareEncoder - Whether this host encodes live video on hardware.
 *
 * @returns The resolved {@link ChannelRequest}.
 */
export function resolveChannelRequest(input: { isTranscoding: boolean; requestHeight: number; requestWidth: number; usesHardwareEncoder: boolean }): ChannelRequest {

  const wantsRichestSource = input.isTranscoding && input.usesHardwareEncoder;

  return {

    bias: input.isTranscoding ? "higher" : "nearest",
    height: wantsRichestSource ? PROTECT_MAX_SOURCE_HEIGHT : input.requestHeight,
    width: wantsRichestSource ? PROTECT_MAX_SOURCE_WIDTH : input.requestWidth
  };
}

/**
 * Resolve how this live view's video reaches HomeKit - copied straight from the camera, or re-encoded under a full set of encoder options - and the bitrate we target
 * either way. Pure and exhaustively testable.
 *
 * The ordered decision:
 *
 *   1. Target bitrate, seeded from what HomeKit asked for. A transcode honors the user's configured transcode bitrate when they have set one (the high-latency bitrate
 *      on a high-latency session), then comes down to the input channel's own ceiling if it is above it - we cannot produce more bitrate than the source carries. A
 *      copy passes the request through untouched, since the camera's own encode is what it is.
 *   2. The output frame rate: the lower of the source channel's rate and the rate HomeKit asked for. A camera slower than the request is sent at its own rate rather
 *      than raised to HomeKit's, because the only way to raise a frame rate here is to repeat frames, and repeated frames stay on screen for uneven lengths of time...a
 *      20 fps camera padded to 30 shows its frames for 33 and 67 milliseconds by turns. A camera faster than the request has frames dropped to meet it. A raised
 *      portrait frame takes this same paced rate. The rate is not chosen again for that frame, and no interpolation filters are added.
 *   3. The encoding itself. A transcode composes the encoder-options bag homebridge-plugin-utils renders at that output rate, the same bag whichever transport feeds
 *      it, because the delegate hands FFmpeg a buffer-backed session's input one frame at a time. A copy reports only whether the input needs transmuxing.
 *   4. Portrait output, and only on a transcode. HomeKit typically asks for a landscape frame. Fitting a portrait camera such as the Doorbell Lite (1504x2016) inside
 *      that box produces a tiny frame the Home app then enlarges. On Apple Silicon, when this host's hardware encoder is doing the transcode and the user has not
 *      configured a crop, the fit box is raised to a minimum height (1080, or 720 for a high-latency client) and capped at the source, so we never enlarge. The box is
 *      the realized frame on both axes: homebridge-plugin-utils fits inside the requested width and height together, so a narrow request width would otherwise pinch
 *      the taller frame. The encoder stays in the quality-constrained mode it uses for every other transcode.
 *
 * @param input.channelBitrate              - The selected source channel's bitrate ceiling, in kbps; the delegate converts it from the controller's bits per second.
 * @param input.channelFps                  - The selected source channel's frame rate.
 * @param input.channelHeight               - The selected source channel's frame height, in pixels.
 * @param input.channelWidth                - The selected source channel's frame width, in pixels.
 * @param input.crop                        - Whether the user has configured cropping for this camera's video stream.
 * @param input.hostSystem                  - The host platform; only "macOS.Apple" admits the portrait height floor.
 * @param input.isHighLatency               - Whether HomeKit negotiated a high-latency session, from {@link resolveTranscodeDecision}.
 * @param input.isTranscoding               - Whether this session re-encodes the video, from {@link resolveTranscodeDecision}.
 * @param input.requestBitrate              - The maximum bitrate HomeKit requested, in kbps.
 * @param input.requestFps                  - The frame rate HomeKit requested.
 * @param input.requestHeight               - The frame height HomeKit requested, in pixels.
 * @param input.requestLevel                - The H.264 level HomeKit requested.
 * @param input.requestProfile              - The H.264 profile HomeKit requested.
 * @param input.requestWidth                - The frame width HomeKit requested, in pixels.
 * @param input.transcodeBitrate            - The user's configured transcode bitrate, in kbps; zero leaves HomeKit's request in place.
 * @param input.transcodeHighLatencyBitrate - The user's configured high-latency transcode bitrate, in kbps; zero leaves HomeKit's request in place.
 * @param input.useTsb                      - Whether this session draws from the timeshift buffer's pooled fMP4 socket rather than direct RTSP.
 * @param input.usesHardwareEncoder         - Whether this host encodes live video on hardware.
 * @param input.videoCodec                  - The camera's source video codec, carried in the transcode bag so FFmpeg's decoder and encoder read one pipeline description.
 *
 * @returns The resolved {@link VideoEncodingDecision}.
 */
export function resolveVideoEncoding(input: { channelBitrate: number; channelFps: number; channelHeight: number; channelWidth: number; crop: boolean;
  hostSystem: string; isHighLatency: boolean; isTranscoding: boolean; requestBitrate: number; requestFps: number; requestHeight: number;
  requestLevel: H264Level; requestProfile: H264Profile; requestWidth: number; transcodeBitrate: number; transcodeHighLatencyBitrate: number; useTsb: boolean;
  usesHardwareEncoder: boolean; videoCodec: string; }): VideoEncodingDecision {

  // 1. Set the initial bitrate we should use for this request based on what HomeKit is requesting.
  let targetBitrate = input.requestBitrate;

  if(input.isTranscoding) {

    // If we have specified the bitrates we want to use when transcoding, let's honor those here.
    if(input.isHighLatency && (input.transcodeHighLatencyBitrate > 0)) {

      targetBitrate = input.transcodeHighLatencyBitrate;
    } else if(!input.isHighLatency && (input.transcodeBitrate > 0)) {

      targetBitrate = input.transcodeBitrate;
    }

    // If we're targeting a bitrate that's beyond the capabilities of our input channel, match the bitrate of the input channel.
    if(targetBitrate > input.channelBitrate) {

      targetBitrate = input.channelBitrate;
    }
  }

  // 2. Settle the output frame rate. See the ordered decision above for why a camera slower than HomeKit's request keeps its own rate. A raised portrait frame takes
  // this same paced rate; the portrait decision below chooses a size, not a rate.
  const outputFps = Math.min(input.channelFps, input.requestFps);

  // 3. Copy the camera's stream through when we are not transcoding; the livestream API's fMP4 is the one input that needs transmuxing on the way out.
  if(!input.isTranscoding) {

    return { mode: "copy", targetBitrate, transmux: input.useTsb };
  }

  // 4. Portrait output. See the ordered decision above. The size, when one is returned, replaces both axes of the fit box. The paced rate from step 2 is unchanged.
  const portrait = portraitLivestream(input);

  return {

    encoderOptions: {

      bitrate: targetBitrate,
      fps: outputFps,
      height: portrait?.height ?? input.requestHeight,
      idrInterval: HOMEKIT_IDR_INTERVAL,
      inputCodec: input.videoCodec,
      inputFps: input.channelFps,
      level: input.requestLevel,
      profile: input.requestProfile,
      width: portrait?.width ?? input.requestWidth
    },
    mode: "transcode",
    ...(portrait ? { portraitOutput: portrait } : {}),
    targetBitrate
  };
}

// The width of a frame `outputHeight` tall that keeps the source aspect ratio, rounded to a multiple of two the way the fit scaler's even-pixel rounding does. This is
// both the width the portrait log reports and the width of the fit box, so the scaler is not pinched by a narrower request.
function evenScaledWidth(sourceWidth: number, sourceHeight: number, outputHeight: number): number {

  return Math.round((sourceWidth * outputHeight) / (sourceHeight * 2)) * 2;
}

// The fit box for a portrait livestream that is sent larger than HomeKit asked for. Undefined when the request passes through unchanged.
//
// The floor applies only when we are transcoding a portrait source on Apple Silicon's hardware encoder with no crop configured. Everywhere else the request passes
// through and nothing is narrated. The aim is the greater of the requested height and the floor; the realized height is that aim capped at the source, which is what
// keeps a short source from being enlarged. A realized frame no taller than the request is not a raise. The frame rate is not decided here: the paced rate applies to
// this frame and to every other transcode alike.
function portraitLivestream(input: { channelHeight: number; channelWidth: number; crop: boolean; hostSystem: string; isHighLatency: boolean; requestHeight: number;
  usesHardwareEncoder: boolean; }): { height: number; width: number } | undefined {

  const qualifies = !input.crop && (input.hostSystem === "macOS.Apple") && input.usesHardwareEncoder && (input.channelHeight > input.channelWidth);

  if(!qualifies) {

    return undefined;
  }

  const floor = input.isHighLatency ? PROTECT_PORTRAIT_LIVESTREAM_HIGH_LATENCY_MIN_HEIGHT : PROTECT_PORTRAIT_LIVESTREAM_MIN_HEIGHT;
  const realizedHeight = Math.min(Math.max(input.requestHeight, floor), input.channelHeight);

  if(realizedHeight <= input.requestHeight) {

    return undefined;
  }

  return { height: realizedHeight, width: evenScaledWidth(input.channelWidth, input.channelHeight, realizedHeight) };
}
