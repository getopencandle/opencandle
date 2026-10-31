import { indicatorVwapBandSettings, indicatorVwapKernelVersion, vwapAnchorZone, type IndicatorCalculationOptions, type IndicatorInputs } from '../domain/indicators';
import { indicatorLegacyDefaults, validateIndicatorInputs } from '../chart/indicator-settings';
import { copyVwapSettings } from './protocol';
import type { VwapCalculationSettings } from './types';
import { isVwapEventAnchor, VWAP_EVENT_ANCHOR_KERNEL } from '../domain/vwap-event-anchors';

/** One effective mapping for native instances and frozen alerts; saved inputs stay untouched. The 'Exchange' timezone
 *  resolves to the source exchange zone from `chart` (UTC 00:00 for 24/7 sources or when no zone is known), exactly as the
 *  kernel 1 calculation resolves it (vwapAnchorZone). */
export function effectiveVwapSettings(inputs: IndicatorInputs, transform: 'standard' | 'heikinashi' | 'heikin-ashi', chart: Pick<IndicatorCalculationOptions, 'exchangeZone' | 'calendar'> = {}): Readonly<VwapCalculationSettings> {
  validateIndicatorInputs('vwap', inputs);
  if (indicatorVwapKernelVersion(inputs) !== 2) throw new Error('The exact VWAP worker requires explicit kernel version 2.');
  if (!['standard', 'heikinashi', 'heikin-ashi'].includes(transform)) throw new Error('This VWAP transform is unavailable.');
  const base = { ...indicatorLegacyDefaults.vwap, ...inputs };
  if (isVwapEventAnchor(base.anchor)) throw new Error(VWAP_EVENT_ANCHOR_KERNEL);
  return copyVwapSettings({ kernelVersion: 2, source: base.source, anchor: base.anchor, timezone: vwapAnchorZone(base.timezone, chart), transform: transform === 'standard' ? 'standard' : 'heikin-ashi', ...indicatorVwapBandSettings(inputs) });
}
