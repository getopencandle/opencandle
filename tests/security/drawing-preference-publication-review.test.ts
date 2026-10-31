import {expect,it,vi} from 'vitest';
import {connectDrawingPreferences,initialDrawingPreferences,type DrawingPreferences,type DrawingPreferencePort} from '../../src/ui/drawing-preferences';
import {createDrawingPreferencesPort} from '../../src/chart/drawing-preferences-port';
// Actual LV physical preference port and connection helper on a controlled
// snap/stay host. No native gesture, renderer, DOM or executable UI evidence.
function fixture(){
 let physical={magnet:'off' as 'off'|'weak'|'strong',stay:false},snap=()=>{},stay=()=>{},rejectApply=false;
 const port=createDrawingPreferencesPort({read:()=>physical,setMagnet:value=>{if(rejectApply)throw Error('Synthetic physical rollback failure');physical={...physical,magnet:value};snap();},setStay:value=>{physical={...physical,stay:value};stay();},onSnap:callback=>{snap=callback;return()=>{};},onStay:callback=>{stay=callback;return()=>{};}}),base={...initialDrawingPreferences},published:DrawingPreferences[]=[],errors:unknown[]=[];
 const emit=(value:typeof physical)=>{physical={...value};snap();stay();};return{port,base,published,errors,emit,physical:()=>physical,failApply:()=>{rejectApply=true;}};
}
it.each(['false','throw'])('rejected %s publication rolls back physical state and retains the confirmed remembered strength for later events',kind=>{
 const s=fixture();let first=true;const off=connectDrawingPreferences(s.port,()=>s.base,value=>{s.published.push(value);if(first){first=false;if(kind==='throw')throw Error('Synthetic rejected preference publication');return false;}return true;},error=>s.errors.push(error));try{s.emit({magnet:'strong',stay:true});expect(s.physical()).toEqual({magnet:'off',stay:false});expect(s.base).toEqual(initialDrawingPreferences);expect(s.errors.length).toBeGreaterThan(0);s.emit({magnet:'off',stay:true});expect(s.published.at(-1)).toEqual({...initialDrawingPreferences,stay:true});}finally{off();s.port.dispose();}
});
it('failed physical rollback is separately diagnostic and cannot silently become accepted remembered strength',()=>{
 const s=fixture();let first=true;const off=connectDrawingPreferences(s.port,()=>s.base,value=>{s.published.push(value);if(first){first=false;s.failApply();return false;}return true;},error=>s.errors.push(error));try{s.emit({magnet:'strong',stay:true});expect(s.errors[0]).toBeInstanceOf(AggregateError);expect(String(s.errors[0])).toMatch(/recovery.*incomplete/i);expect((s.errors[0] as AggregateError).errors.map(String).join(' ')).toContain('Synthetic physical rollback failure');expect(s.base).toEqual(initialDrawingPreferences);s.emit({magnet:'off',stay:true});expect(s.published.at(-1)!.lastEnabledMagnet).toBe('weak');}finally{off();s.port.dispose();}
});
it('a throwing unsubscribe retires the connection before its retained physical callback can publish again',()=>{
 const s=fixture(),notify=vi.fn(),wrapper:DrawingPreferencePort={get:s.port.get,apply:s.port.apply,subscribe:callback=>{s.port.subscribe(callback);return()=>{throw Error('Synthetic physical unsubscribe failure');};}},off=connectDrawingPreferences(wrapper,()=>s.base,notify,error=>s.errors.push(error));expect(()=>off()).toThrow('unsubscribe failure');s.emit({magnet:'strong',stay:true});expect(notify).not.toHaveBeenCalled();expect(s.errors).toEqual([]);s.port.dispose();
});
