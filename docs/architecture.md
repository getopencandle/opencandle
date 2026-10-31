# Architecture

OpenCandle is an Electron desktop app with a React and TypeScript renderer. This page is a short map of how the parts fit together.

```
+--------------------------- Electron main process (electron/) ---------------------------+
|  windows, tray, menus      workspace storage (atomic JSON)      native file dialogs     |
|  data providers: Alpaca, Coinbase, FRED, SEC    key store (safeStorage)    bar caches   |
|  script runtime: QuickJS workers                 alert notifications and webhooks       |
+-------------------------------------+---------------------------------------------------+
                                      | fixed, validated IPC calls (electron/preload.cjs)
+-------------------------------------v---------------------------------------------------+
|  Renderer (src/), sandboxed, no Node access, served from the private lv://app scheme    |
|  ui/ (React)  ->  domain/ (indicators, strategies, alerts, replay, paper trading)       |
|               ->  chart/  (Vela chart engine, chart types, drawings, layouts)           |
+-----------------------------------------------------------------------------------------+
```

## Renderer (`src/`)

- `src/ui/` holds the React interface: the main window, dialogs, panels, menus, themes and icons.
- `src/domain/` is the logic that does not depend on the screen: indicator and pattern calculations, built-in strategies, the strategy tester engine, alerts, replay, paper trading, intervals and sessions, data imports and the Pine importer.
- `src/chart/` connects the domain to the Vela chart engine: chart types (including derived types such as Renko, Kagi and footprint), price and time scales, drawing tools and their painters, multi-chart layouts and image export.
- Feature folders: `analysis-news/`, `fundamentals/`, `market-views/`, `portfolio/`, `strategy-report/`, `watchlists/`, `vwap/`.

The renderer runs with context isolation, Chromium sandboxing, Node integration disabled and web security on. Its content security policy only allows packaged scripts and blocks remote connections, so the renderer never talks to the internet directly.

## Main process (`electron/`)

- `main.cjs` creates windows, registers the `lv://app` scheme, takes a single-instance lock on the profile, and handles IPC. Every privileged call checks that it came from a trusted window.
- `preload.cjs` exposes a small typed bridge (`window.lv`, see `bridge.d.ts`). No file path, URL, shell command or credential crosses it from the renderer.
- `storage.cjs` saves the workspace as bounded JSON in the profile folder: each save writes a temporary file, flushes it to disk and renames it into place, with revision checks so two saves cannot overwrite each other.
- `public-alpaca.cjs`, `public-coinbase.cjs`, `public-fred.cjs` and `public-sec.cjs` are the data providers. They load only when first used, call fixed endpoints, cap response sizes, rate-limit and back off.
- `bar-cache.cjs` caches downloaded bars in the profile folder.
- `import-data.cjs` opens native file pickers for imports, with size limits and strict UTF-8 decoding.
- `script-runtime.cjs`, `script-worker.cjs` and related files run CandleScript.
- `alert-notify.cjs` and `alert-webhook.cjs` deliver alerts.

## Scripting

CandleScript runs in a QuickJS WebAssembly runtime inside a dedicated worker, one fresh runtime per job. The guest has no file, network, process or credential objects, and limits apply to source size, heap, stack, compute time, worker lifetime and output size. Results include plots, visuals, drawing objects, alerts, virtual orders and a resumable state snapshot. See [candlescript.md](candlescript.md).

The Pine importer (`src/domain/pine-import/`) is a translator only: it parses Pine source and writes CandleScript. It never runs Pine. See [pine-import.md](pine-import.md).

## Data flow

1. The renderer asks for bars by symbol and interval.
2. Built-in practice data is generated in the renderer. Live and historical market data comes through the main-process providers, which validate the request and return validated bars.
3. Indicators, patterns, scripts and strategies calculate on the bars the chart has. In replay, they see only the bars up to the replay point.
4. Drawings, layouts, alerts, scripts and settings are part of the workspace and saved through `storage.cjs`.

## Vela

Charts are drawn by [Vela](https://velacharts.dev). OpenCandle applies a small, documented patch to the installed Vela package (`src/chart/apply-vela-compat-patch.mjs`, run on `npm ci` and verified before dev, build and test) and a few build-time transforms in `vite.config.ts`. Every modified file carries a notice. Details: [vela-modification.md](vela-modification.md).

## Packaging

`npm run package` builds the renderer and stages `dist/`, `electron/`, minimal package metadata, licence notices and only the QuickJS runtime modules the app needs into a portable Windows folder and ZIP. Packaged builds enable Electron security fuses. See [building-and-packaging.md](building-and-packaging.md).
