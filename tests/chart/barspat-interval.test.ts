import {afterEach,describe,expect,it,vi} from 'vitest';
import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';

// Bars pattern spec (2026-10-21): one pattern bar per chart bar slot, the "Interval" setting re-samples the SAME
// captured span (coarser from the captured bars, finer from loaded data or a fetch from the chart's live source), the anchor
// stays put and the on-screen length follows the bar count. SYNTHETIC data only; live bridges are mocked (no keyed endpoint).
const {LV_BARS_PATTERN,BARS_PATTERN_SOURCE_PATH}=await import('../../src/chart/lv-types/bars-pattern');
const {readBarsPattern,columnsToBars}=await import('../../src/chart/lv-types/bars-pattern-data');
const {resampleBarsPatternInterval,fetchBarsPatternSpan,withFetchedSeries,capturedSeries,barsPatternSpanFetcher}=await import('../../src/chart/lv-types/bars-pattern-resample');
const {stageBarsPatternRequest,clearStagedBarsPatternRequests}=await import('../../src/chart/lv-types/bars-pattern-request');
const {patchDrawingEdit,drawingCatalog}=await import('../../src/chart/drawing-port');
const {D0,DAY,day,daily,dailyBars,minuteBars,dataset}=await import('../helpers/barspat-fixture');

/** 10 px per chart slot. The chart has daily slots with a two-day gap after every fifth bar (a gapless ordinal axis): slot
 *  k sits at time slotTime(k). barsBetween is the logical distance, like the native projector. */
const slotTime=(k:number)=>day(Math.floor(k/5)*7+(k%5));
const logicalOf=(seconds:number)=>{let k=0;while(slotTime(k+1)<=seconds)k++;const a=slotTime(k),b=slotTime(k+1);return k+(seconds-a)/(b-a);};
const projection={width:600,height:400,xOf:(t:number)=>20+logicalOf(t/1000)*10,yOf:(p:number)=>300-p,pxToPoint:(x:number)=>({time:slotTime(Math.round((x-20)/10))*1000,price:0}),paneIdAtY:()=>'price',
 barsBetween:(a:number,b:number)=>Math.abs(logicalOf(b/1000)-logicalOf(a/1000)),
 barsInRange:(from:number,to:number)=>dailyBars(0,30).filter(bar=>bar.time*1000>=from&&bar.time*1000<=to).map(bar=>({...bar,time:bar.time*1000}))} as never;
function placed(fromDay=0,toDay=4):SerializedDrawing{
 const draft=createDrawing(LV_BARS_PATTERN as never,{paneId:'price',anchors:[{time:day(fromDay)*1000,price:150},{time:day(toDay)*1000,price:150}]})!;
 draft.onPlaced(projection);return draft.serialize();
}
const memberOf=(doc:SerializedDrawing)=>{const read=readBarsPattern(doc.props);if(read.state!=='supported')throw Error('no member');return read.member;};
/** Slot xs of the drawn HL bars (one segment per bar at this pitch). */
function drawnXs(doc:SerializedDrawing):number[]{
 const model=deserializeDrawing(structuredClone(doc))! as any,ctx:any={getTransform:()=>({a:1}),save(){},restore(){},beginPath(){},stroke(){},rect(){},setLineDash(){},fillText(){},xs:[] as number[],moveTo(x:number){this.xs.push(x);},lineTo(){}};
 model.lvPaint(ctx,projection,{fontFamily:'sans-serif',background:'#000',textColor:'#fff'});return ctx.xs;
}
const apply=(doc:SerializedDrawing,next:any)=>patchDrawingEdit(doc,[],{[BARS_PATTERN_SOURCE_PATH]:stageBarsPatternRequest(memberOf(doc),next)});

afterEach(()=>clearStagedBarsPatternRequests());

describe('one pattern bar per chart bar slot',()=>{
 it('draws bar i at anchor x + i chart slots and keeps that spacing after a move across a session gap',()=>{
  const doc=placed(0,4);expect(memberOf(doc).bars.count).toBe(5);
  expect(drawnXs(doc)).toEqual([20,30,40,50,60]);
  // Move the body by three calendar days: the start lands on day 3 (slot 3); the bars still take one slot each.
  const model=deserializeDrawing(structuredClone(doc))! as any;
  model.anchors=model.translateBody(3*DAY*1000,0,structuredClone(doc.anchors));
  expect(drawnXs(model.serialize())).toEqual([50,60,70,80,90]);
 });
 it('the end handle is shown but grabbing it moves the pattern (it never stretches the bars)',()=>{
  const model=deserializeDrawing(structuredClone(placed(0,4)))! as any,[,end]=model.handlePoints(projection);
  expect(end[0]).toBe(60);expect(model.hitHandle(end[0],end[1],projection,3)).toBe(-1);
  expect(model.hitTest(end[0],end[1],projection,3)).toBe(true);
 });
 it('a one-bar pattern takes most of its own slot, not the space between the clicks',()=>{
  const draft=createDrawing(LV_BARS_PATTERN as never,{paneId:'price',anchors:[{time:day(2)*1000,price:150},{time:day(2)*1000+3_600_000,price:150}]})!;
  draft.onPlaced(projection);const model=deserializeDrawing(structuredClone(draft.serialize()))! as any,rects:number[][]=[];
  const ctx:any={getTransform:()=>({a:1}),save(){},restore(){},beginPath(){},stroke(){},setLineDash(){},fillText(){},moveTo(){},lineTo(){},rect(...args:number[]){rects.push(args);}};
  model.lvPaint(ctx,projection,{fontFamily:'sans-serif',background:'#000',textColor:'#fff'});
  expect(rects).toHaveLength(1);expect(rects[0][0]).toBeCloseTo(36.5,9);expect(rects[0][2]).toBeCloseTo(7,9);
 });
 it('the setting is labelled Interval',()=>{
  expect(drawingCatalog().find(row=>row.type===LV_BARS_PATTERN)!.fields.find(field=>field.path===BARS_PATTERN_SOURCE_PATH)!.label).toBe('Interval');
 });
});

describe('Interval: re-sample the captured span',()=>{
 it('coarser intervals aggregate the captured bars with no loaded data, and the captured interval restores them exactly',()=>{
  const doc=placed(0,4),bound={...memberOf(doc),source:{...memberOf(doc).source,resolution:'1D',placedResolution:'1D'}};
  const weekly=resampleBarsPatternInterval(bound,{datasets:[]},{target:'1W'});
  expect(weekly.ok).toBe(true);if(!weekly.ok)return;
  expect(weekly.member.bars.count).toBe(1);expect(weekly.member.source.resolution).toBe('1W');
  const five=dailyBars(0,5);
  expect(columnsToBars((readBarsPattern({lvBarsPattern:weekly.member}) as any).columns)[0]).toEqual({time:day(0),open:five[0].open,high:Math.max(...five.map(b=>b.high)),low:Math.min(...five.map(b=>b.low)),close:five[4].close});
  const back=resampleBarsPatternInterval(weekly.member,{datasets:[]},{target:'1D'});
  expect(back.ok).toBe(true);if(!back.ok)return;
  expect(columnsToBars((readBarsPattern({lvBarsPattern:back.member}) as any).columns)).toEqual(five.map(({volume:_v,...bar})=>bar));
 });
 it('infers the captured interval when the pattern was never bound to a dataset',()=>{
  const member=memberOf(placed(0,4));expect(member.source.resolution).toBeNull();
  expect(capturedSeries(member)!.resolution).toBe('1D');
  expect(resampleBarsPatternInterval(member,{datasets:[]},{target:'1W'}).ok).toBe(true);
 });
 it('finer intervals use loaded finer data, keep the anchor, and the pattern gets longer on screen',()=>{
  const doc=placed(5,9),datasets=[daily(),dataset('syn-1m','1m',minuteBars(5,15))];
  const result=resampleBarsPatternInterval(memberOf(doc),{datasets,chart:{datasetId:'syn-1d',resolution:'1D'}},{target:'240m'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.member.bars.count).toBe(30);
  const after=apply(doc,result.member);
  expect(after.anchors[0]).toEqual(doc.anchors[0]);
  const xs=drawnXs(after);expect(xs.length).toBe(30);expect(xs[0]).toBeCloseTo(drawnXs(doc)[0],9);expect(xs[29]-xs[0]).toBeCloseTo(29*10,9);
 });
 it('finer data that is not available: a plain message, and nothing changes',()=>{
  const member=memberOf(placed(0,4));
  const result=resampleBarsPatternInterval(member,{datasets:[daily()]},{target:'240m'});
  expect(result).toMatchObject({ok:false,code:'NO_SOURCE'});
  if(result.ok)return;
  expect(result.message).toBe('No 4 hours data is available for this span. The interval stays 1 day.');
 });
});

describe('Interval: finer bars fetched from the live source are stored in the drawing',()=>{
 const live=(resolution:string)=>dataset('live:coinbase-public:BTC-USD:'+resolution,resolution,dailyBars(0,30),{fixture:false,instrumentId:'COINBASE:BTC-USD',providerId:'coinbase-public'});
 function bridge(){
  const calls:any[]=[];
  const minutes=minuteBars(0,10);
  const fetchCoinbaseCandles=vi.fn(async(input:any)=>{calls.push(input);
   // SYNTHETIC hourly candles: the minutes of each hour inside [start, end).
   const out=[];for(let open=input.start;open<input.end;open+=3600){const first=(open-D0)/60,rows=minutes.slice(first,first+60);out.push({time:open,open:rows[0].open,high:Math.max(...rows.map(r=>r.high)),low:Math.min(...rows.map(r=>r.low)),close:rows.at(-1)!.close,volume:1});}
   return{ok:true as const,value:{schemaVersion:1 as const,productId:input.productId,granularity:input.granularity,seconds:3600,bars:out,provenance:{} as any}};});
  return{calls,bridge:{fetchCoinbaseCandles}};
 }
 it('asks for a fetch, fetches the span through the bridge, stores the bars and survives a reload',async()=>{
  const doc=placed(0,4),datasets=[live('1D')],chart={datasetId:'live:coinbase-public:BTC-USD:1D',resolution:'1D'};
  const bound={...memberOf(doc),source:{...memberOf(doc).source,instrumentId:'COINBASE:BTC-USD',symbol:'BARSPAT',fixture:false,datasetKey:'k',revision:'r1',resolution:'1D',placedResolution:'1D',spanEnd:day(5)}};
  const first=resampleBarsPatternInterval(bound,{datasets,chart,canFetch:true},{target:'240m'});
  expect(first).toMatchObject({ok:false,code:'FETCH',fetch:{providerId:'coinbase-public',symbol:'BTC-USD',start:day(0),end:day(5)}});
  if(first.ok||first.code!=='FETCH')return;
  const {bridge:b,calls}=bridge();
  const fetched=await fetchBarsPatternSpan(first.fetch,barsPatternSpanFetcher({coinbase:b}));
  expect(fetched.ok).toBe(true);if(!fetched.ok)return;
  expect(calls[0]).toMatchObject({productId:'BTC-USD',granularity:'ONE_HOUR'});
  expect(fetched.series.resolution).toBe('60m');expect(fetched.series.bars.length).toBe(5*24);
  const result=resampleBarsPatternInterval(withFetchedSeries(bound,fetched.series),{datasets,chart,canFetch:true},{target:'240m'});
  expect(result.ok).toBe(true);if(!result.ok)return;
  expect(result.member.bars.count).toBe(30);
  // Stored with the drawing: a JSON round trip reads back, and a later finer choice needs no new fetch.
  const after=apply(doc,result.member),reread=readBarsPattern(JSON.parse(JSON.stringify(after.props)));
  expect(reread.state).toBe('supported');if(reread.state!=='supported')return;
  expect(reread.member.fetched?.resolution).toBe('60m');expect(reread.member.captured?.bars.count).toBe(5);
  const hourly=resampleBarsPatternInterval(reread.member,{datasets:[],canFetch:false},{target:'60m'});
  expect(hourly.ok&&hourly.member.bars.count).toBe(120);
  // Back to the captured interval: the captured daily bars, not a re-aggregation.
  const back=resampleBarsPatternInterval(reread.member,{datasets:[]},{target:'1D'});
  expect(back.ok&&columnsToBars((readBarsPattern({lvBarsPattern:back.member}) as any).columns)).toEqual(dailyBars(0,5).map(({volume:_v,...bar})=>bar));
 });
 it('a failed fetch is a plain message',async()=>{
  const fetcher=barsPatternSpanFetcher({coinbase:{fetchCoinbaseCandles:async()=>({ok:false as const,error:{code:'X',message:'offline'}})}});
  const result=await fetchBarsPatternSpan({providerId:'coinbase-public',symbol:'BTC-USD',resolution:'240m',start:day(0),end:day(5)},fetcher);
  expect(result).toEqual({ok:false,message:'Could not load 4 hours data for this span (offline). The interval is unchanged.'});
 });
 it('two patterns of the same span can hold different intervals side by side',()=>{
  const member={...memberOf(placed(0,4)),source:{...memberOf(placed(0,4)).source,resolution:'1D',placedResolution:'1D'}};
  const a=resampleBarsPatternInterval(member,{datasets:[]},{target:'1D'}),b=resampleBarsPatternInterval(member,{datasets:[]},{target:'1W'});
  expect(a.ok&&a.member.bars.count).toBe(5);expect(b.ok&&b.member.bars.count).toBe(1);
  expect(D0).toBe(day(0));
 });
});
