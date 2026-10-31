import {afterEach,expect,it} from 'vitest';
import {scriptPriceScaleFixture} from '../fixtures/script-price-scale';
import {acquireScriptPriceScaleSource} from '../../src/chart/script-presentation-proof';
import {setIndicatorScalePlacement} from '../../src/chart/indicator-scale';

const owned:Array<{dispose():void}>=[];afterEach(()=>{for(const h of owned.splice(0))h.dispose();});
async function fixture(){const h=await scriptPriceScaleFixture();owned.push(h);await h.start('({onBar(ctx){ctx.plot("First",16);ctx.plot("Second",19);}})');h.native.scene.showPriceLabel=false;return h;}
it('the real installed painter uses independent native scale coordinates and collision slots',async()=>{
 const h=await fixture(),rows=h.paint();expect(rows.map(row=>[row.values[0],row.values[1],row.values[2],row.values[3]])).toEqual([['19.00',333.5,88,53],['16.00',333.5,104,53]]);
 expect(h.recording.commands.filter(row=>row.op==='moveTo').map(row=>row.values)).toContainEqual([301,94.5]);expect(h.recording.commands.filter(row=>row.op==='moveTo').map(row=>row.values)).toContainEqual([301,108]);
});
it('native inversion changes Y coordinates without changing the accepted script scalars',async()=>{
 const h=await fixture();h.pane.scale.invert=true;expect(h.paint().map(row=>[row.values[0],row.values[2]])).toEqual([['16.00',72],['19.00',88]]);
});
it('global value labels override saved plot flags without mutating worker or plot settings',async()=>{
 const h=await fixture(),before=h.port.list()[0],calls=h.workerCalls();h.display.setOptions({labelsVisible:false,valuesVisible:true});expect(h.paint()).toEqual([]);h.display.setOptions({labelsVisible:true,valuesVisible:true});expect(h.paint()).toHaveLength(2);expect(h.port.list()[0].plots).toEqual(before.plots);expect(h.workerCalls()).toBe(calls);
});
it('a later endpoint coordinate callback cannot leave an earlier script label painted',async()=>{
 const h=await fixture(),original=h.coords.priceToY;let count=0;h.coords.priceToY=(...args:Parameters<typeof original>)=>{if(++count===2)h.stage(h.rows.map(row=>({...row,close:row.close+1})));return original.apply(h.coords,args);};
 expect(h.paint()).toEqual([]);expect(h.display.diagnostics().length).toBeGreaterThan(0);
});
it('a later formatter source change rejects the whole prepared script batch',async()=>{
 const h=await fixture();h.formatHooks.beforeFormat=value=>{if(value===19)h.stage(h.rows.map(row=>({...row,close:row.close+1})));};expect(h.paint()).toEqual([]);expect(h.recording.commands.filter(row=>row.op==='fillText'&&row.values[3]===53)).toEqual([]);
});
it('the main-price exclusion coordinate callback also runs before any script glyph commit',async()=>{
 const h=await fixture(),original=h.coords.priceToY;h.native.scene.showPriceLabel=true;let count=0;h.coords.priceToY=(...args:Parameters<typeof original>)=>{if(++count===3)h.stage(h.rows.map(row=>({...row,close:row.close+1})));return original.apply(h.coords,args);};expect(h.paint()).toEqual([]);
});
it('same-valued replacement native points cannot stand in for the accepted emitted point',async()=>{
 const h=await fixture(),source=acquireScriptPriceScaleSource(h.port,h.chart),frame=source.read(source.header()),plot=frame.owners[0].plots[0],native=plot.native as {points:object[]};native.points=[...native.points];expect(()=>plot.assertCurrent()).toThrow();expect(h.paint()).toEqual([]);
});
it('native scene removal rejects captured frames without converting descriptive metadata into authority',async()=>{
 const h=await fixture(),source=acquireScriptPriceScaleSource(h.port,h.chart),frame=source.read(source.header());h.native.scene.indicators.delete(h.record().id);expect(()=>frame.assertCurrent()).toThrow();expect(h.paint()).toEqual([]);
});
it('collapsed and genuinely offscale endpoints are withheld rather than pinned to false prices',async()=>{
 const h=await fixture();h.pane.collapsed=true;expect(h.paint()).toEqual([]);h.pane.collapsed=false;h.pane.scale={min:20,max:40,log:false,invert:false};expect(h.paint()).toEqual([]);
});
it('the previous installed wrapper cannot paint after disposal',async()=>{
 const h=await fixture(),old=h.native.chrome.drawMergedScaleColumns;h.display.dispose();h.recording.commands.length=0;expect(()=>old.call(h.native.chrome,h.recording.ctx,h.native.scene,h.coords,300)).toThrow();expect(h.recording.commands).toEqual([]);
});
it('actual core pane moves use the resolved pane rather than the originally requested price pane',async()=>{
 const h=await fixture();h.port.move(h.binding.id,{newPane:true});const record=h.record(),pane=h.native.scene.panes.get(record.model.paneId);expect(record.model.paneId).not.toBe('price');Object.assign(pane,{bounds:{top:80,height:100},scale:{min:0,max:40,log:false,invert:false},collapsed:false});
 const source=acquireScriptPriceScaleSource(h.port,h.chart),frame=source.read(source.header());expect(frame.owners[0].model).toBe(record.model);expect(h.paint().map(row=>row.values[2])).toEqual([136,152]);
});
it('a genuine private right scale paints in its real extra column',async()=>{
 const h=await fixture(),id=h.record().id;setIndicatorScalePlacement(h.chart,id,'own');h.native.computeScales();const scale=h.native.scene.indicatorScales.get(id);expect(scale).toBeDefined();Object.assign(scale.scale,{min:0,max:40,log:false,invert:false});expect(h.paint().map(row=>[row.values[0],row.values[1],row.values[3]])).toEqual([['19.00',393.5,45],['16.00',393.5,45]]);
});
it('a genuine left private scale uses the original left-gutter renderer and column',async()=>{
 const h=await fixture(),id=h.record().id;h.native.chrome.lvLeftScale={canvas:h.recording.canvas,width:64};setIndicatorScalePlacement(h.chart,id,'left');h.native.computeScales();const scale=h.native.scene.indicatorScales.get(id);expect(scale).toBeDefined();Object.assign(scale.scale,{min:0,max:40,log:false,invert:false});expect(h.paint()).toEqual([]);expect(h.paintLeft().map(row=>[row.values[0],row.values[1],row.values[3]])).toEqual([['19.00',30.5,53],['16.00',30.5,53]]);
});
it('a real shared private-scale holder puts builtin and script labels in the same existing column',async()=>{
 const h=await fixture(),script=h.record().id,builtin=h.nativeIndicators.add('sma',{length:1}),other=h.nativeIndicators.list().find(row=>row.id===builtin)!.rendererId;
 setIndicatorScalePlacement(h.chart,script,'own','SYNTHETIC-shared-scale');setIndicatorScalePlacement(h.chart,other,'own','SYNTHETIC-shared-scale');h.native.computeScales();const holder=h.native.scene.lvScaleKey(script);expect(h.native.scene.lvScaleKey(other)).toBe(holder);const scale=h.native.scene.indicatorScales.get(holder);expect(scale).toBeDefined();Object.assign(scale.scale,{min:0,max:40,log:false,invert:false});expect(h.paint().map(row=>row.values[1])).toEqual([393.5,393.5,393.5]);
});
it('an explicitly axis-free native placement has no scale glyph but keeps scalar readiness',async()=>{
 const h=await fixture();setIndicatorScalePlacement(h.chart,h.record().id,'none');expect(h.paint()).toEqual([]);expect(h.view().state).toBe('ready');
});
it('percent indexed and log display follow resolved native geometry without changing raw script values',async()=>{
 const h=await fixture();h.native.scene.scaleMode='percent';h.pane.percentBaseline=10;expect(h.paint().map(row=>row.values[0])).toEqual(['+90.00%','+60.00%']);h.native.scene.scaleMode='indexed';expect(h.paint().map(row=>row.values[0])).toEqual(['190.00','160.00']);h.native.scene.scaleMode='price';h.pane.scale={min:1,max:40,log:true,invert:false};expect(h.paint()).toHaveLength(2);h.pane.scale.min=0;expect(h.paint()).toEqual([]);
});

it('an enabled main-price glyph reserves literal close-seventeen intervals in both native orientations',async()=>{
 const h=await fixture();h.native.scene.showPriceLabel=true;
 // Genuine accepted close17: normal Y=180*(1-17/40)=103.5, inverted Y=180*17/40=76.5.
 // The existing 8px exclusion reserves [95.5,111.5] and [68.5,84.5], blocking slots5/6 and4/5 respectively.
 expect(h.native.scene.bars.at(-1)?.close).toBe(17);
 // Native division/subtraction/multiplication plus the interval offset are bounded by four scale-relative IEEE rounding steps.
 const intervalError=4*Number.EPSILON*180;
 const normal=h.coords.priceToY(17,h.pane.scale,h.pane.bounds);for(const [actual,ideal] of [[normal-8,95.5],[normal+8,111.5]])expect(Math.abs(actual-ideal)).toBeLessThanOrEqual(intervalError);
 expect(h.paint().map(row=>[row.values[0],row.values[2]])).toEqual([['19.00',72],['16.00',120]]);
 h.pane.scale.invert=true;
 const inverted=h.coords.priceToY(17,h.pane.scale,h.pane.bounds);for(const [actual,ideal] of [[inverted-8,68.5],[inverted+8,84.5]])expect(Math.abs(actual-ideal)).toBeLessThanOrEqual(intervalError);
 expect(h.paint().map(row=>[row.values[0],row.values[2]])).toEqual([['16.00',56],['19.00',104]]);
});
