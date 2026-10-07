import type { ProtectCameraChannelConfig } from "unifi-protect";
import type { Resolution } from "homebridge";

export interface EntryProjection {

  channelId: number;
  lens: number | undefined;
  name: string;
  resolution: Resolution;
  url: string;
}

export interface CameraFixture {

  channels: ProtectCameraChannelConfig[];
  driftNarrative?: string;
  expected: EntryProjection[];
  model: string;
}

export interface PackageFixture {

  driftNarrative?: string;
  expected: Resolution[];
  model: string;
  nativeTop: Resolution;
}

export function makeChannel(options: { fps: number; height: number; id: number; isRtspEnabled?: boolean; name: string; width: number }): ProtectCameraChannelConfig {

  return {

    autoBitrate: false,
    autoFps: false,
    bitrate: 0,
    enabled: true,
    fps: options.fps,
    fpsValues: [],
    height: options.height,
    id: options.id,
    idrInterval: 0,
    internalRtspAlias: null,
    isInternalRtspEnabled: false,
    isRtspEnabled: options.isRtspEnabled ?? true,
    maxBitrate: 0,
    minBitrate: 0,
    minClientAdaptiveBitRate: 0,
    minMotionAdaptiveBitRate: 0,
    name: options.name,
    rtspAlias: "alias" + options.id.toString(),
    validBitrateRangeMargin: null,
    videoId: "",
    width: options.width
  };
}

export const G2_PRO_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 30, height: 1600, id: 0, name: "High", width: 1200 }),
  makeChannel({ fps: 30, height: 1280, id: 1, name: "Medium", width: 960 }),
  makeChannel({ fps: 15, height: 480, id: 2, name: "Low", width: 360 })
];

export const AI_PRO_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 30, height: 2160, id: 0, name: "High", width: 3840 }),
  makeChannel({ fps: 30, height: 720, id: 1, name: "Medium", width: 1280 }),
  makeChannel({ fps: 30, height: 360, id: 2, name: "Low", width: 640 })
];

export const G5_FLEX_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 30, height: 1512, id: 0, name: "High", width: 2688 }),
  makeChannel({ fps: 30, height: 720, id: 1, name: "Medium", width: 1280 }),
  makeChannel({ fps: 30, height: 360, id: 2, name: "Low", width: 640 })
];

export const G5_PTZ_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 30, height: 1512, id: 0, name: "High", width: 2688 }),
  makeChannel({ fps: 30, height: 720, id: 1, name: "Medium", width: 1280 }),
  makeChannel({ fps: 30, height: 360, id: 2, name: "Low", width: 640 })
];

export const G6_INSTANT_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 30, height: 2160, id: 0, name: "High", width: 3840 }),
  makeChannel({ fps: 30, height: 720, id: 1, name: "Medium", width: 1280 }),
  makeChannel({ fps: 30, height: 360, id: 2, name: "Low", width: 640 })
];

export const G6_PRO_ENTRY_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 20, height: 4096, id: 0, name: "High", width: 3024 }),
  makeChannel({ fps: 20, height: 1920, id: 1, name: "Medium", width: 1440 }),
  makeChannel({ fps: 20, height: 640, id: 2, name: "Low", width: 480 }),
  makeChannel({ fps: 3, height: 1200, id: 3, name: "Package Camera", width: 1600 })
];

export const C5_WITNESS_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 15, height: 480, id: 0, name: "High", width: 640 }),
  makeChannel({ fps: 15, height: 360, id: 1, name: "Low", width: 480 })
];

export const MIXED_RTSP_DISABLED_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 30, height: 2160, id: 0, name: "High", width: 3840 }),
  makeChannel({ fps: 30, height: 720, id: 1, isRtspEnabled: false, name: "Medium", width: 1280 }),
  makeChannel({ fps: 30, height: 360, id: 2, name: "Low", width: 640 })
];

export const SANITY_FAIL_CHANNELS: ProtectCameraChannelConfig[] = [

  makeChannel({ fps: 30, height: 0, id: 0, name: "High", width: 0 }),
  makeChannel({ fps: 30, height: 720, id: 1, name: "", width: 1280 })
];

export const FIXTURE_HOST = "camera.test";

export const FIXTURE_RTSPS_PORT = 7441;

function fixtureUrl(id: number): string {

  return "rtsps://" + FIXTURE_HOST + ":" + FIXTURE_RTSPS_PORT.toString() + "/alias" + id.toString() + "?enableSrtp";
}

export const CAMERA_FIXTURES: CameraFixture[] = [

  {

    channels: G2_PRO_CHANNELS,
    expected: [

      { channelId: 0, lens: undefined, name: "1200x1600@30fps (High)", resolution: [ 1440, 1920, 30 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "1200x1600@30fps (High)", resolution: [ 1200, 1600, 30 ], url: fixtureUrl(0) },
      { channelId: 1, lens: undefined, name: "960x1280@30fps (Medium)", resolution: [ 960, 1280, 30 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "960x1280@30fps (Medium)", resolution: [ 768, 1024, 30 ], url: fixtureUrl(1) },
      { channelId: 2, lens: undefined, name: "360x480@15fps (Low)", resolution: [ 480, 640, 15 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "360x480@15fps (Low)", resolution: [ 360, 480, 15 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "360x480@15fps (Low)", resolution: [ 240, 320, 15 ], url: fixtureUrl(2) }
    ],
    model: "G2 Pro"
  },
  {

    channels: AI_PRO_CHANNELS,

    driftNarrative: "16:9 4K. Long-edge nearest: 2560 selects High; 1920/1280 select Medium; 640/480/320 select Low. No fps normalization (all 30fps native).",
    expected: [

      { channelId: 0, lens: undefined, name: "3840x2160@30fps (High)", resolution: [ 3840, 2160, 30 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "3840x2160@30fps (High)", resolution: [ 2560, 1440, 30 ], url: fixtureUrl(0) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1920, 1080, 30 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1280, 720, 30 ], url: fixtureUrl(1) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 640, 360, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 480, 270, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 320, 180, 30 ], url: fixtureUrl(2) }
    ],
    model: "AI Pro"
  },
  {

    channels: G5_FLEX_CHANNELS,
    expected: [

      { channelId: 0, lens: undefined, name: "2688x1512@30fps (High)", resolution: [ 2688, 1512, 30 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "2688x1512@30fps (High)", resolution: [ 2560, 1440, 30 ], url: fixtureUrl(0) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1920, 1080, 30 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1280, 720, 30 ], url: fixtureUrl(1) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 640, 360, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 480, 270, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 320, 180, 30 ], url: fixtureUrl(2) }
    ],
    model: "G5 Flex"
  },
  {

    channels: G5_PTZ_CHANNELS,
    expected: [

      { channelId: 0, lens: undefined, name: "2688x1512@30fps (High)", resolution: [ 2688, 1512, 30 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "2688x1512@30fps (High)", resolution: [ 2560, 1440, 30 ], url: fixtureUrl(0) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1920, 1080, 30 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1280, 720, 30 ], url: fixtureUrl(1) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 640, 360, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 480, 270, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 320, 180, 30 ], url: fixtureUrl(2) }
    ],
    model: "G5 PTZ"
  },
  {

    channels: G6_INSTANT_CHANNELS,
    expected: [

      { channelId: 0, lens: undefined, name: "3840x2160@30fps (High)", resolution: [ 3840, 2160, 30 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "3840x2160@30fps (High)", resolution: [ 2560, 1440, 30 ], url: fixtureUrl(0) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1920, 1080, 30 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "1280x720@30fps (Medium)", resolution: [ 1280, 720, 30 ], url: fixtureUrl(1) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 640, 360, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 480, 270, 30 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "640x360@30fps (Low)", resolution: [ 320, 180, 30 ], url: fixtureUrl(2) }
    ],
    model: "G6 Instant"
  },
  {

    channels: G6_PRO_ENTRY_CHANNELS,

    driftNarrative: "Native 20fps, not in {15,24,30}, so every advertised entry normalizes to 24fps. Portrait 3024x4096 reads 4:3 (tolerance) and advertises portrait " +
      "HomeKit sizes. Package Camera channel filtered out.",
    expected: [

      { channelId: 0, lens: undefined, name: "3024x4096@20fps (High)", resolution: [ 3024, 4096, 24 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "3024x4096@20fps (High)", resolution: [ 2880, 3840, 24 ], url: fixtureUrl(0) },
      { channelId: 1, lens: undefined, name: "1440x1920@20fps (Medium)", resolution: [ 1920, 2560, 24 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "1440x1920@20fps (Medium)", resolution: [ 1440, 1920, 24 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "1440x1920@20fps (Medium)", resolution: [ 960, 1280, 24 ], url: fixtureUrl(1) },
      { channelId: 2, lens: undefined, name: "480x640@20fps (Low)", resolution: [ 768, 1024, 24 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "480x640@20fps (Low)", resolution: [ 480, 640, 24 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "480x640@20fps (Low)", resolution: [ 360, 480, 24 ], url: fixtureUrl(2) },
      { channelId: 2, lens: undefined, name: "480x640@20fps (Low)", resolution: [ 240, 320, 24 ], url: fixtureUrl(2) }
    ],
    model: "G6 Pro Entry"
  },
  {

    channels: C5_WITNESS_CHANNELS,

    driftNarrative: "640x480 4:3 native top. The 1920 mandate inserts 1920x1440 ABOVE native and re-sorts to front; the drifting current-top then admits 1280/1024. " +
      "Final: 1920x1440, 1280x960, 1024x768, 640x480 (all High/ch0), 480x360 (Low/ch1 native), 320x240 (Low/ch1 backstop). All 15fps.",
    expected: [

      { channelId: 0, lens: undefined, name: "640x480@15fps (High)", resolution: [ 1920, 1440, 15 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "640x480@15fps (High)", resolution: [ 1280, 960, 15 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "640x480@15fps (High)", resolution: [ 1024, 768, 15 ], url: fixtureUrl(0) },
      { channelId: 0, lens: undefined, name: "640x480@15fps (High)", resolution: [ 640, 480, 15 ], url: fixtureUrl(0) },
      { channelId: 1, lens: undefined, name: "480x360@15fps (Low)", resolution: [ 480, 360, 15 ], url: fixtureUrl(1) },
      { channelId: 1, lens: undefined, name: "480x360@15fps (Low)", resolution: [ 320, 240, 15 ], url: fixtureUrl(1) }
    ],
    model: "C5 Witness 640x480"
  }
];

export const PACKAGE_FIXTURES: PackageFixture[] = [

  {

    driftNarrative: "1600x1200 4:3 seed at native 3fps (the seed keeps its fps); 1920x1440 lands as a mandate; the under-top 4:3 rows land at 15fps; 2560/3840 dropped.",
    expected: [ [ 1600, 1200, 3 ], [ 1920, 1440, 15 ], [ 1280, 960, 15 ], [ 1024, 768, 15 ], [ 640, 480, 15 ], [ 480, 360, 15 ], [ 320, 240, 15 ] ],
    model: "G6 Pro Entry Package",
    nativeTop: [ 1600, 1200, 3 ]
  },
  {

    expected: [ [ 1600, 1200, 2 ], [ 1920, 1440, 15 ], [ 1280, 960, 15 ], [ 1024, 768, 15 ], [ 640, 480, 15 ], [ 480, 360, 15 ], [ 320, 240, 15 ] ],
    model: "Package fallback",
    nativeTop: [ 1600, 1200, 2 ]
  }
];
