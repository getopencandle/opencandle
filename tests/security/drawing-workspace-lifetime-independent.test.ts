import {expect,it,vi} from 'vitest';
import {createWorkspaceChartHost} from '../../src/ui/workspace-chart-host';
import {createGridDrawingWorkspaceHost} from '../../src/ui/drawing-workspace';
import {createMultiChartState,type MultiChartGridProps} from '../../src/ui/MultiChartGrid';
import {fixtureDataset} from '../../src/domain/fixtures';
import {defaultTheme} from '../../src/ui/themes';
import {sourceContextForDataset} from '../../src/chart/source-context';

function setup(){
 const data=fixtureDataset('GME',4),state=createMultiChartState(data,{appearance:defaultTheme.appearance});
 let props:MultiChartGridProps={state,datasets:[data],activeBars:data.bars,activeDatasetId:data.provenance.datasetId,activeExecutionIdentity:'ordinary',onChange:()=>true,onReady:()=>{},onActiveCell:()=>{}};
 const host=createWorkspaceChartHost({read:()=>props,changed:()=>{},alive:()=>true});
 return{host,data,get:()=>props,set:(next:MultiChartGridProps)=>{props=next;}};
}

it('a prepared tree drawing lease observed while held cannot revive when the same slot resumes',()=>{
 const f=setup(),slot=f.host.slots()[0],publish=vi.fn();
 f.set({...f.get(),onCaptureDrawingWorkspace:()=>({assertCurrent:()=>{},prepare:()=>({assertCurrent:()=>{},publish})})});
 const pending=slot.callbacks.onCaptureDrawingWorkspace!(f.get().state).prepare(structuredClone(f.get().state));
 slot.mode='held';expect(()=>pending.assertCurrent()).toThrow('replaced');slot.mode='active';
 expect(()=>pending.publish(()=>{})).toThrow(/replaced|retired/);expect(publish).not.toHaveBeenCalled();
});

it('tree acknowledgement advances exact state before a throwing outer marker and cannot be replayed',()=>{
 const f=setup(),slot=f.host.slots()[0],next=structuredClone(f.get().state),cause=Error('SYNTHETIC marker failure');let retained!:()=>void,observed:unknown;
 f.set({...f.get(),onCaptureDrawingWorkspace:()=>({assertCurrent:()=>{},prepare:()=>({assertCurrent:()=>{},publish:mark=>{retained=mark;mark();}})})});
 const pending=slot.callbacks.onCaptureDrawingWorkspace!(f.get().state).prepare(next);
 let failure:unknown;try{pending.publish(()=>{observed={state:slot.input.state,awaiting:slot.awaitingProps};throw cause;});}catch(error){failure=error;}
 expect(failure).toBe(cause);expect(observed).toEqual({state:next,awaiting:next});expect(slot.input.state).toBe(next);pending.assertCurrent();
 expect(()=>retained()).toThrow('late or repeated');expect(slot.input.state).toBe(next);
});

it('equal tree input replacement permanently retires a previously prepared command even if the old input is restored',()=>{
 const f=setup(),slot=f.host.slots()[0],before=slot.input,publish=vi.fn();
 f.set({...f.get(),onCaptureDrawingWorkspace:()=>({assertCurrent:()=>{},prepare:()=>({assertCurrent:()=>{},publish})})});
 const pending=slot.callbacks.onCaptureDrawingWorkspace!(f.get().state).prepare(structuredClone(f.get().state));
 f.host.sync();expect(slot.input).not.toBe(before);expect(()=>pending.assertCurrent()).toThrow('replaced');slot.input=before;
 expect(()=>pending.publish(()=>{})).toThrow(/replaced|retired/);expect(publish).not.toHaveBeenCalled();
});

it('Grid controller replacement observed before publication cannot revive by restoring the original controller',()=>{
 const f=setup(),id=f.get().state.layout.activeCellId,publish=vi.fn(),chart={getExecutionIdentity:()=>'ordinary',isInputCurrent:()=>true};let mounted=chart;
 const status={input:{bars:f.data.bars,source:sourceContextForDataset(f.data),style:'candles'},settled:true,error:''};
 f.set({...f.get(),onCaptureDrawingWorkspace:()=>({assertCurrent:()=>{},prepare:()=>({assertCurrent:()=>{},publish})})});
 const host=createGridDrawingWorkspaceHost(id,chart as any,{read:f.get,alive:()=>true,blocked:()=>false,controller:()=>mounted as any,readiness:()=>status,accept:()=>{}});
 const pending=host.capture().prepare({version:1,drawings:[]});mounted={...chart};expect(()=>pending.assertCurrent()).toThrow(/replaced|changed/);mounted=chart;
 expect(()=>pending.publish(()=>{})).toThrow(/retired/);expect(publish).not.toHaveBeenCalled();
});
