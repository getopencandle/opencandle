import React from 'react';
import {legendRowMenuProps} from '../../src/ui/legend-row-menu';// The legend row now spreads its right-click menu props
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {transformSync} from 'rolldown/utils';
import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {CellStudyLegend,type CellStudyLegendProps} from '../../src/ui/CellStudyLegend';
import {indicatorReasonView,legendValuesView,legendButtonView,legendMoreMenuView} from '../../src/ui/indicator-legend-view';
import {indicatorDataStatus,indicatorAcronyms} from '../../src/ui/indicator-dialog-model';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {defaultTheme} from '../../src/ui/themes';
import {createCellStudyInspectionStream,cellStudyInspectionTime} from '../../src/ui/cell-study-intents';
import {indicatorLegendValues} from '../../src/chart/legend-pane-model';
import {defaultPlotStyle,type IndicatorInstanceView} from '../../src/chart/indicator-port';
import {legendButtons,legendMoreMenu,indicatorOrderState,indicatorVisualOrderAvailable,visualOrderItems,isIndicatorOrderStep} from '../../src/chart/legend-model';

// Actual shared view/component and exact App render slice. React scheduling,
// chart metadata/owner callbacks and scalar values are controlled UI inputs;
// these tests grant no numerical, source, native or full-App authority.
const REASON='The complete daily-history/source/native overlap exceeds the current Seasonality budget.';
const closes:(()=>void)[]=[];
let frames:Map<number,()=>void>,sequence:number;
beforeEach(()=>{frames=new Map();sequence=0;vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{frames.set(++sequence,callback);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
afterEach(()=>{for(const close of closes.splice(0).reverse())close();vi.unstubAllGlobals();});
const flush=()=>{const pending=[...frames.values()];frames.clear();for(const callback of pending)callback();};
const statusNodes=(tree:unknown)=>all(tree,node=>node.props.role==='status');
function row(patch:Partial<IndicatorInstanceView>={}):IndicatorInstanceView{return{...factoryIndicatorDefault('sma'),id:'PRIVATE-INTERNAL-ROW-A',kind:'sma',rendererId:'PRIVATE-NATIVE-A',paneId:'price',diagnostics:[REASON],policies:[],series:[],informationBars:0,latestInformationTime:null,presentationDiagnostics:[],...patch};}
function cell(initial:IndicatorInstanceView){
 let rows=[initial],current=true;
 const listeners=new Set<()=>void>(),currentOwner=vi.fn(()=>current),readAt=vi.fn((time:number)=>({precision:2,time,plots:[{label:'SMA',color:'#123456',value:3.25}]}));
 const history=vi.fn(()=>{throw Error('Reason display must not read candle history.');});
 const chart:any={chart:{panes:{list:()=>[{id:'price',kind:'price',indicators:[{id:initial.rendererId}]}]}},indicators:{list:()=>rows,captureReadout:()=>({state:'ready',assertCurrent(){if(!current)throw Error('Retired UI source');},readAt}),subscribe:(callback:()=>void)=>{listeners.add(callback);return()=>listeners.delete(callback);},scaleChoices:()=>[]},scripts:{presentationMetadata:()=>[],subscribe:()=>()=>{}},getDataWindow:history,getCalculationBars:history,getSourceBars:history,getStyle:()=>'candles',onMarketApplied:()=>()=>{},onViewportChanged:()=>()=>{},priceScale:{settings:()=>({mainSide:'right'})}};
 const stream=createCellStudyInspectionStream(),props:CellStudyLegendProps={chart,cellId:'SYNTHETIC-CELL',owner:{},isCurrent:currentOwner,visible:true,bindings:[],favorites:[],settings:defaultChartSettingsDocument(),appearance:{...defaultTheme.appearance,indicatorValuesVisible:false},tickSize:.01,stream,inspectTime:(time,ghost)=>cellStudyInspectionTime([{time:100},{time:160},{time:220}],'candles',time,ghost,()=>current),onAction:()=>true};
 const view=mountControlledComponent(()=>CellStudyLegend(props));view.settle();closes.push(()=>view.dispose());
 return{view,props,currentOwner,history,readAt,stream,chart,setCurrent(value:boolean){current=value;},publish(next:IndicatorInstanceView){rows=[next];for(const notify of listeners)notify();flush();view.settle();}};
}

it('shows the exact nonnumeric published refusal with visible state, tooltip and human accessible label',()=>{
 const status=indicatorDataStatus(row()),node=indicatorReasonView('Seasonality 2016 2026',status),html=renderToStaticMarkup(React.createElement(React.Fragment,null,node));
 expect(text(node)).toBe('Unavailable');expect(html).toContain('role="status"');expect(html).toContain('title="Unavailable: '+REASON+'"');expect(html).toContain('aria-label="Seasonality 2016 2026. Unavailable: '+REASON+'"');expect(html).not.toContain('PRIVATE-INTERNAL');expect(html).not.toContain('data-plot');expect(html).not.toContain('\u2014');
});
it('uses the existing waiting formatter rather than inventing a bar count or numeric value',()=>{
 const status=indicatorDataStatus(row({diagnostics:[]})),node=indicatorReasonView('SMA',status);expect(status.state).toBe('waiting');expect(text(node)).toBe('Waiting');expect((node as React.ReactElement<any>).props.title).toBe(status.text);expect((node as React.ReactElement<any>).props['aria-label']).toBe('SMA. '+status.text);
});
it.each(['hidden','calculated','partial'] as const)('adds no new reason for existing %s states',state=>{expect(indicatorReasonView('SMA',{state,text:'SYNTHETIC existing state'})).toBeNull();});
it('escapes diagnostic text without turning it into markup',()=>{
 const html=renderToStaticMarkup(React.createElement(React.Fragment,null,indicatorReasonView('SMA',{state:'unavailable',text:'SYNTHETIC <b>source</b> & "reason"'})));expect(html).toContain('&lt;b&gt;source&lt;/b&gt;');expect(html).not.toContain('<b>source</b>');
});
it('renders a current real CellStudyLegend reason with one extra bounded owner check and no candle reads',()=>{
 const f=cell(row());f.currentOwner.mockClear();const tree=f.view.render(),statuses=statusNodes(tree),withReason=f.currentOwner.mock.calls.length;expect(statuses).toHaveLength(1);expect(statuses[0].props.title).toBe('Unavailable: '+REASON);expect(text(statuses[0])).toBe('Unavailable');f.publish(row({diagnostics:[],series:[{id:'sma',label:'SMA'}],informationBars:3}));f.currentOwner.mockClear();f.view.render();expect(withReason-f.currentOwner.mock.calls.length).toBe(1);expect(f.history).not.toHaveBeenCalled();expect(f.readAt).not.toHaveBeenCalled();
});
it('does not retain the prior cell reason after its owner retires',()=>{
 const f=cell(row());expect(statusNodes(f.view.render())).toHaveLength(1);f.setCurrent(false);expect(statusNodes(f.view.render())).toHaveLength(0);expect(f.history).not.toHaveBeenCalled();
});
it('keeps hidden rows and a collapsed legend free of current reason badges',()=>{
 const f=cell(row({visible:false}));expect(statusNodes(f.view.render())).toHaveLength(0);f.publish(row());expect(statusNodes(f.view.render())).toHaveLength(1);const toggle=all(f.view.render(),node=>node.props['aria-label']==='Hide indicator legend')[0];(toggle.props.onClick as ()=>void)();expect(statusNodes(f.view.settle())).toHaveLength(0);
});
it('clears the reason when current accepted metadata is ready without changing existing numeric markup',()=>{
 const f=cell(row());expect(statusNodes(f.view.render())).toHaveLength(1);f.props.appearance={...f.props.appearance,indicatorValuesVisible:true};f.publish(row({diagnostics:[],series:[{id:'sma',label:'SMA'}],informationBars:3,latestInformationTime:220}));f.stream.emit('SYNTHETIC-CELL',f.chart,220);flush();const tree=f.view.settle();expect(statusNodes(tree)).toHaveLength(0);expect(text(tree)).toContain('3.25');expect(f.history).not.toHaveBeenCalled();
});
it('replaces A diagnostics with the actual newly published B metadata',()=>{
 const f=cell(row());f.publish(row({id:'PRIVATE-INTERNAL-ROW-B',rendererId:'PRIVATE-NATIVE-B',diagnostics:['SYNTHETIC B observation unavailable.']}));const statuses=statusNodes(f.view.render());expect(statuses).toHaveLength(1);expect(statuses[0].props.title).toBe('Unavailable: SYNTHETIC B observation unavailable.');expect(JSON.stringify(statuses[0].props)).not.toContain(REASON);
});

// Valid complete function input is transformed before execution; no top-level
// return/closure rewrite and no old fixture/source-read interception is used.
const app=readFileSync(resolve(process.env.LV_STUDY_REASON_SOURCE_ROOT??process.cwd(),'src/ui/App.tsx'),'utf8');
function globalRows(rows:IndicatorInstanceView[],owner=true,numeric=false){
 const start=app.indexOf(' // Published reasons use the earlier analysis owner;'),end=app.indexOf(' // A collapsed legend shows how many indicators it holds',start);if(start<0||end<0)throw Error('Actual owned App legend span missing.');
 const ownsRenderedAnalysis=vi.fn(()=>owner),values=vi.fn(()=>({series:[{id:'sma',values:[2,3.25]}]})),noop=()=>{};
 const scope:Record<string,unknown>={React,legendRowMenuProps,legendVisible:true,indicatorViews:rows,ownsRenderedAnalysis,indicatorLabels:new Map(rows.map((value,index)=>[value.id,'SMA '+(index+1)])),legendReadout:new Map(rows.map(value=>[value.id,{title:'SMA',arguments:''}])),legendMenu:null,openIndicatorSettings:noop,indicatorChartAction:(action:()=>unknown)=>action(),applyIndicatorLegendAction:noop,setLegendMenu:noop,chart:{indicators:{values}},statusLine:{indicators:{values:numeric}},legendValuesView,indicatorLegendValues,validInspection:null,defaultPlotStyle,indicatorMoveChoices:()=>[],scaleOf:()=>null,scaleSides:()=>({}),scaleChoicesOf:()=>[],legendButtons,legendButtonView,PaneLegendMenu:()=>null,legendMoreMenuView,legendMoreMenu,indicatorAcronyms,pinToScaleMenu:()=>[],pinToScalePlacement:noop,indicatorOrderState,visualOrderItems,indicatorVisualOrderAvailable,isIndicatorOrderStep,paneLegendOwnerCurrent:()=>{throw Error('Later App const must not be entered.');},legendMoreAction:noop,legendSubmenu:noop,statusBackground:undefined,indicatorReasonView,indicatorDataStatus,/* The values slot renders its content once here */hoverSlot:(_select:unknown,render:()=>unknown)=>render(),hoverReadout:()=>({validInspection:null})};
 const keys=Object.keys(scope),source='function ownedAppLegend('+keys.join(',')+'){'+app.slice(start,end)+'\nreturn indicatorViews.map(legendRow);}',converted=transformSync('synthetic-owned-app-legend.tsx',source,{lang:'tsx',sourceType:'script',jsx:{runtime:'classic'}});expect(converted.errors).toEqual([]);const render=Function(converted.code+'\nreturn ownedAppLegend;')() as (...args:unknown[])=>unknown;
 return{tree:render(...keys.map(key=>scope[key])),ownsRenderedAnalysis,values};
}
it('the actual global App rendering span uses one owner check and keeps two human reasons separate',()=>{
 const f=globalRows([row(),row({id:'PRIVATE-INTERNAL-ROW-B',diagnostics:['SYNTHETIC second source unavailable.']})]);const statuses=statusNodes(f.tree);expect(statuses).toHaveLength(2);expect(statuses[0].props['aria-label']).toContain('SMA 1. Unavailable: '+REASON);expect(statuses[1].props['aria-label']).toContain('SMA 2. Unavailable: SYNTHETIC second source unavailable.');expect(f.ownsRenderedAnalysis).toHaveBeenCalledTimes(1);expect(f.values).not.toHaveBeenCalled();
});
it('the actual global App span suppresses a stale source reason without entering a later closure',()=>{
 const f=globalRows([row()],false);expect(statusNodes(f.tree)).toHaveLength(0);expect(f.ownsRenderedAnalysis).toHaveBeenCalledTimes(1);expect(f.values).not.toHaveBeenCalled();
});
it('the actual global App span preserves the original finite numeric row and does no reason-owner work for ready metadata',()=>{
 const f=globalRows([row({diagnostics:[],series:[{id:'sma',label:'SMA'}],informationBars:3})],true,true);expect(statusNodes(f.tree)).toHaveLength(0);expect(text(f.tree)).toContain('3.25');expect(all(f.tree,node=>node.props['data-plot']==='sma')).toHaveLength(1);expect(f.values).toHaveBeenCalledTimes(1);expect(f.ownsRenderedAnalysis).not.toHaveBeenCalled();
});
