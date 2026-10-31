import {expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DataSourcesPanel} from '../../src/ui/data-sources-panel';
import {SavedInfoSection,SETTINGS_FILE_NOTE} from '../../src/ui/SavedInfoSection';

// The Data sources page markup (static render, no effects). Not executable UI evidence.
const live={coinbaseEnabled:false,onCoinbaseEnabledChange:vi.fn(),alpacaSymbols:[],onAlpacaSymbolsChange:vi.fn(),bridge:null,alpacaPlan:'free' as const,onAlpacaPlanChange:vi.fn()};
const storage={directory:'C:\\Users\\Someone\\AppData\\Roaming\\LarryVision\\local-workspace',onExport:vi.fn(),onReset:vi.fn(),onResetDone:vi.fn()};
const saved={bridge:null,settings:{coinbase:false,alpacaSymbols:[]},onImport:vi.fn()};
const visibleText=(html:string)=>html.replace(/<style>[\s\S]*?<\/style>/g,'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ');

it('opens with the What you need table, then one section per source, saved info, workspace and details',()=>{
  const html=renderToStaticMarkup(React.createElement(DataSourcesPanel,{live,storage,saved,onImportData:vi.fn(),fred:{bridge:null,enabled:true,onEnabledChange:vi.fn()},cache:{bridge:null}}));
  const text=visibleText(html);
  const order=['What you need','Real-time US stocks and history (Alpaca)','Crypto (Coinbase)','Economic data and rates (FRED)','Company fundamentals and filings (SEC)','Use your own data','Where your settings are saved','Cached market data','Saved on this computer','Technical details for each source'];
  const at=order.map(heading=>html.indexOf('>'+heading+'</'));
  expect(at.every(index=>index>=0)).toBe(true);expect([...at].sort((a,b)=>a-b)).toEqual(at);
  for(const need of ['demo','stocks-live','stocks-history','crypto','macro','fundamentals','own-files','other-markets'])expect(html).toContain('data-lv-need="'+need+'"');
  expect(text).toContain('A free Alpaca account and its API key.');
  expect(text).toContain('Nothing. No account or key.');
  expect(text).toContain('Import a file...');expect(text).toContain('Remove key');expect(text).toContain('Export settings...');expect(text).toContain('Import settings...');expect(text).toContain('Open folder');
  // Outside the desktop app every source says so instead of offering set-up buttons.
  expect(text).toContain('Needs the desktop app');expect(html).not.toMatch(/>Set up<\/button>/);
  expect(text).not.toMatch(/\u2014/);
  expect(text).not.toMatch(/lv-synthetic|lv-local-aggregation|alpaca-iex|alpaca-sip|owner-key|public-unauthenticated|liveStocksAlpaca/);
  // The technical list stays closed until asked.
  expect(html).toMatch(/<details class="lv-source-details"><summary>Technical details for each source<\/summary>/);
});
it('with the desktop bridge the rows offer Set up and the crypto row reads On when it is on',()=>{
  const bridge={alpacaKeyStatus:vi.fn(async()=>({ok:true,value:{configured:false,keyIdHint:null,encryption:true}})),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn()} as any;
  const html=renderToStaticMarkup(React.createElement(DataSourcesPanel,{live:{...live,bridge,coinbaseEnabled:true},storage,saved}));
  expect(html).toMatch(/data-lv-need="crypto" data-lv-need-state="on"/);
  expect(html).toMatch(/data-lv-need="demo" data-lv-need-state="ready"/);
  expect(html).toMatch(/>Set up<\/button>|>Settings<\/button>/);
  expect(bridge.alpacaKeyStatus).not.toHaveBeenCalled();
});
it('a switched-off crypto row says so and offers Turn on; the folder path is a wrapping selectable field',()=>{
  const bridge={alpacaKeyStatus:vi.fn(),saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),testAlpacaConnection:vi.fn()} as any;
  const html=renderToStaticMarkup(React.createElement(DataSourcesPanel,{live:{...live,bridge,coinbaseEnabled:false},storage,saved}));
  expect(html).toMatch(/data-lv-need="crypto" data-lv-need-state="off"[^]*?Switched off[^]*?Turn on<\/button>/);
  expect(html).toMatch(/<textarea[^>]*aria-label="Settings folder"[^>]*readOnly|<textarea[^>]*aria-label="Settings folder"[^>]*readonly/i);
  expect(html).not.toMatch(/—/);
},0);
it('saved info says where things are saved and that the settings file never holds keys',()=>{
  const html=renderToStaticMarkup(React.createElement(SavedInfoSection,saved));
  expect(html).toContain('Where your settings are saved');expect(html).toContain('aria-label="Settings folder"');
  expect(html).toContain(SETTINGS_FILE_NOTE);expect(SETTINGS_FILE_NOTE).toMatch(/never contains API keys/);
  expect(html).toMatch(/<button type="button" disabled=""[^>]*>Open folder<\/button>/);
});
