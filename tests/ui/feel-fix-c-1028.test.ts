import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {buildSymbolSearchCandidates,coinbaseOfferFor,generatedLeads,searchSymbols,syntheticGenerationCandidate} from '../../src/ui/symbol-search';
import {coinbaseSearchDatasets} from '../../src/domain/coinbase-live';
import {displayExchange,fixtureInstrument,makeFixture,FIXTURE_CAPABILITIES,FIXTURE_PROVIDER_NAME} from '../../src/domain/fixtures';
import {ChartTradingButtons,LAST_PRICE_BUTTON_LABEL,type ChartTradingButtonsProps} from '../../src/ui/ChartTradingButtons';
import {useLayoutTabs} from '../../src/ui/LayoutTabs';
import type {BarDataset} from '../../src/domain/types';

const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
const all=(tree:any,predicate:(node:any)=>boolean,found:any[]=[]):any[]=>{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,found));else if(tree?.props){if(predicate(tree))found.push(tree);all(tree.props.children,predicate,found);}return found;};
/** A saved synthetic BTC (opened once as a demo) next to the live Coinbase rows. */
const demo=(symbol:string):BarDataset=>({instrument:fixtureInstrument(symbol),bars:makeFixture(symbol,5),resolution:'1D',provenance:{providerId:FIXTURE_CAPABILITIES.id,providerName:FIXTURE_PROVIDER_NAME,datasetId:FIXTURE_CAPABILITIES.id+':'+symbol,fixture:true,coverage:'demo',asOf:0,delaySeconds:null,adjustment:'raw',session:'unknown',timezone:'UTC',state:'historical',revision:'1',license:'demo',notes:[]}} as unknown as BarDataset);

describe('FEEL-FIX-C #1: real symbols lead synthetic ones in symbol search',()=>{
 it('a live BTC-USD ranks above a demo BTC that matches the typed ticker exactly',()=>{
  const rows=buildSymbolSearchCandidates([demo('BTC'),...coinbaseSearchDatasets(true,'1D')],[]);
  const result=searchSymbols(rows,'btc');
  expect(result.rows[0].symbol).toBe('BTC-USD');expect(result.rows[0].sourceKind).toBe('live');
  expect(result.rows.find(row=>row.symbol==='BTC')?.synthetic).toBe(true);
  // Without a real match the exact demo ticker still leads (MS above MSFT).
  expect(searchSymbols(buildSymbolSearchCandidates([demo('MS'),demo('MSFT')],[]),'ms').rows[0].symbol).toBe('MS');
 });
 it('a generated DEMO row does not lead while a real openable source starts with the typed text',()=>{
  const live=buildSymbolSearchCandidates(coinbaseSearchDatasets(true,'1D'),[]);
  expect(generatedLeads('btc',{symbol:'BTC'},live)).toBe(false);
  expect(generatedLeads('btc',{symbol:'BTC'},[])).toBe(true);
  expect(generatedLeads('btc',{symbol:'BTC'},[{symbol:'BTC-USD',synthetic:true,openable:true}])).toBe(true);
  // A different company that only shares the letters keeps the typed ticker first (GM before GME).
  expect(generatedLeads('gm',{symbol:'GM'},[{symbol:'GME',synthetic:false,openable:true}])).toBe(true);
 });
 it('offers Coinbase for a crypto query only while Coinbase is off, and labels a demo crypto pair Crypto',()=>{
  expect(coinbaseOfferFor('btc',false)).toEqual(['BTC-USD']);expect(coinbaseOfferFor('Bitcoin',false)).toEqual(['BTC-USD']);
  expect(coinbaseOfferFor('btc',true)).toEqual([]);expect(coinbaseOfferFor('b',false)).toEqual([]);expect(coinbaseOfferFor('msft',false)).toEqual([]);
  expect(syntheticGenerationCandidate('btc-usd',[])?.assetClass).toBe('crypto');expect(syntheticGenerationCandidate('zzzz',[])?.assetClass).toBe('stock');
 });
 it('the search box shows typed text as one ticker (no "Btc-usd") and the dialog wires the offer',()=>{
  expect(readFileSync('src/ui/symbol-search.css','utf8')).toMatch(/\.symbol-search-controls>input:not\(:placeholder-shown\)\{text-transform:uppercase\}/);
  const dialog=readFileSync('src/ui/SymbolSearchDialog.tsx','utf8');
  expect(dialog).toContain('noSymbolsMatch(query.toUpperCase())');expect(dialog).toContain('Turn on Coinbase live data');
 });
});

describe('FEEL-FIX-C #9: demo symbols read "Demo" as their exchange',()=>{
 it('displayExchange',()=>{expect(displayExchange('SYNTHETIC')).toBe('Demo');expect(displayExchange('NASDAQ')).toBe('NASDAQ');});
});

describe('FEEL-FIX-C #3: Buy and Sell show the last streamed price when there is no paper quote',()=>{
 const base=(over:Partial<ChartTradingButtonsProps>={}):ChartTradingButtonsProps=>({visible:true,legend:'normal',legendBottom:0,quote:null,digits:2,presetName:null,presetTooltip:null,oneClick:false,onBuy:()=>true,onSell:()=>true,...over});
 it('last price on both buttons, labelled; "No quote" only without one',()=>{
  const tree=ChartTradingButtons(base({lastPrice:81270.61})) as any,[sell,buy]=all(tree,node=>node.type==='button');
  expect(text(sell)).toBe('Sell81270.61');expect(text(buy)).toBe('Buy81270.61');expect(text(tree)).toContain(LAST_PRICE_BUTTON_LABEL);expect(text(tree)).not.toContain('No quote');
  expect(text(ChartTradingButtons(base()) as any)).toContain('No quote');
  // A paper quote wins over the last price.
  const quoted=ChartTradingButtons(base({quote:{bid:99.98,ask:100.02},lastPrice:5})) as any;expect(all(quoted,node=>node.type==='button').map(text)).toEqual(['Sell99.98','Buy100.02']);
 });
 it('the legend interval and exchange keep their width; the title gives way',()=>{
  const css=readFileSync('src/ui/styles.css','utf8');
  expect(css).toContain('.chart-heading>div:first-child>span:is([data-status-part=interval],[data-status-part=exchange]){flex:none;overflow:visible}');
 });
});

describe('FEEL-FIX-C #2 and #5: nothing moves at startup or when a layout becomes unsaved',()=>{
 it('the tab strip renders an empty strip of its height while the workspace loads',()=>{
  const Probe=(props:{reserve:boolean})=>useLayoutTabs({reserve:props.reserve,loaded:false,library:undefined,grid:undefined,run:async()=>{},onError:()=>{},keyboard:false,storage:null});
  expect(renderToStaticMarkup(React.createElement(Probe,{reserve:true}))).toBe('<div class="lv-layout-tabs" data-layout-tabs="" aria-hidden="true"></div>');
  expect(renderToStaticMarkup(React.createElement(Probe,{reserve:false}))).toBe('');
 });
 it('startup hides the default header until the saved one is in, and a clean restore is not a toast',()=>{
  const css=readFileSync('src/ui/styles.css','utf8'),app=readFileSync('src/ui/App.tsx','utf8');
  expect(css).toContain('.workspace[data-lv-starting]>.topbar>:not(.brand),.workspace[data-lv-starting]>.right-panel{visibility:hidden}');
  expect(app).toContain("data-lv-starting={!loaded&&startupView.phase==='loading'?'':undefined}");
  expect(app).toContain("(message==='Local workspace restored'||message==='Loading local workspace...'?' lv-toast-quiet':'')");
  expect(app).toContain('useLayoutTabs({reserve:!secondaryWindow,');
 });
 it('a clean layout name reserves the width of its unsaved marker',()=>{
  expect(readFileSync('src/ui/styles.css','utf8')).toContain(".topbar .layout-library-button[data-layout-clean] .layout-library-name::after{content:' *';white-space:pre;visibility:hidden}");
  expect(readFileSync('src/ui/layout-menu.tsx','utf8')).toContain("data-layout-clean={dirty?undefined:''}");
 });
});

describe('FEEL-FIX-C #4, #6, #7, #8',()=>{
 it('the trade group publishes its height and the price legend starts below it',()=>{
  expect(readFileSync('src/ui/ChartTradingButtonsPlacement.tsx','utf8')).toContain("export const TRADE_OFFSET_VAR='--lv-trade-buttons-h';");
  expect(readFileSync('src/ui/indicator-legend.css','utf8')).toContain('.chart-workspace>.indicator-legend>.lv-legend-price-scroll{margin-top:var(--lv-trade-buttons-h,0px)}');
 });
 it('a grid pick closes Layout setup; a dialog whose first field cannot take focus focuses itself',()=>{
  expect(readFileSync('src/ui/App.tsx','utf8')).toContain("document.addEventListener('click',pick,true)");
  expect(readFileSync('src/ui/Modal.tsx','utf8')).toContain('if(!modal.contains(document.activeElement))modal.focus?.();');
 });
 it('Indicator templates and Layout setup have distinct icons; the layout one is a split window',()=>{
  const icons=readFileSync('src/ui/icons/toolbar-icons.tsx','utf8');
  const line=(id:string)=>icons.split('\n').find(row=>row.includes(`icon('${id}'`))!;
  expect(line('layout-setup')).toContain('M14 4.5V23.5M3.5 14H24.5');expect(line('indicator-templates')).not.toMatch(/<rect[^>]*width=\{7\}/);
 });
});
