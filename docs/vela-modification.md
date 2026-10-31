# Changes OpenCandle makes to Vela

OpenCandle draws its charts with [Vela](https://www.npmjs.com/package/@luxalgo/vela) 0.8.4 by LuxAlgo. Vela is Apache-2.0 software. OpenCandle changes a few of its files to add features the app needs. This page says what is changed, why, and how to apply and check the changes.

## What is changed

The installed package is patched by one cumulative patch, `LV-VELA-COMPAT-11`. It is made of these parts:

| Part | What it does |
|---|---|
| `LV-VELA-MAGNET-1` | Holding Ctrl/Cmd temporarily flips the saved magnet mode (Off becomes Strong, Weak or Strong becomes Off). Releasing the key restores it. |
| `LV-VELA-DRAWING-IDS-1` | Reserves the ids of saved drawings so a new drawing never reuses one. |
| `LV-VELA-PAINT-CLIP-1` | Always restores the canvas state after a pane clip, even when drawing throws, and reports both errors. |
| `LV-VELA-DRAWING-PAINT-HOOK-1` | Lets OpenCandle's own drawing types paint themselves inside the normal pane clip. Built-in drawings are unchanged. |
| `LV-VELA-SCALE-BUTTONS-1` | Sizes the A/L price scale buttons and gives them clear tooltips and accessible names. |
| `LV-VELA-SCALE-PLACEMENT-1` | Lets an indicator use a left scale column or a hidden private scale. |
| `LV-VELA-TIME-FORMAT-1` | Lets the app format the crosshair time label (the original label is used if formatting fails). |
| `LV-VELA-CURSOR-KIND-1` | Adds the Cross, Dot, Arrow and Demonstration cursor choices. |
| `LV-VELA-NAV-1` | Keeps panning and zooming from leaving a nearly blank chart; a time scale reset keeps manual price scales; shows a move cursor over drawing handles. |
| `LV-VELA-SCALE-LEFT-1` | Lets the main price scale move to the left side. |
| `LV-VELA-FORWARD-1` | Lets indicator plots extend past the last bar (for example the Ichimoku cloud). |
| `LV-VELA-SCALE-GROUPS-1` | Lets several indicators share one extra price scale. |
| `LV-VELA-RENDER-LEFTOVERS-1` | Small supporting changes: shared scale hand-over, raw bars and bar colors for app layers, and the hovered drawing id. |

Two more changes are applied at build time by Vite transforms, without writing to the installed package:

- `LV-VELA-FUTURE-CALENDAR-1` (`src/chart/vela-future-calendar-transform.mjs`) adds time labels for future dates on the time axis.
- `LV-VELA-INPUT-FEEL-1` (`src/chart/vela-input-feel-transform.mjs`) tunes wheel zoom, time axis dragging and arrow key steps.

Every change is guarded: when the app does not use a feature, Vela behaves as before.

## Applying and checking

`npm install` runs the patch automatically (`postinstall`). You can also run it by hand from the source root:

```text
node src/chart/apply-vela-compat-patch.mjs --check
node src/chart/apply-vela-compat-patch.mjs --apply
node src/chart/apply-vela-compat-patch.mjs --verify
```

The script works only on the exact pinned Vela 0.8.4 files. It checks the SHA-256 hash of every input before and after patching, refuses unexpected versions, changed licence files or linked paths, and restores the original files if anything fails. `npm run build`, `npm test` and `npm run dev` run `--verify` first. The build transforms check their own inputs the same way.

The built app keeps a notice comment in its chart bundle that names every part above. The packaged app also records the input and bundle hashes and includes the patch scripts and plans under `modifications/vela`.

## Licence

Vela stays under its own Apache-2.0 licence. Its LICENSE, NOTICE and on-chart attribution are kept, and the changed files are marked, as section 4 of the [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0) requires. The changes themselves are part of OpenCandle, which is licensed under the PolyForm Noncommercial License 1.0.0 (see LICENSE). LuxAlgo has not reviewed or endorsed OpenCandle.
