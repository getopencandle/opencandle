import {expect,it,vi} from 'vitest';
import {removeObjectsAsOneStep} from '../../src/ui/object-tree-removal';

// Multi-removal helper contract with a SYNTHETIC port: the hold is opened before any removal, released (publishing) exactly
// once after the drawing removal, and accepted removals publish even when a later step fails.
function port(fail?:string){const trace:string[]=[];return{trace,beginExternalTransaction:vi.fn(()=>{trace.push('hold');return{release:(publish:boolean)=>{trace.push('release:'+publish);}};}),remove:vi.fn((id:string)=>{if(id===fail)throw Error('Synthetic removal failure');trace.push('remove:'+id);})};}
it('holds indicator publication around every removal and releases it once, after the drawings',()=>{
 const p=port();removeObjectsAsOneStep(p,['a','b'],()=>p.trace.push('drawings'));expect(p.trace).toEqual(['hold','remove:a','remove:b','drawings','release:true']);
 const q=port();removeObjectsAsOneStep(q,['a','b']);expect(q.trace).toEqual(['hold','remove:a','remove:b','release:true']);
});
it('a failed removal still publishes the accepted ones and then reports the failure',()=>{
 const p=port('b'),drawings=vi.fn();expect(()=>removeObjectsAsOneStep(p,['a','b'],drawings)).toThrow('Synthetic removal failure');
 expect(p.trace).toEqual(['hold','remove:a','release:true']);expect(drawings).not.toHaveBeenCalled();
 const q=port();expect(()=>removeObjectsAsOneStep(q,['a'],()=>{throw Error('Synthetic drawing failure');})).toThrow('Synthetic drawing failure');expect(q.trace).toEqual(['hold','remove:a','release:true']);
});
// A partial acceptance is still verified. The confirmation runs after the publication whenever a removal was
// attempted, also when a later removal, the drawing removal or the publication failed; its own failure is reported too.
it('BFABC-R5: the capture confirmation runs after the publication on success and after every partial failure',()=>{
 const ok=port(),okConfirm=vi.fn((accepted:readonly string[])=>{ok.trace.push('confirm:'+accepted.join(','));});
 removeObjectsAsOneStep(ok,['a','b'],()=>ok.trace.push('drawings'),okConfirm);expect(ok.trace).toEqual(['hold','remove:a','remove:b','drawings','release:true','confirm:a,b']);
 const drawingFails=port(),afterDrawing=vi.fn((accepted:readonly string[])=>{drawingFails.trace.push('confirm:'+accepted.join(','));});
 expect(()=>removeObjectsAsOneStep(drawingFails,['a','b'],()=>{throw Error('Synthetic drawing failure');},afterDrawing)).toThrow('Synthetic drawing failure');
 expect(drawingFails.trace).toEqual(['hold','remove:a','remove:b','release:true','confirm:a,b']);
 const secondFails=port('b'),afterSecond=vi.fn((accepted:readonly string[])=>{secondFails.trace.push('confirm:'+accepted.join(','));});
 expect(()=>removeObjectsAsOneStep(secondFails,['a','b'],vi.fn(),afterSecond)).toThrow('Synthetic removal failure');
 expect(secondFails.trace).toEqual(['hold','remove:a','release:true','confirm:a']);
 // A removal that threw may have changed native state before throwing: it is verified as well.
 const firstFails=port('a'),afterFirst=vi.fn();expect(()=>removeObjectsAsOneStep(firstFails,['a'],undefined,afterFirst)).toThrow('Synthetic removal failure');expect(afterFirst).toHaveBeenCalledWith([]);
 // Drawings only: no indicator was touched, so there is no indicator capture to confirm.
 const drawingsOnly=port(),none=vi.fn();removeObjectsAsOneStep(drawingsOnly,[],()=>drawingsOnly.trace.push('drawings'),none);expect(none).not.toHaveBeenCalled();
});
it('BFABC-R5: a failed confirmation after a partial failure is reported with the original failure',()=>{
 const p=port();let caught:unknown;
 try{removeObjectsAsOneStep(p,['a'],()=>{throw Error('Synthetic drawing failure');},()=>{throw Error('Synthetic quarantine');});}catch(error){caught=error;}
 expect(caught).toBeInstanceOf(AggregateError);expect((caught as AggregateError).errors.map(String)).toEqual(['Error: Synthetic drawing failure','Error: Synthetic quarantine']);
 expect(p.trace).toEqual(['hold','remove:a','release:true']);
 expect(()=>removeObjectsAsOneStep(port(),['a'],undefined,()=>{throw Error('Synthetic mismatch');})).toThrow('Synthetic mismatch');
});
