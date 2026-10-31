# Calendar local import format (LV-C07)

LV has no connected economic or corporate event feed. The calendar shows only events you import, plus an optional, clearly labelled synthetic demo. Empty or missing coverage is reported as unavailable, never as "no events happened".

## How to get data in

Open Calendar, then "Import and manage local event documents":

1. Choose JSON file (desktop package, JSON only), or paste JSON or CSV and press Preview import.
2. Check the preview counts and diagnostics, then Add preview to draft.
3. Apply saves the draft into the workspace. Cancel, Escape or the close button discard it.

"Insert empty JSON document template" and "Insert CSV header template" fill the paste box with an event-free skeleton. "Preview synthetic demo events" builds invented events (titles start with "Synthetic demo:", countries XA/XB, symbols SYNTH1 to SYNTH7, venue DEMO EXCHANGE). The demo document is labelled SYNTHETIC everywhere and still needs Add preview and Apply.

## Accepted JSON

- an array of events (provenance comes from the Source label, Source URL, Rights and Synthetic fields),
- one document `{ "schemaVersion": 1, "id", "provenance": { "kind": "local-import" | "synthetic", "label", "sourceUrl", "importedAt", "license", "fixture" }, "events": [...] }`,
- an exported LV calendar state `{ "schemaVersion": 1, "documents": [...], "query": {...} }` (replaces the draft).

Limits: 10 MiB and 50,000 events per import, 20 MiB and 50,000 revisions for the whole state.

## Event fields

| Field | Notes |
| --- | --- |
| `id`, `kind`, `title`, `date` | Required. `kind` is economic, earnings, dividend, ipo or split. `date` is YYYY-MM-DD as the source lists it. |
| `revision` | Integer from 1. Several revisions of one `id` are kept; the newest one published by the cutoff is shown, earlier ones form the revision history. |
| `publishedAt` | When this revision became known (Unix seconds or ISO with Z/offset). Unknown publication is shown as such and excluded from historical cutoffs. |
| `time`, `timezone`, `timing` | `time` only with `timing: "exact"` and an IANA `timezone`; `date` must equal the time's date in that zone. Other timings (date-only, before-open, after-close, unknown) must not carry a time. |
| `country`, `category`, `importance`, `status` | importance low/medium/high or absent (never treated as high). status scheduled, confirmed, released, cancelled or tentative. |
| `symbol`, `instrumentId`, `exchange`, `fiscalPeriod`, `exDate`, `payDate` | Optional. `exchange` was added in LV-C07 for IPO venues; older data restores it as null. |
| `values` | Named values, each `{ "value": number or null, "unit": text, "availableAt": time or null }`. |

Value names: `actual`, `forecast`, `prior`, `priorRevisedFrom` (the originally reported prior, shown beside a revised `prior`), `epsActual`, `epsForecast`, `revenueActual`, `revenueForecast`, `marketCap`, `dividendAmount`, `dividendYield`, `offerPrice` (ISO currency or currency/share), `sharesOffered`, `sharesOutstanding` (unit `shares`), `splitNumerator`, `splitDenominator`. Use null for missing values, never 0. A value whose `availableAt` is after the cutoff is shown as "Not yet available".

Derived columns (not imported): EPS and revenue surprise `(actual - estimate) / |estimate| x 100` with matching units and a nonzero estimate; IPO deal amount `offer price x shares offered`; IPO market cap `offer price x shares outstanding`; split ratio `numerator / denominator`.

## CSV

One row per event revision. Headers must be unique known field names and include `id`, `kind`, `title` and `date`. Values use three columns each: `name`, `nameUnit`, `nameAvailableAt` (for example `actual`, `actualUnit`, `actualAvailableAt`). Empty cells mean missing. A malformed row rejects the whole import.

## Exports

- Export full calendar JSON: all documents, revisions, provenance and filters; re-importable.
- Export visible CSV report: the current rows with cutoff-masked values, provenance, revision changes; not an import format.
- Add to calendar (iCalendar text): one event as RFC 5545 text, without values. Saved locally as a .ics file; nothing is transmitted.
