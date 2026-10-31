# Third-party software

OpenCandle is licensed under the PolyForm Noncommercial License 1.0.0. It is built on the open-source packages below, which keep their own permissive licences. Packaged builds include the full licence and notice text of every production package in `THIRD-PARTY-NOTICES.txt`.

This list covers the production dependency tree in `package-lock.json` (53 packages: 52 MIT, 1 Apache-2.0). Regenerate it whenever dependencies change.

## Notable components

- **Vela** (`@luxalgo/vela`, Apache-2.0) by LuxAlgo renders the charts. Its NOTICE requires a visible Vela attribution on every screen that shows a chart; OpenCandle keeps the built-in mark. OpenCandle applies a documented patch to Vela at install and build time; see [docs/vela-modification.md](docs/vela-modification.md). The Vela NOTICE is reproduced in [NOTICE](NOTICE).
- **QuickJS** via `quickjs-emscripten` (MIT) runs CandleScript in a sandbox. Packaged builds include only the three runtime modules they need: `quickjs-emscripten-core`, `@jitl/quickjs-wasmfile-release-sync` and `@jitl/quickjs-ffi-types`.
- **Electron** (MIT) is the desktop runtime. Packaged builds include Electron's `LICENSE` and `LICENSES.chromium.html`.

## Production dependencies

Direct dependencies are marked with *.

| Package | Version | Licence | Source |
| --- | --- | --- | --- |
| @codemirror/autocomplete | 6.20.3 | MIT | https://code.haverbeke.berlin/codemirror/autocomplete |
| @codemirror/commands | 6.11.1 | MIT | https://code.haverbeke.berlin/codemirror/commands |
| @codemirror/lang-javascript * | 6.2.5 | MIT | https://github.com/codemirror/lang-javascript |
| @codemirror/language | 6.13.1 | MIT | https://code.haverbeke.berlin/codemirror/language |
| @codemirror/lint | 6.9.7 | MIT | https://code.haverbeke.berlin/codemirror/lint |
| @codemirror/search | 6.7.2 | MIT | https://code.haverbeke.berlin/codemirror/search |
| @codemirror/state | 6.7.6 | MIT | https://code.haverbeke.berlin/codemirror/state |
| @codemirror/streamparser | 6.0.0 | MIT | https://code.haverbeke.berlin/codemirror/streamparser |
| @codemirror/view | 6.43.14 | MIT | https://code.haverbeke.berlin/codemirror/view |
| @floating-ui/core | 1.8.0 | MIT | https://github.com/floating-ui/floating-ui |
| @floating-ui/dom | 1.8.0 | MIT | https://github.com/floating-ui/floating-ui |
| @floating-ui/utils | 0.2.12 | MIT | https://github.com/floating-ui/floating-ui |
| @jitl/quickjs-ffi-types | 0.32.0 | MIT | https://github.com/justjake/quickjs-emscripten |
| @jitl/quickjs-wasmfile-debug-asyncify | 0.32.0 | MIT | https://github.com/justjake/quickjs-emscripten |
| @jitl/quickjs-wasmfile-debug-sync | 0.32.0 | MIT | https://github.com/justjake/quickjs-emscripten |
| @jitl/quickjs-wasmfile-release-asyncify | 0.32.0 | MIT | https://github.com/justjake/quickjs-emscripten |
| @jitl/quickjs-wasmfile-release-sync | 0.32.0 | MIT | https://github.com/justjake/quickjs-emscripten |
| @lezer/common | 1.5.3 | MIT | https://code.haverbeke.berlin/lezer/common |
| @lezer/highlight | 1.2.5 | MIT | https://code.haverbeke.berlin/lezer/highlight |
| @lezer/javascript | 1.5.6 | MIT | https://code.haverbeke.berlin/lezer/javascript |
| @lezer/lr | 1.4.11 | MIT | https://code.haverbeke.berlin/lezer/lr |
| @luxalgo/vela * | 0.8.4 | Apache-2.0 | https://github.com/luxalgo/vela |
| @marijn/find-cluster-break | 1.0.4 | MIT | https://code.haverbeke.berlin/marijn/find-cluster-break |
| @zag-js/anatomy | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/machine |
| @zag-js/aria-hidden | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/aria-hidden |
| @zag-js/core | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/machine |
| @zag-js/dialog | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/dialog |
| @zag-js/dismissable | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/interact-outside |
| @zag-js/dom-query | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/dom-helpers |
| @zag-js/focus-trap | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/focus-trap |
| @zag-js/focus-visible | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/focus-visible |
| @zag-js/interact-outside | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/interact-outside |
| @zag-js/menu | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/menu |
| @zag-js/popper | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/popper |
| @zag-js/rect-utils | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/rect |
| @zag-js/remove-scroll | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/remove-scroll |
| @zag-js/store | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/store |
| @zag-js/tooltip | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/tooltip |
| @zag-js/types | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/types |
| @zag-js/utils | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/utilities/core |
| @zag-js/vanilla | 1.46.0 | MIT | https://github.com/chakra-ui/zag/tree/main/packages/frameworks/vanilla |
| codemirror * | 6.0.2 | MIT | https://github.com/codemirror/basic-setup |
| crelt | 1.0.7 | MIT | https://code.haverbeke.berlin/marijn/crelt |
| csstype | 3.2.3 | MIT | https://github.com/frenic/csstype |
| decimal.js * | 10.6.0 | MIT | https://github.com/MikeMcl/decimal.js |
| proxy-compare | 3.0.1 | MIT | https://github.com/dai-shi/proxy-compare |
| quickjs-emscripten * | 0.32.0 | MIT | https://github.com/justjake/quickjs-emscripten |
| quickjs-emscripten-core | 0.32.0 | MIT | https://github.com/justjake/quickjs-emscripten |
| react * | 19.3.0 | MIT | https://github.com/react/react |
| react-dom * | 19.3.0 | MIT | https://github.com/react/react |
| scheduler | 0.28.0 | MIT | https://github.com/react/react |
| style-mod | 4.1.4 | MIT | https://code.haverbeke.berlin/marijn/style-mod |
| w3c-keyname | 2.2.8 | MIT | https://github.com/marijnh/w3c-keyname |

## Development tools

These are used to build and test OpenCandle. Electron is the only one shipped in packaged builds.

| Package | Version | Licence |
| --- | --- | --- |
| @electron/fuses | 2.1.2 | MIT |
| @electron/packager | 19.0.3 | BSD-2-Clause |
| @types/node | 24.10.1 | MIT |
| @types/react | 19.2.14 | MIT |
| @types/react-dom | 19.2.3 | MIT |
| electron | 44.7.2 | MIT |
| playwright | 1.64.0 | Apache-2.0 |
| typescript | 7.0.2 | Apache-2.0 |
| vite | 8.3.4 | MIT |
| vitest | 5.0.4 | MIT |

Their own dependencies include packages under MIT, ISC, BSD, Apache-2.0, BlueOak-1.0.0, MPL-2.0 (lightningcss, used by the build only) and CC-BY-3.0 (spdx-exceptions data) licences. None of these are included in the app.

## Bundled data

The example files in `examples/` and the built-in practice series are synthetic and were created for OpenCandle. No third-party market data is included in the source or in packaged builds.

The optional `tools/iex-hist` tool downloads data published by IEX. Data provided for free by IEX; by using IEX Historical Data you agree to the [IEX Historical Data Terms of Use](https://www.iex.io/legal/hist-data-terms).
