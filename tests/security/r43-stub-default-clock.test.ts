import {readFileSync} from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {runInNewContext} from 'node:vm';
import {expect,it,vi} from 'vitest';

const root=process.cwd(),logical=path.join(root,'electron/alpaca-stub.cjs'),realRequire=createRequire(path.join(root,'electron/main.cjs'));
const source=()=>readFileSync(process.env.LV_STUB_CLOCK_SOURCE??logical,'utf8');
const allowed=['./validation.cjs','./public-alpaca.cjs'];
const epochs={regular:Date.UTC(2026,9,20,16),closed:Date.UTC(2026,9,21,2)};
const options=(scenario:'regular'|'closed')=>({env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub',LV_ALPACA_CLOCK:scenario},packaged:true,profile:'C:/SYNTHETIC-temp/profile',tmpdir:'C:/SYNTHETIC-temp'});
function nodeStub(){
 const Module=realRequire('node:module'),module=new Module(logical),required:string[]=[];
 module.filename=logical;module.paths=Module._nodeModulePaths(path.dirname(logical));module.require=(name:string)=>{required.push(name);return realRequire(name);};module._compile(source(),logical);
 return{api:module.exports as any,required};
}
function vmStub(performance:unknown){
 const module={exports:{} as any},required:string[]=[],context={module,exports:module.exports,require:(name:string)=>{required.push(name);return realRequire(name);},Response,URL,Buffer,setTimeout,clearTimeout,setInterval,clearInterval};
 Object.defineProperty(context,'performance',typeof performance==='function'?{get:performance as()=>unknown}:{value:performance});
 runInNewContext(source(),context);return{api:module.exports,required};
}

it.each(['regular','closed'] as const)('actual default %s uses trusted Node monotonic time without an extra dependency',async scenario=>{
 const loaded=nodeStub(),transport=loaded.api.alpacaStubTransport(options(scenario));expect(transport.mode).toBe('synthetic');
 const first=transport.clock.now();expect(first).toBeGreaterThanOrEqual(epochs[scenario]);expect(transport.clock.sample().scenario).toBe(scenario);
 await new Promise(resolve=>setTimeout(resolve,5));const next=transport.clock.now();expect(next).toBeGreaterThan(first);expect(transport.clock.now()).toBeGreaterThanOrEqual(next);
 // This is the actual call dependency set, including clock creation and later samples, not a weakened package allowlist.
 expect(loaded.required).toEqual(allowed);
});
it.each(['regular','closed'] as const)('actual default %s reads the supplied trusted VM performance clock, not a module import',scenario=>{
 let elapsed=100;const now=vi.fn(()=>elapsed),loaded=vmStub({now}),transport=loaded.api.alpacaStubTransport(options(scenario));
 expect(transport.clock.sample()).toEqual({scenario,nowMs:epochs[scenario]});elapsed=2111;expect(transport.clock.now()).toBe(epochs[scenario]+2011);
 elapsed=50;expect(transport.clock.now()).toBe(epochs[scenario]+2011);expect(now).toHaveBeenCalled();expect(loaded.required).toEqual(allowed);
});
it('ordinary and blocked VM paths never read the performance default or add a clock dependency',async()=>{
 const read=vi.fn(()=>{throw Error('Clock must stay lazy');}),loaded=vmStub(read);
 const off=loaded.api.alpacaStubTransport({...options('regular'),env:{LV_ALPACA_CLOCK:'regular'}});expect(off).toBeNull();
 const blocked=loaded.api.alpacaStubTransport({...options('regular'),profile:'C:/SYNTHETIC-owner-profile'});expect(blocked.mode).toBe('blocked');expect(blocked.clock).toBeUndefined();
 const ordinary=loaded.api.alpacaStubTransport({...options('regular'),env:{LV_ALPACA_STUB:'synthetic',LV_EXE_HARNESS:'alpaca-stub'}});expect(ordinary.mode).toBe('synthetic');expect(ordinary.clock).toBeUndefined();
 expect(await ordinary.keys.status()).toEqual({configured:true,keyIdHint:'****STUB',encryption:true,synthetic:true});expect(read).not.toHaveBeenCalled();expect(loaded.required).toEqual(allowed);
});
