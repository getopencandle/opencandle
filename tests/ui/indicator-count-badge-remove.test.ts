import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,realChart,text} from './indicator-real-port-harness';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';

// The "N on chart" badge in the Indicators list removes the newest instance of that indicator on the dialog's chart.
// Actual IndicatorDialog handlers on the REAL indicator port; the Undo history is the actual createWorkspaceHistory,
// recording one entry per accepted dialog change (onChange, where App captures) and restoring through indicators.restore.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

type UI=ReturnType<typeof dialog>;
const badge=(ui:UI,name:string)=>findAll(ui.render(),node=>node.type==='button'&&node.props?.['aria-label']==='Remove the last added '+name)[0]??null;
const ids=(ui:UI,kind:string)=>ui.port.list().filter(row=>row.kind===kind).map(row=>row.id);
/** One Undo entry per accepted dialog change, as App records at confirmAnalysisCapture. */
function withHistory(ui:UI){
 const history=createWorkspaceHistory<{indicators:any}>();let committed={indicators:ui.port.serialize()};
 ui.props.onChange=vi.fn(()=>{history.record(committed,null);committed={indicators:ui.port.serialize()};return true;});
 const undo=()=>{const entry=history.peekUndo();if(!entry)return false;ui.port.restore(entry.workspace.indicators);if(!history.undo(committed,null))throw Error('History entry vanished.');committed={indicators:ui.port.serialize()};return true;};
 return {history,undo};
}
const keyEvent=(key:string,extra:Record<string,unknown>={})=>({key,preventDefault:vi.fn(),stopPropagation:vi.fn(),...extra});

describe('Indicators list: the on-chart badge removes the last added instance',()=>{
 it('removes only the newest instance, never adds, and the count updates at once',()=>{
  const ui=dialog();
  for(let i=0;i<3;i++)ui.click('Add Simple Moving Average');
  const [first,second,third]=ids(ui,'sma');
  expect(text(badge(ui,'Simple Moving Average'))).toBe('3 on chart');
  badge(ui,'Simple Moving Average').props.onClick({stopPropagation:vi.fn()});
  expect(ids(ui,'sma')).toEqual([first,second]);expect(ids(ui,'sma')).not.toContain(third);
  expect(text(badge(ui,'Simple Moving Average'))).toBe('2 on chart');
  expect(text(find(ui.render(),node=>node.props?.role==='status'))).toContain('Removed ');
  expect(ui.props.onClose).not.toHaveBeenCalled();
 });

 it('the badge is its own button beside Add, so pressing it never runs Add',()=>{
  const ui=dialog({seed:['ema']});
  const row=find(ui.render(),node=>String(node.props?.className??'').includes('indicator-catalog-row')&&node.props.id==='lv-ind-row-ema');
  const add=find(row,node=>node.props?.['aria-label']==='Add Exponential Moving Average'),button=badge(ui,'Exponential Moving Average');
  expect(findAll(add.props.children,node=>node.type==='button')).toHaveLength(0);
  expect(findAll(row.props.children,node=>node.type==='button').map(node=>node.props['aria-label'])).toContain('Remove the last added Exponential Moving Average');
  expect(button.props.title).toBe('Remove the last added Exponential Moving Average');expect(button.props.title).not.toMatch(/—/);
  button.props.onClick({stopPropagation:vi.fn()});
  expect(ids(ui,'ema')).toEqual([]);expect(ui.port.list()).toHaveLength(0);
  expect(badge(ui,'Exponential Moving Average')).toBeNull();
 });

 it('uses creation order, not pane order',()=>{
  const ui=dialog();
  ui.click('Add Relative Strength Index');ui.click('Add Relative Strength Index');
  const [older,newer]=ids(ui,'rsi');
  ui.port.move(newer,'price');
  badge(ui,'Relative Strength Index').props.onClick({stopPropagation:vi.fn()});
  expect(ids(ui,'rsi')).toEqual([older]);
 });

 it('is one Undo step that restores the removed instance',()=>{
  const ui=dialog(),{history,undo}=withHistory(ui);
  ui.click('Add Simple Moving Average');ui.click('Add Simple Moving Average');
  const before=ui.port.serialize(),steps=history.status().undo;
  badge(ui,'Simple Moving Average').props.onClick({stopPropagation:vi.fn()});
  expect(history.status().undo).toBe(steps+1);expect(ui.props.onChange).toHaveBeenCalledTimes(3);
  expect(ui.port.list().filter(row=>row.kind==='sma')).toHaveLength(1);
  expect(undo()).toBe(true);
  expect(ui.port.serialize()).toEqual(before);
  expect(text(badge(ui,'Simple Moving Average'))).toBe('2 on chart');
 });

 it('Enter and Space on the focused badge remove once each and stop there',()=>{
  const ui=dialog({seed:['sma','sma','sma']});const [a,b,c]=ui.ids;
  const enter=keyEvent('Enter');badge(ui,'Simple Moving Average').props.onKeyDown(enter);
  expect(enter.preventDefault).toHaveBeenCalled();expect(enter.stopPropagation).toHaveBeenCalled();
  expect(ids(ui,'sma')).toEqual([a,b]);
  badge(ui,'Simple Moving Average').props.onKeyDown(keyEvent(' '));expect(ids(ui,'sma')).toEqual([a]);
  badge(ui,'Simple Moving Average').props.onKeyDown(keyEvent('Enter',{repeat:true}));expect(ids(ui,'sma')).toEqual([a]);
  badge(ui,'Simple Moving Average').props.onKeyDown(keyEvent('a'));expect(ids(ui,'sma')).toEqual([a]);
  const up=keyEvent(' ');badge(ui,'Simple Moving Average').props.onKeyUp(up);expect(up.preventDefault).toHaveBeenCalled();expect(ids(ui,'sma')).toEqual([a]);
  expect(c).toBeTruthy();
 });

 it('in a grid it acts on the chart the dialog serves (the active cell), leaving the other cell alone',()=>{
  const other=realChart(),otherId=other.port.add('sma',factoryIndicatorDefault('sma').inputs,factoryIndicatorDefault('sma'));
  const ui=dialog({seed:['sma','sma']});
  badge(ui,'Simple Moving Average').props.onClick({stopPropagation:vi.fn()});
  expect(ids(ui,'sma')).toEqual([ui.ids[0]]);
  expect(other.port.list().map(row=>row.id)).toEqual([otherId]);
  // App hands the dialog the active cell's controller for Add and the badge alike.
  const app=readFileSync('src/ui/App.tsx','utf8'),element=app.slice(app.indexOf('<IndicatorDialog '),app.indexOf('/>',app.indexOf('<IndicatorDialog ')));
  expect(element).toContain(' chart={chart} ');
 });

 it('removing an Anchored VWAP still waiting for its anchor tells the host, which ends the placement',()=>{
  const ui=dialog(),placing=vi.fn(),removed=vi.fn();ui.props.onAnchorPlacement=placing;ui.props.onInstanceRemoved=removed;
  ui.click('Add Anchored VWAP');
  const [id]=ids(ui,'avwap');expect(placing).toHaveBeenCalledWith(id);
  badge(ui,'Anchored VWAP').props.onClick({stopPropagation:vi.fn()});
  expect(ids(ui,'avwap')).toEqual([]);expect(removed).toHaveBeenCalledWith(id);
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('onInstanceRemoved={id=>{if(anchorPlacementRef.current?.id===id)endAnchorPlacement(false);}}');
 });
});
