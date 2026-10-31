import {readFileSync} from 'node:fs';
import {expect,it,vi} from 'vitest';
import {all,mountControlledComponent,text} from '../helpers/alert-dialog-harness';
import {MultiChartGrid,createMultiChartState} from '../../src/ui/MultiChartGrid';
import {ChartPanel} from '../../src/ui/ChartPanel';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';

// The quarantine notice was drawn under the symbol/BB legend rows
// (z-index 5-6) with no z-index of its own, so its text was unreadable and a click on "Reopen chart" opened
// BB settings. SYNTHETIC dataset; actual GridCell; no DOM, GUI or packaged-build claim.
const css=['src/ui/components.css','src/ui/indicator-legend.css','src/ui/styles.css'].map(file=>readFileSync(file,'utf8')).join('\n');
function zOf(selector:string){const values:number[]=[];for(let at=css.indexOf(selector+'{');at>=0;at=css.indexOf(selector+'{',at+1)){const match=/z-index:(\d+)/.exec(css.slice(at,css.indexOf('}',at)));if(match)values.push(Number(match[1]));}if(!values.length)throw Error('SYNTHETIC rule without z-index '+selector);return Math.max(...values);}

it('the chart unavailable notice stacks above every legend row, is opaque and clickable, and Reopen recovers',()=>{
 const legends=['.indicator-legend','.lv-cell-study-legend','.chart-heading','.lv-series-menu-host','.lv-multichart>div:last-child>div:only-child>div:first-child'].map(zOf);
 const gme=fixtureDataset('GME',3),state=createMultiChartState(gme,{appearance:defaultTheme.appearance});
 const parent=mountControlledComponent(()=>MultiChartGrid({state,datasets:[gme],onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}}));
 const cell=all(parent.render(),value=>typeof value.type==='function'&&value.type.name==='GridCell')[0];parent.dispose();
 if(!cell||typeof cell.type!=='function')throw Error('SYNTHETIC fixture requires the real GridCell');
 const props={...cell.props,onCapture:vi.fn(()=>true),onReady:vi.fn(),onRuntime:vi.fn(),onStatus:vi.fn(),onNonGesture:vi.fn(),onBeginGesture:vi.fn(()=>true),onFinishGesture:vi.fn(),port:{mount:()=>()=>{}}};
 const ui=mountControlledComponent(()=>(cell.type as (input:Record<string,unknown>)=>unknown)(props));ui.settle();
 const panel=all(ui.render(),value=>value.type===ChartPanel)[0];
 (panel.props.onUnavailable as (message:string)=>void)('Trendline annotation painting failed. Reopen the chart. Error: SYNTHETIC');ui.settle();
 const notice=all(ui.render(),value=>value.type==='div'&&value.props.role==='alert');expect(notice).toHaveLength(1);
 const style=notice[0].props.style as Record<string,unknown>;
 expect(style.position).toBe('absolute');expect(style.pointerEvents).toBe('auto');expect(style.background).toBe('var(--lv-bg-surface)');
 expect(Number(style.zIndex)).toBeGreaterThan(Math.max(...legends));expect(Number(style.zIndex)).toBeLessThan(95);// fixed menus and dialogs stay above it
 expect(text(notice[0])).toContain('Trendline annotation painting failed');
 const reopen=all(notice[0],value=>value.type==='button'&&text(value)==='Reopen chart');expect(reopen).toHaveLength(1);expect(reopen[0].props.type).toBe('button');
 (reopen[0].props.onClick as ()=>void)();ui.settle();
 expect(all(ui.render(),value=>value.props.role==='alert')).toHaveLength(0);
 ui.dispose();
});
