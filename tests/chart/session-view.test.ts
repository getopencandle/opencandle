// Extended trading hours (App wiring): the session view of a dataset. Synthetic bars only.
import {describe,expect,it} from 'vitest';
import {RTH_LINEAGE_SUFFIX,rawSessionDataset,sessionChartBars,sessionDataset,sessionDatasets} from '../../src/chart/session-zones';
import {barInputIdentity,liveLineageOf,sameBarsInput,stampLiveLineage} from '../../src/chart/bar-input-identity';
import {defaultChartSettingsDocument,restoreChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {factoryAppearance,factoryPriceScale,findRow,writeRow,LV_ROW_KEYS,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {bottomToolbarFullWidth,BOTTOM_SESSION} from '../../src/chart/bottom-toolbar';
import type {Bar,BarDataset} from '../../src/domain/types';

// 2026-10-20 (EDT, UTC-4): 08:00 pre, 10:00 and 15:59 regular, 16:30 post New York time.
const ny=(hour:number,minute:number)=>Date.UTC(2026,9,20,hour+4,minute)/1000;
const bar=(time:number):Bar=>({time,open:1,high:1,low:1,close:1,volume:1});
const stock={assetClass:'stock' as const,timezone:'America/New_York'};
const mixed=()=>[bar(ny(8,0)),bar(ny(8,1)),bar(ny(10,0)),bar(ny(15,59)),bar(ny(16,30))];
function dataset(bars:Bar[],instrument:Partial<BarDataset['instrument']>=stock):BarDataset{
 return{instrument:{id:'SYNTHETIC:T',symbol:'T',name:'synthetic',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',tickSize:0.01,lotSize:1,timezone:'America/New_York',...instrument},bars,resolution:'1m',provenance:{datasetId:'synthetic:T'} as BarDataset['provenance']};
}

describe('session view of chart bars',()=>{
 it("'extended' and inputs without sessions keep the exact array",()=>{
  const bars=mixed();
  expect(sessionChartBars(bars,'extended',stock)).toBe(bars);
  expect(sessionChartBars(bars,'regular',{assetClass:'crypto',timezone:'UTC'})).toBe(bars);
  expect(sessionChartBars(bars,'regular',{assetClass:'stock',timezone:'UTC'})).toBe(bars);
  const regularOnly=[bar(ny(10,0)),bar(ny(10,1))];expect(sessionChartBars(regularOnly,'regular',stock)).toBe(regularOnly);
  const premarketOnly=[bar(ny(8,0)),bar(ny(8,1))];expect(sessionChartBars(premarketOnly,'regular',stock)).toBe(premarketOnly);
 });
 it("'regular' keeps 09:30-16:00 bars, caches one view per input and maps the view back",()=>{
  const bars=mixed(),view=sessionChartBars(bars,'regular',stock);
  expect(view.map(row=>row.time)).toEqual([ny(10,0),ny(15,59)]);
  expect(sessionChartBars(bars,'regular',stock)).toBe(view);
  expect(sessionChartBars(view,'regular',stock)).toBe(view);
  expect(sessionChartBars(view,'extended',stock)).toBe(bars);
 });
 it('a live snapshot view joins a sibling lineage with the same seq',()=>{
  const first=mixed(),second=[...mixed(),bar(ny(16,31))];
  stampLiveLineage(first,'live:test|1m',1);stampLiveLineage(second,'live:test|1m',2);
  const a=sessionChartBars(first,'regular',stock),b=sessionChartBars(second,'regular',stock);
  expect(liveLineageOf(a)).toEqual({key:'live:test|1m'+RTH_LINEAGE_SUFFIX,seq:1});
  expect(sameBarsInput(a,b)).toBe(true);expect(sameBarsInput(a,first)).toBe(false);
  expect(barInputIdentity(a)).not.toBe(barInputIdentity(first));
 });
 it('datasets: same object when unchanged, one cached view otherwise, never stacked',()=>{
  const plain=dataset([bar(ny(10,0))]),ext=dataset(mixed());
  expect(sessionDataset(plain,'regular')).toBe(plain);
  const view=sessionDataset(ext,'regular');
  expect(view).not.toBe(ext);expect(view.bars).toHaveLength(2);expect(view.instrument).toBe(ext.instrument);expect(view.provenance).toBe(ext.provenance);
  expect(sessionDataset(ext,'regular')).toBe(view);expect(sessionDataset(view,'regular')).toBe(view);
  expect(sessionDataset(view,'extended')).toBe(ext);expect(rawSessionDataset(view)).toBe(ext);
  const list=[plain,ext];expect(sessionDatasets(list,'extended')).toBe(list);expect(sessionDatasets(list,'regular')).toEqual([plain,view]);
 });
});

describe('session mode storage and controls',()=>{
 const sources=(over:Partial<ChartSettingsSources>={}):ChartSettingsSources=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:null,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:null,...over});
 it("the Chart Settings document stores symbol.session ('extended' default; older saves restore it)",()=>{
  expect(defaultChartSettingsDocument().symbol.session).toBe('extended');
  const older=defaultChartSettingsDocument() as any;delete older.symbol.session;
  expect(restoreChartSettingsDocument(older).symbol.session).toBe('extended');
  expect(restoreChartSettingsDocument({...defaultChartSettingsDocument(),symbol:{dividendsAdjustment:false,precision:'default',session:'regular'}}).symbol.session).toBe('regular');
  expect(()=>restoreChartSettingsDocument({...defaultChartSettingsDocument(),symbol:{dividendsAdjustment:false,precision:'default',session:'overnight'}})).toThrow();
 });
 it('Symbol tab: the Extended trading hours checkbox reads and writes the document',()=>{
  const row=findRow('symbol',sources(),LV_ROW_KEYS.session)!;
  expect(row).toMatchObject({label:'Extended trading hours',type:'checkbox',factId:null,value:{checked:true},availability:{state:'live'}});
  const next=writeRow(sources(),LV_ROW_KEYS.session,{checked:false});
  expect(next.document.symbol.session).toBe('regular');
  expect(findRow('symbol',next,LV_ROW_KEYS.session)!.value.checked).toBe(false);
  expect(findRow('symbol',sources({documentConnected:false}),LV_ROW_KEYS.session)!.availability.state).toBe('unavailable');
 });
 it('bottom toolbar: the ETH button widens the full bar only when shown',()=>{
  expect(bottomToolbarFullWidth(true)-bottomToolbarFullWidth()).toBe(BOTTOM_SESSION.widthPx);
  expect([BOTTOM_SESSION.label.extended,BOTTOM_SESSION.label.regular]).toEqual(['ETH','RTH']);
 });
});
