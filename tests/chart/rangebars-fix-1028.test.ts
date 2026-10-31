import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {commitChartStyle} from '../../src/chart/style-transaction';
import {rangeSizeRefusal} from '../../src/chart/derived/range';
import {computeDerived} from '../../src/chart/derived/index';
import {buildDerivedAxis} from '../../src/chart/derived/derived-axis';
import {bottomRange,fittedBottomRange,servedBottomRange} from '../../src/chart/bottom-toolbar';
import {previousSessionClose} from '../../src/chart/previous-session-close';
import type {Bar} from '../../src/domain/types';
import {createGridTreeCoordinator} from '../../src/chart/grid-tree-coordinator';
import {createMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {defaultTheme} from '../../src/ui/themes';
import {stampLiveLineage} from '../../src/chart/bar-input-identity';
// Live Coinbase BTC-USD 12M -> 1000R broke the chart: the style landed before its settings (stale 100R),
// 100R builds nothing from yearly bars, the empty feed made the chart unavailable, and every later style change failed both
// ways ("Chart style application failed and rollback was incomplete").

// The last three 12M bars Coinbase served in the repro (2024, 2025, 2026 so far).
const yearly:Bar[]=[{time:1704067200,open:42288.58,high:108388.88,low:38501,close:93354.22,volume:4908836.88},{time:1735689600,open:93347.59,high:126296,low:74420.69,close:87497.94,volume:3002171.34},{time:1767225600,open:87497.95,high:97963.62,low:57717.55,close:79735.06,volume:2419920.18}];

it('the stale 100R the chart saw first is refused on 12M BTC bars; 1000R builds a non-empty feed even with a forming last bar',()=>{
 expect(rangeSizeRefusal(yearly,100,0.01)).toMatch(/^100R is too small for these bars: .* Use 7\d\dR or larger/);
 expect(rangeSizeRefusal(yearly,1000,0.01)).toBeNull();
 const built=computeDerived('range',yearly,{range:1000,phantomBars:false},{tickSize:0.01,lastBarOpen:true});
 expect(built.ok).toBe(true);if(!built.ok)return;
 expect(buildDerivedAxis(built.value,86400*360).feed.length).toBeGreaterThan(1000);
});

it('a style refused by the check rolls back to the drawn style without touching the renderer for the refused one',()=>{
 let style='candles',checks=0;const applied:string[]=[],invalidated:string[]=[];
 expect(()=>commitChartStyle('range',{read:()=>style,write:value=>{style=value;},check:()=>{checks++;if(style==='range')throw Error('Range chart cannot be drawn from these bars');},apply:()=>{applied.push(style);},recompute:()=>{},invalidate:()=>{invalidated.push(style);}})).toThrow('cannot be drawn');
 expect(style).toBe('candles');expect(applied).toEqual(['candles']);expect(checks).toBe(1);expect(invalidated).toEqual([]);
 // A drawable style still applies, recomputes and invalidates exactly as before.
 commitChartStyle('heikinashi',{read:()=>style,write:value=>{style=value;},check:()=>{},apply:()=>{applied.push(style);},recompute:()=>{},invalidate:()=>{invalidated.push(style);}});
 expect(style).toBe('heikinashi');expect(applied).toEqual(['candles','heikinashi']);expect(invalidated).toEqual(['heikinashi']);
});

const adapter=readFileSync('src/chart/adapter.ts','utf8'),grid=readFileSync('src/ui/MultiChartGrid.tsx','utf8'),app=readFileSync('src/ui/App.tsx','utf8');
it('setStyle refuses an unavailable chart up front and checks derived drawability before native application',()=>{
 const body=adapter.slice(adapter.indexOf('    setStyle: (style: string) => {'),adapter.indexOf('    setRange:'));
 expect(body).toMatch(/if\(analysisUnavailable\)\{return \{ok:false as const,diagnostic:\{code:'CHART_UNAVAILABLE'/);
 expect(body.indexOf('if(analysisUnavailable)')).toBeLessThan(body.indexOf('commitChartStyle('));
 expect(body).toContain("check:()=>{");expect(body).toContain('derivedDrawRefusal()');
 expect(body).toContain('error instanceof DerivedDrawRefusal)return {ok:false as const,diagnostic:error.diagnostic}');
 const book=adapter.slice(adapter.indexOf('    applyChartSettingsBook:(book:ChartSettingsBook)=>{'),adapter.indexOf('    setChartSettings:'));
 expect(book.indexOf('const refusal=derivedDrawRefusal()')).toBeGreaterThan(-1);expect(book.indexOf('throw refusal')).toBeLessThan(book.indexOf('applyRequestedStyle()'));
});
it('the cell applies its chart settings book while it renders, before ChartPanel sets the style in its passive effect',()=>{
 expect(grid).toContain('const bookError=useMemo(()=>{if(!chart)return null;try{chart.applyChartSettingsBook(chartTypeSettings??{});return null;}');
 expect(grid).not.toContain(' useEffect(()=>{if(!chart)return;try{chart.applyChartSettingsBook');expect(grid).toContain('useEffect(()=>{if(bookError)setError(bookError);},[bookError]);');
});
it('a typed range size the bars cannot build is refused in App before the workspace changes',()=>{
 const body=app.slice(app.indexOf(' function applyRangeInterval('),app.indexOf('\n',app.indexOf(' function applyRangeInterval(')));
 expect(body.indexOf('rangeSizeRefusal(dataset.bars,size,dataset.instrument.tickSize)')).toBeGreaterThan(-1);
 expect(body.indexOf('rangeSizeRefusal(')).toBeLessThan(body.indexOf("commit({chartStyle:'range'"));
});
it('derived frame proofs check the owner per 256 rows and reuse a still-current receipt',()=>{
 const receipt=adapter.slice(adapter.indexOf('    captureScriptCalculationInput:'),adapter.indexOf('    getDisplayedPriceValues:'));
 expect(receipt).toContain('(index&255)===0&&!current()');expect(receipt).toContain('hit.receipt.isCurrent())return hit.receipt;');
 expect(receipt).not.toMatch(/scriptPresentationNumber\(row\.value,key,scale\);if\(!current\(\)\)/);
 const frame=adapter.slice(adapter.indexOf('  const scriptMarketFrameMatches='),adapter.indexOf('  const renewScriptMarket='));
 expect(frame).toContain('(index&255)===0&&!current()');expect(frame).toMatch(/\}return current\(\);/);
});

it('range button tooltips name the interval a click opens on this window (3M -> 2 hours, 6M -> 4 hours at 1,920 bars)',()=>{
 const all=()=>true,capacity=(1032-72)*2;
 expect(fittedBottomRange(bottomRange('3M'),all,capacity)).toEqual({interval:'120m',tooltip:'3 months in 2 hours intervals'});
 expect(fittedBottomRange(bottomRange('6M'),all,capacity)).toEqual({interval:'240m',tooltip:'6 months in 4 hours intervals'});
 expect(fittedBottomRange(bottomRange('1M'),all,capacity)).toEqual(servedBottomRange(bottomRange('1M'),all));
 expect(fittedBottomRange(bottomRange('3M'),all,null)).toEqual({interval:'60m',tooltip:'3 months in 1 hour intervals'});
 expect(fittedBottomRange(bottomRange('3M'),()=>false,capacity)).toBeNull();
 // The App memo uses the same helper with the chart's capacity, so the tooltip and the click agree.
 expect(app).toContain('fittedBottomRange(row,servable,bottomCapacity)');expect(app).toContain('[deferredServedInputs,bottomCapacity]');
});

it('previous session close finds the earlier day by binary search and matches the walk, in order or not',()=>{
 const walk=(bars:readonly Bar[],index:number)=>{const key=(t:number)=>new Date(t*1000).toISOString().slice(0,10),today=key(bars[index].time);for(let back=index-1;back>=0;back--)if(key(bars[back].time)!==today)return bars[back].close;return null;};
 const day=86400,bars:Bar[]=[];for(let index=0;index<12000;index++){const time=1767225600+Math.floor(index/5000)*day+index;bars.push({time,open:1,high:1,low:1,close:index,volume:1});}
 for(const index of [0,1,4999,5000,5001,9999,10000,11999])expect(previousSessionClose(bars,index,'5m','UTC')).toBe(walk(bars,index));
 const unordered=bars.slice(0,6000).map(bar=>({...bar}));unordered[5500].time=1767225600-3*day;
 for(const index of [5999,5600,5501])expect(previousSessionClose(unordered,index,'5m','UTC')).toBe(walk(unordered,index));
 const sameDay=bars.slice(0,4000);expect(previousSessionClose(sameDay,3999,'1m','UTC')).toBeNull();
});

it('a live derived cell whose chart follows a newer snapshot of the row lineage gets its receipt for the committed bars',()=>{
 const dataset=fixtureDataset('GME',5),state=createMultiChartState(dataset,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;state.cells[id].style='range';
 const followed=dataset.bars.map(row=>({...row}));stampLiveLineage(dataset.bars,'SYNTHETIC-lineage',0);stampLiveLineage(followed,'SYNTHETIC-lineage',1);
 const rows=Object.freeze([Object.freeze({time:1,open:1,high:1,low:1,close:1,volume:1})]),capture=vi.fn((expected:any)=>expected.input.bars===followed?{bars:rows,isCurrent:()=>true}:null);
 const chart:any={captureScriptCalculationInput:capture,isInputCurrent:()=>true,suspendTree:()=>({isCurrent:()=>true,resume(){},retire(){},dispose(){}})},runtime:any={prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})};
 const input={state,datasets:[dataset],activeBars:dataset.bars,activeDatasetId:dataset.provenance.datasetId,activeExecutionIdentity:'ordinary'};
 const coordinator=createGridTreeCoordinator({read:()=>input,alive:()=>true,staging:()=>false,controller:()=>chart,runtime:()=>runtime,cell:()=>({settled:true,error:'',input:{bars:followed,source:sourceContextForDataset(dataset),style:'range'}}),holdLinks:()=>({release(){}}),pending(){},failed(){},canonical(){}});
 const lease=coordinator.suspend(input);expect(capture.mock.calls[0][0].input.bars).toBe(followed);lease.dispose();
});
