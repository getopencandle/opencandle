import {beforeEach,describe,expect,it,vi} from 'vitest';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {DATA_WINDOW_EMPTY,buildDataWindow,comparisonRows,formatDataWindowDate,formatDataWindowTime,type DataWindowComparisonInput,type DataWindowInput} from '../../src/ui/data-window-model';
import {DataWindowPanel,dataWindowScripts} from '../../src/ui/DataWindowPanel';
import {DataWindow} from '../../src/ui/DataWindow';
import {nativeCoreHarness} from '../chart/native-core-harness';
import {createComparisonPort} from '../../src/chart/compare-port';
import {createScriptPort} from '../../src/chart/script-port';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {find,findAll,text} from './object-tree-panel-harness';
import type {BarDataset} from '../../src/domain/types';

// SYNTHETIC fixtures only: five daily bars 2026-07-01..05 UTC and a synthetic
// compare symbol with no bar on 2026-07-03. Every expected string is a literal worked by hand from these numbers.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,cleanups:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{if(hooks.cursor<0)return actual.useState(initial);const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},
 useRef:(initial:any)=>{if(hooks.cursor<0)return actual.useRef(initial);const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},
 useEffect:(effect:()=>unknown,deps?:unknown[])=>{if(hooks.cursor<0)return;const index=hooks.cursor++;const previous=hooks.cells[index];if(!previous||!deps||deps.some((value,position)=>!Object.is(value,previous.deps[position]))){if(previous?.cleanup)previous.cleanup();const cell={deps:deps??[],cleanup:null as any};hooks.cells[index]=cell;hooks.effects.push(()=>{const result=effect();cell.cleanup=typeof result==='function'?result:null;});}}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
const runEffects=()=>{while(hooks.effects.length)hooks.effects.shift()!();};

const day=86400,start=1782864000;
const bars=[
 {time:start,open:9.5,high:10.5,low:9,close:10,volume:1000},
 {time:start+day,open:10,high:11.25,low:9.75,close:11,volume:2000},
 {time:start+2*day,open:11,high:12.5,low:10.5,close:12,volume:1500000},
 {time:start+3*day,open:12,high:13.75,low:11.5,close:13,volume:2500000},
 {time:start+4*day,open:13,high:14.5,low:12.75,close:12.5,volume:39760000},
];
const compareBars=[
 {time:start,open:20,high:21,low:19.5,close:20.5,volume:100},
 {time:start+day,open:20.5,high:22,low:20,close:21.75,volume:2500},
 {time:start+3*day,open:22,high:23.5,low:21.25,close:23,volume:1234567},
 {time:start+4*day,open:23,high:24,low:22.5,close:22.5,volume:0},
];
const series={symbol:'SYNTH',exchange:'LOCAL',interval:'1D',description:'SYNTHETIC fixture',tickSize:0.01};
const compare:DataWindowComparisonInput={id:'cmp-1',symbol:'CMPR',exchange:'LOCAL',interval:'1D',description:'SYNTHETIC compare',tickSize:0.25,color:'#ff9800',visible:true,bars:compareBars};
const input=(index:number|null,extra:Partial<DataWindowInput>={}):DataWindowInput=>({series,bars,index,timezone:'UTC',indicators:[],...extra});
const rowsOf=(view:ReturnType<typeof buildDataWindow>,key:string)=>Object.fromEntries(view.sections.find(section=>section.key===key)!.rows.map(row=>[row.label,row.value]));

describe('Date and Time rows through the shared chart time formatter',()=>{
 it('the Date row follows the chart Date format with the weekday; the factory format keeps the fact example',()=>{
  expect(formatDataWindowDate(start+3*day,'UTC')).toBe("Sat 04 Jul '26");
  expect(formatDataWindowDate(start+3*day,'UTC','format-3')).toBe("Sat 04 Jul '26");
  expect(formatDataWindowDate(start+3*day,'UTC','format-10')).toBe('Sat 2026-07-04');
  expect(formatDataWindowDate(start+3*day,'UTC','format-19')).toBe('Sat 07/04/2026');
  expect(buildDataWindow(input(3,{dateFormat:'format-10'})).date).toEqual([{key:'date',label:'Date',value:'Sat 2026-07-04'}]);
 });
 it('the Time row follows the chart hours format, 24 or 12',()=>{
  expect(formatDataWindowTime(1783089000,'UTC')).toBe('14:30');
  expect(formatDataWindowTime(1783089000,'UTC','12')).toBe('2:30 PM');
  expect(formatDataWindowTime(1783036800,'UTC','12')).toBe('12:00 AM');
  const intraday=[{time:1783089000,open:1,high:1,low:1,close:1,volume:1}];
  expect(buildDataWindow({series:{...series,interval:'30m'},bars:intraday,index:0,timezone:'UTC',timeHours:'12',indicators:[]}).date).toEqual([{key:'date',label:'Date',value:"Fri 03 Jul '26"},{key:'time',label:'Time',value:'2:30 PM'}]);
 });
 it('New York times move with daylight saving time (2026-03-08); an unknown zone reads UTC',()=>{
  expect(formatDataWindowTime(1772807400,'America/New_York')).toBe('09:30');// 2026-03-06 14:30 UTC, EST (UTC-5)
  expect(formatDataWindowTime(1773066600,'America/New_York')).toBe('10:30');// 2026-03-09 14:30 UTC, EDT (UTC-4)
  expect(formatDataWindowTime(1773066600,'America/New_York','12')).toBe('10:30 AM');
  expect(formatDataWindowDate(1772807400,'America/New_York')).toBe("Fri 06 Mar '26");
  expect(formatDataWindowTime(1783089000,'exchange')).toBe('14:30');expect(formatDataWindowTime(1783089000,'Not/AZone')).toBe('14:30');
 });
});

describe('compare symbols',()=>{
 it('a compare section follows the main series with its own prices, change, volume and line colour',()=>{
  const view=buildDataWindow(input(3,{comparisons:[compare],indicators:[{id:'sma-1',kind:'sma',visible:true,offset:0,precision:'auto',plots:[{id:'sma',label:'SMA',color:'#41b6c4',dataWindow:true,values:[null,null,11,12,12.5]}]}],scripts:[{id:'s-1',title:'My script',visible:true,plots:[{id:'one',label:'One',color:'#ff0000',dataWindow:true,value:'7.00'}]}]}));
  expect(view.sections.map(section=>[section.key,section.kind,section.title])).toEqual([['series','series','SYNTH · 1D · LOCAL'],['compare:cmp-1','compare','CMPR · 1D · LOCAL'],['study:sma-1','study','SMA'],['script:s-1','script','My script']]);
  expect(rowsOf(view,'compare:cmp-1')).toEqual({Open:'22.00',High:'23.50',Low:'21.25',Close:'23.00',Change:'+1.25 (+5.75%)',Vol:'1.23 M'});
  const section=view.sections[1];expect(section.tooltip).toBe('SYNTHETIC compare');expect(new Set(section.rows.map(row=>row.color))).toEqual(new Set(['#ff9800']));
  expect(rowsOf(buildDataWindow(input(1,{comparisons:[compare]})),'compare:cmp-1')).toEqual({Open:'20.50',High:'22.00',Low:'20.00',Close:'21.75',Change:'+1.25 (+6.10%)',Vol:'2.50 K'});
 });
 it('no compare bar at the chart bar time shows the empty value in every row; the first compare bar has no change',()=>{
  expect(Object.values(rowsOf(buildDataWindow(input(2,{comparisons:[compare]})),'compare:cmp-1'))).toEqual(Array(6).fill(DATA_WINDOW_EMPTY));
  expect(rowsOf(buildDataWindow(input(0,{comparisons:[compare]})),'compare:cmp-1').Change).toBe(DATA_WINDOW_EMPTY);
  expect(comparisonRows(compare,undefined).every(row=>row.value===DATA_WINDOW_EMPTY)).toBe(true);
  expect(rowsOf(buildDataWindow(input(null,{comparisons:[compare]})),'compare:cmp-1')).toEqual({Open:'23.00',High:'24.00',Low:'22.50',Close:'22.50',Change:'-0.50 (-2.17%)',Vol:'0'});
 });
 it('a hidden compare symbol keeps a dimmed section with its values (as a hidden indicator); Hide data leaves the header',()=>{
  const view=buildDataWindow(input(3,{comparisons:[{...compare,visible:false}]}));
  expect(view.sections[1]).toMatchObject({visible:false,hidden:false});expect(rowsOf(view,'compare:cmp-1').Close).toBe('23.00');
  expect(buildDataWindow(input(3,{comparisons:[compare],hidden:new Set(['compare:cmp-1'])})).sections[1]).toMatchObject({hidden:true,rows:[]});
 });
});

describe('script indicators and strategies',()=>{
 it('one row per data window plot, the empty value for a missing value, Hide data per script',()=>{
  const scripts=[{id:'s-1',title:'Cross strategy',visible:true,plots:[{id:'fast',label:'Fast',color:'#2962ff',dataWindow:true,value:'12.40'},{id:'slow',label:'Slow',color:'#f23645',dataWindow:true,value:null},{id:'debug',label:'Debug',color:'#888888',dataWindow:false,value:'1.00'}]}];
  const view=buildDataWindow(input(3,{scripts}));
  expect(view.sections[1]).toMatchObject({key:'script:s-1',title:'Cross strategy',tooltip:'Cross strategy',visible:true});
  expect(view.sections[1].rows).toEqual([{key:'fast',label:'Fast',value:'12.40',color:'#2962ff'},{key:'slow',label:'Slow',value:DATA_WINDOW_EMPTY,color:'#f23645'}]);
  expect(buildDataWindow(input(3,{scripts,hidden:new Set(['script:s-1'])})).sections[1]).toMatchObject({hidden:true,rows:[]});
 });
 it('readout groups are matched to scripts by their plot labels, in chart order, so equal titles keep their own values',()=>{
  const row=(id:string,title:string,visible=true)=>({id,title,visible,plots:{line:{...defaultPlotStyle('sma','line',0),color:'#123456'}},plotDescriptors:[{id:'line',title:'Line',color:'#abcdef'}]}) as any;
  const readout={date:'',time:'',ohlc:null,groups:[{name:'SMA',rows:[{label:'SMA',value:'1.00',color:'#000'}]},{name:'Twin',rows:[{label:'Twin · Line',value:'3.00',color:'#111'}]},{name:'Twin',rows:[{label:'Twin · Line',value:'4.00',color:'#222'}]}]};
  expect(dataWindowScripts([row('a','Twin'),row('b','Twin'),row('c','Other')],readout).map(script=>script.plots.map(plot=>[plot.label,plot.value,plot.color]))).toEqual([[['Line','3.00','#123456']],[['Line','4.00','#123456']],[['Line',null,'#123456']]]);
  expect(dataWindowScripts([row('a','Twin',false),row('b','Twin')],readout).map(script=>script.plots[0].value)).toEqual([null,'3.00']);
  expect(dataWindowScripts([row('a','Twin')],null)[0].plots[0].value).toBeNull();
 });
});

// Real comparison and script ports on the pinned native core (tests/chart/native-core-harness), and the chart's own data
// window readout; the panel's handlers are called through the deterministic hook mock above. No DOM or GUI claim.
const msBars=bars.map(bar=>({...bar,time:bar.time*1000}));
const instrument={id:'synthetic',symbol:'SYNTH',name:'SYNTHETIC fixture',exchange:'LOCAL',currency:'USD',assetClass:'stock' as const,tickSize:0.01,lotSize:1,timezone:'UTC'};
const compareDataset={instrument:{...instrument,id:'synthetic-compare',symbol:'CMPR',name:'SYNTHETIC compare',tickSize:0.25},resolution:'1D',bars:compareBars,provenance:{fixture:true,datasetId:'synthetic-compare'}} as unknown as BarDataset;
async function setup(){
 const t=await nativeCoreHarness();t.native.bars=msBars;t.core.bars=msBars;
 const comparisons=createComparisonPort(t.chart,t.bridge.claim),scripts=createScriptPort(t.chart,undefined,t.bridge.claim);
 const chart={indicators:{values:()=>null},comparisons,scripts} as any;
 const props:any={chart,dataset:{instrument,resolution:'1D'},bars,inspection:null,indicators:[],timezone:'UTC'};
 const inspect=(index:number|null)=>{t.native.hoverLogical=index;props.inspection={displayed:index===null?{index:4,bar:bars[4],hovered:false}:{index,bar:bars[index],hovered:true},readout:t.native.getDataWindowReadout()};};
 const render=()=>{hooks.cursor=0;return DataWindowPanel(props);};
 const sections=()=>findAll(render(),node=>node.props?.['data-section']).map(node=>node.props['data-section']);
 const values=(key:string)=>Object.fromEntries(findAll(find(render(),node=>node.props?.['data-section']===key),node=>node.props?.className==='lv-dw-row').map(node=>[text(node.props.children[0]),text(node.props.children[1])]));
 const dispose=()=>{for(const cell of hooks.cells)if(cell&&typeof cell==='object'&&typeof cell.cleanup==='function')cell.cleanup();scripts.dispose();comparisons.dispose();t.dispose();};
 return {t,comparisons,scripts,chart,props,inspect,render,sections,values,dispose};
}
const linePlot=(id:string,title:string,color:string,values:Array<number|null>)=>({id,title,color,values:values.map((value,index)=>({time:start+index*day,value}))});

describe('Data window panel on the real comparison and script ports',()=>{
 it('lists the compare symbol and the script with the values at the hovered bar',async()=>{
  const s=await setup();try{
   const cmp=s.comparisons.add(compareDataset,{color:'#ff9800'}),script=s.scripts.add({plots:[linePlot('fast','Fast','#2962ff',[null,5.5,6.25,7,7.5])]},{title:'Cross strategy'});
   s.inspect(3);
   expect(s.sections()).toEqual(['series','compare:'+cmp,'script:'+script]);
   expect(s.values('compare:'+cmp)).toEqual({Open:'22.00',High:'23.50',Low:'21.25',Close:'23.00',Change:'+1.25 (+5.75%)',Vol:'1.23 M'});
   expect(s.values('script:'+script)).toEqual({Fast:'7.00'});
   s.inspect(0);expect(s.values('script:'+script)).toEqual({Fast:DATA_WINDOW_EMPTY});expect(s.values('compare:'+cmp).Close).toBe('20.50');
   s.inspect(null);expect(s.values('script:'+script)).toEqual({Fast:'7.50'});expect(s.values('compare:'+cmp).Close).toBe('22.50');
   const titleOf=(key:string)=>find(find(s.render(),node=>node.props?.['data-section']===key),node=>node.props?.className==='lv-dw-section-title');
   expect([text(titleOf('compare:'+cmp)),titleOf('compare:'+cmp).props.title]).toEqual(['CMPR · 1D · LOCAL','SYNTHETIC compare']);
  }finally{s.dispose();}
 });
 it('a hidden script keeps its dimmed section and rows with the empty value; a data-window-off plot has no row',async()=>{
  const s=await setup();try{
   const script=s.scripts.add({plots:[linePlot('fast','Fast','#2962ff',[1,2,3,4,5]),linePlot('slow','Slow','#f23645',[5,4,3,2,1])]},{title:'Two lines'});
   s.inspect(2);runEffects();expect(s.values('script:'+script)).toEqual({Fast:'3.00',Slow:'3.00'});
   s.scripts.style(script,{slow:{...defaultPlotStyle('sma','slow',1),color:'#f23645',dataWindow:false}});runEffects();s.inspect(2);expect(s.values('script:'+script)).toEqual({Fast:'3.00'});
   // A hidden script (the packaged renderer suspends it, which notifies; the harness host does not, so it is added hidden).
   const hiddenScript=s.scripts.add({plots:[linePlot('fast','Fast','#2962ff',[1,2,3,4,5])]},{title:'Two lines',visible:false});s.inspect(2);
   const section=find(s.render(),node=>node.props?.['data-section']==='script:'+hiddenScript);expect(section.props.className).toContain('is-source-hidden');
   expect(s.values('script:'+hiddenScript)).toEqual({Fast:DATA_WINDOW_EMPTY});expect(s.values('script:'+script)).toEqual({Fast:'3.00'});
  }finally{s.dispose();}
 });
 it('reads the ports once per change notification, re-reads on add, update and restore, and never per crosshair frame',async()=>{
  const s=await setup();try{
   const listed=vi.spyOn(s.comparisons,'list');
   s.inspect(3);s.render();runEffects();s.render();s.inspect(2);s.render();s.inspect(1);s.render();
   const reads=listed.mock.calls.length;expect(reads).toBe(2);// first render, then the subscription's first refresh
   const cmp=s.comparisons.add(compareDataset,{color:'#ff9800'});expect(s.sections()).toEqual(['series','compare:'+cmp]);
   s.render();s.render();expect(listed.mock.calls.length).toBe(reads+1);
   s.comparisons.update(cmp,{visible:false});expect(find(s.render(),node=>node.props?.['data-section']==='compare:'+cmp).props.className).toContain('is-source-hidden');
   const saved=s.comparisons.list().map(({rendererId,...settings})=>settings);
   s.comparisons.remove(cmp);expect(s.sections()).toEqual(['series']);
   s.comparisons.restore(saved);expect(s.sections()).toEqual(['series','compare:'+cmp]);expect(s.values('compare:'+cmp).Close).toBe('21.75');
  }finally{s.dispose();}
 });
 it('a hidden tab reads nothing; showing it again reads a change made while hidden',async()=>{
  const s=await setup();try{
   s.inspect(3);s.render();runEffects();
   s.props.active=false;expect(findAll(s.render(),node=>node.props?.['data-section']).length).toBe(0);runEffects();
   const cmp=s.comparisons.add(compareDataset);
   const listed=vi.spyOn(s.comparisons,'list'),scriptsListed=vi.spyOn(s.scripts,'list');
   s.render();runEffects();s.render();expect(listed).not.toHaveBeenCalled();expect(scriptsListed).not.toHaveBeenCalled();
   s.props.active=true;expect(s.sections()).toEqual(['series','compare:'+cmp]);runEffects();expect(s.sections()).toEqual(['series','compare:'+cmp]);
  }finally{s.dispose();}
 });
 it('Hide data on a compare section leaves its header only',async()=>{
  const s=await setup();try{
   const cmp=s.comparisons.add(compareDataset);s.inspect(3);
   const button=()=>find(find(s.render(),node=>node.props?.['data-section']==='compare:'+cmp),node=>node.type==='button');
   expect(button().props['aria-label']).toBe('Hide data');button().props.onClick();expect(s.values('compare:'+cmp)).toEqual({});expect(button().props['aria-label']).toBe('Show data');
  }finally{s.dispose();}
 });
});

describe('legacy compact readout (DataWindow.tsx)',()=>{
 it('names its rows as the Data window and shows the time in the chart timezone',()=>{
  hooks.cursor=-1;try{
   const bar={time:1783089000,open:1.5,high:2,low:1,close:1.75,volume:10};
   const markup=renderToStaticMarkup(React.createElement(DataWindow,{symbol:'SYNTH',snapshot:null,fallback:bar,transformed:false,timezone:'America/New_York'}));
   expect(markup).toContain('Time (New York)<b>2026-07-03 10:30 UTC-4</b>');
   for(const label of ['Open','High','Low','Close','Vol'])expect(markup).toContain('<span>'+label+'<b>');
   expect(markup).not.toMatch(/<span>(open|high|low|close|volume)<b>/);expect(markup).not.toContain('Time (UTC)');
   expect(renderToStaticMarkup(React.createElement(DataWindow,{symbol:'SYNTH',snapshot:null,fallback:bar,transformed:false,timeHours:'12'}))).toContain('Time (UTC)<b>2026-07-03 2:30 PM UTC</b>');
  }finally{hooks.cursor=0;}
 });
});
