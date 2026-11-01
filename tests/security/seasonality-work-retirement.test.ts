import {afterEach,expect,it,vi} from 'vitest';
import {createBuiltinPresentationPort,BUILTIN_SEASONALITY_PREPARATION_COST,type BuiltinPresentationControl} from '../../src/chart/builtin-presentation-proof';
import type {SeasonalityResult} from '../../src/domain/indicators-ext/seasonality-types';
import {INDICATOR_WORK_LIMIT,INDICATOR_OUTPUT_LIMIT,INDICATOR_BATCH_WORK_LIMIT,INDICATOR_BATCH_OUTPUT_LIMIT} from '../../src/chart/indicator-settings';

// Actual aggregate source accounting, without manufacturing a consumed source,
// group, native acknowledgement or private work witness. Genuine positive
// retirement requires the separate full live-C constructor integration cases.
const close:(()=>void)[]=[];
afterEach(async()=>{const errors:unknown[]=[];for(const release of close.splice(0).reverse())try{release();}catch(error){errors.push(error);}for(let i=0;i<12;i++)await Promise.resolve();if(errors.length)throw new AggregateError(errors,'Work retirement cleanup failed.');});
const tick=async()=>{for(let i=0;i<12;i++)await Promise.resolve();};
const budget=Object.freeze({operations:0,numericSlots:0});
const cost=(operations:number,numericSlots=1408)=>({operations,numericSlots,pendingSlots:0});
const supplied={status:'ready'} as unknown as Readonly<SeasonalityResult>;
// The shared batch caps are larger than one study's limits (INDICATOR_BATCH_*). An accepted unrelated source holds the
// difference, so exactly one study's worth of headroom (20M operations, 2M slots) is left and the amounts below keep
// testing the cap edge.
function pipeline(){let control!:BuiltinPresentationControl;createBuiltinPresentationPort({},undefined,undefined,value=>{control=value;return{};});close.push(()=>control.dispose());
 const filler=control.reserveSource({},()=>true,budget,{operations:INDICATOR_BATCH_WORK_LIMIT-INDICATOR_WORK_LIMIT,numericSlots:INDICATOR_BATCH_OUTPUT_LIMIT-INDICATOR_OUTPUT_LIMIT,pendingSlots:0});expect(filler).not.toBeNull();filler!.accept();close.push(()=>filler!.release());
 return control;}
function accepted(control:BuiltinPresentationControl,armed=true,slots=1408){
 const model={},owned=vi.fn(()=>true),token=control.reserveSource(model,owned,budget,cost(18000000,slots));expect(token).not.toBeNull();
 const scene=armed?control.armSeasonalityPreparation(model,token!):null;if(scene)close.push(()=>scene.retire());token!.accept();return{model,owned,token:token!,scene};
}
const blocked=(control:BuiltinPresentationControl)=>expect(control.reserveSource({},()=>true,budget,cost(3000000))).toBeNull();
it('a supplied ready-shaped result cannot retire the actual accepted18M peak or fund another3M',async()=>{
 const control=pipeline(),a=accepted(control);blocked(control);control.retireSeasonalityPreparationWork(a.model,supplied,a.token);await tick();blocked(control);expect(a.token.signal.aborted).toBe(false);
 a.scene!.retire();a.token.release();await tick();expect(a.token.signal.aborted).toBe(true);expect(control.reserveSource({},()=>true,budget,cost(3000000))).not.toBeNull();
});
it('copied reservations, foreign models and proxy result headers cannot acquire retirement or run property traps',async()=>{
 const control=pipeline(),a=accepted(control),trap=vi.fn(()=>{throw Error('Foreign retirement property.');}),foreign=new Proxy({},{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap});
 control.retireSeasonalityPreparationWork({},supplied,a.token);control.retireSeasonalityPreparationWork(a.model,supplied,{...a.token});control.retireSeasonalityPreparationWork(a.model,foreign as Readonly<SeasonalityResult>,a.token);await tick();expect(trap).not.toHaveBeenCalled();blocked(control);
});
it('repeated ineligible retirement is rejected before supplied owner callbacks and creates no headroom',async()=>{
 const control=pipeline(),a=accepted(control);a.owned.mockClear();for(let i=0;i<1000;i++)control.retireSeasonalityPreparationWork(a.model,supplied,a.token);await tick();expect(a.owned).not.toHaveBeenCalled();blocked(control);
});
it('the legacy unarmed local/timeframe source retains its original full work balance',async()=>{
 const control=pipeline(),a=accepted(control,false);control.retireSeasonalityPreparationWork(a.model,supplied,a.token);await tick();blocked(control);a.token.release();expect(a.token.signal.aborted).toBe(true);
});
it('retirement attempts after actual source release cannot double-debit or fund unrelated21M',async()=>{
 const control=pipeline(),a=accepted(control);a.scene!.retire();a.token.release();await tick();expect(a.token.signal.aborted).toBe(true);
 for(let i=0;i<20;i++)control.retireSeasonalityPreparationWork(a.model,supplied,a.token);await tick();expect(control.reserveSource({},()=>true,budget,cost(12000000))).not.toBeNull();expect(control.reserveSource({},()=>true,budget,cost(9000000))).toBeNull();
});
it('work retirement never grants storage credit for a still-owned numeric graph',async()=>{
 const control=pipeline(),a=accepted(control,true,1000000);control.retireSeasonalityPreparationWork(a.model,supplied,a.token);await tick();expect(control.reserveSource({},()=>true,budget,cost(1,1000001))).toBeNull();expect(BUILTIN_SEASONALITY_PREPARATION_COST.numericSlots).toBe(1408);
});
it('direct calls to the internal queued target cannot mature a supplied ticket or read proxy fields',async()=>{
 const control=pipeline(),a=accepted(control),trap=vi.fn(()=>{throw Error('Foreign queued ticket property.');}),foreign=new Proxy({},{get:trap,getOwnPropertyDescriptor:trap,getPrototypeOf:trap});
 const target=control as BuiltinPresentationControl&{retireUnwoundSeasonalityWork(ticket:object):void};
 target.retireUnwoundSeasonalityWork({});target.retireUnwoundSeasonalityWork(a.token);target.retireUnwoundSeasonalityWork(foreign);await tick();expect(trap).not.toHaveBeenCalled();blocked(control);expect(a.token.signal.aborted).toBe(false);
});
