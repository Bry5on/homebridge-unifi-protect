# Portrait doorbell fix — branch status

**Fork:** https://github.com/Bry5on/homebridge-unifi-protect
**Branch:** `fix/portrait-doorbell-liveview`

## Preferred: push the local commit

The complete fix is committed locally as `2b1233e` in `/workspace/homebridge-unifi-protect`.

```bash
cd /workspace/homebridge-unifi-protect
git remote add bry5on https://github.com/Bry5on/homebridge-unifi-protect.git  # if needed
git push -u bry5on fix/portrait-doorbell-liveview --force
```

## Or apply the patch on a clean v8.1.0 tree

```bash
git checkout c8bce2c
git checkout -b fix/portrait-doorbell-liveview
git am /workspace/0001-portrait-doorbell-liveview.patch
# or: git apply /workspace/portrait-doorbell-liveview.diff
git push -u bry5on fix/portrait-doorbell-liveview
```

## Already on this branch via MCP

- `src/settings.ts` — portrait constrained host target
- `patches/README-portrait-doorbell.md`

## Tests

`npm test` → **810/810 pass** on the local full commit.
