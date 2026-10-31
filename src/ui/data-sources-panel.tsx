import React,{useState} from 'react';
import {AlpacaSourceSettings,CoinbaseSourceSettings,type LiveDataSettingsProps} from './LiveDataSettings';
import {LocalStorageSection,type LocalStorageSectionProps} from './LocalStorageSection';
import {MarketDataCacheSection,type MarketDataCacheSectionProps} from './MarketDataCacheSection';
import {FredCacheSection,type FredCacheSectionProps} from './FredCacheSection';
import {ProviderCapabilitiesSection} from './ProviderCapabilitiesSection';
import {SavedInfoSection,type SavedInfoSectionProps} from './SavedInfoSection';
import {PROVIDER_REGISTRY,type ProviderRecord} from '../domain/provider-capabilities';
import {ALPACA_STUB_PROVIDER_ID,type AlpacaKeyStatus,type AlpacaStatus} from '../domain/alpaca-live';
import {DATA_NEEDS,dataNeedStatus,type DataNeed,type DataNeedInputs} from '../domain/data-source-settings';
/**
 * Body of the Data sources tab in Settings. Nothing here is part of the settings draft: every button acts at once and Cancel
 * does not undo it (like Save as in the Template menu).
 *
 * Organised by what a new user needs. First a "What you need" table (one row per kind of data: the minimum
 * to get it, how, and its status here), then one section per source with its controls, then where everything is saved
 * (folder, Open folder, settings export and import), the caches, the workspace, and the technical details per source.
 */
export interface DataSourcesPanelProps {
 live:LiveDataSettingsProps;
 storage:LocalStorageSectionProps;
 /** Cached market data (size and Clear). Absent: the section is not shown. */
 cache?:MarketDataCacheSectionProps;
 /** Economic data (FRED) cache size and Clear. Absent: the section is not shown. */
 fred?:FredCacheSectionProps;
 /** Where settings are saved, Open folder, settings export and import. Absent: the section is not shown. */
 saved?:SavedInfoSectionProps;
 /** Opens the Import window for the user's own bar files. Absent: the button is not shown. */
 onImportData?:()=>void;
}
/** User-facing names for the source list. The keyless test stub is a developer source and is not listed;
 * the registry (and its internal names) is unchanged. Example data keeps its access badge. */
const PROVIDER_DISPLAY_NAMES:Readonly<Record<string,string>>={'lv-synthetic-v1':'Example data (built in)','lv-local-aggregation':'Computed intervals'};
export function dataSourceRecords(records:readonly ProviderRecord[]=PROVIDER_REGISTRY):ProviderRecord[]{
 return records.filter(row=>row.capabilities.id!==ALPACA_STUB_PROVIDER_ID).map(row=>{const name=PROVIDER_DISPLAY_NAMES[row.capabilities.id];return name?{...row,name}:row;});
}
const DATA_SOURCE_RECORDS:readonly ProviderRecord[]=Object.freeze(dataSourceRecords());
const DATA_SOURCES_CSS=[
 '.lv-datasources{display:flex;flex-direction:column;gap:6px}',
 '.lv-datasources h3{margin:14px 0 4px}.lv-datasources h4{margin:10px 0 2px}',
 '.lv-datasources>section{padding-top:4px;border-top:1px solid var(--lv-border)}.lv-datasources>section:first-of-type{border-top:0;padding-top:0}',
 '.lv-datasources .lv-live-note{margin:2px 0;color:var(--lv-text-secondary);font-size:12px;line-height:1.45}',
 '.lv-datasources .lv-live-grid{display:grid;grid-template-columns:150px minmax(0,1fr);gap:8px 12px;align-items:center;margin:4px 0}',
 '.lv-datasources .lv-live-grid>label{display:contents}',
 '.lv-datasources .lv-live-grid input,.lv-datasources .lv-live-grid select{width:100%;max-width:360px;box-sizing:border-box}',
 '.lv-datasources .lv-live-symbols{margin:6px 0;max-width:520px}.lv-datasources .lv-live-symbols-head{display:flex;justify-content:space-between;align-items:baseline}',
 '.lv-datasources .lv-live-chips{list-style:none;margin:6px 0;padding:0;display:flex;flex-wrap:wrap;gap:6px}',
 '.lv-datasources .lv-live-chip{display:inline-flex;align-items:center;gap:2px;padding:0 0 0 8px;border:1px solid var(--lv-border);border-radius:var(--lv-radius-plate);font-size:12px;color:var(--lv-text-primary)}',
 '.lv-datasources .lv-live-chip button{min-height:22px;padding:0 6px;border:0;background:transparent;color:var(--lv-text-secondary)}',
 '.lv-datasources .lv-live-combo{position:relative}.lv-datasources .lv-live-combo input{width:100%;max-width:360px;box-sizing:border-box}',
 '.lv-datasources .lv-live-suggest{position:absolute;z-index:5;left:0;top:100%;width:100%;max-width:520px;margin:2px 0 0;padding:0;list-style:none;background:var(--lv-bg-input);border:1px solid var(--lv-input-border);border-radius:var(--lv-radius-plate);max-height:260px;overflow:auto}',
 '.lv-datasources .lv-live-suggest[hidden]{display:none}',
 '.lv-datasources .lv-live-suggest-row{display:flex;flex-direction:column;padding:5px 8px;cursor:pointer;font-size:12px;color:var(--lv-text-primary)}',
 '.lv-datasources .lv-live-suggest-row.active{background:var(--lv-hover)}.lv-datasources .lv-live-suggest-row.blocked{color:var(--lv-text-disabled)}',
 '.lv-datasources .lv-live-suggest-notice{color:var(--lv-text-secondary);font-size:11px}',
 '.lv-datasources .lv-live-key-actions{display:flex;flex-wrap:wrap;gap:8px}',
 '.lv-datasources input:not([type=checkbox]):not([type=radio]),.lv-datasources select{min-height:30px;padding:4px 8px;background:var(--lv-bg-input);color:var(--lv-text-primary);border:1px solid var(--lv-input-border);border-radius:var(--lv-radius-plate)}',
 '.lv-datasources input:not([type=checkbox]):not([type=radio]):focus-visible,.lv-datasources select:focus-visible{outline:none;border-color:var(--lv-input-border-focus)}',
 '.lv-datasources button{min-height:30px;padding:4px 12px;background:var(--lv-bg-input);color:var(--lv-text-primary);border:1px solid var(--lv-input-border);border-radius:var(--lv-radius-plate);cursor:pointer}',
 '.lv-datasources button:hover:not(:disabled){background:var(--lv-hover);border-color:var(--lv-input-border-hover)}',
 '.lv-datasources button.primary{background:var(--lv-accent);border-color:var(--lv-accent);color:var(--lv-on-accent)}',
 '.lv-datasources button.primary:hover:not(:disabled){background:var(--lv-accent-hover)}',
 '.lv-datasources button:disabled{color:var(--lv-text-disabled);background:transparent;border-color:var(--lv-border);cursor:default}',
 '.lv-datasources .lv-provider-access{margin-left:8px;padding:0 6px;border:1px solid var(--lv-border);border-radius:4px;color:var(--lv-text-secondary);font-size:11px}',
 '.lv-datasources .lv-live-about>summary,.lv-datasources .lv-source-details>summary{cursor:pointer;color:var(--lv-text-secondary);font-size:12px}',
 '.lv-datasources .lv-needs{list-style:none;margin:6px 0 0;padding:0;border:1px solid var(--lv-border);border-radius:var(--lv-radius-plate);font-size:12px}',
 '.lv-datasources .lv-needs>li{padding:8px 10px;border-top:1px solid var(--lv-border)}.lv-datasources .lv-needs>li:first-child{border-top:0}',
 '.lv-datasources .lv-need-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}',
 '.lv-datasources .lv-need-title{font-weight:600;font-size:13px;color:var(--lv-text-primary);margin-right:auto}',
 '.lv-datasources .lv-need-min{margin-top:3px;color:var(--lv-text-primary)}',
 '.lv-datasources .lv-need-label{display:inline-block;margin-right:4px;color:var(--lv-text-secondary);font-size:11px;text-transform:uppercase;letter-spacing:.04em}',
 '.lv-datasources .lv-need-sub{margin-top:2px;color:var(--lv-text-secondary);line-height:1.4}',
 '.lv-datasources .lv-pill{display:inline-block;padding:1px 8px;border:1px solid var(--lv-border);border-radius:10px;color:var(--lv-text-secondary);white-space:nowrap;font-size:11px}',
 '.lv-datasources .lv-pill[data-state=ready],.lv-datasources .lv-pill[data-state=on],.lv-datasources .lv-pill[data-state=set-up],.lv-datasources .lv-pill[data-state=connected]{color:var(--lv-positive-text);border-color:var(--lv-positive-border,var(--lv-positive-text))}',
 '.lv-datasources .lv-pill[data-state=attention]{color:var(--lv-negative-text);border-color:var(--lv-error-border,var(--lv-negative-text))}',
 '.lv-datasources .lv-need-head button{min-height:22px;padding:0 10px;font-size:12px}',
 '.lv-datasources .lv-saved-path{display:flex;gap:8px;align-items:center;margin:4px 0}.lv-datasources .lv-saved-path textarea{flex:1;min-width:0;box-sizing:border-box;resize:none;overflow:hidden;font:inherit;line-height:1.4;overflow-wrap:anywhere;word-break:break-all;padding:4px 8px;background:var(--lv-bg-input);color:var(--lv-text-primary);border:1px solid var(--lv-input-border);border-radius:var(--lv-radius-plate)}.lv-datasources .lv-saved-path{align-items:flex-start}',
 '.lv-datasources .lv-saved-warning{color:var(--lv-negative-text)}',
].join('');
const SECTION_IDS:Readonly<Record<NonNullable<DataNeed['section']>,string>>={alpaca:'lv-ds-alpaca',coinbase:'lv-ds-coinbase',fred:'lv-ds-fred','own-files':'lv-ds-own-files'};
function goTo(section:NonNullable<DataNeed['section']>){try{document.getElementById(SECTION_IDS[section])?.scrollIntoView({block:'start',behavior:'smooth'});}catch{/* preview without a document */}}
/** The "What you need" list. Pure render of DATA_NEEDS and the current status of each row: the title and its
 * status on one line, then "You need" (the minimum), then what it gives and how to get it. Cards, not a table: the Settings
 * dialog is narrow, and a three-column table wrapped every cell into a tall strip. */
export function DataNeedsTable({inputs}:{inputs:DataNeedInputs}){
 return <ul className="lv-needs" aria-label="What you need for each kind of data">
  {DATA_NEEDS.map(need=>{const status=dataNeedStatus(need.id,inputs);return <li key={need.id} data-lv-need={need.id} data-lv-need-state={status.state}>
   <div className="lv-need-head"><span className="lv-need-title">{need.title}</span><span className="lv-pill" data-state={status.state}>{status.label}</span>{need.section&&inputs.desktop&&<button type="button" onClick={()=>goTo(need.section!)}>{status.state==='off'?'Turn on':status.state==='not-set-up'||status.state==='attention'?'Set up':'Settings'}</button>}</div>
   <div className="lv-need-min"><span className="lv-need-label">You need</span> {need.minimum}</div>
   <div className="lv-need-sub">{need.gives} {need.howTo}</div>
  </li>;})}
 </ul>;
}
export function DataSourcesPanel({live,storage,cache,fred,saved,onImportData}:DataSourcesPanelProps){
 const [alpacaKey,setAlpacaKey]=useState<AlpacaKeyStatus|null>(null),[stream,setStream]=useState<AlpacaStatus|null>(null),[imports,setImports]=useState(0);
 const desktop=!!live.bridge;
 const inputs:DataNeedInputs={alpacaKey,alpacaStream:stream,coinbaseEnabled:live.coinbaseEnabled,fredEnabled:fred?.enabled!==false,desktop};
 const onKey=(status:AlpacaKeyStatus)=>{setAlpacaKey(status);live.onAlpacaKeyStatus?.(status);};
 const savedProps:SavedInfoSectionProps|undefined=saved&&{...saved,onImport:settings=>{saved.onImport(settings);setImports(count=>count+1);}};
 return <div className="lv-datasources">
  <style>{DATA_SOURCES_CSS}</style>
  <section aria-label="What you need">
   <h3>What you need</h3>
   <p className="lv-live-note">Charts need live data. For US stocks and ETFs we recommend a free Alpaca key. Crypto from Coinbase needs no account or key. Add only the sources for the data you want. Everything here is free unless it says paid. Data from Alpaca, Coinbase and FRED is for your own viewing, so OpenCandle does not export it.</p>
   <DataNeedsTable inputs={inputs}/>
  </section>
  <section id={SECTION_IDS.alpaca} aria-label="Real-time US stocks (Alpaca)">
   <h3>Real-time US stocks and history (Alpaca)</h3>
   <p className="lv-live-note">Minimum: a free Alpaca account and its API key. Sign up at alpaca.markets (a free paper trading account is enough), generate an API key in the Alpaca dashboard, then paste the Key ID and Secret here. Alpaca shows the secret only once, so keep it somewhere safe.</p>
   <AlpacaSourceSettings key={imports} {...live} onAlpacaKeyStatus={onKey} onStreamStatus={setStream}/>
  </section>
  <section id={SECTION_IDS.coinbase} aria-label="Crypto (Coinbase)">
   <h3>Crypto (Coinbase)</h3>
   <p className="lv-live-note">Nothing to set up: no account or key. Turn it on to chart crypto.</p>
   <CoinbaseSourceSettings coinbaseEnabled={live.coinbaseEnabled} onCoinbaseEnabledChange={live.onCoinbaseEnabledChange}/>
  </section>
  {fred&&<section id={SECTION_IDS.fred} aria-label="Economic data and rates (FRED)" className="lv-ds-wrap"><FredCacheSection {...fred}/></section>}
  <section aria-label="Company fundamentals and SEC filings">
   <h3>Company fundamentals and filings (SEC)</h3>
   <p className="lv-live-note">Nothing to set up: no account or key. Open Fundamentals or SEC filings for a company and OpenCandle downloads its public reports from the SEC's EDGAR service, only when you ask. The SEC sees your IP address and the company you looked up.</p>
  </section>
  <section id={SECTION_IDS['own-files']} aria-label="Use your own data">
   <h3>Use your own data</h3>
   <p className="lv-live-note">Any market, any source you have the rights to: import a CSV or JSON file of price bars with columns time (or date), open, high, low, close and volume. The import window shows a preview before anything is saved and has example files to try.</p>
   {onImportData&&<div className="lv-live-key-actions"><button type="button" onClick={onImportData}>Import a file...</button></div>}
  </section>
  {savedProps&&<SavedInfoSection {...savedProps}/>}
  {cache&&<MarketDataCacheSection {...cache}/>}
  <LocalStorageSection {...storage}/>
  <section aria-label="Technical details">
   <details className="lv-source-details"><summary>Technical details for each source</summary><ProviderCapabilitiesSection records={DATA_SOURCE_RECORDS}/></details>
  </section>
 </div>;
}
