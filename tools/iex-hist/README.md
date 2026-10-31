# iex-hist: IEX HIST TOPS to 1-minute bars

Builds real 1-minute OHLCV bars (for example GME and SPY) from **IEX HIST**, the free
historical data that IEX publishes. You need no account, no API key and no third-party
package. The tool is original OpenCandle code and uses only the Python 3.12 standard library.

> Data provided for free by IEX. By accessing or using IEX Historical Data, you agree to the
> [IEX Historical Data Terms of Use](https://www.iex.io/legal/hist-data-terms).

## What it does

1. It reads the public listing at `https://iextrading.com/api/1.0/hist` and picks the
   TOPS 1.6 file for the day you ask for (`--date YYYYMMDD` or `--date latest`). Each day is
   published on the next trading day (T+1).
2. It **streams** that day's `*_IEXTP1_TOPS1.6.pcap.gz` over HTTPS and decompresses it in
   memory. A day's file is about 10 to 12 GB compressed and about 50 GB uncompressed, and
   **nothing large is ever written to disk**. If the connection drops, the tool resumes it in
   place with an HTTP Range request against the same pinned object generation, so no byte is
   downloaded twice.
3. It decodes pcap or pcap-ng framing, Ethernet, IPv4 and UDP, then IEX-TP segment headers
   (Message Protocol ID `0x8003`). It checks sequence numbers to detect gaps and to drop
   duplicate messages. It then decodes TOPS **Trade Report** (`0x54`) and **Trade Break**
   (`0x42`) messages for the symbols you request.
4. It aggregates 1-minute bars keyed by the bar's **start** minute in **America/New_York**
   and writes ISO 8601 timestamps with an explicit offset, for example
   `2026-10-14T09:30:00-04:00`. DST follows the US rule in force since 2007. IEX HIST
   begins in 2016.
5. It writes one CSV per symbol and one provenance sidecar JSON per CSV.

## Bar rule (sale-condition eligibility)

These are the field offsets from the IEX TOPS Specification v1.66
(<https://www.iex.io/documents/tops-v1-66>). All fields are little endian.
- `0` type, `1` sale condition flags, `2` timestamp (int64 ns since the epoch, UTC),
  `10` symbol (8 bytes, space padded), `18` size (uint32 shares),
  `22` price (int64, 4 implied decimals), `30` trade ID (int64). The message is 38 bytes.
- Flags: `0x80` ISO, `0x40` Extended Hours (Form T), `0x20` Odd Lot,
  `0x10` Trade Through Exempt, `0x08` Single-price Cross.

Appendix A, *Trade Eligibility Guidelines*: a trade is **Last Sale eligible** and
**High/Low eligible** only when the Extended Hours flag **and** the Odd Lot flag are both 0.
The other flags may be 0 or 1. **Every** trade is Volume eligible. The tool applies these
rules as follows:

| Bar field | Uses |
|---|---|
| open, close | first and last trade with `flags & 0x60 == 0` in the minute, in feed order (the spec guarantees that, per symbol, timestamps never decrease) |
| high, low | max and min price over those same eligible trades |
| volume | all non-broken trades in that minute, odd lots included (they are volume eligible) |
| bar exists | only if the minute has at least one price-eligible trade. No price is ever invented. |

- Volume in minutes with no price-eligible trade cannot go into a bar. Those are
  pre-market and after-hours (Form T) minutes and odd-lot-only minutes. The sidecar
  reports that volume as `volume_in_minutes_without_price_eligible_trade`.
- A Trade Break removes the referenced Trade ID completely.
- Form T trades are not price eligible, so in practice the bars cover the **regular
  session**. The first and last bars are IEX trades, not official opening or closing prices.
- Prices are written as exact decimals taken straight from the 4-implied-decimal integers,
  with no floating-point rounding.

## Important caveat: IEX venue only

TOPS reports trades **matched on IEX** only. Routed executions are excluded. This is **not**
consolidated tape data. IEX handles a small share of US equity volume, so expect the
following:
- Volume is a small fraction of consolidated volume.
- Highs and lows can be inside the consolidated range.
- Quiet minutes have no bar. They are gaps, not zero-volume bars, and OpenCandle keeps them
  as gaps.

The IEX terms say the same thing: the data "does not reflect trading activity on markets other
than IEX" and is "intended to provide you with a reference point only, rather than as a basis
for making trading decisions."

## Terms and required attribution

Source: <https://www.iex.io/legal/hist-data-terms>. In short:
- If you distribute or give anyone access to IEX historical data, you must cite IEX with
  this exact text and link: **"Data provided for free by IEX. By accessing or using IEX
  Historical Data, you agree to the IEX Historical Data Terms of Use."**
  (<https://www.iex.io/legal/hist-data-terms>)
- IEX keeps all proprietary rights. The data is provided "as is" with no warranty. Illegal
  use is prohibited.
- The output is local user data under `local-data/`. It is not shipped with OpenCandle.
  Keep the attribution with any copy you share.

## Usage

The examples use `%LOCALAPPDATA%\Programs\Python\Python312\python.exe` as Python.

```
# Most recent listed day, GME + SPY (the defaults), into local-data/imports/iex-<date>/
python -I tools\iex-hist\iex_tops_bars.py --date latest --progress %TEMP%\iex-progress.json

# A specific day and symbols
python -I tools\iex-hist\iex_tops_bars.py --date 20261014 --symbols GME,SPY,AAPL

# Test guard: stop after 64 MiB compressed. Output goes to iex-<date>-partial/ and is
# marked complete_day=false.
python -I tools\iex-hist\iex_tops_bars.py --date 20261014 --max-bytes 67108864

# Re-run on a local capture (pcap, pcap-ng, gzip or not)
python -I tools\iex-hist\iex_tops_bars.py --file capture.pcap.gz --file-date 2026-10-14 --out some\dir
```

A full day takes roughly 10 to 30 minutes, depending on bandwidth (a fast path decodes
about 0.75 million frames per second). Progress goes to stderr, and also to `--progress`
as JSON when you pass it.

Tests use a hand-built **synthetic** capture and need no network:

```
python -I tools\iex-hist\test_iex_tops_bars.py
```

## Outputs

`local-data/imports/iex-YYYY-MM-DD/`
- `<SYM>_IEX-TOPS_<YYYYMMDD>_1m.csv`: header `time,open,high,low,close,volume,symbol`,
  UTF-8, LF line endings, chronological, one symbol per file.
- `<SYM>_IEX-TOPS_<YYYYMMDD>_1m.csv.provenance.json`: source and file URLs, file date,
  compressed bytes streamed, completeness (gzip EOF reached and byte count equal to the
  listed size), retrieval start and finish times, IEX-TP sequence accounting (messages, gaps,
  duplicates), per-symbol trade counts (eligible and ineligible by reason, broken), volume
  breakdown, the CSV's SHA-256, the eligibility rule, the venue caveat, the attribution text
  and a suggested source label.

## Importing into OpenCandle

1. Open **Import data**, choose the CSV and keep Format = CSV.
2. Fill in the fields:
   - **Symbol**: `GME` or `SPY`. It must match the file's `symbol` column.
   - **Resolution**: `1m`.
   - **Exchange**: `IEX`. This is the venue the trades come from. It keeps the chart ID
     (`IEX:GME`) from suggesting consolidated NYSE prices.
   - **Asset class**: stock (GME) or ETF (SPY).
   - **Currency**: USD. **Tick size**: 0.01. **Lot size**: 1.
   - **Exchange timezone**: `America/New_York`.
   - **Adjustment**: Raw (as traded).
   - **Session**: Regular trading hours only.
3. Source description (160 characters or fewer). Copy `suggested_source_label` from the
   sidecar, for example:
   `IEX HIST TOPS 2026-10-14, IEX venue trades only, 1-minute bars, retrieved 2026-10-16. Data provided for free by IEX.`
   The retrieval date is the UTC date. The app adds its own period after the label, so you
   can drop the final period.
4. Read the preview and press **Import and open**.

The app accepts these files because they meet its import rules: ISO timestamps with an
explicit offset and no sub-second part, positive plain-decimal prices, consistent OHLC, one
symbol, a size well under 20 MiB, and far fewer than 100,000 rows.
