import {describe,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke} from '../helpers/alert-dialog-harness';
import {ReplayPanel,replayDateSubmit,type ReplayPanelProps} from '../../src/ui/ReplayPanel';
import {openReplay,selectReplayStart} from '../../src/domain/replay-session';
import {fixtureDataset} from '../../src/domain/fixtures';

// The replay Select date form reads and shows the chart timezone.
// Controlled hooks, no DOM. SYNTHETIC bars and instants.
const s=(y:number,mo:number,d:number,h:number,mi:number)=>Date.UTC(y,mo-1,d,h,mi)/1000;
const chart=fixtureDataset('BAR',30);
const participant={cellId:'c1',instrumentId:chart.instrument.id,symbol:'BAR',interval:'1D',chartType:'candles',datasetId:chart.provenance.datasetId,revision:'1'};
const active=selectReplayStart(openReplay({participants:[participant],activeCellId:'c1',sessionId:'bar'}),chart,chart.bars[9].time,'1D');
const noop=()=>{};
function props(extra:Partial<ReplayPanelProps>):ReplayPanelProps{
 return {session:active,saved:null,intervalMenu:{auto:{id:'1D',reason:'Auto uses the chart interval.'},options:[]},multiChart:false,atEnd:false,unsupportedReason:null,clockLabel:'',onSelectStart:noop,onTogglePlay:noop,onStep:noop,onSpeed:noop,onInterval:noop,onScope:noop,onRealtime:noop,onClose:noop,onContinue:noop,onStartPoint:vi.fn(),...extra} as ReplayPanelProps;
}
function dateForm(extra:Partial<ReplayPanelProps>){
 const panel=mountControlledComponent(()=>ReplayPanel(props(extra)));panel.settle();
 const slot=all(panel.render(),node=>typeof node.type==='function'&&node.props.label==='Start point')[0];
 const menu=(slot.props.menu as (close:()=>void)=>{type:(p:unknown)=>unknown;props:Record<string,unknown>})(noop);
 const list=mountControlledComponent(()=>menu.type(menu.props));list.settle();
 const picker=all(list.render(),node=>typeof node.type==='function')[0];
 const items=mountControlledComponent(()=>(picker.type as (p:unknown)=>unknown)(picker.props));items.settle();
 invoke(all(items.render(),node=>node.type==='button'&&text(node)==='Select date')[0].props.onClick);list.settle();
 const form=all(list.render(),node=>typeof node.type==='function')[0];
 const view=mountControlledComponent(()=>(form.type as (p:unknown)=>unknown)(form.props));view.settle();
 return{menu,view,input:()=>all(view.render(),node=>node.type==='input')[0],form:()=>all(view.render(),node=>node.type==='form')[0]};
}

describe(' replay Select date',()=>{
 it('submits a chart-timezone date and time, across both DST changes',()=>{
  const onStartPoint=vi.fn();
  expect(replayDateSubmit('2026-03-08T03:30',onStartPoint,'America/New_York')).toBeNull();
  expect(onStartPoint).toHaveBeenCalledWith({kind:'date',time:s(2026,3,8,7,30)});
  expect(replayDateSubmit('2026-03-08T02:30',vi.fn(),'America/Denver')).toContain('That time does not exist in Denver');
  replayDateSubmit('2026-11-01T01:30',onStartPoint,'America/Denver');expect(onStartPoint).toHaveBeenLastCalledWith({kind:'date',time:s(2026,11,1,7,30)});
  expect(replayDateSubmit('',vi.fn())).toBe('Choose a valid UTC date and time.');
 });
 it('the form shows the chart wall clock and names the zone; UTC without a zone',()=>{
  const ny=dateForm({timezone:'America/New_York',session:{...active,clock:s(2026,10,23,13,30)} as ReplayPanelProps['session']});
  expect(ny.menu.props.timezone).toBe('America/New_York');
  expect(ny.input().props.value).toBe('2026-10-23T09:30');expect(ny.view.text()).toContain('Start date and time (New York)');
  expect(ny.input().props['aria-label']).toBe('Replay start date and time in New York time');
  const utc=dateForm({session:{...active,clock:s(2026,10,23,13,30)} as ReplayPanelProps['session']});
  expect(utc.input().props.value).toBe('2026-10-23T13:30');expect(utc.view.text()).toContain('Start date and time (UTC)');
 });
});
