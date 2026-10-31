# Development

You only need these tools to **change** Peak Duo. Running it on a server needs none of them.

- Node.js 18+ (no `npm install` needed; the tools use only Node built-ins)
- Python 3.10+ for Lua, SQL and browser tests
- Optional: a Lua 5.4 shared library or `pip install lupa` for the Lua tests
- Optional: `pip install playwright` and Chromium for browser tests

## Project layout

```text
peak-phone/
├── fxmanifest.lua          resource manifest
├── config.lua              camera / speaker / crypto settings (shared)
├── sv_config.lua           server settings + PhoneOwnerConfig branding
├── shared/                 PhoneConfig (settings.lua), shared helpers, prop + live settings
├── bridge/                 framework bridge, database layer, schema migration, wallet journal
├── server/                 one file per feature (sv_messages.lua, sv_calls.lua, sv_webrtc.lua, ...)
├── client/                 one file per feature + NUI callback routing (_cl_main.lua)
├── jobs/                   Job Center / Job Creator (server, schema, defaults)
├── integrations/           in-resource adapter fallbacks
├── sql/                    table definitions
├── stream/                 broken-phone and live-screen archetypes
├── web/
│   ├── public/             the NUI that ships (index.html)
│   │   ├── duo/            the phone shell + native apps as ES modules (no build step)
│   │   ├── build/          generated legacy app bundle (npm run build)
│   │   └── images/, ringtones/
│   ├── legacy/             original compiled Svelte bundle + byte-offset patches
│   └── src/                original Svelte sources of the legacy apps (reference)
├── extras/
│   ├── peak-duo-prop/      3D handset resource
│   ├── peak-sim-assets/    SIM tray/card resource
│   ├── peak-duo-source/    Blender sources + authoring scripts for the handset
│   └── sharedrop-source/   Blender sources for ShareDrop animations
├── config-examples/        server.cfg, inventory items, coturn
├── tests/                  Node, Lua, SQL and browser tests
└── tools/                  build, preview, integrity and asset tools
```

## How the UI is built

The phone has two layers:

1. **The Duo shell and native apps** (`web/public/duo/*.mjs`): Home Screen, Split View, Control Center, Messages, Maps, Weather, Clock, Notes, Music, KiloGram, Y, Settings and most other apps. These are plain ES modules loaded directly by `web/public/index.html`, with **no build step**. Edit them and reload.
2. **Legacy apps** (some economy and gameplay screens): a compiled Svelte bundle. `npm run build` (`tools/build-duo.cjs`) applies the reviewed patches in `web/legacy/patches.json` to `web/legacy/bundle.original.js` and writes `web/public/build/duo-legacy.js`. The build checks the source bundle's SHA-256 first, so patches can't be applied to the wrong file by accident. Editing `web/src/*.svelte` alone doesn't change the shipped bundle.

`PeakPhoneTransport(route, data)` sends a request from the UI to the client Lua (`RegisterNUICallback`), which calls a server callback. Every write is checked again on the server.

## Browser preview

```sh
npm run preview          # http://127.0.0.1:8791
```

The preview mocks the FiveM bridge with synthetic data (`web/public/duo/preview.mjs`, `fixtures.mjs`). Apps that need server data show a "needs the live FiveM server" message. In the browser console, `window.PeakDuo` exposes helpers such as `PeakDuo.openApp('maps')`, `PeakDuo.fold()` and `PeakDuo.setPhoneSetting('appearance','dark')`.

## Tests

```sh
npm test                 # Node unit + contract tests (UI logic, transport, integrity, configs)
npm run test:lua         # Lua server/client modules against mocked FiveM natives
npm run test:hardware    # native hardware/media output contracts
npm run test:music       # music catalog contracts
python tests/portable/sql_contracts.py   # SQL schema vs. INSERT statements
npm run verify           # runtime files match tests/contracts/runtime-sha256.json
```

Browser tests (`npm run test:browser:*`) drive the preview with Playwright. Start `npm run preview` first, or set `PREVIEW_URL`. Screenshots and reports go to `artifacts/` (git-ignored).

These tests use mocks. They don't replace testing on a real FiveM server with two players.

### Runtime integrity manifest

`npm run verify` compares every runtime file with `tests/contracts/runtime-sha256.json`. After intentionally changing runtime files, regenerate it:

```sh
npm run manifest:write
```

Commit the updated manifest together with your change.

## Adding a native app

1. Create `web/public/duo/my-app.mjs` (look at `calculator-app.mjs` or `weather-app.mjs`).
2. Register it in `web/public/duo/catalog.mjs` (`APPS`) and wire it up where the shell mounts native apps (search for an existing app ID in `shell.mjs`).
3. For server data, add `client/cl_myapp.lua` (NUI callback) and `server/sv_myapp.lua` (validated server callback), and add the server file to `fxmanifest.lua`.
4. Add tests, then run `npm test`, `npm run test:lua` and `npm run manifest:write`.

## Asset sources

`extras/peak-duo-source` and `extras/sharedrop-source` contain the editable Blender files and scripts for the handset and animations. Rebuilding them needs Blender, Sollumz and CodeWalker. The scripts read tool locations from environment variables (`PEAK_TOOLCHAIN`, `PEAK_CODEWALKER`, `PEAK_AUTHORING_REFERENCE`, `PEAK_AUTHORING_WORKSPACE`, `PEAK_ANIMATION_OUTPUT`). Game reference meshes are not included and must come from your own game files.
