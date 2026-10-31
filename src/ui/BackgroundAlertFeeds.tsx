import { useEffect, useRef } from 'react';
import type { LocalAlert } from '../domain/alerts';
import type { LiveHandle } from '../domain/live-provider';
import { BackgroundAlertWatcher } from './background-alert-watcher';
import type { BackgroundFeed, BackgroundPlan } from './background-alert-plan';

/** Keeps live feeds open for alerts on symbols that are not charted, so every alert runs. Renders nothing. */
export interface BackgroundAlertFeedsProps {
  alerts: LocalAlert[];
  /** The live saved collection, so a trigger is never published against a collection one render old. */
  readAlerts?: () => readonly LocalAlert[];
  activeInstrumentId: string;
  activeDatasetId?:string;
  activeResolution?:string;
  enabled: boolean;
  suspended: boolean;
  backgroundSave?: boolean;
  isStorageLocked?: () => boolean;
  onAlertsChange: (alerts: LocalAlert[], expected?: LocalAlert[]) => boolean | void;
  /** Opens (or shares) the live feed of a dataset. Null when it cannot be opened. */
  openLiveFeed: (feed: BackgroundFeed) => LiveHandle | null;
  openAlpacaSymbols: () => ReadonlySet<string>;
  onPlan?: (plan: BackgroundPlan) => void;
  /** One instrument's drawings from the saved workspace (savedDrawingsForInstrument), for older drawing alerts. */
  readDrawings?: (instrumentId: string) => readonly unknown[] | null;
}
export function BackgroundAlertFeeds(props: BackgroundAlertFeedsProps) {
  const latest = useRef(props); latest.current = props;
  const watcher = useRef<BackgroundAlertWatcher | null>(null);
  useEffect(() => {
    if (!props.enabled || props.suspended) return;
    const created = new BackgroundAlertWatcher({
      open: feed => latest.current.openLiveFeed(feed),
      alerts: () => latest.current.readAlerts?.() ?? latest.current.alerts,
      publish: (next, expected) => latest.current.onAlertsChange(next, expected),
      identity: () => crypto.randomUUID(),
      openAlpacaSymbols: () => latest.current.openAlpacaSymbols(),
      drawings: instrumentId => latest.current.readDrawings?.(instrumentId) ?? null,
      ready: () => { const live = latest.current; return live.enabled && !live.suspended && !live.backgroundSave && live.isStorageLocked?.() !== true; },
    });
    watcher.current = created;
    return () => { created.dispose(); if (watcher.current === created) watcher.current = null; };
  }, [props.enabled, props.suspended]);
  useEffect(() => {
    const plan = watcher.current?.sync(props.activeInstrumentId,props.activeDatasetId,props.activeResolution) ?? { feeds: [], skipped: [] };
    latest.current.onPlan?.(plan);
  }, [props.alerts, props.activeInstrumentId,props.activeDatasetId,props.activeResolution, props.enabled, props.suspended]);
  return null;
}
