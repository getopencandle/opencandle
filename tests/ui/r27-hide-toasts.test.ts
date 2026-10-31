// decision (SYNTHETIC alerts): Chart settings "Automatically hide toasts" follows the reference default (on).
// A stored `false` from before the setting was live is treated as unset through a one-time migration flag; an explicit
// change made after the migration is kept. The alert popup host honours the setting.
import { describe, expect, it, vi } from 'vitest';
import { mountControlledComponent, all } from '../helpers/alert-dialog-harness';
import { AlertDeliveryHost, type AlertDeliveryHostProps } from '../../src/ui/alert-delivery-host';
import { ALERT_POPUP_AUTOHIDE_MS } from '../../src/domain/alert-delivery';
import { createLocalAlert, processAlertEvent, type AlertDefinition, type LocalAlert } from '../../src/domain/alerts';
import { defaultChartSettingsDocument, restoreChartSettingsDocument } from '../../src/chart/chart-settings-document';
import { factoryAppearance, factoryPriceScale, findRow, writeRow, type ChartSettingsSources } from '../../src/chart/chart-settings-bindings';

const legacy = () => { const saved = JSON.parse(JSON.stringify(defaultChartSettingsDocument())); delete saved.alerts.hideToastsMigrated; saved.alerts.hideToasts = false; return saved; };
const sources = (document = defaultChartSettingsDocument()): ChartSettingsSources => ({ appearance: factoryAppearance(), document, documentConnected: true, priceScale: factoryPriceScale(), ratio: null, style: 'candles', typeSettings: null, timezone: 'UTC', exchangeTimezone: null });

describe('alerts.hideToasts migration', () => {
  it('defaults to on, with the migration flag set', () => {
    expect(defaultChartSettingsDocument().alerts).toMatchObject({ hideToasts: true, hideToastsMigrated: true });
    expect(restoreChartSettingsDocument(undefined).alerts.hideToasts).toBe(true);
    expect(restoreChartSettingsDocument({ version: 1 }).alerts).toMatchObject({ hideToasts: true, hideToastsMigrated: true });
  });
  it('treats a stored false written before the setting was live as unset, once', () => {
    const migrated = restoreChartSettingsDocument(legacy());
    expect(migrated.alerts).toMatchObject({ hideToasts: true, hideToastsMigrated: true });
    const unflagged = legacy(); unflagged.alerts.hideToastsMigrated = false;
    expect(restoreChartSettingsDocument(unflagged).alerts.hideToasts).toBe(true);
    // The migration touches no other alert field, and a migrated document restores to itself.
    expect(migrated.alerts.lines).toEqual({ visible: true, color: null });
    expect(restoreChartSettingsDocument(JSON.parse(JSON.stringify(migrated)))).toEqual(migrated);
  });
  it('keeps an explicit change made after the migration, through save and restore', () => {
    const migrated = restoreChartSettingsDocument(legacy());
    const row = findRow('alerts', sources(migrated), 'alerts.hideToasts');
    expect(row?.availability.state).toBe('live');
    expect(row?.value.checked).toBe(true);
    const off = writeRow(sources(migrated), 'alerts.hideToasts', { checked: false });
    expect(off.document.alerts).toMatchObject({ hideToasts: false, hideToastsMigrated: true });
    const reopened = restoreChartSettingsDocument(JSON.parse(JSON.stringify(off.document)));
    expect(reopened.alerts.hideToasts).toBe(false);
    expect(restoreChartSettingsDocument(JSON.parse(JSON.stringify(reopened))).alerts.hideToasts).toBe(false);
    const on = writeRow(sources(reopened), 'alerts.hideToasts', { checked: true });
    expect(restoreChartSettingsDocument(JSON.parse(JSON.stringify(on.document))).alerts.hideToasts).toBe(true);
  });
});

const definition = (id: string): AlertDefinition => ({ id, instrumentId: 'SYNTHETIC:GME', sourceId: 'close', name: `SYNTHETIC ${id}`, message: `SYNTHETIC ${id} crossed`, condition: { kind: 'greater', value: 10 }, frequency: 'every-time', createdAt: 1000, expiresAt: null, mode: 'ordinary', runId: 'ordinary' } as AlertDefinition);
function fire(alert: LocalAlert, sequence: number, value = 11): LocalAlert {
  const d = alert.definition, time = 1000 + sequence;
  const result = processAlertEvent(alert, { instrumentId: d.instrumentId, sourceId: d.sourceId, value, time, availableAt: time, sequence, barId: `SYNTHETIC bar ${sequence}`, barClosed: false, feedState: 'ready', mode: d.mode, runId: d.runId });
  expect(result.notification).not.toBeNull(); return result.alert;
}
function host(initial: LocalAlert[], autoHide: boolean | undefined) {
  const props: AlertDeliveryHostProps = { alerts: initial, soundPlayer: { play: vi.fn(async () => undefined) }, desktopPort: { permission: () => 'granted', show: vi.fn() }, ...(autoHide === undefined ? {} : { autoHide }) };
  const view = mountControlledComponent(() => AlertDeliveryHost(props)); view.settle();
  const popups = () => all(view.render(), node => node.type === 'article' && typeof node.props['data-alert-notification-id'] === 'string');
  return { ...view, props, popups, update: (alerts: LocalAlert[]) => { props.alerts = alerts; view.settle(); } };
}

describe('alert popup host follows Automatically hide toasts', () => {
  for (const autoHide of [undefined, true, false] as const) it(`autoHide ${String(autoHide)}`, () => {
    vi.useFakeTimers();
    try {
      const alert = fire(createLocalAlert(definition('a')), 1);
      const ui = host([alert], autoHide);
      ui.update([fire(alert, 2, 12)]);
      expect(ui.popups()).toHaveLength(1);
      vi.advanceTimersByTime(ALERT_POPUP_AUTOHIDE_MS); ui.settle();
      expect(ui.popups()).toHaveLength(autoHide === false ? 1 : 0);
    } finally { vi.useRealTimers(); }
  });
});
