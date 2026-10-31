import {expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {priceScaleHarness} from './price-scale-harness';
import {capturePriceScaleDisplayPrecision} from '../../src/chart/price-scale-port';
import {precisionFormatter,derivedPriceDecimals} from '../../src/chart/symbol-precision';
import {tickDecimals} from '../../src/chart/axis-labels';
import {sourceTickSize} from '../../src/chart/adapter';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {isSymbolMathDatasetId} from '../../src/domain/symbol-math-live';
import {fixtureDataset} from '../../src/domain/fixtures';

/** Actual adapter format-body with controlled private lifecycle/main-reference boundary, not complete adapter construction. */
function adapterFormat(port:object){
 const source=readFileSync(resolve(process.env.LV_SCRIPT_PRICE_SCALE_SOURCE_ROOT??'.','src/chart/adapter.ts'),'utf8'),from=source.indexOf('capturePriceScaleFormat(){'),to=source.indexOf('},capture(expected,consumed,renew){',from);if(from<0||to<0)throw Error('Actual adapter format method was not found.');
 const method=source.slice(from,to+1),dataset=fixtureDataset('GME',3),initial=sourceContextForDataset(dataset);
 const build=stripTypeScriptTypes(`(function(capturePriceScaleDisplayPrecision,precisionFormatter,derivedPriceDecimals,tickDecimals,sourceTickSize,isSymbolMathDatasetId,port,initial){let axisLabelPort=port,currentSource=initial,vwapSourceEpoch={},currentExecutionIdentity='ordinary',requestedStyle='candles',disposed=false,analysisUnavailable=null,analysisPending=0,marketUpdating=false;const marketQueue={isPending:()=>false};let main=null;const controller={captureSeriesReadout:()=>main};const actual={${method}};return{capture:()=>actual.capturePriceScaleFormat(),replace(){currentSource={...currentSource};vwapSourceEpoch={};},math(value){currentSource={...currentSource,datasetId:'live:lv-symbol-math:SYNTHETIC'};main=value;},main(value){main=value;},close(){disposed=true;}};})`,{mode:'strip'});
 return new Function('return '+build)()(capturePriceScaleDisplayPrecision,precisionFormatter,derivedPriceDecimals,tickDecimals,sourceTickSize,isSymbolMathDatasetId,port,initial) as {capture():{format(value:number):string;assertCurrent():void}|null;replace():void;math(value:unknown):void;main(value:unknown):void;close():void};
}
it('unseen precision two four two changes terminally retire the first private receipt',()=>{
 const h=priceScaleHarness();try{h.port.setPrecision('2');const receipt=capturePriceScaleDisplayPrecision(h.port)!;let calls=0;const off=h.port.subscribe(()=>calls++);h.port.setPrecision('4');h.port.setPrecision('2');expect(()=>receipt.assertCurrent()).toThrow();expect(capturePriceScaleDisplayPrecision(h.port)!.precision).toBe('2');off();expect(calls).toBe(0);}finally{h.port.dispose();}
});
it('native precision failure preserves the thrown error and withholds new receipts until successful real sync',()=>{
 const h=priceScaleHarness();try{const before=capturePriceScaleDisplayPrecision(h.port)!,old=h.renderer.setPricePrecision;h.renderer.setPricePrecision=()=>{throw Error('Synthetic native precision failed');};expect(()=>h.port.setPrecision('4')).toThrow('Synthetic native precision failed');expect(()=>before.assertCurrent()).toThrow();expect(()=>capturePriceScaleDisplayPrecision(h.port)).toThrow(/waiting/);h.renderer.setPricePrecision=old;h.port.refreshPrecision();expect(capturePriceScaleDisplayPrecision(h.port)!.precision).toBe('4');}finally{h.port.dispose();}
});
it('private precision observation happens before native callback reentry',()=>{
 const h=priceScaleHarness();try{h.port.setPrecision('2');const old=capturePriceScaleDisplayPrecision(h.port)!,native=h.renderer.setPricePrecision;let rejected=false;h.renderer.setPricePrecision=function(value:number){try{old.assertCurrent();}catch{rejected=true;}return native.call(this,value);};h.port.setPrecision('4');expect(rejected).toBe(true);expect(capturePriceScaleDisplayPrecision(h.port)!.precision).toBe('4');}finally{h.port.dispose();}
});
it('copied and disposed price ports cannot supply precision authority',()=>{
 const h=priceScaleHarness();expect(capturePriceScaleDisplayPrecision({...h.port})).toBeNull();const old=capturePriceScaleDisplayPrecision(h.port)!;h.port.dispose();expect(capturePriceScaleDisplayPrecision(h.port)).toBeNull();expect(()=>old.assertCurrent()).toThrow();
});
it.each([['2','16.13'],['4','16.1250'],['integer','16'],['1/4','16.25']] as const)('actual adapter display format honors stored precision %s', (precision,text)=>{
 const h=priceScaleHarness();try{h.port.setPrecision(precision);const actual=adapterFormat(h.port),receipt=actual.capture()!;expect(receipt.format(16.125)).toBe(text);actual.replace();expect(()=>receipt.format(16.125)).toThrow();}finally{h.port.dispose();}
});
it('actual adapter refuses missing symbol-math main reference rather than borrowing a raw tail',()=>{
 const h=priceScaleHarness();try{const actual=adapterFormat(h.port);actual.math({state:'unavailable'});expect(actual.capture()).toBeNull();}finally{h.port.dispose();}
});
it('actual adapter uses one accepted main close for default symbol-math display and rechecks its lease',()=>{
 const h=priceScaleHarness();try{const actual=adapterFormat(h.port);let calls=0,current=true;actual.math({state:'ready',assertCurrent(){if(!current)throw Error('Main source replaced');},readPosition(address:unknown){expect(address).toEqual({kind:'latest'});calls++;return{bar:{close:1.2345}};}});const receipt=actual.capture()!;expect(receipt.format(16.125)).toBe('16.1250');expect(receipt.format(19)).toBe('19.0000');expect(calls).toBe(1);current=false;expect(()=>receipt.format(16.125)).toThrow();}finally{h.port.dispose();}
});
it('an unread receipt cannot revive after same-precision native failure and same-precision recovery',()=>{
 const h=priceScaleHarness();try{h.port.setPrecision('2');const old=capturePriceScaleDisplayPrecision(h.port)!,native=h.renderer.setPricePrecision;h.renderer.setPricePrecision=()=>{throw Error('Synthetic same-value native failure');};expect(()=>h.port.refreshPrecision()).toThrow('Synthetic same-value native failure');h.renderer.setPricePrecision=native;h.port.refreshPrecision();expect(capturePriceScaleDisplayPrecision(h.port)!.precision).toBe('2');expect(()=>old.assertCurrent()).toThrow();}finally{h.port.dispose();}
});
it('a late failed outer same-precision sync preserves a newer successful same-precision receipt',()=>{
 const h=priceScaleHarness();try{h.port.setPrecision('2');const native=h.renderer.setPricePrecision;let nested=false;const saved:{descendant:ReturnType<typeof capturePriceScaleDisplayPrecision>}={descendant:null};h.renderer.setPricePrecision=function(value:number){if(!nested){nested=true;h.port.refreshPrecision();saved.descendant=capturePriceScaleDisplayPrecision(h.port);throw Error('Synthetic late outer failure');}return native.call(this,value);};expect(()=>h.port.refreshPrecision()).toThrow('Synthetic late outer failure');expect(saved.descendant).not.toBeNull();expect(()=>saved.descendant!.assertCurrent()).not.toThrow();expect(capturePriceScaleDisplayPrecision(h.port)!.precision).toBe('2');}finally{h.port.dispose();}
});
