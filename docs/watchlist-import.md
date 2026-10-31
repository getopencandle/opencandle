# Local watchlists

Watchlists use local data. The initial GME and SPY demo sources and prices are synthetic. Importing a ticker identifier does not connect a feed or supply a quote. A row without an exact supplied source shows unavailable values.

Click a row to select its details and open its exact source in the active chart after a 300 ms delay. Double-click cancels the pending single-click action and opens that source on all charts, after every chart accepts it. The delay is an OpenCandle policy and does not read Windows double-click preferences. A later double-click cannot undo an already accepted single-click. Modified clicks select rows without opening charts. Enter and Open chart open immediately. Right-click a row for local source, flag, section, note, copy and removal controls. Native interaction and reference timing remain unverified.

Drag a column's right edge to resize it. Focus the edge with the keyboard and use Left or Right for one-pixel steps, Shift with an arrow for ten pixels, Home for 48 pixels or End for 400 pixels. Escape cancels an unfinished drag. A changed list owner, closed panel or opened panel dialog retires the unfinished resize. Accepted widths are stored in the local workspace and watchlist JSON.

Notes are plain text stored locally. Use Notes, a row's note icon, Add note in the selected-symbol details, a screener row action or Alt+N while the chart workspace has focus. Alt+N targets the current chart market and does not run in an editor or dialog. Each associated note records exchange, ticker and whether its market is synthetic. Notes remain available after a watchlist row or list is deleted. Switching away from an edited draft offers Save, Discard or Keep editing; deleting a note requires its current revision and confirmation. Browsing notes does not change the chart. The book allows at most 1,000 notes, each at most 64 KiB UTF-8, within its existing 2 MiB total limit. Notes are not sent to a server.

Open Watchlist import and export from the watchlist toolbar. Choose a local TXT or JSON file, or paste text and select its format. Imports create new lists. Nothing runs or connects when a file is imported. Both native file import and the watchlist document are limited to 2 MiB. Native text must be valid UTF-8; malformed encoding is rejected. TXT permits at most 5,000 identifiers. A saved book permits 100 custom lists, 5,000 rows in one list, 20,000 rows overall and 5,000 global flags.

TXT uses comma-separated, exchange-prefixed identifiers. This original example declares unresolved local identifiers and contains no market prices:

```text
LOCAL:DEMO1,LOCAL:DEMO2
```

For supplied market data, use its declared exchange and ticker, for example `NYSE:GME`. Identifiers are normalized to uppercase. Do not use section markers, URLs, scripts or bare tickers. A malformed or duplicate member rejects the import as a whole; existing lists remain intact. Sections cannot be imported from TXT. Use OpenCandle JSON to preserve them.

Select a row and choose Source to bind an imported dataset. Its ticker and declared exchange must match exactly. The CSV import's Exchange field must therefore identify the intended market. An unresolved real-market identifier cannot silently use the synthetic demo source. Several datasets can describe the same ticker; source IDs distinguish them. Missing or ambiguous matches remain unavailable. A source choice explicitly identifies the provider, interval, session, adjustment and synthetic status.

Last comes from the selected primary source. Daily change, daily change percentage and daily volume use supplied daily history. An optional daily companion must match the primary instrument, provider, currency, session, adjustment and time zone, and must be original daily data. It does not replace the primary Last or its timestamp. Missing history shows N/A. No live or extended-hours quote is invented.

Export full watchlist JSON to retain custom lists, sections, flags, source references, sorting, display settings and notes. It exports the watchlist book, not chart bars or the rest of the workspace. Importing that JSON merges new lists and notes with fresh identities; existing display preferences and flag colors take precedence. Global flags apply to the market identifier across lists. Source references require the corresponding locally supplied data to resolve after import.

Export active list TXT to export only the market identifiers in that list. If it has sections, explicitly select flattening or use JSON. TXT does not retain sections, source bindings, flags, names, display settings or notes. Both exports use the native Save dialog and write only to the destination you choose. Local list names, source IDs and note text are intentional parts of JSON; consider them before sharing the file.

Cancel or close an import/export dialog to ignore its pending UI result. Editing the import buffer invalidates an earlier file-selection result. Closing the panel does not undo a file already written after you authorized a native Save. Native dialog execution, desktop double-click behavior and full reference parity remain pending. Licensed company logos, hotlists and further advanced watchlist features remain open requirements. Notes, column dragging and the click-delay behavior described here are newer source changes than package 20261014T161020398Z-4cb3f959a429; they have not yet received packaged GUI verification.
