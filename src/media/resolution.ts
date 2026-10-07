import type { Nullable } from "homebridge-plugin-utils";
import type { ProtectCameraChannelConfig } from "unifi-protect";
import type { Resolution } from "homebridge";

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

export function resolutionTableFor(nativeTop: Resolution): readonly (readonly [number, number])[] {

  const table = is4x3AspectRatio(nativeTop[0], nativeTop[1]) ? RESOLUTIONS_4X3 : RESOLUTIONS_16X9;

  return isPortraitResolution(nativeTop[0], nativeTop[1]) ? table.map(([ width, height ]) => [ height, width ] as const) : table;
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

      const requestLongEdge = longEdge(request.width, request.height);

      if(request.bias === "lower") {

        return entries.find((e) => (longEdge(e.channel.width, e.channel.height) < requestLongEdge)) ?? entries.at(-1) ?? null;
      }

      return entries.filter((e) => (longEdge(e.channel.width, e.channel.height) > requestLongEdge)).at(-1) ?? entries[0] ?? null;
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
