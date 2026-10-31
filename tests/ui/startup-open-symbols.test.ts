import {readFileSync} from 'node:fs';
import {afterEach,describe,expect,it,vi} from 'vitest';
import {buildStartupLiveGrid,decideStartupOpenMany,mergeStreamSymbols,parseStartupOpenSymbols,resolveStartupSymbols,startupLayoutPreset,STARTUP_MAX_CHARTS,STARTUP_OPEN_INTERVAL} from '../../src/ui/startup-open';
import {alpacaDatasetId,ALPACA_SYMBOL,type AlpacaAsset} from '../../src/domain/alpaca-live';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {clearLiveDatasets,liveDatasetById} from '../../src/ui/live-registry';
import {projectGrid,selectedDataset} from '../../src/ui/workspace-grid';
import {LV_LAYOUTS} from '../../src/chart/layout-port';

// --lv-open-symbols=GME,SPY,GME.WS. Pure helpers plus a mocked asset search; no network.
const main=readFileSync('electron/main.cjs','utf8');
const fn=(name:string)=>new Function(`${new RegExp('const '+name+'=.*;\\r?\\n').exec(main)![0]}return ${name};`)() as (argv:unknown)=>string|null;
afterEach(()=>clearLiveDatasets());
const a=(symbol:string)=>({source:'alpaca' as const,symbol});
const asset=(symbol:string,extra:Partial<AlpacaAsset>={}):AlpacaAsset=>({symbol,name:symbol+' synthetic',exchange:'NYSE',tradable:true,status:'active',chartable:ALPACA_SYMBOL.test(symbol),warrant:false,...extra});

describe('main forwards the raw list, length-capped',()=>{
 it('reads --lv-open-symbols= and caps item length and count',()=>{
  const many=fn('startupOpenSymbolsArg');
  expect(many(['x.exe','--lv-open-symbols=GME,SPY,GME.WS'])).toBe('GME,SPY,GME.WS');
  expect(many(['--lv-open-symbols=gme, spy'])).toBe('gme, spy');
  expect(many(['--lv-open-symbols='+Array.from({length:16},()=>'ABCDE.WSA.PRA').join(',')])).not.toBeNull();
  for(const bad of ['','GME;SPY','GME,../x','A\\B',Array.from({length:17},()=>'A').join(','),'ABCDEFGHIJKLMN',',,,'])expect(many(['--lv-open-symbols='+bad]),bad).toBeNull();
  expect(many(['--lv-open-symbol=GME'])).toBeNull();expect(many(undefined)).toBeNull();
 });
 it('the single-symbol argument fits the longest dotted symbol and still rejects longer text',()=>{
  const one=fn('startupOpenArg');
  expect(one(['--lv-open-symbol=GME.WS'])).toBe('GME.WS');expect(one(['--lv-open-symbol=ABCDE.WSA.PRA'])).toBe('ABCDE.WSA.PRA');
  expect(one(['--lv-open-symbol=ABCDEFGHIJKLMN'])).toBeNull();
 });
 it('both channels are handled behind trusted() and exposed by preload',()=>{
  expect(main).toContain("'lv:startup:open-symbols': async value => {noInput(value);return startupOpenSymbolsArg(process.argv);}");
  expect(readFileSync('electron/preload.cjs','utf8')).toContain("startupOpenSymbols: () => invoke('lv:startup:open-symbols')");
 });
});

describe('parsing the symbol list',()=>{
 it('opens GME, SPY and the warrant in order, upper-cased and de-duplicated',()=>{
  expect(parseStartupOpenSymbols(['app.exe','--lv-open-symbols=GME,SPY,GME.WS'])).toEqual({symbols:[a('GME'),a('SPY'),a('GME.WS')],rejected:[]});
  expect(parseStartupOpenSymbols(['--lv-open-symbols=gme, spy ,GME,btc-usd'])).toEqual({symbols:[a('GME'),a('SPY'),{source:'coinbase',symbol:'BTC-USD'}],rejected:[]});
 });
 it('keeps the good symbols when some are malformed, and keeps the warrant spellings for lookup',()=>{
  expect(parseStartupOpenSymbols(['--lv-open-symbols=GME,TOOLONGSYM,SPY,GME-WS'])).toEqual({symbols:[a('GME'),a('SPY'),a('GME-WS')],rejected:['TOOLONGSYM']});
 });
 it('falls back to --lv-open-symbol=, and the plural argument wins when both are given',()=>{
  expect(parseStartupOpenSymbols(['--lv-open-symbol=GME'])).toEqual({symbols:[a('GME')],rejected:[]});
  expect(parseStartupOpenSymbols(['--lv-open-symbol=AAPL','--lv-open-symbols=GME,SPY'])?.symbols).toEqual([a('GME'),a('SPY')]);
  expect(parseStartupOpenSymbols(['--lv-open-symbol=TOOLONGSYM'])).toEqual({symbols:[],rejected:['TOOLONGSYM']});
  expect(parseStartupOpenSymbols([])).toBeNull();
 });
 it('opens at most one full layout of charts',()=>{
  const list=Array.from({length:STARTUP_MAX_CHARTS+2},(_,i)=>'S'+String.fromCharCode(65+i));
  const parsed=parseStartupOpenSymbols(['--lv-open-symbols='+list.join(',')])!;
  expect(parsed.symbols).toHaveLength(STARTUP_MAX_CHARTS);expect(parsed.rejected).toEqual(list.slice(STARTUP_MAX_CHARTS));
 });
});

describe('checking symbols against Alpaca before opening',()=>{
 const search=vi.fn(async(query:string)=>({ok:true as const,value:{schemaVersion:1 as const,query,total:2,listedAt:'2026-10-21T15:00:00Z',assets:query.startsWith('GME')?[asset('GME'),asset('GME.WS',{tradable:false,warrant:true})]:query==='SPY'?[asset('SPY')]:[]}}));
 it('uses the real Alpaca symbol, and lists the ones Alpaca does not have',async()=>{
  const result=await resolveStartupSymbols([a('GME'),a('SPY'),a('GME-WS'),a('ZZZZ'),{source:'coinbase',symbol:'BTC-USD'}],search);
  expect(result.symbols).toEqual([a('GME'),a('SPY'),a('GME.WS'),{source:'coinbase',symbol:'BTC-USD'}]);
  expect(result.missing).toEqual(['ZZZZ']);
  expect(result.notices).toEqual([expect.stringMatching(/GME\.WS.*not tradable/)]);
 });
 it('without lookup (or when it fails) opens what was typed when the chart format allows it',async()=>{
  expect(await resolveStartupSymbols([a('GME'),a('GME-WS')],null)).toEqual({symbols:[a('GME')],missing:['GME-WS'],notices:[]});
  const failing=async()=>({ok:false as const,error:{code:'AUTH_FAILED',message:'Alpaca rejected the key.'}});
  expect(await resolveStartupSymbols([a('GME.WS')],failing)).toEqual({symbols:[a('GME.WS')],missing:[],notices:[]});
 });
});

describe('deciding what opens',()=>{
 it('opens every found symbol and names the missing ones in plain words',()=>{
  expect(decideStartupOpenMany({symbols:[a('GME'),a('SPY')],missing:['ZZZZ'],rejected:['TOOLONGSYM'],notices:[],alpacaKeyConfigured:true,coinbaseEnabled:false}))
   .toEqual({open:[a('GME'),a('SPY')],message:'Could not find ZZZZ, TOOLONGSYM. Opened GME and SPY.'});
  expect(decideStartupOpenMany({symbols:[a('GME'),a('SPY'),a('GME.WS')],missing:[],rejected:[],notices:[],alpacaKeyConfigured:true,coinbaseEnabled:false})).toEqual({open:[a('GME'),a('SPY'),a('GME.WS')],message:null});
 });
 it('without a key opens nothing from Alpaca and says how to fix it; notices are passed on',()=>{
  expect(decideStartupOpenMany({symbols:[a('GME'),a('SPY')],missing:[],rejected:[],notices:[],alpacaKeyConfigured:false,coinbaseEnabled:false})).toEqual({open:[],message:'No Alpaca key saved. Add it in Settings > Data sources to open GME, SPY live.'});
  expect(decideStartupOpenMany({symbols:[a('GME.WS')],missing:[],rejected:[],notices:['Alpaca lists GME.WS but marks it not tradable.'],alpacaKeyConfigured:true,coinbaseEnabled:false}).message).toBe('Alpaca lists GME.WS but marks it not tradable.');
  expect(decideStartupOpenMany({symbols:[],missing:['ZZZZ'],rejected:[],notices:[],alpacaKeyConfigured:true,coinbaseEnabled:false})).toEqual({open:[],message:'Could not find ZZZZ. Nothing was opened.'});
 });
});

describe('the multi-chart layout',()=>{
 it('picks the smallest layout that fits',()=>{
  expect([1,2,3,4,5,6,7,9,12,16].map(startupLayoutPreset)).toEqual(['single','two-columns','three-columns','four','six','six','eight','ten','twelve','sixteen']);
  for(const id of ['single','two-columns','three-columns','four','six','eight','ten','twelve','sixteen'])expect(LV_LAYOUTS.some(row=>row.id===id)).toBe(true);
 });
 it('puts one live chart per symbol, first chart active, and asks the app to open each feed',()=>{
  const workspace=createInitialWorkspace();let next=0;
  const result=buildStartupLiveGrid(workspace,[a('GME'),a('SPY'),a('GME.WS')],STARTUP_OPEN_INTERVAL,{coinbase:false,alpacaKey:true},()=>'startup-cell-'+(++next));
  const rows=result.grid.layout.cells;
  expect(result.grid.presetId).toBe('three-columns');expect(rows.map(row=>row.symbol)).toEqual(['GME','SPY','GME.WS']);
  expect(rows.map(row=>result.grid.cells[row.id].datasetId)).toEqual(['GME','SPY','GME.WS'].map(s=>alpacaDatasetId(s,'1m')));
  expect(result.grid.layout.activeCellId).toBe(rows[0].id);
  expect(result.reopen.map(row=>[row.cellId,row.symbol,row.interval])).toEqual(rows.map(row=>[row.id,row.symbol,'1m']));
  for(const row of rows)expect(liveDatasetById(result.grid.cells[row.id].datasetId)?.provenance.state).toBe('loading');
  const projected=projectGrid(workspace,result.grid);expect(selectedDataset(projected).instrument.symbol).toBe('GME');
 });
});

describe('stream symbols cover every open chart',()=>{
 it('adds the open symbols to the saved list, keeping the open ones within 30',()=>{
  expect(mergeStreamSymbols(['AAPL','GME'],['GME','SPY','GME.WS'])).toEqual(['AAPL','GME','SPY','GME.WS']);
  const saved=Array.from({length:30},(_,i)=>'S'+String.fromCharCode(65+i%26)+String.fromCharCode(65+Math.floor(i/26)));
  const merged=mergeStreamSymbols(saved,['GME','SPY','GME.WS']);
  expect(merged).toHaveLength(30);expect(merged.slice(-3)).toEqual(['GME','SPY','GME.WS']);expect(merged.slice(0,27)).toEqual(saved.slice(0,27));
  expect(mergeStreamSymbols(['AAPL'],['bad sym','GME'])).toEqual(['AAPL','GME']);
 });
});
