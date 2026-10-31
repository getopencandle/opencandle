import {afterEach,expect,it,vi} from 'vitest';
import {scriptPriceScaleFixture} from '../fixtures/script-price-scale';
import {acquireScriptPriceScaleSource,readScriptReadoutPosition} from '../../src/chart/script-presentation-proof';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {scriptPriceScaleAdmission} from '../../src/chart/indicator-display';

const owned:Array<{dispose():void}>=[];afterEach(()=>{for(const h of owned.splice(0))h.dispose();});
async function fixture(style='candles'){const h=await scriptPriceScaleFixture(style);owned.push(h);return h;}
const constant='({onBar(ctx){ctx.plot("First",16);ctx.plot("Second",19);}})';
it('genuine accepted worker values are the two scale endpoints and not cursor values',async()=>{
 const h=await fixture();await h.start(constant);const source=acquireScriptPriceScaleSource(h.port,h.chart),header=source.header(),frame=source.read(header);expect(header).toEqual({ownerCount:1,plotCount:2});expect(frame.owners[0].plots.map(row=>row.value)).toEqual([16,19]);expect(h.paint().map(row=>row.values[0]).sort()).toEqual(['16.00','19.00']);
});
it('a missing last observation withholds its endpoint instead of searching earlier output',async()=>{
 const h=await fixture();await h.start('({onBar(ctx){if(ctx.index===0)ctx.plot("Sparse",16);}})');expect(acquireScriptPriceScaleSource(h.port,h.chart).header()).toEqual({ownerCount:1,plotCount:0});expect(h.paint()).toEqual([]);
});
it('an explicit null tail does not reuse the prior non-null endpoint',async()=>{
 const h=await fixture();await h.start('({onBar(ctx){ctx.plot("Null tail",ctx.index===0?16:null);}})');expect(h.paint()).toEqual([]);
});
it('logical duplicate event times select the last confirmed ordinal and ignore projections',async()=>{
 const h=await fixture('renko');await h.start('({onBar(ctx){ctx.plot("Ordinal",ctx.index+1);}})');const view=readScriptReadoutPosition(h.view(),{kind:'latest'}),source=acquireScriptPriceScaleSource(h.port,h.chart),frame=source.read(source.header());expect(view.logicalIndex).toBeGreaterThan(0);expect(frame.owners[0].plots[0].value).toBe(view.logicalIndex!+1);expect(frame.owners[0].plots[0].point).toBe(h.record().model.series[0].points[view.logicalIndex!]);
});
it('priceScale controls only scale candidates while legend and dataWindow remain independent',async()=>{
 const h=await fixture();await h.start(constant);const rows=h.port.presentationMetadata!()[0].plots;const styles=Object.fromEntries(rows.map((row,index)=>[row.id,{...defaultPlotStyle('sma',row.id,index),color:row.color,priceScale:index===1,legend:index===0,dataWindow:index===0}]));h.port.replaceStyles(h.binding.id,styles);
 expect(h.paint().map(row=>row.values[0])).toEqual(['19.00']);expect(readScriptReadoutPosition(h.view(),{kind:'latest'}).plots.map(row=>row.value)).toEqual([16]);
});
it('whole binding and per-plot hiding suppress candidates and Show restores only current native output',async()=>{
 const h=await fixture();await h.start(constant);const rows=h.port.presentationMetadata!()[0].renderedPlots;h.port.replaceStyles(h.binding.id,{...rows,[Object.keys(rows)[0]]:{...Object.values(rows)[0],visible:false}});expect(h.paint().map(row=>row.values[0])).toEqual(['19.00']);h.port.show(h.binding.id,false);expect(h.paint()).toEqual([]);h.port.show(h.binding.id,true);expect(h.paint().map(row=>row.values[0])).toEqual(['19.00']);
});
it('copied proxy and getter-bearing port data cannot acquire script display authority',async()=>{
 const h=await fixture();await h.start(constant);let reads=0;for(const port of [{...h.port},new Proxy(h.port,{get(){reads++;throw Error('Unexpected public read');}}),{get captureReadout(){reads++;return h.port.captureReadout;}}])expect(()=>acquireScriptPriceScaleSource(port,h.chart)).toThrow();expect(reads).toBe(0);
});
it('a copied header or foreign chart cannot materialize accepted candidates',async()=>{
 const h=await fixture();await h.start(constant);const source=acquireScriptPriceScaleSource(h.port,h.chart),header=source.header();expect(()=>source.read({...header})).toThrow();expect(()=>acquireScriptPriceScaleSource(h.port,{}).read(header)).toThrow();
});
it('source replacement and A B A style changes terminally retire captured headers and frames',async()=>{
 const h=await fixture();await h.start(constant);const source=acquireScriptPriceScaleSource(h.port,h.chart),header=source.header(),frame=source.read(header),styles=h.port.presentationMetadata!()[0].renderedPlots;h.port.replaceStyles(h.binding.id,{...styles,[Object.keys(styles)[0]]:{...Object.values(styles)[0],priceScale:false}});h.port.replaceStyles(h.binding.id,styles);expect(()=>frame.assertCurrent()).toThrow();expect(()=>source.read(header)).toThrow();const next=source.read(source.header());h.stage(h.rows.map(row=>({...row,close:row.close+1})));expect(()=>next.assertCurrent()).toThrow();
});
it('repeated endpoint painting never calls script ctx.bars or makes a new worker request',async()=>{
 const h=await fixture();await h.start(constant);const model=h.instances.get(h.record().id)!,bars=vi.spyOn(model.ctx!,'bars'),calls=h.workerCalls();for(let index=0;index<100;index++)h.paint();expect(bars).not.toHaveBeenCalled();expect(h.workerCalls()).toBe(calls);
});
it('retained source methods cannot read a disposed producer',async()=>{
 const h=await fixture();await h.start(constant);const source=acquireScriptPriceScaleSource(h.port,h.chart),header=source.header();h.dispose();expect(()=>source.header()).toThrow();expect(()=>source.read(header)).toThrow();
});
it('two genuine jobs with equal human plot titles keep distinct accepted native series and flags',async()=>{
 const h=await fixture();await h.start('({onBar(ctx){ctx.plot("Same",16);}})');const other={...h.binding,id:'SYNTHETIC-second-script',source:'({onBar(ctx){ctx.plot("Same",19);}})'},bindings=[h.binding,other],context=h.context();
 await new Promise<void>((resolve,reject)=>{let done=false;const off=h.port.subscribe(()=>{if(done)return;try{if(h.port.captureReadout!(other.id).state==='ready'){done=true;off();resolve();}}catch(error){done=true;off();reject(error);}});try{h.runtime.update({...context,bindings,csvJobOwner:{get input(){return h.input;},get execution(){return h.input.execution;},assertCurrent(row){if(!bindings.some(binding=>binding.id===row.id&&binding.source===row.source))throw Error('Synthetic binding replaced.');}}});}catch(error){done=true;off();reject(error);}});
 const source=acquireScriptPriceScaleSource(h.port,h.chart),frame=source.read(source.header());expect(frame.owners).toHaveLength(2);expect(frame.owners.flatMap(owner=>owner.plots.map(plot=>plot.title))).toEqual(['Same','Same']);expect(frame.owners[0].plots[0].native).not.toBe(frame.owners[1].plots[0].native);expect(h.paint().map(row=>row.values[0]).sort()).toEqual(['16.00','19.00']);
 const style=h.port.presentationMetadata!().find(row=>row.id===other.id)!.renderedPlots;h.port.replaceStyles(other.id,Object.fromEntries(Object.entries(style).map(([id,value])=>[id,{...value,priceScale:false}])));expect(h.paint().map(row=>row.values[0])).toEqual(['16.00']);
});
it('combined allocation arithmetic admits exact old bounds and rejects one over before materialization',()=>{
 expect(scriptPriceScaleAdmission(999,15999,1,1)).toBe(true);expect(scriptPriceScaleAdmission(1000,16000,0,0)).toBe(true);expect(scriptPriceScaleAdmission(1000,15999,1,1)).toBe(false);expect(scriptPriceScaleAdmission(999,16000,1,1)).toBe(false);
 for(const value of [-1,NaN,Infinity,.5,Number.MAX_SAFE_INTEGER])expect(scriptPriceScaleAdmission(1,1,value,value)).toBe(false);
});
