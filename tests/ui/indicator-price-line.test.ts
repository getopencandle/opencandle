import {beforeEach,expect,it,vi} from 'vitest';
import type {IndicatorId} from '../../src/domain/indicators';
import {indicatorDecorationId} from '../../src/chart/indicator-presentation';
import {makeHarness,realChart,valuesOf,bars} from './indicator-real-port-harness';

// L1 lane evidence for IND.<kind>.STYLE.<plot>.PRICE_LINE: the per-plot "Latest-value tracking line"
// checkbox of the ACTUAL settings handlers, applied through the REAL port, observed in the native
// output recorded by the minimal host. Model + component-handler evidence only; no GUI/reference.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

const cases:[string,IndicatorId,string][]=[
 ['IND.VOLUME.STYLE.VOLUME_MA.PRICE_LINE','volume','ma'],['IND.SMA.STYLE.SMA.PRICE_LINE','sma','sma'],['IND.EMA.STYLE.EMA.PRICE_LINE','ema','ema'],['IND.RSI.STYLE.RSI.PRICE_LINE','rsi','rsi'],
 ['IND.MACD.STYLE.MACD.PRICE_LINE','macd','macd'],['IND.MACD.STYLE.SIGNAL.PRICE_LINE','macd','signal'],['IND.BB.STYLE.BASIS.PRICE_LINE','bb','basis'],['IND.BB.STYLE.UPPER.PRICE_LINE','bb','upper'],
 ['IND.BB.STYLE.LOWER.PRICE_LINE','bb','lower'],['IND.STOCH.STYLE.K.PRICE_LINE','stochastic','k'],['IND.STOCH.STYLE.D.PRICE_LINE','stochastic','d'],['IND.ATR.STYLE.ATR.PRICE_LINE','atr','atr'],['IND.OBV.STYLE.OBV.PRICE_LINE','obv','obv'],
];
// Volume MA is hidden by default; these cases show it with the tracking line.
const showHidden=(view:{sCheck:(name:string,value:boolean)=>void},kind:string,plot:string)=>{if(kind==='volume'&&plot==='ma')view.sCheck(plot+' visible',true);};
const tracking=(host:{live:Map<string,any>},rendererId:string)=>(host.live.get(rendererId)?.emitted?.priceLines??[]).filter((line:any)=>line.id.includes('track:'));

it.each(cases)('%s: per-plot tracking line is staged until Apply, independent of other plots/instances and offset, cleared by factory reset, kept by restart',(_leaf,kind,plot)=>{
 const ui=dialog({seed:[kind,kind],initialSelected:0}),[one,two]=ui.ids,rows=()=>ui.port.list(),native=(index:number)=>rows()[index].rendererId;
 ui.sClick('Style');expect(ui.sField(plot+' trackPrice').props.checked).toBe(false);expect(tracking(ui.host,native(0))).toEqual([]);
 ui.sCheck(plot+' trackPrice',true);expect(ui.sText()).toContain('Unapplied changes.');expect(tracking(ui.host,native(0))).toEqual([]);
 ui.sClick('Cancel');expect(rows()[0].plots[plot].trackPrice??false).toBe(false);expect(tracking(ui.host,native(0))).toEqual([]);
 ui.click('Edit '+ui.labels().get(one));ui.sClick('Style');ui.sCheck(plot+' trackPrice',true);showHidden(ui,kind,plot);ui.sSubmit();
 const endpoint=valuesOf(ui.port,one).find(series=>series.id===plot)!.values.at(-1)!;expect(Number.isFinite(endpoint)).toBe(true);
 const lines=tracking(ui.host,native(0));expect(lines).toHaveLength(1);
 expect(lines[0]).toMatchObject({id:indicatorDecorationId(one,'track:'+plot),price:endpoint,width:rows()[0].plots[plot].width,lineStyle:rows()[0].plots[plot].lineStyle});
 expect(Object.entries(rows()[0].plots).filter(([id,style])=>id!==plot&&style.trackPrice)).toEqual([]);expect(tracking(ui.host,native(1))).toEqual([]);expect(rows()[1].plots[plot].trackPrice??false).toBe(false);
 ui.sClick('Inputs');ui.sEdit('Display offset (bars)','3');ui.sSubmit();expect(tracking(ui.host,native(0))[0].price).toBe(endpoint);// display offset never moves the endpoint
 ui.sClick('Style');ui.sCheck(plot+' visible',false);ui.sSubmit();expect(tracking(ui.host,native(0))).toEqual([]);ui.sCheck(plot+' visible',true);ui.sSubmit();expect(tracking(ui.host,native(0))).toHaveLength(1);
 const restarted=realChart();restarted.port.restore(JSON.parse(JSON.stringify(ui.port.serialize())));const again=restarted.port.list()[0];
 expect(again.plots[plot].trackPrice).toBe(true);expect(tracking(restarted.host,again.rendererId)).toEqual([expect.objectContaining({id:indicatorDecorationId(one,'track:'+plot),price:endpoint})]);expect(tracking(restarted.host,restarted.port.list()[1].rendererId)).toEqual([]);
 ui.sClick('Reset draft to factory');expect(tracking(ui.host,native(0))).toHaveLength(1);ui.sSubmit();expect(rows()[0].plots[plot].trackPrice??false).toBe(false);expect(tracking(ui.host,native(0))).toEqual([]);
 expect(valuesOf(ui.port,two)).toEqual(valuesOf(ui.port,one));
});

it.each(cases)('%s: an unavailable latest value draws no tracking line (missing data is not zero)',(_leaf,kind,plot)=>{
 const short=bars.slice(0,2),ui=dialog({seed:[kind],initialSelected:0,bars:short}),[id]=ui.ids;
 ui.sClick('Style');ui.sCheck(plot+' trackPrice',true);ui.sSubmit();expect(ui.port.list()[0].plots[plot].trackPrice).toBe(true);
 const endpoint=valuesOf(ui.port,id).find(series=>series.id===plot)?.values.at(-1)??null,lines=tracking(ui.host,ui.port.list()[0].rendererId);
 if(endpoint===null)expect(lines).toEqual([]);else expect(lines).toEqual([expect.objectContaining({price:endpoint})]);
});

// Review F1 (2026-10-16): the 2-bar case above still has a latest value for EMA, MACD/Signal and OBV, so it never
// exercised missing data for them. Here the LAST bar carries a non-finite input that makes this plot's latest value
// genuinely unavailable (close for price-based plots, high+close for ATR's true range, volume for Volume MA). OBV uses a
// missing close: since fix L1-20261016-fix-obv that bar's OBV is null (missing volume refuses OBV as a whole instead).
const trailingGap:Record<string,string[]>={volume:['volume'],obv:['close'],atr:['high','close']};
it.each(cases)('%s: a trailing non-finite input leaves the latest value unavailable and draws no tracking line',(_leaf,kind,plot)=>{
 const fields=trailingGap[kind]??['close'],gapped=bars.slice(0,60).map((bar,index)=>index===59?{...bar,...Object.fromEntries(fields.map(field=>[field,NaN]))}:bar);
 const complete=dialog({seed:[kind],initialSelected:0,bars:bars.slice(0,59)}),ui=dialog({seed:[kind],initialSelected:0,bars:gapped}),[id]=ui.ids;
 for(const view of [complete,ui]){view.sClick('Style');view.sCheck(plot+' trackPrice',true);showHidden(view,kind,plot);view.sSubmit();expect(view.port.list()[0].plots[plot].trackPrice).toBe(true);}
 expect(tracking(complete.host,complete.port.list()[0].rendererId)).toHaveLength(1);// the same settings draw a line when the latest value exists
 const endpoint=valuesOf(ui.port,id).find(series=>series.id===plot)?.values.at(-1)??null;expect(endpoint).toBeNull();
 expect(tracking(ui.host,ui.port.list()[0].rendererId)).toEqual([]);
});
