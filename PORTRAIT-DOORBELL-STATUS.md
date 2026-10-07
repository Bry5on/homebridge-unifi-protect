# Portrait doorbell live-view fix

Branch: `fix/portrait-doorbell-liveview`
Fork: https://github.com/Bry5on/homebridge-unifi-protect

## On this branch

- `src/media/resolution.ts` — full portrait fix (comment-stripped for MCP size): 4:3 tolerance 0.03, `isPortraitResolution` / `longEdge`, portrait-swapped ads, long-edge nearest selection, long-edge mandate gate
- `src/settings.ts` — `PROTECT_TIMESHIFT_CONSTRAINED_HOST_TARGET_PORTRAIT` (1080x1920)
- `src/camera.fixtures.ts` + `src/media/resolution.test.ts` — G6 / AI / G2 / G5 portrait fixtures and expectations

## Optional (Pi belt-and-suspenders)

- `patches/camera-portrait-timeshift.patch` — raspbian substrate uses portrait target when top channel is upright. Not required once long-edge nearest matching is in place (landscape 1920x1080 already selects Medium via longEdge=1920). Apply with: `git apply patches/camera-portrait-timeshift.patch`
- `src/media/stream.ts` — comment-only; skipped on remote

## Local golden commit

Local clone commit `2b1233e` has full commented sources; 810/810 tests. No upstream PR opened.
