import {afterEach,expect,it,vi} from 'vitest';
import {scriptPresentationFixture,settle} from '../fixtures/script-presentation';
import {createScriptPresentationPort,retireScriptPresentationPort,scriptPriceScaleControlsAvailable} from '../../src/chart/script-presentation-proof';

// Descriptive capability tests. A true result never asserts current numeric/native readiness.
const owned:ReturnType<typeof scriptPresentationFixture>[]=[],releases:Array<()=>void>=[];
afterEach(()=>{vi.restoreAllMocks();for(const close of releases.splice(0).reverse())close();for(const f of owned.splice(0).reverse())f.close();});
function fixture(options:Parameters<typeof scriptPresentationFixture>[0]={}){const f=scriptPresentationFixture(options);owned.push(f);return f;}
it('a genuine chart-bound producer supports controls even before any current plotted value exists',()=>{
 const f=fixture({host:false});expect(f.port.list()).toEqual([]);expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);expect(f.port.captureReadout!(f.bindings[0].id).state).toBe('unavailable');expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);
});
it('unknown and genuine legacy two-argument ports have no chart-bound control capability',()=>{
 const legacy=createScriptPresentationPort(undefined,control=>({dispose:()=>control.dispose()}));releases.push(()=>legacy.dispose());expect(scriptPriceScaleControlsAvailable(legacy)).toBe(false);expect(scriptPriceScaleControlsAvailable({})).toBe(false);
});
it('copied proxy and getter-bearing public data cannot claim the private capability or trigger callbacks',()=>{
 const f=fixture();let reads=0;const fake={get captureReadout(){reads++;throw Error('Public properties are not capability proof');},get presentationMetadata(){reads++;throw Error('No metadata fallback');}};
 for(const port of [{...f.port},new Proxy(f.port,{get(){reads++;throw Error('No proxy fields');}}),fake])expect(scriptPriceScaleControlsAvailable(port)).toBe(false);expect(reads).toBe(0);
});
it('disposing the actual producer terminally removes its control capability',()=>{
 const f=fixture();expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);f.close();expect(scriptPriceScaleControlsAvailable(f.port)).toBe(false);expect(scriptPriceScaleControlsAvailable({...f.port})).toBe(false);
});
it('model retirement and hidden output preserve capability without claiming a current endpoint',async()=>{
 const f=fixture();f.runtime().update(f.context());f.complete();await settle();expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);f.port.show(f.bindings[0].id,false);expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);retireScriptPresentationPort(f.port);expect(f.port.captureReadout!(f.bindings[0].id).state).toBe('unavailable');expect(scriptPriceScaleControlsAvailable(f.port)).toBe(true);
});
it('one thousand capability lookups read no metadata readout source native graph format or worker data',()=>{
 const f=fixture(),metadata=vi.spyOn(f.port,'presentationMetadata'),readout=vi.spyOn(f.port,'captureReadout'),list=vi.spyOn(f.port,'list'),clone=vi.spyOn(globalThis,'structuredClone'),json=vi.spyOn(JSON,'stringify'),bars=f.barReads,descriptor=Object.getOwnPropertyDescriptor(f.chart,'orchestrator')!;let nativeReads=0;const values:boolean[]=[];
 Object.defineProperty(f.chart,'orchestrator',{configurable:true,get(){nativeReads++;throw Error('Capability cannot inspect native membership');}});
 try{for(let index=0;index<1000;index++)values.push(scriptPriceScaleControlsAvailable(f.port));expect(values.every(Boolean)).toBe(true);expect(nativeReads).toBe(0);expect(metadata).not.toHaveBeenCalled();expect(readout).not.toHaveBeenCalled();expect(list).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();expect(json).not.toHaveBeenCalled();expect(f.barReads).toBe(bars);expect(f.pending).toHaveLength(0);}finally{Object.defineProperty(f.chart,'orchestrator',descriptor);}
});
