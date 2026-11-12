/* Copyright(C) 2017-2026, HJD (https://github.com/hjdhjd). All rights reserved.
 *
 * stream-encode-policy.test.ts: Exhaustive red-green coverage of the pure transcode, channel-request, and video-encoding decisions.
 *
 * Each is a pure function - no `this`, no I/O - so every cell is provable against constructed inputs, the property that makes pure decision modules exhaustively
 * testable in a way `this`-bound logic is not. The transcode table walks each circumstance that forces a re-encode and the high-latency packet-time boundary; the
 * channel-request table walks the transcode and hardware-encoder axes; the encoding table walks the bitrate hints, the channel ceiling, the copy-mode transmux,
 * every axis of the interpolation predicate, and the portrait height floor.
 */
import { H264Level, H264Profile, HOMEKIT_IDR_INTERVAL } from "homebridge-plugin-utils";
import { PROTECT_MAX_SOURCE_HEIGHT, PROTECT_MAX_SOURCE_WIDTH, PROTECT_PORTRAIT_LIVESTREAM_HIGH_LATENCY_MIN_HEIGHT, PROTECT_PORTRAIT_LIVESTREAM_MIN_HEIGHT }
  from "../settings.ts";
import { describe, test } from "node:test";
import { resolveChannelRequest, resolveTranscodeDecision, resolveVideoEncoding } from "./stream-encode-policy.ts";
import type { VideoEncoderOptions } from "homebridge-plugin-utils";
import assert from "node:assert/strict";

// The neutral transcode input: no configured transcode or crop, a low-latency session with high-latency transcoding available, on an H.264 camera. Each test overrides
// only the axes it exercises, so the single variable per cell is the input under test.
function transcodeInput(overrides: Partial<Parameters<typeof resolveTranscodeDecision>[0]> = {}): Parameters<typeof resolveTranscodeDecision>[0] {

  return { crop: false, packetTime: 30, transcode: false, transcodeHighLatency: true, videoCodec: "h264", ...overrides };
}

// The neutral channel-request input: a copy-mode session on a software host, asking for 1920x1080. The requested dimensions are deliberately unequal to the
// maximum-source constants, so a cell that returns the wrong pair is always distinguishable.
function channelInput(overrides: Partial<Parameters<typeof resolveChannelRequest>[0]> = {}): Parameters<typeof resolveChannelRequest>[0] {

  return { isTranscoding: false, requestHeight: 1080, requestWidth: 1920, usesHardwareEncoder: false, ...overrides };
}

// The neutral encoding input: a copy-mode direct-RTSP session on a plain Linux host, HomeKit asking for 1920x1080@30 at 3000 kbps, fed by a 1920x1080 30 fps channel
// whose own ceiling of 6000 kbps sits above the request, from an H.264 camera, with no configured transcode bitrates and no crop. The source is landscape and the
// encoder is software, so the portrait floor stays off unless a test turns it on. Every bitrate here is in kbps.
function encodingInput(overrides: Partial<Parameters<typeof resolveVideoEncoding>[0]> = {}): Parameters<typeof resolveVideoEncoding>[0] {

  return { channelBitrate: 6000, channelFps: 30, channelHeight: 1080, channelWidth: 1920, cpuGeneration: 0, crop: false, hostSystem: "linux", isHighLatency: false,
    isPackageCamera: false, isTranscoding: false, requestBitrate: 3000, requestFps: 30, requestHeight: 1080, requestLevel: H264Level.LEVEL4_0,
    requestProfile: H264Profile.MAIN, requestWidth: 1920, transcodeBitrate: 0, transcodeHighLatencyBitrate: 0, useTsb: false, usesHardwareEncoder: false,
    videoCodec: "h264", ...overrides };
}

// The encoder-options bag the neutral encoding input is expected to produce once transcoding is on: HomeKit's request in full, the camera's H.264 source codec, the
// channel's frame rate as the declared input rate, the HomeKit I-frame interval, and no filters. These are hand-written expectations, not a mirror of the policy - each
// test spreads the one field its axis moves, so every assertion below stays a whole-result comparison.
function transcodeBag(overrides: Partial<VideoEncoderOptions> = {}): VideoEncoderOptions {

  return { bitrate: 3000, fps: 30, height: 1080, idrInterval: HOMEKIT_IDR_INTERVAL, inputCodec: "h264", inputFps: 30, level: H264Level.LEVEL4_0,
    profile: H264Profile.MAIN, width: 1920, ...overrides };
}

describe("resolveTranscodeDecision - the circumstances that force a re-encode", () => {

  test("a plain H.264 low-latency session with no configured hints copies the stream through", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput()), { isHighLatency: false, isTranscoding: false });
  });

  test("the explicit transcode hint forces a re-encode", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ transcode: true })), { isHighLatency: false, isTranscoding: true });
  });

  test("the crop hint forces a re-encode", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ crop: true })), { isHighLatency: false, isTranscoding: true });
  });

  test("a camera that is not encoding in H.264 forces a re-encode", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ videoCodec: "av1" })), { isHighLatency: false, isTranscoding: true });
  });

  test("an H.264 camera leaves the codec circumstance off", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ videoCodec: "h264" })), { isHighLatency: false, isTranscoding: false });
  });
});

describe("resolveTranscodeDecision - the high-latency packet-time boundary", () => {

  test("a 60ms packet time reads as high latency and transcodes when high-latency transcoding is enabled", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ packetTime: 60, transcodeHighLatency: true })), { isHighLatency: true, isTranscoding: true });
  });

  test("a 40ms packet time stays below the boundary and does not transcode", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ packetTime: 40, transcodeHighLatency: true })), { isHighLatency: false, isTranscoding: false });
  });

  test("a high-latency session with high-latency transcoding turned off still reads as high latency but does not transcode", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ packetTime: 60, transcodeHighLatency: false })), { isHighLatency: true, isTranscoding: false });
  });

  test("a low-latency session with high-latency transcoding turned off does not transcode", () => {

    assert.deepEqual(resolveTranscodeDecision(transcodeInput({ packetTime: 40, transcodeHighLatency: false })), { isHighLatency: false, isTranscoding: false });
  });
});

describe("resolveChannelRequest - the transcode and hardware-encoder axes", () => {

  test("transcoding on a hardware encoder hunts the richest source we ever ask for, biased higher", () => {

    assert.deepEqual(resolveChannelRequest(channelInput({ isTranscoding: true, usesHardwareEncoder: true })),
      { biasHigher: true, height: PROTECT_MAX_SOURCE_HEIGHT, width: PROTECT_MAX_SOURCE_WIDTH });
  });

  test("transcoding in software asks for the HomeKit dimensions, still biased higher", () => {

    assert.deepEqual(resolveChannelRequest(channelInput({ isTranscoding: true, usesHardwareEncoder: false })), { biasHigher: true, height: 1080, width: 1920 });
  });

  test("a copy-mode session asks for the HomeKit dimensions with no bias, on either kind of host", () => {

    assert.deepEqual(resolveChannelRequest(channelInput({ isTranscoding: false, usesHardwareEncoder: true })), { biasHigher: false, height: 1080, width: 1920 });
    assert.deepEqual(resolveChannelRequest(channelInput({ isTranscoding: false, usesHardwareEncoder: false })), { biasHigher: false, height: 1080, width: 1920 });
  });
});

describe("resolveVideoEncoding - copy mode", () => {

  test("a direct-RTSP session copies the stream with no transmux and passes HomeKit's bitrate through", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ useTsb: false })), { mode: "copy", targetBitrate: 3000, transmux: false });
  });

  test("a buffer-backed session copies the stream and asks for the transmux the fMP4 input needs", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ useTsb: true })), { mode: "copy", targetBitrate: 3000, transmux: true });
  });

  test("a copy-mode session never comes down to the channel's ceiling, even asking for more than the channel carries", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ channelBitrate: 1000, isTranscoding: false, requestBitrate: 3000 })),
      { mode: "copy", targetBitrate: 3000, transmux: false });
  });

  test("a copy-mode session ignores the configured transcode bitrates entirely", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isTranscoding: false, transcodeBitrate: 500, transcodeHighLatencyBitrate: 250 })),
      { mode: "copy", targetBitrate: 3000, transmux: false });
  });
});

describe("resolveVideoEncoding - the transcode bag", () => {

  test("a baseline transcode carries HomeKit's request, the channel's input frame rate, and no filters", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isTranscoding: true })), { encoderOptions: transcodeBag(), mode: "transcode", targetBitrate: 3000 });
  });

  test("HomeKit's requested level, profile, and dimensions pass through to the encoder untouched", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isTranscoding: true, requestHeight: 720, requestLevel: H264Level.LEVEL3_1,
      requestProfile: H264Profile.BASELINE, requestWidth: 1280 })),
    { encoderOptions: transcodeBag({ height: 720, level: H264Level.LEVEL3_1, profile: H264Profile.BASELINE, width: 1280 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("the source channel's frame rate is what the encoder is told it is fed, independent of the rate HomeKit asked for", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ channelFps: 15, isTranscoding: true, requestFps: 30 })),
      { encoderOptions: transcodeBag({ inputFps: 15 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("the camera's source codec is the input codec the transcode bag describes, and a copy's result is the same whatever the codec", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isTranscoding: true, videoCodec: "hevc" })),
      { encoderOptions: transcodeBag({ inputCodec: "hevc" }), mode: "transcode", targetBitrate: 3000 });
    assert.deepEqual(resolveVideoEncoding(encodingInput({ isTranscoding: false, videoCodec: "hevc" })), { mode: "copy", targetBitrate: 3000, transmux: false });
  });
});

describe("resolveVideoEncoding - the bitrate hints and the channel's ceiling", () => {

  test("the configured transcode bitrate overrides HomeKit's request on a low-latency session", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isTranscoding: true, transcodeBitrate: 2000 })),
      { encoderOptions: transcodeBag({ bitrate: 2000 }), mode: "transcode", targetBitrate: 2000 });
  });

  test("the configured high-latency bitrate overrides HomeKit's request on a high-latency session", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isHighLatency: true, isTranscoding: true, transcodeBitrate: 2000, transcodeHighLatencyBitrate: 1000 })),
      { encoderOptions: transcodeBag({ bitrate: 1000 }), mode: "transcode", targetBitrate: 1000 });
  });

  test("each configured bitrate applies only to its own latency class", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isHighLatency: false, isTranscoding: true, transcodeHighLatencyBitrate: 1000 })),
      { encoderOptions: transcodeBag(), mode: "transcode", targetBitrate: 3000 });
    assert.deepEqual(resolveVideoEncoding(encodingInput({ isHighLatency: true, isTranscoding: true, transcodeBitrate: 2000 })),
      { encoderOptions: transcodeBag(), mode: "transcode", targetBitrate: 3000 });
  });

  test("a zero configured bitrate is no configuration at all and leaves HomeKit's request in place", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ isTranscoding: true, transcodeBitrate: 0 })),
      { encoderOptions: transcodeBag(), mode: "transcode", targetBitrate: 3000 });
    assert.deepEqual(resolveVideoEncoding(encodingInput({ isHighLatency: true, isTranscoding: true, transcodeHighLatencyBitrate: 0 })),
      { encoderOptions: transcodeBag(), mode: "transcode", targetBitrate: 3000 });
  });

  test("a target above the channel's own ceiling comes down to it", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ channelBitrate: 1500, isTranscoding: true, requestBitrate: 3000 })),
      { encoderOptions: transcodeBag({ bitrate: 1500 }), mode: "transcode", targetBitrate: 1500 });
  });

  test("a target already within the channel's ceiling is left alone", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ channelBitrate: 6000, isTranscoding: true, requestBitrate: 3000 })),
      { encoderOptions: transcodeBag(), mode: "transcode", targetBitrate: 3000 });
  });

  test("the ceiling applies to a configured bitrate too, not only to HomeKit's request", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ channelBitrate: 1500, isTranscoding: true, transcodeBitrate: 2500 })),
      { encoderOptions: transcodeBag({ bitrate: 1500 }), mode: "transcode", targetBitrate: 1500 });
  });
});

describe("resolveVideoEncoding - the interpolation predicate", () => {

  // The interpolating population: riding the timeshift buffer, on M3-or-later Apple Silicon, and not the low-frame-rate package camera. The channel's frame rate is
  // deliberately below the requested rate throughout, so an interpolating cell and a plain one are always distinguishable by the encoder's declared output rate.
  const interpolating = { channelFps: 15, cpuGeneration: 3, hostSystem: "macOS.Apple", isPackageCamera: false, isTranscoding: true, requestFps: 30, useTsb: true };

  test("the interpolating population is handed the fps and minterpolate filters and takes its output rate from the channel", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput(interpolating)), {

      encoderOptions: transcodeBag({ fps: 15, inputFps: 15,
        videoFilters: [ "fps=30", "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me=fss:me_mode=bidir:vsbmc=1:scd=none" ] }),
      mode: "transcode",
      targetBitrate: 3000
    });
  });

  test("the package camera is excluded - its frame rate is too low for the filter to pay for itself", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ ...interpolating, isPackageCamera: true })),
      { encoderOptions: transcodeBag({ inputFps: 15 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("an earlier Apple Silicon generation is excluded", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ ...interpolating, cpuGeneration: 2 })),
      { encoderOptions: transcodeBag({ inputFps: 15 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("a host that is not Apple Silicon is excluded, whatever its generation reads as", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ ...interpolating, hostSystem: "macOS.Intel" })),
      { encoderOptions: transcodeBag({ inputFps: 15 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("a direct-RTSP session is excluded - interpolation rides the timeshift buffer only", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ ...interpolating, useTsb: false })),
      { encoderOptions: transcodeBag({ inputFps: 15 }), mode: "transcode", targetBitrate: 3000 });
  });
});

describe("resolveVideoEncoding - portrait livestreams", () => {

  // A UniFi Protect Doorbell Lite channel, 1504x2016 at 24 fps, transcoded on Apple Silicon's hardware encoder with no crop. HomeKit's request is filled in per test.
  // The two height floors are pinned to the values the Home app was tuned against: 1080 low-latency (806x1080) and 720 high-latency (538x720).
  function doorbell(overrides: Partial<Parameters<typeof resolveVideoEncoding>[0]> = {}): Parameters<typeof resolveVideoEncoding>[0] {

    return encodingInput({

      channelFps: 24,
      channelHeight: 2016,
      channelWidth: 1504,
      hostSystem: "macOS.Apple",
      isTranscoding: true,
      requestFps: 30,
      usesHardwareEncoder: true,
      ...overrides
    });
  }

  test("the portrait height floors are 1080, and 720 for a high-latency client", () => {

    assert.equal(PROTECT_PORTRAIT_LIVESTREAM_MIN_HEIGHT, 1080);
    assert.equal(PROTECT_PORTRAIT_LIVESTREAM_HIGH_LATENCY_MIN_HEIGHT, 720);
  });

  test("a 1280x720 request and a 640x360 request both aim at 806x1080, at the camera's 24 fps, with average bitrate", () => {

    for(const request of [ { height: 720, width: 1280 }, { height: 360, width: 640 } ]) {

      assert.deepEqual(resolveVideoEncoding(doorbell({ requestHeight: request.height, requestWidth: request.width })), {

        encoderOptions: transcodeBag({ fps: 24, height: 1080, inputFps: 24, smartQuality: false, width: request.width }),
        mode: "transcode",
        portraitOutput: { height: 1080, width: 806 },
        targetBitrate: 3000
      });
    }
  });

  test("a high-latency 320x240 request aims at 538x720 and keeps the high-latency bitrate", () => {

    assert.deepEqual(resolveVideoEncoding(doorbell({ isHighLatency: true, requestHeight: 240, requestWidth: 320, transcodeHighLatencyBitrate: 1000 })), {

      encoderOptions: transcodeBag({ bitrate: 1000, fps: 24, height: 720, inputFps: 24, smartQuality: false, width: 320 }),
      mode: "transcode",
      portraitOutput: { height: 720, width: 538 },
      targetBitrate: 1000
    });
  });

  test("a request already at the floor is not upsized, and a high-latency request already at 720 is not either", () => {

    assert.deepEqual(resolveVideoEncoding(doorbell({ requestHeight: 1080, requestWidth: 1920 })),
      { encoderOptions: transcodeBag({ height: 1080, inputFps: 24, width: 1920 }), mode: "transcode", targetBitrate: 3000 });

    assert.deepEqual(resolveVideoEncoding(doorbell({ isHighLatency: true, requestHeight: 720, requestWidth: 1280 })),
      { encoderOptions: transcodeBag({ height: 720, inputFps: 24, width: 1280 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("the realized frame is capped at the source height, so a short portrait source is never upscaled", () => {

    // 600x900 is portrait and shorter than the 1080 floor, but taller than the 360 request, so we upsize only as far as the source.
    assert.deepEqual(resolveVideoEncoding(doorbell({ channelHeight: 900, channelWidth: 600, requestHeight: 360, requestWidth: 640 })), {

      encoderOptions: transcodeBag({ fps: 24, height: 1080, inputFps: 24, smartQuality: false, width: 640 }),
      mode: "transcode",
      portraitOutput: { height: 900, width: 600 },
      targetBitrate: 3000
    });

    // A source shorter than the request is not an upsize. The encoder is still aimed at the floor; the scaler's min(ih, height) is what keeps it from growing.
    assert.deepEqual(resolveVideoEncoding(doorbell({ channelHeight: 500, channelWidth: 400, requestHeight: 720, requestWidth: 1280 })),
      { encoderOptions: transcodeBag({ height: 1080, inputFps: 24, width: 1280 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("a source frame rate above the request is not raised, and a zero source frame rate keeps the request", () => {

    assert.deepEqual(resolveVideoEncoding(doorbell({ channelFps: 40, requestHeight: 360, requestWidth: 640 })), {

      encoderOptions: transcodeBag({ fps: 30, height: 1080, inputFps: 40, smartQuality: false, width: 640 }),
      mode: "transcode",
      portraitOutput: { height: 1080, width: 806 },
      targetBitrate: 3000
    });

    assert.deepEqual(resolveVideoEncoding(doorbell({ channelFps: 0, requestHeight: 360, requestWidth: 640 })), {

      encoderOptions: transcodeBag({ fps: 30, height: 1080, inputFps: 0, smartQuality: false, width: 640 }),
      mode: "transcode",
      portraitOutput: { height: 1080, width: 806 },
      targetBitrate: 3000
    });
  });

  test("a landscape camera on the same Apple Silicon hardware encoder is unchanged", () => {

    assert.deepEqual(resolveVideoEncoding(encodingInput({ hostSystem: "macOS.Apple", isTranscoding: true, requestHeight: 360, requestWidth: 640,
      usesHardwareEncoder: true })),
    { encoderOptions: transcodeBag({ height: 360, width: 640 }), mode: "transcode", targetBitrate: 3000 });
  });

  test("a portrait source encoded in software, on a non-Apple host, or with a crop configured is unchanged", () => {

    const request = { requestHeight: 360, requestWidth: 640 };
    const unchanged = { encoderOptions: transcodeBag({ height: 360, inputFps: 24, width: 640 }), mode: "transcode" as const, targetBitrate: 3000 };

    assert.deepEqual(resolveVideoEncoding(doorbell({ ...request, usesHardwareEncoder: false })), unchanged);
    assert.deepEqual(resolveVideoEncoding(doorbell({ ...request, hostSystem: "linux" })), unchanged);
    assert.deepEqual(resolveVideoEncoding(doorbell({ ...request, crop: true })), unchanged);
  });

  test("a copy-mode session of a portrait source is still a copy", () => {

    assert.deepEqual(resolveVideoEncoding(doorbell({ isTranscoding: false })), { mode: "copy", targetBitrate: 3000, transmux: false });
  });

  test("the minterpolate path keeps its channel frame rate and filters when a portrait source is upsized", () => {

    // Channel fps sits above the request so a portrait native-fps choice (min of the two) would be distinguishable from interpolation's channel rate.
    const upsized = doorbell({ channelFps: 40, cpuGeneration: 3, requestHeight: 360, requestWidth: 640, useTsb: true });
    const filters = [ "fps=30", "minterpolate=fps=30:mi_mode=mci:mc_mode=aobmc:me=fss:me_mode=bidir:vsbmc=1:scd=none" ];

    assert.deepEqual(resolveVideoEncoding(upsized), {

      encoderOptions: transcodeBag({ fps: 40, height: 1080, inputFps: 40, smartQuality: false, videoFilters: filters, width: 640 }),
      mode: "transcode",
      portraitOutput: { height: 1080, width: 806 },
      targetBitrate: 3000
    });

    // An M1 (generation 1) does not interpolate. The same portrait source takes the native frame rate and no minterpolate filters.
    assert.deepEqual(resolveVideoEncoding(doorbell({ channelFps: 40, cpuGeneration: 1, requestHeight: 360, requestWidth: 640, useTsb: true })), {

      encoderOptions: transcodeBag({ fps: 30, height: 1080, inputFps: 40, smartQuality: false, width: 640 }),
      mode: "transcode",
      portraitOutput: { height: 1080, width: 806 },
      targetBitrate: 3000
    });
  });

  test("a package camera is still upsized, and still excluded from interpolation", () => {

    assert.deepEqual(resolveVideoEncoding(doorbell({ cpuGeneration: 3, isPackageCamera: true, requestHeight: 360, requestWidth: 640, useTsb: true })), {

      encoderOptions: transcodeBag({ fps: 24, height: 1080, inputFps: 24, smartQuality: false, width: 640 }),
      mode: "transcode",
      portraitOutput: { height: 1080, width: 806 },
      targetBitrate: 3000
    });
  });
});
