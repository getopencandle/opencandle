import {afterEach,describe,expect,it} from 'vitest';
import type {Vela} from '@luxalgo/vela';
import {nativeHost} from '../ui/indicator-real-port-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import type {IndicatorPresentationContext} from '../../src/chart/indicator-presentation';
import {compactVolume,pocExtensionLines,profileShapes,VP_ROW_LABEL_COLOR} from '../../src/chart/vp-visible-range-presentation';
import {setProfileDatasets} from '../../src/chart/vp-visible-range-ltf';
import {VP_FILL_DEFAULTS,VP_FILL_IDS,defaultIndicatorPresentation,indicatorFillIds,indicatorFillLabel,validateIndicatorPresentation} from '../../src/chart/indicator-settings';
import {indicatorColorOpacity} from '../../src/chart/indicator-opacity';
import {defaultPlotStyle} from '../../src/chart/indicator-rendering';
import {buildVolumeProfile,developingProfile,type ProfileOptions} from '../../src/domain/volume-profile';

// Visible range and Periodic volume profile extras (editable row colors, developing POC and VA, Extend POC right,
// row volume labels) through the REAL calculation, port and presentation (minimal in-memory native host). SYNTHETIC bars.
const DAY=86400,T0=1767225600;
const bar=(i:number,o:number,h:number,l:number,c:number,volume=100)=>({time:T0+i*DAY,open:o,high:h,low:l,close:c,volume});
/** A drifting series with uneven volume, so developing levels move and the grid is rebuilt several times. */
const BARS=Array.from({length:24},(_,i)=>{const mid=20+Math.round(6*Math.sin(i/3)*100)/100+i*0.25;return bar(i,mid+(i%2?-0.5:0.5),mid+1+(i%3)*0.5,mid-1-(i%4)*0.25,mid+(i%2?0.75:-0.5),100+((i*37)%5)*60);});
function rig(context:IndicatorPresentationContext={resolution:'1D',calendar:'utc'},bars=BARS){
 const host=nativeHost(bars.map(row=>({...row,time:row.time*1000})));let range:{from:number;to:number}|null=null;
 (host.chart as any).getVisibleRange=()=>range;
 const port=createIndicatorPort(host.chart as unknown as Vela,undefined,undefined,undefined,undefined,()=>context);
 const live=(id:string)=>host.live.get(port.list().find(row=>row.id===id)!.rendererId);
 return {port,setRange:(from:number,to:number)=>{range={from:(T0+from*DAY)*1000,to:(T0+to*DAY)*1000};},emitted:(id:string)=>live(id).emitted,values:(id:string,plot:string)=>port.values(id).series.find(row=>row.id===plot)!.values};
}
afterEach(()=>setProfileDatasets([]));
const OPTIONS:ProfileOptions={rowsLayout:'Number Of Rows',rowSize:6,valueAreaPct:70};

describe(' developing levels (calculation)',()=>{
 it('equal buildVolumeProfile over every prefix, for both row layouts',()=>{
  for(const options of [OPTIONS,{rowsLayout:'Ticks Per Row',rowSize:4,valueAreaPct:70,tickSize:0.25} as ProfileOptions]){
   const dev=developingProfile(BARS,3,20,options);
   for(let i=3;i<=20;i++){const p=buildVolumeProfile(BARS,3,i,options)!;expect([dev.poc[i-3],dev.vah[i-3],dev.val[i-3]],options.rowsLayout+' '+i).toEqual([p.pocPrice,p.vah,p.val]);}
   expect(new Set(dev.poc).size).toBeGreaterThan(2);// the levels develop
  }
 });
 it('are null until the prefix has volume, and empty for an empty span',()=>{
  const bars=[bar(0,10,11,9,10,0),bar(1,10,12,9,11,50)];
  expect(developingProfile(bars,0,1,OPTIONS).poc).toEqual([null,buildVolumeProfile(bars,0,1,OPTIONS)!.pocPrice]);
  expect(developingProfile(bars,1,0,OPTIONS)).toEqual({poc:[],vah:[],val:[]});
 });
 it('Periodic: the inputs fill the developing plots per period, which restart at each period; off leaves them empty',()=>{
  const r=rig();const off=r.port.add('pvp',{period:'Week',rowSize:6});
  for(const plot of ['devPoc','devVah','devVal'])expect(r.values(off,plot).every(value=>value===null)).toBe(true);
  const on=r.port.add('pvp',{period:'Week',rowSize:6,developingPoc:true,developingVa:true}),poc=r.values(on,'devPoc'),pocAll=r.values(on,'poc');
  const firstWeekEnd=pocAll.findIndex((value,i)=>i>0&&value!==pocAll[i-1]&&value!==null)-1;// last bar of the first period
  expect(poc[firstWeekEnd]).toBe(pocAll[firstWeekEnd]);// a period's developing POC ends at its POC
  expect(poc.every(value=>value!==null)).toBe(true);expect(r.values(on,'devVah').every(value=>value!==null)).toBe(true);
  const vaOnly=r.port.add('pvp',{period:'Week',rowSize:6,developingVa:true});
  expect(r.values(vaOnly,'devPoc').every(value=>value===null)).toBe(true);expect(r.values(vaOnly,'devVal').some(value=>value!==null)).toBe(true);
 });
 it('the developing line breaks only where a period starts; POC keeps its per-value segments',()=>{
  const r=rig();const id=r.port.add('pvp',{period:'Week',rowSize:6,developingPoc:true}),out=r.emitted(id);
  const dev=out.series.find((row:any)=>row.title==='Developing POC'),values=r.values(id,'devPoc'),pocAll=r.values(id,'poc');
  const starts=pocAll.flatMap((value,i)=>i>0&&value!==pocAll[i-1]?[i]:[]);
  const breaks=dev.points.flatMap((p:any,i:number)=>p.color==='rgba(0,0,0,0)'?[i]:[]);
  expect(breaks.every((i:number)=>starts.includes(i))).toBe(true);
  expect(values.some((value,i)=>i>0&&value!==values[i-1]&&!starts.includes(i))).toBe(true);// it moves inside a period without breaking
 });
});

describe(' editable histogram colors',()=>{
 it('the profile kinds have four row backgrounds with the colors as defaults; other kinds do not',()=>{
  expect(indicatorFillIds('vrvp')).toEqual([...VP_FILL_IDS]);expect(indicatorFillIds('pvp')).toEqual([...VP_FILL_IDS]);expect(indicatorFillIds('atr')).toEqual([]);
  expect(defaultIndicatorPresentation('vrvp').fills).toEqual(VP_FILL_DEFAULTS);expect(defaultIndicatorPresentation('pvp',true).fills).toEqual(VP_FILL_DEFAULTS);
  expect(VP_FILL_IDS.map(id=>indicatorFillLabel('vrvp',id))).toEqual(['Up volume','Down volume','Value area up','Value area down']);
  expect(indicatorFillLabel('ichimoku','bearish')).toBe('Bearish fill');expect(indicatorFillLabel('ichimoku','band')).toBe('Bullish fill');expect(indicatorFillLabel('bb','band')).toBe('Band fill');
  expect(()=>validateIndicatorPresentation('atr',{...defaultIndicatorPresentation('atr'),fills:{vpUp:VP_FILL_DEFAULTS.vpUp}})).toThrow('Unsupported indicator fill');
 });
 it('row boxes use the Style tab colors; a hidden background leaves its rows undrawn; no band fill is emitted',()=>{
  const r=rig();r.setRange(2,20);const id=r.port.add('vrvp',{rowSize:6});
  const base=r.emitted(id);expect(base.fills).toEqual([]);
  const row=()=>r.port.list().find(item=>item.id===id)!;
  r.port.update(id,{presentation:{...row().presentation!,fills:{...row().presentation!.fills,vpUp:{visible:true,color:'#00ff00',opacity:50},vpValueDown:{visible:false,color:'#fbc02d',opacity:70}}}});
  const out=r.emitted(id),colors=new Set(out.boxes.map((b:any)=>b.bgColor));
  expect(colors.has(indicatorColorOpacity('#00ff00',50))).toBe(true);
  expect(colors.has(indicatorColorOpacity('#fbc02d',70))).toBe(false);
  expect(colors.has(indicatorColorOpacity('#2962ff',70))).toBe(true);
  expect(out.boxes.length).toBeLessThan(base.boxes.length);
  expect(r.port.list().find(item=>item.id===id)!.diagnostics).toEqual([]);
 });
});

describe(' row volume labels',()=>{
 const p=buildVolumeProfile([bar(0,10,14,10,14,400),bar(1,12,12,11,11,300),bar(2,12,12,12,12,1500)],0,2,{rowsLayout:'Number Of Rows',rowSize:4,valueAreaPct:70},{left:0,right:10})!;
 it('one label per drawn row at its outer end, with the abbreviated row volume',()=>{
  const {boxes,labels}=profileShapes(p,{volume:'Up/Down',placement:'Left',widthPct:40,rowValues:true},role=>role);
  const drawnRows=new Set(boxes.map(b=>b.id.split(':')[1]));expect(labels.map(l=>l.id.split(':')[1])).toEqual([...drawnRows]);
  for(const l of labels){const k=Number(l.id.split(':')[1]),row=p.rows[k],end=Math.max(...boxes.filter(b=>b.id.startsWith(`row:${k}:`)).map(b=>b.right));
   expect(l).toMatchObject({xloc:'bar_index',yloc:'price',x:end,y:(row.low+row.high)/2,text:compactVolume(row.up+row.down),style:'label_left',textColor:VP_ROW_LABEL_COLOR,noFill:true});}
  expect(profileShapes(p,{volume:'Up/Down',placement:'Left',widthPct:40},role=>role).labels).toEqual([]);
  const right=profileShapes(p,{volume:'Delta',placement:'Right',widthPct:40,rowValues:true},role=>role).labels;
  expect(right.every(l=>l.style==='label_right'&&l.x<10)).toBe(true);expect(right.some(l=>l.text!.startsWith('-'))).toBe(true);
 });
 it('abbreviates with K, M and B and trims trailing zeros',()=>{
  expect([compactVolume(950),compactVolume(1500),compactVolume(2_000_000),compactVolume(-3_250_000_000),compactVolume(12.345)]).toEqual(['950','1.5 K','2 M','-3.25 B','12.35']);
 });
 it('reach the native output only while the input is on',()=>{
  const r=rig();r.setRange(2,20);const id=r.port.add('vrvp',{rowSize:6});expect(r.emitted(id).labels).toBeUndefined();
  r.port.update(id,{inputs:{...r.port.list().find(item=>item.id===id)!.inputs,rowValues:true}});
  const out=r.emitted(id);expect(out.labels.length).toBeGreaterThan(0);expect(out.labels.length).toBeLessThanOrEqual(6);
 });
});

describe(' Extend POC right',()=>{
 it('Visible range: one line from the last visible bar extending to the right edge, in the POC style',()=>{
  const r=rig();r.setRange(2,14);const id=r.port.add('vrvp',{rowSize:6,extendPocRight:true}),out=r.emitted(id),poc=r.values(id,'poc');
  expect(out.lines).toHaveLength(1);
  expect(out.lines[0]).toMatchObject({xloc:'bar_index',x1:14,x2:15,y1:poc[14],y2:poc[14],extend:'right',color:indicatorColorOpacity('#f44336',100),width:2,style:'solid'});
  const off=r.port.add('vrvp',{rowSize:6});expect(r.emitted(off).lines).toBeUndefined();
 });
 it('Periodic: each POC runs until the first later bar that reaches it, else to the right edge',()=>{
  const bars=[bar(0,10,12,9,11),bar(1,11,11.5,10,11),bar(2,20,22,19,21),bar(3,30,31,29,30),bar(4,10.4,11,10.4,10.5)];
  const one={rowsLayout:'Number Of Rows' as const,rowSize:4,valueAreaPct:70};
  const a=buildVolumeProfile(bars,0,1,one)!,b=buildVolumeProfile(bars,2,2,one)!;
  const lines=pocExtensionLines([a,b],bars,false,{color:'#f44336',width:2,lineStyle:'solid'},role=>role);
  const touch=bars.findIndex((row,i)=>i>1&&row.low<=a.pocPrice&&a.pocPrice<=row.high);
  expect(touch).toBe(4);
  expect(lines[0]).toMatchObject({id:'vp:0:poc-extension',x1:1,x2:4,extend:'none'});
  expect(lines[1]).toMatchObject({id:'vp:2:poc-extension',x1:2,x2:3,extend:'right'});
 });
 it('a hidden POC plot draws no extension',()=>{
  const r=rig();r.setRange(2,14);const id=r.port.add('vrvp',{rowSize:6,extendPocRight:true});
  const row=r.port.list().find(item=>item.id===id)!;
  r.port.update(id,{plots:{...row.plots,poc:{...defaultPlotStyle('vrvp','poc',0),visible:false}}});
  expect(r.emitted(id).lines).toBeUndefined();
 });
});
