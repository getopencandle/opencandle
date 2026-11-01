import type { AdjustmentBasis, ProviderCapabilities, SessionBasis } from './types';
import { FIXTURE_CAPABILITIES } from './fixtures';
import { ALPACA_CAPABILITIES, ALPACA_RESOLUTIONS, ALPACA_SIP_DELAY_SECONDS, ALPACA_SIP_PROVIDER_ID, ALPACA_STUB_PROVIDER_ID } from './alpaca-live';
import { COINBASE_CAPABILITIES } from './coinbase-live';
import { FRED_CAPABILITIES } from './fred';
import { IMPORT_ADJUSTMENTS, IMPORT_MAX_BYTES, IMPORT_MAX_ROWS, IMPORT_RESOLUTIONS, IMPORT_SESSIONS } from './data-setup';
import { LIVE_LICENSED_PROVIDER_IDS, isLiveDatasetId, isLiveProviderId } from './live-provider';

/**
 * One registry of every bar source OpenCandle can
 * show, with what it supplies (symbols, fields, history, resolutions, delay, sessions, corporate actions, limits) and how
 * it is reached (no key, the owner's own key, a local file, or generated SYNTHETIC data). Pure data: no network.
 *
 * Validation is explicit and conservative: a provider is only "verified" when an actual feed check is recorded here
 * (none is today). Fixture and stub tests never count as a live check, and a synthetic source can never be verified.
 */
export type ProviderAccess = 'synthetic' | 'local-file' | 'derived' | 'public-unauthenticated' | 'owner-key';
export type ProviderValidation = 'synthetic' | 'local-file' | 'derived' | 'fixture-tested' | 'actual-feed-verified';
/** A recorded check against the real feed (date, what was observed). Required before `verifiedLive` may be true. */
export interface ProviderFeedCheck { observedAt: string; observation: string }
export interface ProviderRecord {
  capabilities: ProviderCapabilities;
  name: string;
  access: ProviderAccess;
  /** Who may use it and on what terms (plan, key, license). */
  entitlement: string;
  /** How listings are identified: the instrument id the app keys on, and what is known about symbol changes and delistings. */
  symbolIdentity: string;
  /** Exchange timezone of the bars and how date-only rows are handled. */
  timezone: string;
  corporateActions: string;
  validation: ProviderValidation;
  feedCheck: ProviderFeedCheck | null;
}

const ALL_ASSETS: ProviderCapabilities['assets'] = ['stock', 'etf', 'index', 'option', 'future', 'forex', 'crypto', 'commodity', 'bond', 'other'];
const values = <T,>(rows: readonly { value: T }[]): T[] => rows.map(row => row.value);

export const LOCAL_IMPORT_CAPABILITIES: ProviderCapabilities = Object.freeze({
  id: 'local-import', assets: ALL_ASSETS, universe: 'Whatever instruments you import from local CSV or JSON files', fields: ['ohlcv'],
  resolutions: [...IMPORT_RESOLUTIONS], streaming: false, delaySeconds: null,
  sessions: values<SessionBasis>(IMPORT_SESSIONS), adjustmentBases: values<AdjustmentBasis>(IMPORT_ADJUSTMENTS),
  earliestHistory: Object.fromEntries(IMPORT_RESOLUTIONS.map(id => [id, null])), requiresKey: false, redistributable: null,
  limits: [`${IMPORT_MAX_BYTES / (1024 * 1024)} MiB per file`, `${IMPORT_MAX_ROWS} rows per file`, 'No streaming, quotes or corporate actions'], verifiedLive: false,
}) as ProviderCapabilities;
export const ALPACA_SIP_DELAYED_CAPABILITIES: ProviderCapabilities = Object.freeze({
  id: ALPACA_SIP_PROVIDER_ID, assets: ['stock', 'etf'], universe: 'US equities, consolidated (all-exchange) history', fields: ['ohlcv'],
  resolutions: Object.keys(ALPACA_RESOLUTIONS), streaming: false, delaySeconds: ALPACA_SIP_DELAY_SECONDS, sessions: ['unknown'], adjustmentBases: ['split-adjusted', 'total-return'],
  earliestHistory: Object.fromEntries(Object.keys(ALPACA_RESOLUTIONS).map(id => [id, '2015-01-01'])), requiresKey: true, redistributable: false,
  limits: [`History ends ${ALPACA_SIP_DELAY_SECONDS / 60} minutes before retrieval`, '200 historical requests per minute (shared with the live feed)'], verifiedLive: false,
}) as ProviderCapabilities;
export const ALPACA_STUB_CAPABILITIES: ProviderCapabilities = Object.freeze({
  ...ALPACA_CAPABILITIES, id: ALPACA_STUB_PROVIDER_ID, universe: 'Any US-style symbol; prices are invented by the keyless SYNTHETIC stub', requiresKey: false, redistributable: true,
  limits: ['SYNTHETIC invented prices, splits and dividends; no real market data'], verifiedLive: false,
}) as ProviderCapabilities;
export const LOCAL_AGGREGATION_CAPABILITIES: ProviderCapabilities = Object.freeze({
  id: 'lv-local-aggregation', assets: ALL_ASSETS, universe: 'Any loaded source, regrouped on this computer', fields: ['ohlcv'],
  resolutions: ['any coarser time interval'], streaming: false, delaySeconds: null, sessions: ['regular', 'extended', 'all', 'unknown'], adjustmentBases: ['raw', 'split-adjusted', 'total-return', 'unknown'],
  earliestHistory: {}, requiresKey: false, redistributable: null,
  limits: ['Open first, high max, low min, close last, volume sum', 'Never adds missing bars or sessions', 'Tick and range bars need real trades'], verifiedLive: false,
}) as ProviderCapabilities;

export const PROVIDER_REGISTRY: readonly ProviderRecord[] = Object.freeze([
  { capabilities: FIXTURE_CAPABILITIES, name: 'OpenCandle synthetic fixture generator', access: 'synthetic', entitlement: 'Built in; no account, key or network.',
    symbolIdentity: 'SYNTHETIC:<symbol>; generated on request, never listed, renamed or delisted.', timezone: 'UTC weekday bars; no exchange calendar.',
    corporateActions: 'None.', validation: 'synthetic', feedCheck: null },
  { capabilities: LOCAL_IMPORT_CAPABILITIES, name: 'Local import (CSV or JSON)', access: 'local-file', entitlement: 'Your own files; you are responsible for the rights to the data you import.',
    symbolIdentity: 'The instrument id, symbol and exchange you declare at import; symbol changes and delistings are not tracked.',
    timezone: 'The timezone you declare at import; date-only rows stay dates (no invented times).',
    corporateActions: 'The adjustment basis you declare (raw, split-adjusted, total return or unknown) is kept; nothing is re-adjusted.', validation: 'local-file', feedCheck: null },
  { capabilities: LOCAL_AGGREGATION_CAPABILITIES, name: 'OpenCandle local aggregation', access: 'derived', entitlement: 'Inherits the rights of its source.',
    symbolIdentity: 'The source instrument id.', timezone: 'UTC calendar; US equity minute bars anchor at the New York session and their days at New York midnight.',
    corporateActions: 'Keeps the source adjustment basis.', validation: 'derived', feedCheck: null },
  { capabilities: COINBASE_CAPABILITIES, name: 'Coinbase public market data', access: 'public-unauthenticated', entitlement: 'Public, unauthenticated endpoints; personal use only, no sharing or reselling.',
    symbolIdentity: 'COINBASE:<product id> from a fixed allow-list; listing changes are not tracked.', timezone: 'UTC; crypto trades around the clock.',
    corporateActions: 'Not applicable (raw prices).', validation: 'fixture-tested', feedCheck: null },
  { capabilities: FRED_CAPABILITIES, name: 'FRED economic data (St. Louis Fed)', access: 'public-unauthenticated', entitlement: 'Public CSV endpoint, no key; personal use only, no sharing or reselling. Fetched one series at a time when you open it; some series carry their own source terms.',
    symbolIdentity: 'FRED:<series id> (for example FRED:DGS10); series ids are FRED identifiers, and discontinued or renamed series are not tracked.', timezone: 'Date-only rows kept as UTC dates (no invented times); weekly, monthly and quarterly series keep their native dates.',
    corporateActions: 'Not applicable. Values may be revised by FRED; the daily refresh picks revisions up.', validation: 'fixture-tested', feedCheck: null },
  { capabilities: { ...ALPACA_CAPABILITIES, fields: [...new Set([...ALPACA_CAPABILITIES.fields, 'corporate-actions' as const])] }, name: 'Alpaca (IEX live)', access: 'owner-key',
    entitlement: 'Needs your own Alpaca market-data key (entered in Data sources, stored encrypted); the free plan streams IEX only.',
    symbolIdentity: 'US:<symbol>; Alpaca reports inactive or non-tradable listings and the app says so; symbol changes are not tracked.',
    timezone: 'America/New_York with daylight saving; NYSE holidays and early closes 2015 to 2028.',
    corporateActions: 'Splits and dividends from Alpaca; history split-adjusted or total-return (Chart settings).', validation: 'fixture-tested', feedCheck: null },
  { capabilities: ALPACA_SIP_DELAYED_CAPABILITIES, name: 'Alpaca (delayed consolidated history)', access: 'owner-key',
    entitlement: 'Needs your own Alpaca market-data key; delayed history only.', symbolIdentity: 'US:<symbol>.',
    timezone: 'America/New_York with daylight saving.', corporateActions: 'Split-adjusted or total-return history.', validation: 'fixture-tested', feedCheck: null },
  { capabilities: ALPACA_STUB_CAPABILITIES, name: 'SYNTHETIC Alpaca stub', access: 'synthetic', entitlement: 'Built in test stub; no key or network.',
    symbolIdentity: 'US:<symbol> with invented prices.', timezone: 'America/New_York (invented sessions).',
    corporateActions: 'SYNTHETIC 2-for-1 split on 2025-06-16, reverse splits and quarterly dividends.', validation: 'synthetic', feedCheck: null },
] satisfies ProviderRecord[]);

export function providerRecord(providerId: string): ProviderRecord | null { return PROVIDER_REGISTRY.find(row => row.capabilities.id === providerId) ?? null; }

/**
 * Whether a provider's terms apply to an exported file. Live feeds, FRED and licensed history (provider record not
 * redistributable) may be saved on the user's own computer for personal analysis, and the file or its save status then
 * carries personalUseNote. SYNTHETIC rows, local imports and local aggregation carry no provider terms.
 */
export function providerTermsApply(source: { datasetId?: unknown; providerId?: unknown; fixture?: unknown }): boolean {
  if (source.fixture === true) return false;
  if (isLiveDatasetId(source.datasetId) || isLiveProviderId(source.providerId)) return true;
  const row = typeof source.providerId === 'string' ? providerRecord(source.providerId) : null;
  return !!row && row.access !== 'synthetic' && row.capabilities.redistributable === false;
}

/** Consistency rules for the registry (returns plain problems; empty means consistent). */
export function validateProviderRegistry(records: readonly ProviderRecord[] = PROVIDER_REGISTRY): string[] {
  const problems: string[] = [], seen = new Set<string>();
  for (const row of records) {
    const c = row.capabilities, id = c.id;
    if (seen.has(id)) problems.push(`${id}: listed twice`); seen.add(id);
    if (c.verifiedLive && (row.validation !== 'actual-feed-verified' || !row.feedCheck)) problems.push(`${id}: marked verified without a recorded actual feed check`);
    if (row.validation === 'actual-feed-verified' && !c.verifiedLive) problems.push(`${id}: feed check recorded but not marked verified`);
    if ((row.access === 'synthetic' || row.access === 'local-file' || row.access === 'derived') && (c.verifiedLive || row.validation === 'actual-feed-verified' || row.validation === 'fixture-tested')) problems.push(`${id}: a ${row.access} source cannot claim live validation`);
    if (c.requiresKey !== (row.access === 'owner-key')) problems.push(`${id}: key requirement disagrees with its access`);
    if ((row.access === 'public-unauthenticated' || row.access === 'owner-key') && c.redistributable !== false) problems.push(`${id}: a market-data feed must not be marked redistributable`);
    if (LIVE_LICENSED_PROVIDER_IDS.includes(id) && row.access !== 'synthetic' && c.redistributable !== false) problems.push(`${id}: licensed feed marked redistributable`);
    if (!c.resolutions.length || !c.fields.length || !c.limits.length) problems.push(`${id}: resolutions, fields and limits must be stated`);
    if (c.streaming && c.delaySeconds === null) problems.push(`${id}: a streaming source must state its delay`);
  }
  return problems;
}

export function providerAccessLabel(access: ProviderAccess): string {
  switch (access) {
    case 'synthetic': return 'Example data (no key)';
    case 'local-file': return 'Local files';
    case 'derived': return 'Computed locally';
    case 'public-unauthenticated': return 'Public, no key';
    case 'owner-key': return 'Your own key';
  }
}
/** Plain validation wording; never says "working" or "live" for an unchecked feed. */
export function providerValidationLabel(row: Pick<ProviderRecord, 'validation' | 'feedCheck'>): string {
  switch (row.validation) {
    case 'actual-feed-verified': return row.feedCheck ? `Checked against the real feed on ${row.feedCheck.observedAt}` : 'Not verified against the real feed';
    case 'fixture-tested': return 'Tested with recorded and demo answers only; not verified against the real feed';
    case 'synthetic': return 'Invented example data; not market data';
    case 'local-file': return 'Checked when each file is imported (preview before commit)';
    case 'derived': return 'Derived from its source; lineage is checked when restored';
  }
}
export function formatProviderDelay(delaySeconds: number | null, streaming: boolean): string {
  if (delaySeconds === null) return streaming ? 'Unknown' : 'Not applicable';
  if (delaySeconds === 0) return 'Real time (as delivered)';
  return delaySeconds % 60 === 0 ? `${delaySeconds / 60} minutes` : `${delaySeconds} seconds`;
}
