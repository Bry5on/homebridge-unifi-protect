# Portrait doorbell live-view fix

Branch: `fix/portrait-doorbell-liveview`
Base: homebridge-unifi-protect v8.1.0 (c8bce2c)

## What this fixes

Portrait doorbells (e.g. G6 Pro Entry 3024×4096) were advertised as landscape 16:9, so HomeKit negotiated 1280×720 and long-edge-blind channel selection bound Low 480×640 — black bars + muddy live view.

## Changes

1. `is4x3AspectRatio` uses ratio tolerance (`|max/min - 4/3| < 0.03`)
2. Portrait native tops advertise swapped HomeKit sizes (e.g. 960×1280, 1440×1920)
3. `selectChannelProfile` nearest matching uses long-edge distance (not width alone)
4. Pi constrained substrate target is portrait-aware (`1080×1920`)
5. Live encode still uses utils scaler; advertisement/selection preferred over pad
6. Fixtures + tests updated (810/810 pass)

## Apply

```bash
git clone https://github.com/Bry5on/homebridge-unifi-protect.git
cd homebridge-unifi-protect
git fetch origin fix/portrait-doorbell-liveview
git checkout fix/portrait-doorbell-liveview
```

Or from upstream v8.1.0:

```bash
git apply /path/to/0001-portrait-doorbell-liveview.patch
# or: git am 0001-portrait-doorbell-liveview.patch
```

Patch also at repo `patches/0001-portrait-doorbell-liveview.patch` once pushed.
