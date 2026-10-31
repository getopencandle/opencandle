import {it,expect} from 'vitest';
import {connectDrawingPreferences,initialDrawingPreferences,reconcileDrawingPreferences,restoreDrawingPreferences,type DrawingPreferences,type PhysicalDrawingPreferences} from '../../src/ui/drawing-preferences';
it('retains the last enabled strength while off and rejects malformed or contradictory saved values',()=>{
 let state=reconcileDrawingPreferences(initialDrawingPreferences,{magnet:'strong',stay:true});state=reconcileDrawingPreferences(state,{magnet:'off',stay:true});expect(state).toEqual({schemaVersion:1,magnet:'off',lastEnabledMagnet:'strong',stay:true});expect(restoreDrawingPreferences(JSON.parse(JSON.stringify(state)))).toEqual(state);
 for(const bad of [{magnet:'nearest'},{stay:'false'},{schemaVersion:2},{magnet:'strong',lastEnabledMagnet:'weak'},{unexpected:true}])expect(()=>restoreDrawingPreferences({...state,...bad})).toThrow();
});
it('applies stored preferences without a commit, accepts genuine events once, and ignores stale callbacks after detach',()=>{
 let state:DrawingPreferences={...initialDrawingPreferences},notify:(value:PhysicalDrawingPreferences)=>void=()=>{},commits=0,offCount=0;const applied:PhysicalDrawingPreferences[]=[];
 const port={get:()=>({magnet:state.magnet,stay:state.stay}),apply:(value:PhysicalDrawingPreferences)=>applied.push(value),subscribe:(fn:typeof notify)=>{notify=fn;return()=>{offCount++;};}};
 const errors:unknown[]=[];const off=connectDrawingPreferences(port,()=>state,next=>{state=next;commits++;},error=>errors.push(error));expect(applied).toHaveLength(1);expect(commits).toBe(0);
 notify({magnet:'strong',stay:false});notify({magnet:'strong',stay:false});expect(commits).toBe(1);expect(state.lastEnabledMagnet).toBe('strong');notify({magnet:'off',stay:true});expect(state.lastEnabledMagnet).toBe('strong');expect(commits).toBe(2);
 notify({magnet:'invalid',stay:true} as any);expect(errors).toHaveLength(1);expect(commits).toBe(2);off();notify({magnet:'weak',stay:false});expect(commits).toBe(2);expect(offCount).toBe(1);
});
