import {expect,it} from 'vitest';
import {createGridAnalysisCoordinator} from '../../src/chart/grid-analysis-coordinator';
import {createMultiChartState,resizeMultiChartState,type MultiChartState} from '../../src/ui/MultiChartGrid';
import {defaultTheme} from '../../src/ui/themes';
import {fixtureDataset} from '../../src/domain/fixtures';
import type {ChartController} from '../../src/chart/adapter';
import type {ScriptBindingRuntime} from '../../src/ui/script-binding-runtime';

// Actual coordinator; model writes and native leases are controlled. No native
// renderer, linked React parent, or graphical publication proof is claimed.
function fixture(){
 const dataset=fixtureDataset('GME',5);
 let model=resizeMultiChartState(createMultiChartState(dataset,{appearance:defaultTheme.appearance}),'two-columns'),history=0,pending=false;
 const ids=model.layout.cells.map(cell=>cell.id),calls:string[]=[],failSeals=new Map<string,unknown>();let failDiagnostic=false,failRelease=false;
 const coordinator=createGridAnalysisCoordinator({read:()=>({state:model,datasets:[dataset]}),
  controller:id=>({prepareAnalysisSnapshot:async()=>({changed:true,isCurrent:()=>true,commit(){calls.push('commit:'+id);},seal(){calls.push('seal:'+id);if(failSeals.has(id))throw failSeals.get(id);},async rollback(){calls.push('rollback:'+id);}}),
   saveDrawings:()=>({version:1,drawings:[]}),indicators:{serialize:()=>[]},getAnalysisUnavailable:()=>'',}) as unknown as ChartController,
  runtime:()=>({prepareBindings:()=>({changed:true,pauseAndCapture(){},stage(){},rollback(){},resume(){},abandon(){}})}) as unknown as ScriptBindingRuntime,
  pending(active){pending=active;calls.push('pending:'+active);},holdLinks:()=>({release(){calls.push('release');if(failRelease)throw Error('SYNTHETIC release rejected');}}),
  preparedInputs(){},failed(){calls.push('diagnostic');if(failDiagnostic)throw Error('SYNTHETIC diagnostic rejected');},
 });
 return{ids,calls,failSeals,coordinator,state:()=>({model,history,pending}),write(next:MultiChartState){model=next;history++;},
  failCleanup(){failDiagnostic=true;failRelease=true;},
  apply(action:(mark:()=>void,next:MultiChartState)=>unknown){const expected=model,next=structuredClone(model);return coordinator.apply({expectedState:expected,nextState:next,nextDatasets:[dataset],assertCurrent:()=>true,commitModel:mark=>action(mark,next)});}};
}

it('a retired marker cannot acknowledge a later transaction even during its active commit callback',async()=>{
 const f=fixture();let oldMark:undefined|(()=>void);
 await f.apply((mark,next)=>{f.write(next);oldMark=mark;mark();});
 const accepted=f.state().model;f.calls.length=0;
 await expect(f.apply(()=>{expect(()=>oldMark!()).toThrow(/retired/);})).rejects.toThrow(/acknowledge/);
 expect(f.state()).toEqual({model:accepted,history:1,pending:false});
 expect(f.calls.filter(call=>call.startsWith('rollback:'))).toEqual([...f.ids].reverse().map(id=>'rollback:'+id));
 expect(f.calls.some(call=>call.startsWith('seal:'))).toBe(false);
 await expect(f.apply((mark,next)=>{f.write(next);mark();})).resolves.toEqual({publicationErrors:[]});expect(f.state().history).toBe(2);
});

it('explicit acknowledgement governs a later false return and retires its marker permanently',async()=>{
 const f=fixture();let saved:undefined|(()=>void);
 const outcome=await f.apply((mark,next)=>{f.write(next);saved=mark;mark();return false;});
 expect(f.state().history).toBe(1);expect(f.state().pending).toBe(false);expect(outcome.publicationErrors).toEqual([]);
 expect(f.calls.filter(call=>call.startsWith('seal:'))).toEqual(f.ids.map(id=>'seal:'+id));
 expect(f.calls.some(call=>call.startsWith('rollback:'))).toBe(false);expect(()=>saved!()).toThrow(/retired/);
});

it('throwing failure conversion and diagnostics cannot skip sibling seals or cleanup after acknowledgement',async()=>{
 const f=fixture(),failure={[Symbol.toPrimitive](){throw Error('SYNTHETIC conversion failed');}};
 f.failSeals.set(f.ids[0],failure);f.failCleanup();
 const outcome=await f.apply((mark,next)=>{f.write(next);mark();throw failure;});
 expect(f.state().history).toBe(1);expect(f.state().pending).toBe(false);
 expect(f.calls.filter(call=>call.startsWith('seal:'))).toEqual(f.ids.map(id=>'seal:'+id));
 expect(f.calls.some(call=>call.startsWith('rollback:'))).toBe(false);expect(f.calls.slice(-3)).toEqual(['release','pending:false','diagnostic']);
 expect(outcome.publicationErrors.join(' ')).toContain('details are unavailable');expect(outcome.publicationErrors.join(' ')).toContain('diagnostic');
 expect(outcome.publicationErrors.join(' ')).toContain('release rejected');
});
