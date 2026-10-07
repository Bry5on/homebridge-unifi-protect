import { AI_PRO_CHANNELS, C5_WITNESS_CHANNELS, CAMERA_FIXTURES, FIXTURE_HOST, FIXTURE_RTSPS_PORT, G6_PRO_ENTRY_CHANNELS, MIXED_RTSP_DISABLED_CHANNELS, PACKAGE_FIXTURES,
  SANITY_FAIL_CHANNELS, makeChannel } from "../camera.fixtures.ts";
import { buildAdvertisedProfiles, buildAdvertisedResolutions, buildChannelProfile, capByPixels, isPrimaryChannel, rtspUrl, selectChannelProfile } from "./resolution.ts";
import { describe, test } from "node:test";
import type { ChannelProfile } from "./resolution.ts";
import type { Nullable } from "homebridge-plugin-utils";
import type { ProtectCameraChannelConfig } from "unifi-protect";
import type { Resolution } from "homebridge";
import type { SelectRequest } from "./resolution.ts";
import assert from "node:assert/strict";

interface SelectOutcome {

  id: number;
  resolution: Resolution;
}

function project(entry: ChannelProfile): { channelId: number; lens: number | undefined; name: string; resolution: Resolution; url: string } {

  return { channelId: entry.channel.id, lens: entry.lens, name: entry.name, resolution: entry.resolution, url: entry.url };
}

function outcome(entry: Nullable<ChannelProfile>): SelectOutcome | null {

  return entry ? { id: entry.channel.id, resolution: entry.resolution } : null;
}

function nativeEntries(channels: ProtectCameraChannelConfig[]): ChannelProfile[] {

  const entries: ChannelProfile[] = [];

  for(const channel of channels.filter(isPrimaryChannel)) {

    if(!channel.name || (channel.width <= 0) || (channel.width > 65535) || (channel.height <= 0) || (channel.height > 65535)) {

      continue;
    }

    entries.push(buildChannelProfile(channel, { rtspPort: FIXTURE_RTSPS_PORT, urlHost: FIXTURE_HOST }));
  }

  return entries;
}

function selectChannelViaWrapper(entries: ChannelProfile[], rtspDefault: string, width: number, height: number,
  opts?: { biasHigher?: boolean; maxPixels?: number }): Nullable<ChannelProfile> {

  const capped = capByPixels(entries, opts?.maxPixels);
  const request: SelectRequest = rtspDefault ? { mode: "name", name: rtspDefault } :
    { bias: opts?.biasHigher ? "higher" : "lower", height: height, mode: "nearest", width: width };

  return selectChannelProfile(capped, request);
}

describe("resolution golden-master: parent advertised list (production == checked-in fixtures)", () => {

  for(const fixture of CAMERA_FIXTURES) {

    test(fixture.model, () => {

      const produced = buildAdvertisedProfiles(nativeEntries(fixture.channels)).map(project);

      assert.deepEqual(produced, fixture.expected);
    });
  }
});

describe("resolution golden-master: package list (production == checked-in fixtures)", () => {

  for(const fixture of PACKAGE_FIXTURES) {

    test(fixture.model, () => {

      const produced = buildAdvertisedResolutions({ fpsSet: [15], nativeTop: fixture.nativeTop });

      assert.deepEqual(produced, fixture.expected);
    });
  }
});

describe("resolution: the RTSP-enabled / sanity-fail channel filtering", () => {

  test("a disabled channel never appears in the advertised list", () => {

    const produced = buildAdvertisedProfiles(nativeEntries(MIXED_RTSP_DISABLED_CHANNELS));

    assert.equal(produced.some((e) => (e.channel.id === 1)), false);
    assert.equal(produced.length > 0, true);
  });

  test("buildAdvertisedProfiles([]) returns [] (no throw) - the device short-circuit signal", () => {

    const empty = nativeEntries(SANITY_FAIL_CHANNELS);

    assert.equal(empty.length, 0);
    assert.deepEqual(buildAdvertisedProfiles(empty), []);
  });
});

describe("resolution: selector per-request mapping through the selectChannel wrapper (checked-in grid)", () => {

  const published = buildAdvertisedProfiles(nativeEntries(AI_PRO_CHANNELS));

  const CAP_1080P = 1920 * 1080;

  const GRID: { bias: "higher" | "lower"; expected: SelectOutcome; height: number; maxPixels: number; width: number }[] = [

    { bias: "lower", expected: { id: 0, resolution: [ 3840, 2160, 30 ] }, height: 2160, maxPixels: Infinity, width: 3840 },
    { bias: "lower", expected: { id: 1, resolution: [ 1920, 1080, 30 ] }, height: 1080, maxPixels: Infinity, width: 1920 },
    { bias: "lower", expected: { id: 1, resolution: [ 1280, 720, 30 ] }, height: 720, maxPixels: Infinity, width: 1280 },
    { bias: "lower", expected: { id: 2, resolution: [ 640, 360, 30 ] }, height: 360, maxPixels: Infinity, width: 640 },
    { bias: "lower", expected: { id: 2, resolution: [ 640, 360, 30 ] }, height: 100, maxPixels: Infinity, width: 100 },
    { bias: "lower", expected: { id: 0, resolution: [ 3840, 2160, 30 ] }, height: 99999, maxPixels: Infinity, width: 99999 },
    { bias: "lower", expected: { id: 1, resolution: [ 1920, 1080, 30 ] }, height: 2160, maxPixels: CAP_1080P, width: 3840 },
    { bias: "lower", expected: { id: 2, resolution: [ 640, 360, 30 ] }, height: 360, maxPixels: CAP_1080P, width: 640 },
    { bias: "higher", expected: { id: 0, resolution: [ 3840, 2160, 30 ] }, height: 2160, maxPixels: Infinity, width: 3840 },
    { bias: "higher", expected: { id: 0, resolution: [ 3840, 2160, 30 ] }, height: 1080, maxPixels: Infinity, width: 1920 },
    { bias: "higher", expected: { id: 1, resolution: [ 1280, 720, 30 ] }, height: 720, maxPixels: Infinity, width: 1280 },
    { bias: "higher", expected: { id: 2, resolution: [ 640, 360, 30 ] }, height: 360, maxPixels: Infinity, width: 640 },
    { bias: "higher", expected: { id: 2, resolution: [ 640, 360, 30 ] }, height: 100, maxPixels: Infinity, width: 100 },
    { bias: "higher", expected: { id: 0, resolution: [ 3840, 2160, 30 ] }, height: 99999, maxPixels: Infinity, width: 99999 },
    { bias: "higher", expected: { id: 1, resolution: [ 1280, 720, 30 ] }, height: 2160, maxPixels: CAP_1080P, width: 3840 },
    { bias: "higher", expected: { id: 1, resolution: [ 1280, 720, 30 ] }, height: 1080, maxPixels: CAP_1080P, width: 1920 }
  ];

  for(const row of GRID) {

    test("AI Pro bias=" + row.bias + " cap=" + row.maxPixels.toString() + " " + row.width.toString() + "x" + row.height.toString(), () => {

      const result = outcome(selectChannelViaWrapper(published, "", row.width, row.height, { biasHigher: (row.bias === "higher"), maxPixels: row.maxPixels }));

      assert.deepEqual(result, row.expected);
    });
  }

  test("Pi witness: rtspDefault=HIGH + maxPixels=1080p + bias higher => null (HIGH exceeds the cap)", () => {

    const result = outcome(selectChannelViaWrapper(published, "HIGH", 3840, 2160, { biasHigher: true, maxPixels: CAP_1080P }));

    assert.equal(result, null);
  });

  test("name-pin HIGH (uncapped) resolves to the High channel", () => {

    const result = outcome(selectChannelViaWrapper(published, "HIGH", 640, 360));

    assert.deepEqual(result, { id: 0, resolution: [ 3840, 2160, 30 ] });
  });

  test("empty entry list yields null", () => {

    assert.equal(outcome(selectChannelViaWrapper([], "", 1920, 1080)), null);
    assert.equal(outcome(selectChannelViaWrapper([], "HIGH", 1920, 1080)), null);
  });
});

describe("resolution: the deep-low-resolution drift (the regression locus, exercised through the full list-build)", () => {

  test("the deep-low-resolution 4:3 camera admits the under-mandate resolutions (no under-mandate drop)", () => {

    const produced = buildAdvertisedProfiles(nativeEntries(C5_WITNESS_CHANNELS));
    const dims = produced.map((e) => e.resolution[0].toString() + "x" + e.resolution[1].toString());

    assert.equal(dims.includes("1920x1440"), true);

    assert.equal(dims.includes("1280x960"), true);
    assert.equal(dims.includes("1024x768"), true);

    assert.equal(dims.includes("640x480"), true);
    assert.deepEqual([...dims], [ "1920x1440", "1280x960", "1024x768", "640x480", "480x360", "320x240" ]);
  });

  test("a single-channel camera produces a coherent list", () => {

    const single: ProtectCameraChannelConfig[] = [makeChannel({ fps: 30, height: 1080, id: 0, name: "High", width: 1920 })];
    const produced = buildAdvertisedProfiles(nativeEntries(single));

    assert.equal(produced.length > 0, true);
    assert.equal(produced.every((e) => (e.channel.id === 0)), true);
  });
});

describe("resolution: the advertised list is streaming-preference-free", () => {

  test("buildAdvertisedProfiles maps to nearest channels; the streaming preference applies only at request time", () => {

    const list = buildAdvertisedProfiles(nativeEntries(AI_PRO_CHANNELS));

    assert.deepEqual(list.map((e) => e.channel.id), [ 0, 0, 1, 1, 2, 2, 2 ]);

    assert.equal(outcome(selectChannelViaWrapper(list, "HIGH", 640, 360))?.id, 0);
  });
});

describe("resolution: portrait doorbell long-edge nearest matching (G6 Pro Entry)", () => {

  const published = buildAdvertisedProfiles(nativeEntries(G6_PRO_ENTRY_CHANNELS));

  test("G6 Pro Entry does NOT map 1280x720 to Low", () => {

    const result = outcome(selectChannelViaWrapper(published, "", 1280, 720));

    assert.notEqual(result?.id, 2);
    assert.equal(result?.id, 1);
  });

  test("G6 Pro Entry maps portrait 720x1280 / 1080x1920 to Medium", () => {

    assert.equal(outcome(selectChannelViaWrapper(published, "", 720, 1280))?.id, 1);
    assert.equal(outcome(selectChannelViaWrapper(published, "", 1080, 1920))?.id, 1);
  });

  test("G6 Pro Entry advertises portrait HomeKit sizes in the 4:3 family", () => {

    const dims = published.map((e) => e.resolution[0].toString() + "x" + e.resolution[1].toString());

    assert.equal(dims.includes("960x1280"), true);
    assert.equal(dims.includes("1440x1920"), true);
    assert.equal(dims.includes("1920x1080"), false);
    assert.equal(dims.includes("1280x720"), false);
  });
});

describe("resolution: rtspUrl - the two scheme branches", () => {

  test("the default branch composes the secure rtsps URL with the enableSrtp query", () => {

    const channel = makeChannel({ fps: 30, height: 1080, id: 0, name: "High", width: 1920 });

    assert.equal(rtspUrl(channel, "h", 7447), "rtsps://h:7447/" + channel.rtspAlias + "?enableSrtp");
  });

  test("the secure: false branch composes the plain rtsp URL with no query", () => {

    const channel = makeChannel({ fps: 30, height: 1080, id: 0, name: "High", width: 1920 });

    assert.equal(rtspUrl(channel, "h", 7447, false), "rtsp://h:7447/" + channel.rtspAlias);
  });
});
