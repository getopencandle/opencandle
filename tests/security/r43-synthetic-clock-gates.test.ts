import {expect,it,vi} from 'vitest';
import {clockStubModule,REGULAR_EPOCH,CLOSED_EPOCH} from '../fixtures/r43-synthetic-clock';

const stub=clockStubModule(),profile='C:/clock-temp/throwaway',tmpdir='C:/clock-temp';
it.each([
 {env:{LV_ALPACA_CLOCK:'regular'},packaged:true,profile,tmpdir,mode:undefined},
 {env:{LV_ALPACA_STUB:'wrong',LV_ALPACA_CLOCK:'regular'},packaged:true,profile,tmpdir,mode:'blocked'},
 {env:{LV_ALPACA_STUB:'synthetic',LV_ALPACA_CLOCK:'regular'},packaged:true,profile,tmpdir,mode:'blocked'},
 {env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular'},packaged:true,profile:'C:/owner-profile',tmpdir,mode:'blocked'},
 {env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:'regular'},packaged:true,profile:tmpdir,tmpdir,mode:'blocked'},
])('clock selection cannot bypass the existing stub admission gates: %#',async input=>{
 const elapsed=vi.fn(()=>{throw Error('Clock must not start');}),transport=stub.alpacaStubTransport({...input,elapsedNow:elapsed});
 expect(transport?.mode).toBe(input.mode);expect(transport?.clock).toBeUndefined();expect(elapsed).not.toHaveBeenCalled();
 if(transport){expect((await transport.keys.status()).configured).toBe(false);await expect(transport.fetch('https://unused.invalid')).rejects.toThrow(/blocked/);}
});
it.each(['','Regular','wall','toString',123,null])('a malformed clock scenario blocks the stub rather than falling back: %s',scenario=>{
 const elapsed=vi.fn(()=>0),transport=stub.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:scenario},packaged:true,profile,tmpdir,elapsedNow:elapsed});
 expect(transport.mode).toBe('blocked');expect(transport.clock).toBeUndefined();expect(elapsed).not.toHaveBeenCalled();
});
it.each(['regular','closed'] as const)('only an admitted %s scenario creates a bounded, advancing clock',async scenario=>{
 let elapsed=5;const now=vi.fn(()=>0),transport=stub.alpacaStubTransport({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:scenario},packaged:true,profile,tmpdir,now,elapsedNow:()=>elapsed});
 expect(transport.mode).toBe('synthetic');expect(transport.clock.sample()).toEqual({scenario,nowMs:scenario==='regular'?REGULAR_EPOCH:CLOSED_EPOCH});
 elapsed=1025;expect(transport.clock.now()).toBe((scenario==='regular'?REGULAR_EPOCH:CLOSED_EPOCH)+1020);expect(now).not.toHaveBeenCalled();
 expect(await transport.keys.status()).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});
});
it('leaves ordinary and key-lifecycle stub transports and status shapes unchanged without an explicit clock',async()=>{
 const elapsed=vi.fn(()=>0);
 for(const mode of ['synthetic','synthetic-lifecycle']){const transport=stub.alpacaStubTransport({env:{LV_ALPACA_STUB:mode},packaged:false,profile,tmpdir,elapsedNow:elapsed});expect(transport.clock).toBeUndefined();expect(await transport.keys.status()).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});}
 expect(elapsed).not.toHaveBeenCalled();
});
