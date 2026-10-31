import {expect,it,vi} from 'vitest';
import {confirmAnalysisPublication} from '../../src/ui/analysis-capture-confirmation';
import {AnalysisPublicationError} from '../../src/chart/analysis-publication';
it('matching saved/native indicator records refresh only after stable readback and preserve raw numbers',()=>{
 const rows=[{id:'sma',inputs:{length:3},values:[null,1/3]}],before=structuredClone(rows),refresh=vi.fn(),quarantine=vi.fn();let guards=0;
 expect(confirmAnalysisPublication('Indicator',{assertCurrent(){guards++;},readSaved:()=>rows,readNative:()=>structuredClone(rows),refresh,quarantine})).toBe(true);
 expect(guards).toBe(5);expect(rows).toEqual(before);expect(refresh).toHaveBeenCalledOnce();expect(quarantine).not.toHaveBeenCalled();
});
it('mismatched native accepted comparison records quarantine once and cannot report refresh success',()=>{
 const refresh=vi.fn(),quarantine=vi.fn();expect(()=>confirmAnalysisPublication('Comparison',{assertCurrent(){},readSaved:()=>[{color:'#000000'}],readNative:()=>[{color:'#ffffff'}],refresh,quarantine})).toThrow(AnalysisPublicationError);
 expect(refresh).not.toHaveBeenCalled();expect(quarantine).toHaveBeenCalledOnce();expect(quarantine.mock.calls[0][0]).toMatchObject({accepted:true,recoveryRequired:true});
});
it('a retired owner after native reads cannot quarantine its replacement or refresh stale rows',()=>{
 let current=true;const refresh=vi.fn(),quarantine=vi.fn();expect(()=>confirmAnalysisPublication('Indicator',{assertCurrent(){if(!current)throw Error('Retired owner');},readSaved:()=>[],readNative:()=>{current=false;return[{id:'old'}];},refresh,quarantine})).toThrow('Retired owner');expect(refresh).not.toHaveBeenCalled();expect(quarantine).not.toHaveBeenCalled();
});
it('final saved-read changes and diagnostic failures retain their accepted-failure causes',()=>{
 let reads=0;const diagnostic=Error('Literal quarantine diagnostic failure');let error:unknown;
 try{confirmAnalysisPublication('Indicator',{assertCurrent(){},readSaved:()=>++reads===1?[]:[{id:'different'}],readNative:()=>[],refresh(){throw Error('Must not refresh');},quarantine(){throw diagnostic;}});}catch(cause){error=cause;}
 expect(error).toBeInstanceOf(AnalysisPublicationError);expect((error as AnalysisPublicationError).causes).toHaveLength(2);expect((error as AnalysisPublicationError).causes[1]).toBe(diagnostic);
});
