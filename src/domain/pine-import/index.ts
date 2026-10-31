// Pine Script v5/v6 to LVScript importer (clean-room, original OpenCandle code). LVScript remains the
// scripting language: an import produces an ordinary LVScript document that the user reviews, saves and runs.
import { translatePine, type PineImportReport, type PineImportResult } from './translate';

export type { PineImportIssue, PineImportReport, PineImportResult } from './translate';
/** The largest Pine source the importer accepts (the LVScript source limit). */
export const PINE_IMPORT_SOURCE_BYTES = 64 * 1024;

/** Translates Pine source. Never executes anything and never throws for malformed source. */
export function importPineScript(source: string): PineImportResult {
  if (new TextEncoder().encode(source).length > PINE_IMPORT_SOURCE_BYTES) {
    const report: PineImportReport = { version: null, declaration: null, title: '', statements: { total: 0, translated: 0 }, translated: [], unsupported: [], notes: [], errors: [{ line: 0, message: 'The Pine source is larger than 64 KiB.' }] };
    return { ok: false, name: 'Imported Pine script', kind: 'indicator', pane: 'price', source: '', report };
  }
  if (!source.trim()) {
    const report: PineImportReport = { version: null, declaration: null, title: '', statements: { total: 0, translated: 0 }, translated: [], unsupported: [], notes: [], errors: [{ line: 0, message: 'Paste a Pine script first.' }] };
    return { ok: false, name: 'Imported Pine script', kind: 'indicator', pane: 'price', source: '', report };
  }
  const result = translatePine(source);
  if (new TextEncoder().encode(result.source).length > PINE_IMPORT_SOURCE_BYTES) {
    result.ok = false;
    result.report.errors.push({ line: 0, message: 'The translated CandleScript is larger than the 64 KiB CandleScript source limit.' });
  }
  return result;
}

/** Plain-text summary lines of a report, for the import dialog and the console. */
export function pineReportSummary(report: PineImportReport): string[] {
  const lines = [`Pine ${report.version ? 'v' + report.version : '(no //@version)'} ${report.declaration ?? 'script'}${report.title ? ' "' + report.title + '"' : ''}.`,
    `${report.statements.translated} of ${report.statements.total} statements translated without a TODO.`];
  if (report.translated.length) lines.push('Translated: ' + report.translated.join(', ') + '.');
  if (report.unsupported.length) lines.push(`Not translated: ${report.unsupported.length} item${report.unsupported.length === 1 ? '' : 's'} (marked TODO(pine) in the script).`);
  if (report.errors.length) lines.push(`Source problems: ${report.errors.length}.`);
  return lines;
}
