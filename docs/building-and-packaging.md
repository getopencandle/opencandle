# Building and packaging

## Requirements

- Windows 10 or 11, x64.
- Node.js 24 LTS (22.12 or later works) and npm.
- Python 3 (3.12 tested), on `PATH` as `python`, for creating the portable ZIP.
- About 1 GB of free disk space for dependencies and a packaged build.

## Install dependencies

```powershell
npm ci
```

`npm ci` installs the exact versions pinned in `package-lock.json`. Its `postinstall` step applies OpenCandle's compatibility patch to the Vela charting library (`src/chart/apply-vela-compat-patch.mjs --apply`). The `predev`, `prebuild` and `pretest` steps verify that the patch is in place and stop with a message if it is not; run `npm ci` again to fix that.

## Development

| Command | Result |
| --- | --- |
| `npm run dev` | Vite dev server for the renderer at http://127.0.0.1:5173. Good for fast UI work in a browser. Desktop-only features (data sources, file dialogs, keys, scripts that need the main process) are disabled. |
| `npm run build` | Typechecks the source (`tsc --noEmit`, `src/` only) and builds the renderer into `dist/`. |
| `npm run typecheck` | Typechecks source and tests together (`tsconfig.test.json`). |
| `npm start` | Starts the Electron desktop app from source, loading `dist/`. Run `npm run build` first, and again after renderer changes. |

`npm start` uses the normal profile folder (`%APPDATA%\OpenCandle`). To keep development data separate, pass an absolute profile folder outside the project:

```powershell
npx electron . --lv-profile=C:\Users\you\AppData\Roaming\OpenCandle-dev --user-data-dir=C:\Users\you\AppData\Roaming\OpenCandle-dev
```

## Packaging a portable build

```powershell
npm run package
```

This builds the renderer, then `scripts/package.mjs`:

1. Downloads the pinned Electron release through `@electron/packager` and checks its checksum.
2. Stages `dist/`, `electron/`, minimal package metadata, licence and notice files, the Vela modification files and only the three QuickJS runtime modules the app needs.
3. Packs the app into an ASAR archive and sets Electron security fuses (no RunAsNode, no Node options or inspector, ASAR integrity required, cookie encryption on).
4. Writes the portable folder and a ZIP under `out/<build id>/`, and records the latest build in `out/latest.json`.

The packaged build includes `THIRD-PARTY-NOTICES.txt` (licence text of every production dependency), an `sbom.json` software inventory, Electron's own licence files, and the application licence.

To check a packaged build (fuses, file list, notices and hashes):

```powershell
npm run package:verify
```

Builds are not code-signed. Windows SmartScreen may warn on first launch.

## Vela patch

OpenCandle modifies the installed Vela package and applies a few build-time transforms in `vite.config.ts`. The modified bundle carries a prominent notice, and packaged builds include the patch scripts, the patch plans and [vela-modification.md](vela-modification.md), as required by the Apache License 2.0. If you change the patch, update the plan files and that document together.

## Troubleshooting

- **The Vela patch check fails before dev, build or test**: delete `node_modules` and run `npm ci`.
- **`npm start` shows a blank window**: run `npm run build` first.
- **Packaging fails at the ZIP step**: make sure `python` runs Python 3.
- **The app says the profile is inside the program folder**: choose a profile folder outside the project or install folder.
