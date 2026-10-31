import { ALERT_HISTORY_LIMIT, type AlertNotification, type LocalAlert } from './alerts';

export const ALERT_HISTORY_EXPORT_BYTES = 20 * 1024 * 1024;
export const ALERT_HISTORY_CSV_COLUMNS = Object.freeze([
  'notification_id', 'alert_id', 'observed_at_unix_seconds', 'sequence',
  'alert_name_at_trigger', 'message_at_trigger', 'value', 'bar_id', 'mode', 'run_id',
  'local', 'observation_kind', 'synthetic_fixture', 'source_time_unix_seconds',
  'source_available_at', 'source_revision', 'dataset_key', 'source_kind',
  'completion', 'observation_reason', 'correction', 'information_end_unix_seconds', 'information_start_unix_seconds',
  'left_value', 'left_unit', 'left_basis', 'left_label', 'right_value', 'right_unit', 'right_basis', 'right_label',
  'observation_semantics_version', 'source_session_id', 'replay_run_id', 'chart_id',
]);

/** Escape spreadsheet formula prefixes. Numeric negatives stay numeric. */
export function alertHistoryCsvCell(value: string | number | null): string {
  if (value === null) return '';
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw Error('Alert history contains an invalid number.');
    return String(value);
  }
  if (typeof value !== 'string') throw Error('Alert history contains an unsupported field.');
  const safe = /^\s*[=+\-@]/u.test(value) || /^[\t\r\n]/u.test(value) ? "'" + value : value;
  return '"' + safe.replaceAll('"', '""') + '"';
}

/** View export of validated local state. No current chart/definition inference. */
export function alertHistoryCsv(alerts: readonly LocalAlert[]): string {
  if (!Array.isArray(alerts) || alerts.length > 10000) throw Error('Alert history exceeds the saved alert limit.');
  const rows: Array<{ item: AlertNotification; order: number }> = [];
  for (const alert of alerts) {
    if (!Array.isArray(alert.history) || rows.length + alert.history.length > ALERT_HISTORY_LIMIT)
      throw Error('Alert history export exceeds 100000 retained triggers.');
    for (const item of alert.history) {
      if (!item || !Number.isSafeInteger(item.at) || item.at < 0 || !Number.isSafeInteger(item.sequence) || item.sequence < 0 ||
          item.local !== true || typeof item.value !== 'number' || !Number.isFinite(item.value) || !['ordinary', 'replay'].includes(item.mode) || typeof item.name !== 'string' || item.name.length > 200 ||
          typeof item.message !== 'string' || item.message.length > 4000)
        throw Error('Alert history contains an invalid trigger.');
      rows.push({ item, order: rows.length });
    }
  }
  rows.sort((a, b) => b.item.at - a.item.at || b.item.sequence - a.item.sequence || a.order - b.order);
  const encoder = new TextEncoder(), chunks = ['\uFEFF'];
  let bytes = 3;
  const write = (fields: (string | number | null)[]) => {
    const line = fields.map(alertHistoryCsvCell).join(',') + '\r\n';
    bytes += encoder.encode(line).byteLength;
    if (bytes > ALERT_HISTORY_EXPORT_BYTES) throw Error('Alert history CSV exceeds 20 MiB. No partial file was exported.');
    chunks.push(line);
  };
  write([...ALERT_HISTORY_CSV_COLUMNS]);
  for (const { item } of rows) {
    const source = item.observation;
    write([
      item.id, item.alertId, item.at, item.sequence, item.name, item.message, item.value, item.barId, item.mode, item.runId,
      'true', source?.kind ?? 'legacy-unknown', source ? String(source.binding.fixture) : 'unknown', source?.sourceTime ?? null,
      'unknown', source?.sourceRevision ?? '', source?.binding.datasetKey ?? '', source?.binding.source.kind ?? 'unknown',
      source?.completion ?? 'unknown', source?.reason ?? 'unknown', source ? String(source.correction) : 'unknown', source?.informationEndTime ?? null, source?.informationStartTime ?? null,
      source?.operands?.left.value ?? null, source?.operands?.left.unit ?? '', source?.operands?.left.basis ?? '', source?.operands?.left.label ?? '',
      source?.operands?.right?.value ?? null, source?.operands?.right?.unit ?? '', source?.operands?.right?.basis ?? '', source?.operands?.right?.label ?? '',
      source?.schemaVersion ?? 1, source?.binding.sessionId ?? '', source?.binding.replayRunId ?? '', source?.binding.chartId ?? '',
    ]);
  }
  return chunks.join('');
}
