// The provider registry and its Data sources
// section. Pure data and static markup; no network, no keys.
import {describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {PROVIDER_REGISTRY,formatProviderDelay,providerRecord,providerValidationLabel,validateProviderRegistry,type ProviderRecord} from '../../src/domain/provider-capabilities';
import {FIXTURE_CAPABILITIES,fixtureDataset} from '../../src/domain/fixtures';
import {ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID} from '../../src/domain/alpaca-live';
import {COINBASE_PROVIDER_ID} from '../../src/domain/coinbase-live';
import {aggregateInterval} from '../../src/domain/intervals';
import {exampleDraft,prepareImportDraft} from '../../src/domain/data-setup';
import {dataSourceRecords} from '../../src/ui/data-sources-panel';
import {ProviderCapabilitiesSection} from '../../src/ui/ProviderCapabilitiesSection';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';

describe('provider registry',()=>{
 it('lists every bar source the app produces, once each',()=>{
  const ids=PROVIDER_REGISTRY.map(row=>row.capabilities.id);
  expect(new Set(ids).size).toBe(ids.length);
  for(const id of [FIXTURE_CAPABILITIES.id,'local-import','lv-local-aggregation',COINBASE_PROVIDER_ID,'alpaca-iex',ALPACA_SIP_PROVIDER_ID,ALPACA_STUB_PROVIDER_ID])expect(providerRecord(id),id).not.toBeNull();
  // The ids really produced by the generator, the importer and local aggregation are the registered ones.
  expect(providerRecord(fixtureDataset('SPY',2).provenance.providerId)).not.toBeNull();
  const day=fixtureDataset('SPY',10);expect(providerRecord(aggregateInterval(day,'1W').dataset.provenance.providerId)?.access).toBe('derived');
  const prepared=prepareImportDraft(exampleDraft(PROVIDER_EXAMPLE),{now:Date.UTC(2026,9,27)/1000});
  expect(prepared.dataset).not.toBeNull();expect(providerRecord(prepared.dataset!.provenance.providerId)?.access).toBe('local-file');
  expect(providerRecord('no-such-provider')).toBeNull();
 });
 it('states symbols, fields, history, intervals, delay, sessions, actions, limits and entitlement for each source',()=>{
  for(const row of PROVIDER_REGISTRY){
   const c=row.capabilities;
   expect(c.universe.length,c.id).toBeGreaterThan(0);expect(c.fields.length,c.id).toBeGreaterThan(0);expect(c.resolutions.length,c.id).toBeGreaterThan(0);
   expect(c.sessions.length,c.id).toBeGreaterThan(0);expect(c.adjustmentBases.length,c.id).toBeGreaterThan(0);expect(c.limits.length,c.id).toBeGreaterThan(0);
   expect(typeof c.earliestHistory,c.id).toBe('object');
   for(const text of [row.entitlement,row.symbolIdentity,row.timezone,row.corporateActions])expect(text.length,c.id).toBeGreaterThan(0);
  }
  expect(providerRecord('alpaca-iex')!.capabilities.fields).toContain('corporate-actions');
  expect(providerRecord(ALPACA_SIP_PROVIDER_ID)!.capabilities.delaySeconds).toBe(900);
 });
 it('PUBLIC: no source needs a key except the owner-key Alpaca feeds, and every keyless network source is public',()=>{
  for(const row of PROVIDER_REGISTRY)expect(row.capabilities.requiresKey,row.capabilities.id).toBe(row.access==='owner-key');
  expect(PROVIDER_REGISTRY.filter(row=>row.access==='owner-key').map(row=>row.capabilities.id).sort()).toEqual(['alpaca-iex',ALPACA_SIP_PROVIDER_ID].sort());
  expect(providerRecord(COINBASE_PROVIDER_ID)!.access).toBe('public-unauthenticated');
  expect(providerRecord(ALPACA_STUB_PROVIDER_ID)!.capabilities.requiresKey).toBe(false);
 });
 it('VALIDATION: nothing is marked verified, the registry is consistent, and the checker refuses false claims',()=>{
  expect(validateProviderRegistry()).toEqual([]);
  expect(PROVIDER_REGISTRY.every(row=>!row.capabilities.verifiedLive&&row.feedCheck===null)).toBe(true);
  const coinbase=providerRecord(COINBASE_PROVIDER_ID)!;
  const claim=(patch:Partial<ProviderRecord>,caps:Partial<ProviderRecord['capabilities']>={})=>validateProviderRegistry([{...coinbase,...patch,capabilities:{...coinbase.capabilities,...caps}}]);
  expect(claim({},{verifiedLive:true})).toEqual([expect.stringMatching(/verified without a recorded actual feed check/)]);
  expect(claim({validation:'actual-feed-verified'})).toEqual([expect.stringMatching(/not marked verified/)]);
  expect(claim({validation:'actual-feed-verified',feedCheck:{observedAt:'2026-10-27',observation:'SYNTHETIC test record'}},{verifiedLive:true})).toEqual([]);
  expect(claim({access:'synthetic'})).toContain(`${COINBASE_PROVIDER_ID}: a synthetic source cannot claim live validation`);
  expect(claim({},{requiresKey:true})).toEqual([expect.stringMatching(/key requirement/)]);
  expect(claim({},{redistributable:true}).length).toBeGreaterThan(0);
  expect(claim({},{delaySeconds:null})).toEqual([expect.stringMatching(/must state its delay/)]);
  expect(validateProviderRegistry([coinbase,coinbase])).toEqual([`${COINBASE_PROVIDER_ID}: listed twice`]);
  expect(providerValidationLabel(coinbase)).toMatch(/not verified against the real feed/);
  expect(providerValidationLabel({validation:'actual-feed-verified',feedCheck:null})).toBe('Not verified against the real feed');
 });
 it('formats delay plainly',()=>{
  expect(formatProviderDelay(0,true)).toBe('Real time (as delivered)');expect(formatProviderDelay(900,false)).toBe('15 minutes');
  expect(formatProviderDelay(null,false)).toBe('Not applicable');expect(formatProviderDelay(null,true)).toBe('Unknown');expect(formatProviderDelay(45,true)).toBe('45 seconds');
 });
});

const PROVIDER_EXAMPLE='gme-daily-csv';
describe('Data sources > What each source supplies (markup only; not executable UI evidence)',()=>{
 it('lists each source with its access and validation, and never says working or verified for an unchecked feed',()=>{
  const html=renderToStaticMarkup(React.createElement(ProviderCapabilitiesSection));
  expect(html).toContain('What each source supplies');
  for(const row of PROVIDER_REGISTRY)expect(html).toContain(`data-lv-provider="${row.capabilities.id}"`);
  expect(html).toContain('Public, no key');expect(html).toContain('Your own key');expect(html).toContain('Example data (no key)');const page=renderToStaticMarkup(React.createElement(ProviderCapabilitiesSection,{records:dataSourceRecords()}));expect(page).not.toMatch(/SYNTHETIC|SYNTH|Listing identity|ohlcv|<symbol>|COINBASE:|US:/);
  expect(html).not.toMatch(/Checked against the real feed on/);expect(html).not.toMatch(/\bworking\b/i);expect(html).not.toMatch(/\u2014/);
  expect(html).toContain('Display only; bars cannot be exported or shared');
 });
 it('is part of the Data sources panel',()=>{
  const live={coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:[],onAlpacaSymbolsChange:vi.fn(),bridge:null};
  const storage={directory:'C:\\Synthetic\\Profile',onExport:vi.fn(),onReset:vi.fn(),onRestore:vi.fn()} as any;
  expect(renderToStaticMarkup(React.createElement(DataSourcesPanel,{live,storage}))).toContain('What each source supplies');
 });
});
