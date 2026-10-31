# Using local Watchlist Advanced View data

Open **Advanced View** from the watchlist. The Overview tab uses the exact source bound to each row. Earnings and Dividends use documents already imported into Calendar. News uses documents already imported into News. There is no automatic market, news, fundamental or FX feed in this view.

Choose a tab, Overview mode, grouping and optional summary. Click a numeric cell to inspect its definition, native units, source, timestamp and availability. **Apply** saves view settings and analysis data locally. **Cancel**, Escape and the close control discard the draft. **Reset view draft** resets settings while retaining draft data. Opening a chart or Notes leaves this draft without saving it. Notes does not switch the chart.

The default GME and SPY rows are synthetic. Their generated prices and any supplied synthetic observations are not actual issuer or exchange data. An unresolved imported ticker stays unresolved until an exact matching source is supplied.

## Importing observations and FX

Expand **Import supplied observations, associations and FX**. Choose a JSON file or paste JSON, then select **Preview analysis import**. Inspect the record counts and select **Replace draft with preview**. This replaces the draft envelope. **Apply** is the separate save step. An invalid file, cancelled chooser or rejected workspace save leaves accepted data unchanged.

The [synthetic example](../examples/watchlist-advanced-synthetic.json) contains made-up GME financial observations explicitly associated with `SYNTHETIC:GME`. It can be used with the default synthetic GME watchlist row. Import it and select Financials to see the fictional revenue and EPS. Sector grouping uses its fictional sector. It contains no actual GME financial data, event or news. Export your existing envelope first if you want to retain it, because replacement does not merge envelopes.

Files use this exact outer shape:

```json
{"schemaVersion":1,"observations":[],"associations":[],"fx":[]}
```

Limits are 10 MiB UTF-8, 10,000 records per array, 20,000 records combined, 500,000 structural nodes and 16 nested levels. IDs/revisions must be unique within an array. Revisions are positive safe integers. Numeric values must be finite and within the JavaScript safe numeric magnitude. Times are integer Unix seconds in years 0001 through 9999. Unknown values use JSON `null`, never zero or an empty string.

**Export analysis JSON** saves the current draft envelope in the same format. It does not export view settings, calendar/news documents or OHLC bars. View settings are retained by the local workspace export. Import and export cancellation do not save or clear the draft.

## Observation fields

Every observation has these fields, with no extra keys:

| Field | Meaning |
| --- | --- |
| `id`, `revision` | Stable observation identity and revision number. The highest eligible revision of an ID is selected. |
| `market` | Exact `exchange`, `symbol` and boolean `synthetic`. Actual and synthetic markets remain separate even when their names match. |
| `metric` | One of the metric IDs below, or `sector`. |
| `value` | Number or null. `sector` takes a string or null. |
| `unit` | `currency`, `currency/share`, `percent`, `ratio`, `shares`, `oscillator`, or `category`. |
| `currency` | Recognized ISO currency for monetary units; otherwise null. |
| `period` | Exact object with `label`, `start`, `end`. Endpoints are Unix seconds or null, ordered when supplied and not later than `asOf`. |
| `asOf` | Event/valuation timestamp. This does not establish when the information became available. |
| `availableAt` | Publication/availability timestamp, or null when unknown. Historical cutoffs exclude unknown availability and later publications. |
| `definition` | Plain-text methodology. Distinguish reported versus diluted EPS, annual versus quarterly data and any estimate. |
| `source` | Exact object with `label`, `datasetId`, `basisKey`, `fixture`, `adjustment`. Dataset/basis may be null for explicitly market-level observations. `fixture` must equal `market.synthetic`. |
| `coverage` | `complete-period`, `partial`, or `unknown`. A declaration is not independently validated source coverage. |
| `state` | `ready`, `stale`, `disconnected`, or `unavailable`. |

`source.adjustment` is `raw`, `split-adjusted`, `total-return` or `unknown`. Keep the declared basis consistent with the metric. The basis key is OpenCandle's canonical versioned source identity, not a ticker or URL. Supplied Last, change and volume observations require the exact matching basis key; ordinary price calculations already use the source bound to the row. Do not invent a basis key to force an association.

| Mode | Metric IDs |
| --- | --- |
| Price | `last`, `change`, `changePercent`, `volume`, `averageVolume10`, `marketCap` |
| Financials | `revenue`, `reportedEps`, `peDilutedTtm`, `beta`, `dividend`, `yield` |
| Performance | `performanceWeek`, `performanceMonth`, `performanceThreeMonths`, `performanceYtd`, `performanceYear`, `performanceFiveYears`, `performanceAllTime` |
| Risk | `beta1y`, `beta3y`, `beta5y`, `volatility1d`, `volatility1w`, `volatility1m` |
| Technicals | `ratingAll`, `ratingMa`, `ratingOscillator`, `rsi14`, `momentum10`, `ao`, `cci20` |

Expected units: prices, changes, EPS, dividends, AO and Momentum use `currency/share`; revenue and market cap use `currency`; volume fields use `shares`; returns, yield and volatility use `percent`; RSI and CCI use `oscillator`; the remaining numeric metrics use `ratio`. Supplied ratings currently require numeric values and a declared definition; there is no reference-equivalent category mapping. Sector uses `category` with no currency.

Performance requires percent units, explicit endpoints and complete-period coverage. All time additionally requires `period.label` equal to `all-time:full-listing-history`. These declarations do not prove a provider has full listing history. The reference's exact Advanced View performance anchors remain unresolved. OpenCandle does not calculate them from five, 21 or 252 arbitrary loaded bars.

If two different eligible IDs supply the same metric and basis, the cell is ambiguous. Remove the unwanted definition/source from the envelope instead of relying on array order. A supplied unavailable observation stays unavailable; OpenCandle does not silently replace it with a different source.

## Calendar and news associations

Qualified `EXCHANGE:SYMBOL` tags match only the same synthetic/actual basis. Calendar instrument IDs may match an unambiguous bound market. Bare tickers are not sufficient. To associate an imported item explicitly, add:

```json
{
  "id":"association-example", "revision":1,
  "market":{"exchange":"SYNTHETIC","symbol":"GME","synthetic":true},
  "kind":"news", "documentId":"YOUR_IMPORTED_DOCUMENT_ID",
  "itemId":"YOUR_IMPORTED_ITEM_ID", "availableAt":null,
  "source":"User-declared association; verify these exact IDs"
}
```

Use `kind:"calendar"` for events. Copy IDs from your local document export; these placeholder IDs do not identify a real article. Synthetic associations cannot make actual news appear to describe a synthetic instrument. Unknown availability is allowed only in the latest supplied view, with no claim of historical availability.

Earnings shows supplied upcoming events. Dividends filters the chosen ex-date or payment date from today through the next 13 calendar dates in the chosen timezone. Date-only events keep their date. They do not become invented midnight observations. Actual/forecast values and calculated surprise retain their individual publication guards. Frequency and event-time market-cap joins are currently unavailable.

## FX and summary behavior

An FX record has `id`, `revision`, `currency`, `rate`, `valuationDate`, `asOf`, `availableAt`, `source`, and `fixture`. `rate` means positive USD per one native currency unit. `valuationDate` is a valid `YYYY-MM-DD` UTC date. A USD display cell requires exactly one eligible rate for its native currency, synthetic basis and valuation date, with the FX as-of no later than the cell's as-of. USD values need no FX record. A rate of 1.2 for EUR converts EUR100 to USD120. Ratios, percentages, shares and oscillator values are not converted.

Missing or ambiguous FX makes the converted value unavailable while preserving its native value for inspection. Summaries remain native. They require matching units, currency, period and definition. EUR100 and USD110 cannot produce a raw combined mean. Percentage summaries remain unavailable until reference eligibility is settled. Missing values are excluded with an eligible/total count, not converted to zero. Numeric sorting first partitions compatible displayed bases and then sorts within each partition.

Composition counts distinct qualified markets equally. It is not capital allocation or inferred issuer ownership. Multiple provider rows for one qualified synthetic/actual market count once; missing or conflicting classifications stay Unknown. Current count meters are functional, but pie-chart visual conformity is not implemented.

## What has been tested

Model and controlled component-handler tests cover calculation oracles, source identity, availability, malformed imports, stale actions and publication rejection. They do not establish native window operation, keyboard focus, a working chooser on this host, installation behavior or reference equivalence. The 1,000-symbol by 500-bar synthetic workload took about 871 ms synchronously on this machine; that is a measurable blocking interval, not a claim of interactive responsiveness. Performance and reference equivalence remain unverified; large supplied lists can briefly block this view.
