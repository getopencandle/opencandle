# Testing

OpenCandle uses [Vitest](https://vitest.dev) for unit, model and component tests (`tests/**/*.test.ts`, about 1,700 files), plus a few Node and Python tests for scripts and tools. All tests use synthetic data and mocked provider endpoints; no test needs an API key or network access.

## Everyday use: run what you touched

```powershell
npm test -- tests/domain/indicator-catalog-oracles.test.ts   # one file
npm test -- tests/chart                                      # one folder
npm test -- -t "Supertrend"                                  # tests whose name matches
npm run test:watch -- tests/ui                               # watch mode
```

`npm test` runs `vitest run --no-fs-module-cache --no-cache` after verifying the Vela patch. If you call Vitest directly, always pass `--no-fs-module-cache --no-cache`: persistent transform caches grow very large with this suite.

The `tests/` folder mirrors `src/`, so the tests for `src/domain/alerts...` live under `tests/domain/`, and so on.

## Full suite

The full suite is large. Run it in shards with one worker each, and give Node more memory:

```powershell
$env:NODE_OPTIONS = "--max-old-space-size=6144"
1..8 | ForEach-Object { npx vitest run --no-fs-module-cache --no-cache --maxWorkers=1 --shard=$_/8 }
```

In Git Bash:

```bash
for i in 1 2 3 4 5 6 7 8; do
  NODE_OPTIONS=--max-old-space-size=6144 npx vitest run --no-fs-module-cache --no-cache --maxWorkers=1 --shard=$i/8
done
```

Single-worker runs also keep the performance tests (which measure model timings) stable, because no other workers compete for the CPU.

## Other tests

| Tests | Command |
| --- | --- |
| Node script tests | `node --test "tests/scripts/*.test.mjs"` |
| IEX HIST tool | `python tools/iex-hist/test_iex_tops_bars.py` |
| Typecheck (source and tests) | `npm run typecheck` (`tsc --noEmit -p tsconfig.test.json`; `npm run build` checks `src/` only) |

A few layout tests (under `tests/ui/`) drive a headless Microsoft Edge through Playwright to measure real DOM layout. They expect Edge at its default Windows location.

## Writing tests

- Use synthetic data. Generators and fixtures live in `tests/fixtures/` and `tests/helpers/`. Never commit real market data, real keys or personal files.
- Prefer testing the domain function directly (`src/domain/`) over rendering the UI.
- For a new indicator, include a short synthetic series with expected values computed independently (for example with a small script), and cover the warm-up bars and gaps.
- Keep tests deterministic: no wall-clock time, randomness without a fixed seed, or network calls.
