import {beforeEach,afterEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text} from '../helpers/alert-dialog-harness';
import {CellStudyLegend,type CellStudyLegendProps} from '../../src/ui/CellStudyLegend';
import {createCellStudyInspectionStream,cellStudyInspectionTime} from '../../src/ui/cell-study-intents';
import {createCellCrosshairWatch} from '../../src/ui/grid-hover';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {defaultTheme} from '../../src/ui/themes';
import {SYNTHETIC_BINDING} from '../fixtures/script-presentation';
import {ScriptLegendRows} from '../../src/ui/ScriptSettingsDialog';
// Actual component callbacks + existing grid-hover subscription path. Controllers,
// scalar reader, hook scheduling and DOM nodes are explicitly synthetic here.
let frames:Map<number,()=>void>,sequence:number;
beforeEach(()=>{frames=new Map();sequence=0;vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{frames.set(++sequence,fn);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
afterEach(()=>vi.unstubAllGlobals());
const flush=()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();};
function cell(id:string,time:number,value:number,times:number[]=[time]){
 let current=true,pending=false,ready=true;const crosses=new Set<(event:any)=>void>(),events=new Set<()=>void>(),markets=new Set<()=>void>(),viewports=new Set<()=>void>(),grid=times.map(time=>({time})),acceptedTimes=new Set(times),off={indicator:vi.fn(),script:vi.fn(),market:vi.fn(),viewport:vi.fn()},row={...factoryIndicatorDefault('sma'),id:'synthetic-'+id,kind:'sma' as const,rendererId:'native-'+id,paneId:'price',diagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:time,presentationDiagnostics:[]};
 const readAt=vi.fn((query:number)=>{if(!acceptedTimes.has(query))throw Error('Synthetic unaccepted query');return{precision:2,time:query,plots:[{label:'Moving average',color:'#123456',value}]};}),assertCurrent=vi.fn(()=>{if(!current)throw Error('Synthetic source retired');}),capture=vi.fn(()=>ready?{state:'ready',assertCurrent,readAt}:{state:'unavailable',message:'Synthetic waiting'}),list=vi.fn(()=>[row]);
 const chart:any={chart:{panes:{list:vi.fn(()=>[{id:'price',kind:'price',indicators:[{id:row.rendererId}]}])}},indicators:{list,captureReadout:capture,subscribe:vi.fn((fn:()=>void)=>{events.add(fn);return()=>{events.delete(fn);off.indicator();};}),scaleChoices:()=>[]},scripts:{presentationMetadata:vi.fn(()=>[]),subscribe:vi.fn(()=>()=>off.script()),captureReadout:capture},getDataWindow:vi.fn(()=>{throw Error('Hover must not inspect history.');}),getStyle:()=> 'candles',onMarketApplied:vi.fn((fn:()=>void)=>{markets.add(fn);return()=>{markets.delete(fn);off.market();};}),onViewportChanged:vi.fn((fn:()=>void)=>{viewports.add(fn);return()=>{viewports.delete(fn);off.viewport();};}),onCrosshair:(fn:(event:any)=>void)=>{crosses.add(fn);return()=>crosses.delete(fn);},priceScale:{settings:vi.fn(()=>({mainSide:'right'}))}};
 return{chart,row,list,readAt,capture,off,inspectTime:(time:number|null,ghost:boolean)=>cellStudyInspectionTime(grid,'candles',time,ghost,()=>current&&!pending),setCurrent:(v:boolean)=>{current=v;},setReady:(v:boolean)=>{ready=v;},setPending:(v:boolean)=>{pending=v;},current:()=>current,cross(t:number){for(const fn of crosses)fn({time:t});},publish(){for(const fn of events)fn();},market(){for(const fn of markets)fn();},viewport(){for(const fn of viewports)fn();}};
}
function mount(id:string,f:ReturnType<typeof cell>,stream=createCellStudyInspectionStream()){
 const action=vi.fn(()=>true),props:CellStudyLegendProps={chart:f.chart,cellId:id,owner:{},isCurrent:f.current,visible:true,bindings:[],favorites:[],settings:defaultChartSettingsDocument(),appearance:defaultTheme.appearance,tickSize:.01,stream,inspectTime:f.inspectTime,onAction:action};
 const view=mountControlledComponent(()=>CellStudyLegend(props));view.settle();return{view,props,action,stream};
}
it('shows distinct exact inspected times for A/B through the actual grid-hover fanout, without hover metadata clones',()=>{
 const stream=createCellStudyInspectionStream(),a=cell('a',220,7,[100,160,220]),b=cell('b',400,11,[160,280,400]),av=mount('a',a,stream),bv=mount('b',b,stream),watch=createCellCrosshairWatch((id,chart,time)=>stream.emit(id,chart,time));watch.attach('a',a.chart);watch.attach('b',b.chart);a.list.mockClear();b.list.mockClear();a.readAt.mockClear();b.readAt.mockClear();
 a.cross(160);flush();bv.view.settle();expect(all(av.view.settle(),node=>node.props['data-inspected-time']===160)).toHaveLength(1);expect(a.readAt).toHaveBeenLastCalledWith(160);expect(b.readAt).toHaveBeenLastCalledWith(400);b.cross(280);flush();const ar=av.view.settle(),br=bv.view.settle();expect(all(ar,node=>node.props['data-inspected-time']===220)).toHaveLength(1);expect(all(br,node=>node.props['data-inspected-time']===280)).toHaveLength(1);expect(a.readAt).toHaveBeenLastCalledWith(220);expect(b.readAt).toHaveBeenLastCalledWith(280);expect(text(ar)).toContain('7.00');expect(text(br)).toContain('11.00');expect(a.list).not.toHaveBeenCalled();expect(b.list).not.toHaveBeenCalled();watch.dispose();
});
it('waiting or pending input values stay explicitly unavailable and never borrow the active chart value',()=>{
 const f=cell('a',100,7);f.setReady(false);const ui=mount('a',f);expect(all(ui.view.render(),node=>node.props['data-study-values']==='unavailable')).toHaveLength(1);expect(f.readAt).not.toHaveBeenCalled();f.setReady(true);f.setPending(true);f.publish();flush();ui.view.settle();expect(f.readAt).not.toHaveBeenCalled();
});
it('dispatches real built-in Settings/Hide/Remove subjects with the cell settings fingerprint',()=>{
 const f=cell('a',100,7),ui=mount('a',f),tree=ui.view.render(),buttons=all(tree,node=>node.type==='button');
 for(const kind of ['settings','hide','remove']){const node=buttons.find(node=>String(node.props['aria-label']??'').toLowerCase().startsWith(kind==='hide'?'hide ':kind==='remove'?'remove ':'settings for '));expect(node).toBeDefined();(node!.props.onClick as()=>void)();}
 expect(ui.action.mock.calls.map(args=>(args as any)[1].kind)).toEqual(['settings','visibility','remove']);expect((ui.action.mock.calls[0] as any)[0]).toMatchObject({kind:'builtin',id:f.row.id});expect((ui.action.mock.calls[0] as any)[0].fingerprint).toContain('native-a');
});
it('keeps a failed/waiting script in explicit placement-unavailable management rather than guessing its saved pane',()=>{
 const f=cell('a',100,7),ui=mount('a',f);ui.props.bindings=[{...SYNTHETIC_BINDING,pane:'new',paneId:'saved-logical-only'}];const tree=ui.view.settle(),group=all(tree,node=>node.props['data-study-placement']==='unavailable');expect(group).toHaveLength(1);expect(text(group[0])).toContain(SYNTHETIC_BINDING.name);expect(all(group[0],node=>node.type==='button').map(node=>node.props['aria-label'])).toContain('Remove script '+SYNTHETIC_BINDING.name);expect(all(tree,node=>node.props['data-legend-pane']==='saved-logical-only')).toHaveLength(0);
});
it('retired controls refuse commands and a replacement owner does not render the old owner metadata',()=>{
 const f=cell('a',100,7),ui=mount('a',f),control=all(ui.view.render(),node=>node.type==='button'&&String(node.props['aria-label']).startsWith('Remove '))[0];f.setCurrent(false);(control.props.onClick as()=>void)();expect(ui.action).not.toHaveBeenCalled();ui.props.owner={};const beforeEffects=ui.view.render();expect(all(beforeEffects,node=>node.props['data-legend-row']===f.row.id)).toHaveLength(0);ui.view.settle();
});

it('keeps no-source absence across empty, waiting script and empty states',()=>{
 const f=cell('a',100,7);f.list.mockReturnValue([]);const ui=mount('a',f);expect(ui.view.settle()).toBeNull();ui.props.bindings=[SYNTHETIC_BINDING];expect(ui.view.settle()).not.toBeNull();expect(all(ui.view.render(),node=>node.props['data-legend-script']===SYNTHETIC_BINDING.id)).toHaveLength(1);ui.props.bindings=[];expect(ui.view.settle()).toBeNull();
});
it('groups actual per-cell non-price pane metadata instead of an active or saved logical pane',()=>{
 const f=cell('b',220,11);f.row.paneId='synthetic-actual-pane';const ui=mount('b',f),tree=ui.view.settle(),group=all(tree,node=>node.props['data-legend-pane']==='synthetic-actual-pane');expect(group).toHaveLength(1);expect(all(group[0],node=>node.props['data-legend-row']===f.row.id)).toHaveLength(1);expect(all(tree,node=>node.props['data-study-placement']==='unavailable')).toHaveLength(0);expect(f.readAt).toHaveBeenLastCalledWith(220);
});

it('an active hidden cell still supplies linked ghost time without mounting duplicate chrome or reading metadata',()=>{
 const stream=createCellStudyInspectionStream(),source=cell('a',220,7,[100,160,220]),target=cell('b',280,11,[100,180,280]),a=mount('a',source,stream),b=mount('b',target,stream);a.props.visible=false;a.view.settle();source.list.mockClear();stream.configure({id:'synthetic-layout',cells:[{id:'a',group:'one'},{id:'b',group:'one'}],sync:{crosshair:true},maximizedCellId:null} as any);const watch=createCellCrosshairWatch((id,chart,time)=>stream.emit(id,chart,time));watch.attach('a',source.chart);source.cross(160);flush();expect(a.view.settle()).toBeNull();b.view.settle();expect(target.readAt).toHaveBeenLastCalledWith(100);expect(source.list).not.toHaveBeenCalled();expect(source.chart.getDataWindow).not.toHaveBeenCalled();expect(target.chart.getDataWindow).not.toHaveBeenCalled();watch.dispose();
});
it('does not serialize script source or list metadata on repeated per-cell hover renders',()=>{
 const f=cell('a',220,7,[100,160,220]),ui=mount('a',f);ui.props.bindings=[{...SYNTHETIC_BINDING,source:'// SYNTHETIC '+ 'x'.repeat(99000)}];ui.view.settle();const stringify=vi.spyOn(JSON,'stringify');f.list.mockClear();try{for(const time of [100,160,220,160]){ui.stream.emit('a',f.chart,time);flush();ui.view.settle();}expect(stringify).not.toHaveBeenCalled();expect(f.list).not.toHaveBeenCalled();expect(f.chart.getDataWindow).not.toHaveBeenCalled();}finally{stringify.mockRestore();}
});
it('global values off suppresses builtin and script readers, and per-plot legend off suppresses values after global enable',()=>{
 const f=cell('a',100,7),ui=mount('a',f);ui.props.bindings=[SYNTHETIC_BINDING];ui.props.appearance={...ui.props.appearance,indicatorValuesVisible:false};f.capture.mockClear();const hidden=ui.view.settle();expect(all(hidden,node=>node.props['data-legend-values']==='true')).toHaveLength(0);expect(f.capture).not.toHaveBeenCalled();ui.props.appearance={...ui.props.appearance,indicatorValuesVisible:true};f.readAt.mockReturnValue({precision:2,time:100,plots:[{label:'Moving average',color:'#123456',value:7,legend:false}]} as any);ui.props.settings={...ui.props.settings,statusLine:{...ui.props.settings.statusLine,indicatorTitles:false}};const enabled=ui.view.settle();expect(all(enabled,node=>node.props['data-legend-values']==='true')).toHaveLength(0);expect(text(enabled)).not.toContain(SYNTHETIC_BINDING.name);expect(f.capture).toHaveBeenCalled();
});
it('partial acquisition unwinds the source endpoint and earlier native subscription',()=>{
 const f=cell('a',100,7);f.chart.scripts.subscribe.mockImplementation(()=>{throw Error('Synthetic late acquisition failed');});const ui=mount('a',f),writes=ui.view.owner.writes;expect(f.off.indicator).toHaveBeenCalledOnce();ui.stream.emit('a',f.chart,100);expect(ui.view.owner.writes).toBe(writes);expect(ui.view.text()).toContain('Study updates are temporarily unavailable.');
});
it('cleanup attempts every subscription even when an earlier unsubscribe throws',()=>{
 const f=cell('a',100,7),ui=mount('a',f);f.off.indicator.mockImplementation(()=>{throw Error('Synthetic unsubscribe failed');});expect(()=>ui.view.dispose()).not.toThrow();expect(f.off.indicator).toHaveBeenCalledOnce();expect(f.off.script).toHaveBeenCalledOnce();expect(f.off.market).toHaveBeenCalledOnce();expect(f.off.viewport).toHaveBeenCalledOnce();
});

it('one global title setting suppresses script title text on both real active and inactive rows without hiding controls',()=>{
 const f=cell('a',100,7),inactive=mount('a',f);inactive.props.bindings=[SYNTHETIC_BINDING];let showTitles=false;const active=mountControlledComponent(()=>ScriptLegendRows({chart:f.chart,bindings:[SYNTHETIC_BINDING],showTitles,onBindingsChange:()=>true}));inactive.props.settings={...inactive.props.settings,statusLine:{...inactive.props.settings.statusLine,indicatorTitles:false}};expect(text(active.settle())).not.toContain(SYNTHETIC_BINDING.name);expect(text(inactive.view.settle())).not.toContain(SYNTHETIC_BINDING.name);expect(all(active.render(),node=>node.props['aria-label']==='Remove script '+SYNTHETIC_BINDING.name)).toHaveLength(1);showTitles=true;inactive.props.settings={...inactive.props.settings,statusLine:{...inactive.props.settings.statusLine,indicatorTitles:true}};expect(text(active.settle())).toContain(SYNTHETIC_BINDING.name);expect(text(inactive.view.settle())).toContain(SYNTHETIC_BINDING.name);
});

it('a retained open menu retires before any native pane or price-scale read on a same-props local render',()=>{
 const f=cell('a',100,7),ui=mount('a',f),more=all(ui.view.render(),node=>node.type==='button'&&String(node.props['aria-label']).startsWith('More '))[0];expect(more).toBeDefined();(more.props.onClick as()=>void)();ui.view.settle();expect(f.chart.chart.panes.list).toHaveBeenCalled();expect(f.chart.priceScale.settings).toHaveBeenCalled();f.setCurrent(false);f.chart.chart.panes.list.mockClear();f.chart.priceScale.settings.mockClear();ui.view.render();expect(f.chart.chart.panes.list).not.toHaveBeenCalled();expect(f.chart.priceScale.settings).not.toHaveBeenCalled();expect(all(ui.view.render(),node=>node.props['aria-haspopup']==='menu'&&node.props['aria-expanded']===true)).toHaveLength(0);expect(all(ui.view.render(),node=>node.props['aria-label']==='Hide indicator legend'&&node.props['aria-expanded']===true)).toHaveLength(1);
});
