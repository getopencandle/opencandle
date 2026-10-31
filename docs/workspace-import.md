# Local workspace copies and recovery

These instructions apply to builds with **Local storage → Restore from export**. The earlier 710-test development artifact does not include that control. Native file dialogs, replacement and restart behavior still require executable verification; passing model tests does not certify them.

OpenCandle saves on this computer. A complete export contains charts, drawings, indicators, watchlists, original scripts, imported datasets, alerts and ordinary virtual paper-trading state. It can contain your local source text and data. Keep copies somewhere you control. There is no cloud account or hosted backup. Built-in demonstration prices remain labeled synthetic; paper money and orders are virtual.

To make a copy, open **Local storage → Export complete workspace**, choose a JSON filename in the native Save dialog, and check the displayed result. Cancel leaves the saved workspace unchanged. Moving the portable application folder does not move its separate local workspace folder, whose location is displayed in Local storage.

To replace the current workspace:

1. Export the current workspace first if you want to keep it.
2. Choose **Restore from export → Choose workspace JSON**, or paste the complete exported JSON into the draft. Native import accepts strict UTF-8 JSON up to 64 MiB; the compact workspace data must fit 32 MiB. Use an OpenCandle export containing exactly `schemaVersion: 1` and `data`. The internal `workspace.json` storage file contains additional revision metadata and is not an export.
3. Select **Preview workspace**. Check symbol, interval, chart count, imported history, unavailable drawings, scripts, alerts and virtual order/history counts. Disclosed legacy fields may receive documented local defaults. Missing sources or malformed data reject the candidate. Preview executes no scripts and fetches no data.
4. Select **Replace local workspace** only after reviewing it. Included script bindings may execute in the restricted CandleScript runtime after loading. Replacement clears Replay and chart Undo history; it preserves previously exported files. Changed current state requires a fresh preview.

Choosing Cancel preserves the draft. Editing revokes an older file read or preview. **Cancel replacement** or Escape cancels the review; Close leaves the current workspace intact before replacement begins. Once a storage write starts, wait for its result. A rejected write keeps the old workspace. A successful write is the replacement boundary: subsequent chart startup errors do not restore the old document. Reload to retry rendering the newly saved state.

**Reset local workspace** deliberately clears the active saved document and virtual trading state after confirmation. It does not delete exported copies and cannot be undone inside OpenCandle. Export before resetting.

Builds with **Saved workspace needs recovery** distinguish two failures. If OpenCandle can read the storage envelope and revision but its workspace contents are invalid, it retains the original payload. Export that payload before repair; you can then preview a valid complete export for replacement, or explicitly confirm Reset. OpenCandle does not display synthetic defaults as recovered data or run saved scripts while this decision is pending. Retry loading invalidates old reviews and confirmations. Wait for its result before reviewing another action.

If the storage envelope itself is unreadable, its revision is unknown. OpenCandle preserves the file and offers **Retry loading**. Export, replacement and Reset remain unavailable; this build does not rename or delete a corrupt file automatically. Preserve the local folder and valid exports, and report the build ID and sanitized error. Do not overwrite the internal storage file with an export. If a safe revision has been exhausted, writes reject while preserving the saved document; keep an export and report the error instead of repeatedly resetting.

Startup recovery is a source feature added after the 864-test development artifact. Check the controls present in your build. Native recovery, file dialogs and restart behavior still require executable verification. For portable startup errors, keep all extracted application files together. Do not disable the sandbox or change OS security policy to force startup.
