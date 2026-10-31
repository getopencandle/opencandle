# Contributing to OpenCandle

Thanks for helping. This guide covers setup, tests, style and how to send a change.

You keep the copyright in your contribution. By submitting it, you grant the OpenCandle project maintainer a perpetual, irrevocable, worldwide, royalty-free licence to use, modify, sublicense and relicense it under any terms, including commercial ones.
You also confirm that you have the right to contribute it. Please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Setup

1. Install Node.js 24 LTS (22.12 or later works) and Git. Windows 10 or 11 x64 is the supported platform.
2. Clone and install:

   ```powershell
   git clone https://github.com/getopencandle/opencandle.git
   cd opencandle
   npm ci
   ```

   `npm ci` also applies a small compatibility patch to the Vela charting library (`src/chart/apply-vela-compat-patch.mjs`). `npm run dev`, `npm run build` and `npm test` verify the patch first and stop if it is missing.

3. Run the app:
   - `npm run build` then `npm start` for the desktop app.
   - `npm run dev` for a quick browser view of the renderer (desktop-only features are disabled there).

## Running tests

Run only the tests that touch your change while you work, then the related folder before you open a pull request.

```powershell
npm test -- tests/domain/indicator-catalog-oracles.test.ts   # one file
npm test -- tests/chart                                      # one folder
npm test -- -t "Bollinger"                                   # tests whose name matches
```

Always keep the `--no-fs-module-cache --no-cache` flags if you call Vitest directly (`npm test` adds them for you). The full suite and sharding are described in [docs/testing.md](docs/testing.md).

Before a pull request, also run `npm run typecheck` (source and tests) and `npm run build` (source typecheck and renderer build).

## Style

**Code**
- TypeScript in `src/`, CommonJS in `electron/`. Match the style of the file you are editing.
- Keep the renderer free of Node access. Anything that touches files, the network or keys goes through a fixed, validated bridge call in `electron/preload.cjs` and is handled in the main process.
- Tests use synthetic data only. Never add real market data, real API keys or personal files to fixtures. Test keys must look obviously fake (for example `SYNTHETICKEY0000ABCD`).

**User-visible text**
- Plain, short sentences. Say what happens and what the user can do.
- No em dashes in UI text. Use a colon, a comma, parentheses or a new sentence instead.
- Do not show internal ids, schema names or debug wording to users.
- Call the product "OpenCandle" and the scripting language "CandleScript".

**Visual identity**
- OpenCandle has its own look: its own themes, colours, icons and layout. Do not copy another platform's trade dress, icons, artwork, wording or colour schemes. Feature ideas are welcome; copied designs are not.
- Icons are original SVG components in `src/ui/icons/`.
- Never hide, remove or obscure the Vela attribution mark on charts. Its licence requires it to stay visible (see [NOTICE](NOTICE)).

## Proposing indicators and drawing tools

Open an issue first so we can agree on scope before you write code. Please include:

- **What it is**: name, purpose, and a public reference for the formula or construction (a paper, book or well-known definition).
- **Inputs and defaults**: every input, its default, and its valid range.
- **Exact behaviour**: how the first bars behave before the window is full, how gaps and missing volume are handled, and rounding.
- **Test data**: a small synthetic series with expected values, ideally computed independently (a short script or spreadsheet you can share).
- For drawing tools: anchor points, how the tool snaps, what settings it has, and how it should look when selected.

Write the formula yourself from the public definition. Only reuse code under a permissive licence (MIT, BSD, ISC or Apache-2.0); never GPL, AGPL or unlicensed code.

Indicators live under `src/domain/` (catalog files under `src/domain/indicators-ext/`), and drawing tools under `src/chart/` and `src/ui/drawing-tool-catalog.ts`. Look at a similar existing one and follow its pattern.

## Pull request checklist

- [ ] I agree to the contributor licence grant at the top of this file.
- [ ] The change is focused on one thing, and the description says what and why.
- [ ] Tests added or updated, using synthetic data only.
- [ ] Targeted tests pass, and `npm run build` passes.
- [ ] No real keys, personal paths, personal data or market data in code, tests or docs.
- [ ] User-visible text is plain, has no em dashes, and shows no internal ids.
- [ ] No third-party code, artwork or trade dress copied in; any new dependency has a permissive licence (MIT, BSD, ISC or Apache-2.0) and is added to [THIRD_PARTY.md](THIRD_PARTY.md).
- [ ] The Vela attribution mark is still visible on charts.
- [ ] Docs updated if behaviour changed, and a line added under "Unreleased" in [CHANGELOG.md](CHANGELOG.md).

## Reporting bugs, ideas and questions

Bugs and feature ideas go in [GitHub Issues](https://github.com/getopencandle/opencandle/issues). Questions and general discussion go in [GitHub Discussions](https://github.com/getopencandle/opencandle/discussions).

For a bug, open a GitHub issue with the OpenCandle version, Windows version, steps to reproduce, and what you expected. If a file is needed, use a small synthetic one. Do not attach keys, profiles or workspaces that contain personal information. Security problems go through [SECURITY.md](SECURITY.md), not public issues.
