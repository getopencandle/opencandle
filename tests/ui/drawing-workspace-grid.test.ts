import {expect,it,vi} from 'vitest';
import {createGridDrawingWorkspaceHost} from '../../src/ui/drawing-workspace';
import {createMultiChartState,type MultiChartGridProps,resizeMultiChartState} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';
// Actual cell publication boundary with a controlled native input receipt.
// No native window or React painting is exercised here.
function fixture(){
 const data=fixtureDataset('GME',5),state=createMultiChartState(data,{appearance:defaultTheme.appearance}),id=state.layout.activeCellId;
 let alive=true,blocked=false,epoch='ordinary',currentChart:any,rootExpected=state,writes=0,retainedAck:(()=>void)|undefined;
 let status={input:{bars:data.bars,source:sourceContextForDataset(data),style:'candles'},settled:true,error:''};
 const chart={getExecutionIdentity:()=>epoch,isInputCurrent:()=>true};currentChart=chart;
 let write:(mark:()=>void,next:any)=>void=(mark,next)=>{rootExpected=next;writes++;mark();};
 let props:MultiChartGridProps={state,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:vi.fn(()=>true),onReady:vi.fn(),onActiveCell:vi.fn(),onDrawingHistory:vi.fn(),drawingHistoryStatus:()=>({canUndo:true,canRedo:false}),onCaptureDrawingWorkspace:vi.fn(expected=>{
  expect(expected).toBe(rootExpected);
  const assertCurrent=()=>{if(props.state!==rootExpected)throw Error('Root workspace replaced.');};
  return{assertCurrent,prepare:(next:typeof state)=>({assertCurrent,publish:(mark:()=>void)=>{retainedAck=mark;write(mark,next);}})};
 })};
 const accept=vi.fn(next=>{props={...props,state:next};});
 const host=createGridDrawingWorkspaceHost(id,chart as any,{read:()=>props,alive:()=>alive,blocked:()=>blocked,controller:key=>key===id?currentChart:undefined,readiness:()=>status,accept});
 return{host,id,chart,props:()=>props,accept,writes:()=>writes,setProps:(next:MultiChartGridProps)=>{props=next;},setRoot:(next:MultiChartGridProps)=>{props=next;rootExpected=next.state;},replaceChart:()=>{currentChart={...chart};},replaceStatus:()=>{status={...status};},setEpoch:(value:string)=>{epoch=value;},setBlocked:(value:boolean)=>{blocked=value;},unmount:()=>{alive=false;},write:(fn:typeof write)=>{write=fn;},ack:()=>retainedAck!};
}
const document=()=>({version:1,drawings:[{id:'copy',type:'future-drawing',opaque:{missing:undefined,negativeZero:-0}}]});
it('prepares a private exact drawing candidate and advances the cell only at acknowledgement',()=>{
 const f=fixture(),before=f.props().state,command=f.host.capture(),candidate=document(),pending=command.prepare(candidate);candidate.drawings[0].id='outside-mutation';
 expect(f.props().state).toBe(before);expect(f.writes()).toBe(0);const mark=vi.fn(()=>expect(f.props().state).not.toBe(before));pending.publish(mark);
 expect(mark).toHaveBeenCalledOnce();expect(f.writes()).toBe(1);pending.assertCurrent();command.assertCurrent();
 const row=(f.props().state.cells[f.id].drawings.drawings as any[])[0];expect(row.id).toBe('copy');expect(Object.hasOwn(row.opaque,'missing')).toBe(true);expect(Object.is(row.opaque.negativeZero,-0)).toBe(true);
 expect(()=>pending.publish(mark)).toThrow('consumed');
});
it.each(['controller','readiness','execution','busy','unmount','equal-grid'] as const)('rejects %s replacement before publication',kind=>{
 const f=fixture(),pending=f.host.capture().prepare(document()),mark=vi.fn();
 if(kind==='controller')f.replaceChart();if(kind==='readiness')f.replaceStatus();if(kind==='execution')f.setEpoch('replay-other');if(kind==='busy')f.setBlocked(true);if(kind==='unmount')f.unmount();if(kind==='equal-grid')f.setProps({...f.props(),state:structuredClone(f.props().state)});
 expect(()=>pending.publish(mark)).toThrow();expect(mark).not.toHaveBeenCalled();expect(f.accept).not.toHaveBeenCalled();expect(f.writes()).toBe(0);
});
// (spec 3.7): the linked refusal became the unmounted-peer candidate case.
it('a linked same-scope peer whose native chart is not mounted receives a canonical-only candidate in the same step',()=>{
 const f=fixture(),next=resizeMultiChartState(f.props().state,'two-columns');next.layout.sync.drawings=true;
 const scoped={version:1,drawings:[{id:'S',type:'future-drawing',lvSyncScope:'layout'},{id:'L',type:'future-drawing'}]};
 for(const cell of next.layout.cells)next.cells[cell.id]={...next.cells[cell.id],drawings:structuredClone(scoped)};
 f.setRoot({...f.props(),state:next});const peer=next.layout.cells.find(cell=>cell.id!==f.id)!.id;
 const pending=f.host.capture('erase').prepare({version:1,drawings:[{id:'L',type:'future-drawing'}]});pending.publish(()=>{});
 expect(f.props().onCaptureDrawingWorkspace).toHaveBeenCalledOnce();expect(f.writes()).toBe(1);
 expect(f.props().state.cells[f.id].drawings.drawings).toEqual([{id:'L',type:'future-drawing'}]);
 expect(f.props().state.cells[peer].drawings.drawings).toEqual([{id:'L',type:'future-drawing'}]);
});
it('a missing acknowledgement cannot later overwrite the current grid',()=>{
 const f=fixture(),before=f.props().state;f.write(()=>{});const pending=f.host.capture().prepare(document());
 expect(()=>pending.publish(()=>{})).toThrow('acknowledge synchronously');expect(f.props().state).toBe(before);
 expect(()=>f.ack()()).toThrow('retired');expect(f.accept).not.toHaveBeenCalled();
});
it('workspace history dispatch uses the captured current state and does not assert an expired action afterward',()=>{
 const f=fixture(),assert=vi.fn();f.host.history('undo',assert);expect(assert).toHaveBeenCalledOnce();expect(f.props().onDrawingHistory).toHaveBeenCalledWith('undo',f.props().state);expect(f.host.historyStatus()).toEqual({canUndo:true,canRedo:false});
 f.setBlocked(true);expect(()=>f.host.history('redo',assert)).toThrow();expect(f.props().onDrawingHistory).toHaveBeenCalledTimes(1);
});
