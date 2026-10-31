import { expect, it, vi } from 'vitest';
import { mountControlledComponent } from '../helpers/alert-dialog-harness';
import { BackgroundAlertFeeds, type BackgroundAlertFeedsProps } from '../../src/ui/BackgroundAlertFeeds';
import { alertOn, liveLike } from '../helpers/background-alert-fixtures';
import type { LiveHandle } from '../../src/domain/live-provider';

// SYNTHETIC component-handler checks (controlled hooks, no DOM): the mount keeps feeds in step with saved alerts.
function handle(id: string) { const closed = vi.fn(); const value: LiveHandle = { datasetId: id, dataset: () => ({ ...liveLike('AAPL'), bars: [] }), formingTime: () => null, onChange: () => () => undefined, close: closed }; return { value, closed }; }
function mount(props: Partial<BackgroundAlertFeedsProps> = {}) {
  const opened: string[] = [], handles: ReturnType<typeof handle>[] = [];
  const base: BackgroundAlertFeedsProps = { alerts: [alertOn(liveLike('AAPL'), 'a')], activeInstrumentId: 'US:SPY', enabled: true, suspended: false, onAlertsChange: () => true, openLiveFeed: feed => { opened.push(feed.symbol); const made = handle(feed.datasetId); handles.push(made); return made.value; }, openAlpacaSymbols: () => new Set(['SPY']), ...props };
  const view = mountControlledComponent(() => BackgroundAlertFeeds(base)); view.settle();
  return { view, base, opened, handles };
}

it('opens a feed for an alert on another symbol and closes it again on unmount', () => {
  const ui = mount();
  expect(ui.opened).toEqual(['AAPL']);
  ui.view.dispose();
  expect(ui.handles[0].closed).toHaveBeenCalledTimes(1);
});

it('opens nothing while alerts are not enabled or a workspace operation holds them', () => {
  expect(mount({ enabled: false }).opened).toEqual([]);
  expect(mount({ suspended: true }).opened).toEqual([]);
});

it('reports what it cannot watch so the alerts panel can say so', () => {
  const onPlan = vi.fn();
  mount({ alerts: [alertOn({ ...liveLike('IBM'), provenance: { ...liveLike('IBM').provenance, datasetId: 'imported:ibm', providerId: 'local-import' } }, 'i')], onPlan });
  expect(onPlan).toHaveBeenCalled();
  expect(onPlan.mock.calls.at(-1)![0].skipped).toHaveLength(1);
});
