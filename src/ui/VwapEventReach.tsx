import { useEffect, useMemo, useRef } from 'react';
import type { LocalAlert } from '../domain/alerts';
import { loadChartEvents } from './ChartEventMarkers';
import { VwapEventDateReach, vwapEventTargets, type VwapEventReachWorkspace } from './vwap-event-reach';

/** Keeps the VWAP Dividends and Splits dates loaded for background alerts and every layout tab's charts
 * (src/ui/vwap-event-reach.ts). Renders nothing. */
export interface VwapEventReachProps {
  alerts: readonly LocalAlert[];
  workspace: VwapEventReachWorkspace;
  enabled: boolean;
  /** After an instrument's dates were remembered. */
  onLoaded?: (instrumentId: string) => void;
  /** Test seam; the default is the chart markers' memoized loader. */
  load?: typeof loadChartEvents;
}
export function VwapEventReach(props: VwapEventReachProps) {
  const latest = useRef(props); latest.current = props;
  const reach = useRef<VwapEventDateReach | null>(null);
  const targets = useMemo(() => vwapEventTargets({ alerts: props.alerts, workspace: props.workspace }), [props.alerts, props.workspace.grid, props.workspace.layoutLibrary]);
  const key = JSON.stringify(targets);
  useEffect(() => {
    if (!props.enabled) return;
    const created = new VwapEventDateReach({ load: symbol => (latest.current.load ?? loadChartEvents)(symbol), onLoaded: id => latest.current.onLoaded?.(id) });
    reach.current = created;
    return () => { created.dispose(); if (reach.current === created) reach.current = null; };
  }, [props.enabled]);
  useEffect(() => { reach.current?.sync(targets); }, [key, props.enabled]);
  return null;
}
