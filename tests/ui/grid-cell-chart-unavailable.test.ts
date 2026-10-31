import {expect,it,vi} from 'vitest';
import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';

// Actual GridCell under the shared controlled hook model (SYNTHETIC dataset; no
// DOM, GUI or packaged-build claim). A chart whose construction throws never
// calls onReady, so the cell must show its own error and Reopen action instead
// of keeping an invisible pane.
it('a chart that fails to construct shows the cell error and Reopen instead of a hidden empty pane',()=>{
 const gme=fixtureDataset('GME',3),state=createMultiChartState(gme,{appearance:defaultTheme.appearance});
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets:[gme],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];
 parent.dispose();
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture requires the real GridCell');
 const statuses:string[]=[];
 const props={...cell.props,onCapture:vi.fn(()=>true),onReady:vi.fn(),onRuntime:vi.fn(),onStatus:(value:{error:string})=>{statuses.push(value.error);},onNonGesture:vi.fn(),onBeginGesture:vi.fn(()=>true),onFinishGesture:vi.fn(),port:{mount:()=>()=>{}}};
 const component=cell.type as (input:Record<string,unknown>)=>unknown;
 const ui=mountControlledComponent(()=>component(props));ui.settle();
 const panel=()=>{const found=all(ui.render(),value=>value.type===ChartPanel);if(found.length!==1)throw Error('SYNTHETIC fixture expected one ChartPanel');return found[0];};
 const wrapper=()=>all(ui.render(),value=>value.type==='div'&&(value.props.children as {type?:unknown}|undefined)?.type===ChartPanel)[0];
 const alerts=()=>all(ui.render(),value=>value.props.role==='alert').map(text).join(' | ');
 const reopen=()=>all(ui.render(),value=>value.type==='button'&&text(value)==='Reopen chart');
 expect((wrapper().props.style as {visibility:string}).visibility).toBe('hidden');expect(alerts()).toBe('');expect(reopen()).toHaveLength(0);
 const report=panel().props.onUnavailable;expect(typeof report).toBe('function');
 (report as (message:string)=>void)('Drawing command member unavailable: drawings');ui.settle();
 expect(alerts()).toContain('Chart unavailable: Drawing command member unavailable: drawings');
 expect(reopen()).toHaveLength(1);expect(statuses.at(-1)).toBe('Chart unavailable: Drawing command member unavailable: drawings');
 (reopen()[0].props.onClick as ()=>void)();ui.settle();
 expect(alerts()).toBe('');expect(statuses.at(-1)).toBe('');expect(typeof panel().props.onUnavailable).toBe('function');
 ui.dispose();
});
// The panel reports non-terminal failures (an appearance/style apply that threw
// after a successful build) through the same channel. The cell must not stay in
// error: when that chart later commits its first input, onReady re-owns it and
// the cell's settle path clears the alert.
it('a non-terminal unavailable report clears when the same chart later reaches onReady',async()=>{
 const gme=fixtureDataset('GME',3),state=createMultiChartState(gme,{appearance:defaultTheme.appearance});
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets:[gme],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];
 parent.dispose();
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture requires the real GridCell');
 const statuses:string[]=[],saved=cell.props.saved as Record<string,any>;
 const props={...cell.props,onCapture:vi.fn(()=>true),onReady:vi.fn(),onRuntime:vi.fn(),onStatus:(value:{error:string})=>{statuses.push(value.error);},onNonGesture:vi.fn(),onBeginGesture:vi.fn(()=>true),onFinishGesture:vi.fn(),port:{mount:()=>()=>{}}};
 const input={bars:gme.bars,source:sourceContextForDataset(gme,gme.bars),style:saved.style as string};
 const chart={getExecutionIdentity:()=>'ordinary',getAnalysisUnavailable:()=>'',onAvailabilityChanged:()=>()=>{},onDrawingCommandError:()=>()=>{},
  getChartOptions:()=>saved.chartOptions,applyChartOptions:()=>{},saveDrawings:()=>saved.drawings,loadDrawings:()=>{},
  indicators:{restore:()=>{},serialize:()=>[],subscribe:()=>()=>{}},comparisons:{restore:()=>{},list:()=>[],subscribe:()=>()=>{}},
  onDrawingsChanged:()=>()=>{},getViewport:()=>null,setViewport:()=>{},onViewportChanged:()=>()=>{},onNavigationCommand:()=>()=>{},applyChartSettingsBook:()=>{},priceScale:{bindHost:()=>()=>{},settings:()=>({}),applySettings:(value:unknown)=>value},
  drawings:{getMode:()=>null},isDrawingChromeTarget:()=>false,isInputCurrent:()=>true,scripts:{configurationSnapshot:()=>[]}};
 const component=cell.type as (input:Record<string,unknown>)=>unknown;
 const ui=mountControlledComponent(()=>component(props));ui.settle();
 const panel=()=>{const found=all(ui.render(),value=>value.type===ChartPanel);if(found.length!==1)throw Error('SYNTHETIC fixture expected one ChartPanel');return found[0];};
 const alerts=()=>all(ui.render(),value=>value.props.role==='alert').map(text).join(' | ');
 (panel().props.onUnavailable as (message:string)=>void)('SYNTHETIC appearance failed');ui.settle();
 expect(alerts()).toContain('Chart unavailable: SYNTHETIC appearance failed');expect(statuses.at(-1)).toBe('Chart unavailable: SYNTHETIC appearance failed');
 (panel().props.onReady as (chart:unknown,input:unknown,execution:string)=>void)(chart,input,'ordinary');ui.settle();
 for(let turn=0;turn<6;turn++)await new Promise<void>(resolve=>setTimeout(resolve,0));ui.settle();
 expect(alerts()).toBe('');expect(statuses.at(-1)).toBe('');expect(props.onReady).toHaveBeenLastCalledWith(chart);
 ui.dispose();
});
