import {describe,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke,saved,notice} from '../helpers/alert-dialog-harness';
import {AlertsDock,type AlertsDockProps} from '../../src/ui/AlertsDock';
import {DateNavigationDialog,utcDateInput,zonedDateInput} from '../../src/ui/DateNavigationDialog';
import {ScriptLogsPanel,scriptLogTime,type ScriptLogSource} from '../../src/ui/ScriptLogsPanel';
import {formatToolbarClock} from '../../src/chart/bottom-toolbar';

// The alert log, Go to date, script logs and the bottom clock follow the chart timezone and hour cycle.
// Controlled hooks, no DOM. Every alert, log row and instant is SYNTHETIC.
const s=(y:number,mo:number,d:number,h:number,mi:number,se=0)=>Date.UTC(y,mo-1,d,h,mi,se)/1000;
const fired=()=>({...saved('tz'),lastTriggeredAt:s(2026,10,23,13,30),history:[notice('tz',1,s(2026,3,8,7,0)),notice('tz',2,s(2026,10,23,13,30))]});

function dock(extra:Partial<AlertsDockProps>){
 const props={alerts:[fired()],activeInstrumentId:'x',unwatched:new Map(),now:()=>s(2026,10,23,14,0),onAlertsChange:vi.fn(()=>true),onCreate:vi.fn(),onEdit:vi.fn(),...extra} as AlertsDockProps;
 const view=mountControlledComponent(()=>AlertsDock(props));view.settle();
 const log=()=>{const tab=all(view.render(),node=>node.type==='button'&&node.props.role==='tab'&&text(node).startsWith('Log'))[0];invoke(tab.props.onClick);view.settle();return all(view.render(),node=>node.type==='time').map(text);};
 return{view,log};
}

describe(' alert log',()=>{
 it('shows log and last-trigger times in the chart timezone, across the DST change',()=>{
  const ny=dock({timezone:'America/New_York'});
  expect(ny.view.text()).toContain('last 2026-10-23 09:30 UTC-4');
  expect(ny.log()).toEqual(['2026-10-23 09:30 UTC-4','2026-03-08 03:00 UTC-4']);
  const denver=dock({timezone:'America/Denver',timeHours:'12'});
  expect(denver.log()).toEqual(['2026-10-23 7:30 AM UTC-6','2026-03-08 12:00 AM UTC-7']);
 });
 it('an explicit formatTime still wins, and no zone at all keeps the UTC text',()=>{
  expect(dock({timezone:'America/New_York',formatTime:String}).log()).toEqual([String(s(2026,10,23,13,30)),String(s(2026,3,8,7,0))]);
  expect(dock({}).log()).toEqual(['2026-10-23 13:30 UTC','2026-03-08 07:00 UTC']);
 });
});

describe(' Go to date',()=>{
 const form=(tree:unknown)=>all(tree,node=>node.type==='form')[0];
 // Separate date and time inputs; the pair reads back as the old datetime-local value.
 const inputs=(tree:unknown)=>all(tree,node=>node.type==='input');
 const value=(tree:unknown)=>inputs(tree).map(node=>node.props.value).join('T');
 const type=(view:{render():unknown;settle():void},stamp:string)=>{const [date,clock]=stamp.split('T');invoke(inputs(view.render())[0].props.onChange,{target:{value:date}});view.settle();invoke(inputs(view.render())[1].props.onChange,{target:{value:clock}});view.settle();};
 it('reads and shows the chart wall clock, names the zone, and refuses the skipped DST hour',()=>{
  const onGo=vi.fn(),onClose=vi.fn();
  const view=mountControlledComponent(()=>DateNavigationDialog({time:s(2026,10,23,13,30),timezone:'America/New_York',onGo,onClose}));view.settle();
  expect(value(view.render())).toBe('2026-10-23T09:30');
  expect(text(view.render())).toContain('Time (New York)');expect(inputs(view.render()).map(node=>[node.props.type,node.props['aria-label']])).toEqual([['date','Go to date in New York time'],['time','Go to time in New York time']]);
  type(view,'2026-03-08T02:30');
  invoke(form(view.render()).props.onSubmit,{preventDefault(){}});view.settle();
  expect(onGo).not.toHaveBeenCalled();expect(text(view.render())).toContain('That time does not exist in New York');
  type(view,'2026-03-08T03:30');
  invoke(form(view.render()).props.onSubmit,{preventDefault(){}});
  expect(onGo).toHaveBeenCalledWith(s(2026,3,8,7,30));expect(onClose).toHaveBeenCalled();
 });
 it('Denver across the autumn change, and UTC when no zone is given',()=>{
  expect(zonedDateInput('2026-11-01T01:30','America/Denver')).toBe(s(2026,11,1,7,30));
  expect(zonedDateInput('2026-11-01T01:30','UTC')).toBe(utcDateInput('2026-11-01T01:30'));
  const onGo=vi.fn();
  const view=mountControlledComponent(()=>DateNavigationDialog({time:s(2026,10,23,13,30),onGo,onClose:()=>{}}));view.settle();
  expect(value(view.render())).toBe('2026-10-23T13:30');expect(text(view.render())).toContain('Time (UTC)');
  invoke(form(view.render()).props.onSubmit,{preventDefault(){}});expect(onGo).toHaveBeenCalledWith(s(2026,10,23,13,30));
 });
});

describe(' script logs',()=>{
 const sources:ScriptLogSource[]=[{id:'a',title:'RSI',entries:[{time:s(2026,3,8,6,59),index:1,level:'info',message:'before'},{time:s(2026,3,8,7,0),index:2,level:'info',message:'after'}],dropped:0}];
 const rows=(chart:any,extra:Record<string,unknown>={})=>{const view=mountControlledComponent(()=>ScriptLogsPanel({chart,...extra}));view.settle();return{head:all(view.render(),node=>node.type==='th').map(text)[0],times:all(view.render(),node=>node.type==='tr'&&!!node.props['data-level']).map(row=>text((row.props.children as unknown[])[0]))};};
 it('bar times follow the chart timezone read from the chart, and the header names it',()=>{
  const chart={scripts:{logs:()=>sources,subscribe:()=>()=>true},getChartOptions:()=>({timezone:'America/New_York'})};
  expect(rows(chart)).toEqual({head:'Bar time (New York)',times:['2026-03-08 01:59:00','2026-03-08 03:00:00']});
  expect(rows(chart,{timezone:'America/Denver',timeHours:'12'})).toEqual({head:'Bar time (Denver)',times:['2026-03-07 11:59:00 PM','2026-03-08 12:00:00 AM']});
 });
 it('a chart without options keeps UTC',()=>{
  expect(rows({scripts:{logs:()=>sources,subscribe:()=>()=>true}}).head).toBe('Bar time (UTC)');
  expect(scriptLogTime(3600)).toBe('1970-01-01 01:00:00');expect(scriptLogTime(s(2026,3,8,7,0),'America/Denver')).toBe('2026-03-08 00:00:00');
 });
});

describe(' bottom clock',()=>{
 it('follows the 12-hour setting; 24-hours is unchanged',()=>{
  const at=Date.UTC(2026,9,16,3,18,4,750);
  expect(formatToolbarClock(at,'America/Phoenix')).toBe('20:18:04 UTC-7');
  expect(formatToolbarClock(at,'America/Phoenix','12')).toBe('8:18:04 PM UTC-7');
  expect(formatToolbarClock(at,'UTC','12')).toBe('3:18:04 AM UTC');
  expect(formatToolbarClock(Date.UTC(2026,2,8,7,0,0),'America/New_York','12')).toBe('3:00:00 AM UTC-4');
  expect(formatToolbarClock(Date.UTC(2026,2,8,6,59,59),'America/New_York','12')).toBe('1:59:59 AM UTC-5');
  expect(formatToolbarClock(Date.UTC(2026,10,1,8,0,0),'America/Denver','12')).toBe('1:00:00 AM UTC-7');
 });
});
