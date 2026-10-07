import type { Nullable } from "homebridge-plugin-utils";
import type { ProtectCameraChannelConfig } from "unifi-protect";
import type { Resolution } from "homebridge";
import { createHash } from "node:crypto";

export interface ChannelProfile {

  channel: ProtectCameraChannelConfig;
  lens?: number;
  name: string;
  resolution: Resolution;
  url: string;
}

export const RESOLUTIONS_4X3: readonly (readonly [number, number])[] =
  [ [ 3840, 2880 ], [ 2560, 1920 ], [ 1920, 1440 ], [ 1280, 960 ], [ 1024, 768 ], [ 640, 480 ], [ 480, 360 ], [ 320, 240 ] ];

export const RESOLUTIONS_16X9: readonly (readonly [number, number])[] =
  [ [ 3840, 2160 ], [ 2560, 1440 ], [ 1920, 1080 ], [ 1280, 720 ], [ 640, 360 ], [ 480, 270 ], [ 320, 180 ] ];

export const PACKAGE_CHANNEL_NAME = "Package Camera";

export type SelectRequest = { mode: "name"; name: string } |
  { bias: "higher" | "lower"; height: number; mode: "nearest"; width: number };

export function is4x3AspectRatio(width: number, height: number): boolean {

  const maxDim = Math.max(width, height);
  const minDim = Math.min(width, height);

  return Math.abs((maxDim / minDim) - (4 / 3)) < 0.03;
}

export function isPortraitResolution(width: number, height: number): boolean {

  return width < height;
}

export function longEdge(width: number, height: number): number {

  return Math.max(width, height);
}

export function sortByResolutions(a: ChannelProfile, b: ChannelProfile): number {

  if(a.resolution[0] < b.resolution[0]) {

    return 1;
  }

  if(a.resolution[0] > b.resolution[0]) {

    return -1;
  }

  if(a.resolution[1] < b.resolution[1]) {

    return 1;
  }

  if(a.resolution[1] > b.resolution[1]) {

    return -1;
  }

  if(a.resolution[2] < b.resolution[2]) {

    return 1;
  }

  if(a.resolution[2] > b.resolution[2]) {

    return -1;
  }

  return 0;
}

export function formatResolution(resolution: Resolution): string {

  return resolution[0].toString() + "x" + resolution[1].toString() + "@" + resolution[2].toString() + "fps";
}

export function rtspUrl(channel: ProtectCameraChannelConfig, urlHost: string, rtspPort: number, secure = true): string {

  return (secure ? "rtsps://" : "rtsp://") + urlHost + ":" + rtspPort.toString() + "/" + channel.rtspAlias + (secure ? "?enableSrtp" : "");
}

export function isPackageChannel(channel: ProtectCameraChannelConfig): boolean {

  return channel.name === PACKAGE_CHANNEL_NAME;
}

export function isPrimaryChannel(channel: ProtectCameraChannelConfig): boolean {

  return channel.isRtspEnabled && !isPackageChannel(channel);
}

export function buildChannelProfile(channel: ProtectCameraChannelConfig, options: { lens?: number; rtspPort: number; urlHost: string }): ChannelProfile {

  const entry: ChannelProfile = {

    channel: channel,
    name: formatResolution([ channel.width, channel.height, channel.fps ]) + " (" + channel.name + ")",
    resolution: [ channel.width, channel.height, channel.fps ],
    url: rtspUrl(channel, options.urlHost, options.rtspPort)
  };

  if(options.lens !== undefined) {

    entry.lens = options.lens;
  }

  return entry;
}

// Apple's 3:4 portrait streaming tiers (HomeKit Secure Video Open Source Compatibility Guide, "Minimum Requirements"): 1536x2048, 1200x1600, 960x1280, 480x640. The
// swapped 4:3 table already covers 960x1280 and 480x640; these fill in the rest. 1200x1600 is also the native resolution of the Logitech Circle View Doorbell.
export const PORTRAIT_3X4_TIERS: readonly (readonly [number, number])[] = [ [ 1536, 2048 ], [ 1200, 1600 ] ];

export function resolutionTableFor(nativeTop: Resolution): readonly (readonly [number, number])[] {

  const is4x3 = is4x3AspectRatio(nativeTop[0], nativeTop[1]);
  const table = is4x3 ? RESOLUTIONS_4X3 : RESOLUTIONS_16X9;

  if(!isPortraitResolution(nativeTop[0], nativeTop[1])) {

    return table;
  }

  const portrait = table.map(([ width, height ]) => [ height, width ] as const);

  return is4x3 ? [ ...portrait, ...PORTRAIT_3X4_TIERS ].sort((a, b) => (b[1] - a[1])) : portrait;
}

export function isMandatedOrUnderTop(candidate: Resolution, currentTop: Resolution): boolean {

  return (longEdge(candidate[0], candidate[1]) < longEdge(currentTop[0], currentTop[1])) || [ 1920, 1280 ].includes(longEdge(candidate[0], candidate[1]));
}

export function capByPixels(entries: readonly ChannelProfile[], maxPixels: number | undefined): ChannelProfile[] {

  return (maxPixels === undefined) ? [...entries] : entries.filter((e) => ((e.channel.width * e.channel.height) <= maxPixels));
}

export function selectChannelProfile(entries: readonly ChannelProfile[], request: SelectRequest): Nullable<ChannelProfile> {

  switch(request.mode) {

    case "name": {

      const wanted = request.name.toUpperCase();

      return entries.find((e) => e.channel.name.toUpperCase() === wanted) ?? null;
    }

    case "nearest": {

      if(!entries.length) {

        return null;
      }

      const exact = entries.find((e) => (e.channel.width === request.width) && (e.channel.height === request.height));

      if(exact) {

        return entries.find((e) => (e.channel.width === request.width) && (e.channel.height === request.height) && (e.resolution[0] === request.width) &&
          (e.resolution[1] === request.height)) ?? exact;
      }

      const target = longEdge(request.width, request.height);
      const entryRank = (entry: ChannelProfile): number => longEdge(entry.channel.width, entry.channel.height);

      if(request.bias === "lower") {

        let best: ChannelProfile | null = null;
        let bestDiff = Infinity;

        for(const entry of entries) {

          const diff = Math.abs(entryRank(entry) - target);

          if(diff < bestDiff) {

            bestDiff = diff;
            best = entry;
          }
        }

        return best;
      }

      const higher = entries.filter((e) => (entryRank(e) > target)).at(-1) ?? entries[0] ?? null;

      if(!higher) {

        return null;
      }

      return entries.find((e) => (e.channel.id === higher.channel.id) && (e.resolution[0] === e.channel.width) && (e.resolution[1] === e.channel.height)) ?? higher;
    }

    default: {

      return null;
    }
  }
}

export function buildAdvertisedProfiles(nativeEntries: readonly ChannelProfile[]): ChannelProfile[] {

  const entries = [...nativeEntries];

  entries.sort(sortByResolutions);

  const nativeTopEntry = entries[0];

  if(!nativeTopEntry) {

    return [];
  }

  const validResolutions: Resolution[] = resolutionTableFor(nativeTopEntry.resolution)
    .flatMap(([ width, height ]) => [ 30, 15 ].map((fps): Resolution => [ width, height, fps ]));

  for(const candidate of validResolutions) {

    const currentTop = entries[0] ?? nativeTopEntry;

    if(!isMandatedOrUnderTop(candidate, currentTop.resolution)) {

      continue;
    }

    const foundRtsp = selectChannelProfile(entries, { bias: "lower", height: candidate[1], mode: "nearest", width: candidate[0] });

    if(!foundRtsp) {

      continue;
    }

    if(entries.some((x) => (x.resolution[0] === candidate[0]) && (x.resolution[1] === candidate[1]) && (x.resolution[2] === foundRtsp.channel.fps))) {

      continue;
    }

    entries.push({ channel: foundRtsp.channel, name: foundRtsp.name, resolution: [ candidate[0], candidate[1], foundRtsp.channel.fps ], url: foundRtsp.url });

    entries.sort(sortByResolutions);
  }

  const topEntry = entries[0] ?? nativeTopEntry;

  if(![ 15, 24, 30 ].includes(topEntry.resolution[2])) {

    for(const entry of entries) {

      if([ 15, 24, 30 ].includes(entry.resolution[2])) {

        continue;
      }

      if(entry.resolution[2] > 24) {

        entry.resolution[2] = 30;
      } else if(entry.resolution[2] > 15) {

        entry.resolution[2] = 24;
      } else {

        entry.resolution[2] = 15;
      }
    }
  }

  return entries;
}

export function buildAdvertisedResolutions(options: { fpsSet: readonly number[]; nativeTop: Resolution }): Resolution[] {

  const validResolutions: Resolution[] = [options.nativeTop];

  const hkResolutions: Resolution[] = resolutionTableFor(options.nativeTop)
    .flatMap(([ width, height ]) => options.fpsSet.map((fps): Resolution => [ width, height, fps ]));

  for(const candidate of hkResolutions) {

    if(!isMandatedOrUnderTop(candidate, options.nativeTop)) {

      continue;
    }

    if(validResolutions.some((x) => (x[0] === candidate[0]) && (x[1] === candidate[1]) && (x[2] === candidate[2]))) {

      continue;
    }

    validResolutions.push(candidate);
  }

  return validResolutions;
}

// A crop rectangle expressed as fractions of the source frame, matching the shape FfmpegOptions expects for its crop configuration.
export interface CropFraction {

  height: number;
  width: number;
  x: number;
  y: number;
}

// The live-transcode output plan for a portrait source answering a landscape HomeKit request.
export interface PortraitLiveOutput {

  // The crop applied ahead of the scaler, or null when the full portrait frame is sent (pillarboxed by the Home app).
  crop: Nullable<CropFraction>;

  // The height handed to the encoder's scaler (scale_vt=-2:min(ih\,height)). The scaler caps this at the (cropped) source height.
  height: number;

  // The expected output dimensions after cropping and scaling, for logging.
  outputHeight: number;
  outputWidth: number;
}

// Plan the live-transcode output for a portrait camera. HomeKit clients typically request landscape resolutions even when we advertise portrait ones, and the Home
// app aspect-fits whatever frame we send into its player. FfmpegOptions scales by height only (scale=-2:min(ih\,requestHeight)), so a
// 1504x2016 source answering a 640x360 request becomes a 268x360 frame: the Home app pillarboxes it (~29% black bars each side) and upscales a tiny image.
//
// We do two things for a portrait source and a landscape request:
//
//   fill = true   Crop the source (full width, vertically centered) to the requested aspect ratio before scaling, so the frame fills the landscape player with no bars.
//   fill = false  Keep the full portrait frame (Home app pillarboxes it), but scale it to a useful height instead of the requested height.
//
// In both cases the scaler target height is max(requested height, minHeight), and the scaler itself caps it at the source (or cropped) height, so we never upscale.
// When HomeKit requests a portrait resolution (one of the portrait sizes we advertise), we never crop, but still apply the same height floor. Returns null when the
// source isn't portrait, in which case the caller keeps the stock behavior.
export function planPortraitLiveOutput(options: { fill: boolean; minHeight: number; request: { height: number; width: number };
  source: { height: number; width: number }; }): Nullable<PortraitLiveOutput> {

  const { fill, minHeight, request, source } = options;

  if((source.width <= 0) || (source.height <= 0) || (request.width <= 0) || (request.height <= 0) || !isPortraitResolution(source.width, source.height)) {

    return null;
  }

  const height = Math.max(request.height, minHeight);
  let crop: Nullable<CropFraction> = null;
  let effectiveHeight = source.height;

  if(fill && (request.width > request.height)) {

    // Keep the full source width and take a vertically centered band whose aspect ratio matches the request.
    const heightFraction = Math.min(1, (source.width * request.height) / (request.width * source.height));

    crop = { height: heightFraction, width: 1, x: 0, y: (1 - heightFraction) / 2 };
    effectiveHeight = Math.floor(source.height * heightFraction);
  }

  const outputHeight = Math.min(effectiveHeight, height);
  const outputWidth = Math.max(2, Math.round((source.width * outputHeight) / (effectiveHeight * 2)) * 2);

  return { crop, height, outputHeight, outputWidth };
}

// A short, stable tag derived from an advertised resolution list. HAP-NodeJS computes the accessory configuration number (c#) from the attribute database with every
// characteristic VALUE stripped, so changing only the advertised resolutions (the value of Supported Video Stream Configuration) never bumps c#, and HomeKit controllers
// can keep using a previously cached stream configuration. Folding this tag into the characteristic's description - which IS part of the hashed configuration - makes a
// changed resolution list bump c# exactly once, prompting HomeKit to re-read the accessory database without changing any aid/iid.
export function advertisedResolutionsTag(resolutions: readonly Resolution[]): string {

  return createHash("sha1").update(JSON.stringify(resolutions)).digest("hex").slice(0, 8);
}
