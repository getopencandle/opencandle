import {afterEach,expect,it,vi} from 'vitest';
import {scriptPresentationFixture,SYNTHETIC_BINDING,syntheticResult,settle} from '../fixtures/script-presentation';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {scriptHlineStyleId,scriptFillStyleId} from '../../src/chart/script-port';
const fixtures:ReturnType<typeof scriptPresentationFixture>[]=[];
const fixture=()=>{const value=scriptPresentationFixture();fixtures.push(value);return value;};
afterEach(()=>{for(const value of fixtures.splice(0).reverse())value.close();vi.restoreAllMocks();});
const metadata=(f:ReturnType<typeof fixture>)=>{const rows=f.port.presentationMetadata?.();expect(rows).toHaveLength(1);return rows![0];};
function mounted(f:ReturnType<typeof fixture>,result:any=syntheticResult(),plots:any={}){f.port.add(result,{id:SYNTHETIC_BINDING.id,title:'Synthetic management study',pane:'price',visible:true,plots});}
function configured(f:ReturnType<typeof fixture>){const runtime=f.runtime(),context=f.context(),lease=runtime.prepareBindings(context.bindings,context);lease.pauseAndCapture();lease.stage();lease.resume(true);runtime.update(context);return runtime;}

it('retains actual waiting placement and management without calculated scalar authority',()=>{
 const f=fixture();configured(f);expect(f.pending).toHaveLength(1);const row=metadata(f);expect(row.title).toBe(SYNTHETIC_BINDING.name);expect(row.actualPaneId).toBe('price');expect(row.plots).toEqual([]);expect(f.port.captureReadout?.(row.id).state).toBe('unavailable');
});
it('retains failed-worker management and actual placement without fabricating values',async()=>{
 const f=fixture();configured(f);f.pending[0].reject(Error('Synthetic worker refused'));await settle();const row=metadata(f);expect(row.id).toBe(SYNTHETIC_BINDING.id);expect(row.actualPaneId).toBe('price');expect(f.port.captureReadout?.(row.id).state).toBe('unavailable');
});
it('preserves numeric, horizontal-line and fill style settings in fresh frozen primitive records',()=>{
 const f=fixture(),result=syntheticResult();result.visuals={hlines:[{title:'Threshold',price:20,color:'#345678',lineStyle:'dashed',width:2}],fills:[{title:'Band',from:'lvplot:Value',to:'lvhline:Threshold',color:'#abcdef88'}],backgrounds:[],markers:[]};
 const numeric={...defaultPlotStyle('sma','lvplot:Value',0),color:'#990011',width:3,lineStyle:'dotted' as const,legend:false},horizontal={...defaultPlotStyle('sma','line',0),color:'#223344',visible:false};
 mounted(f,result,{'lvplot:Value':numeric,[scriptHlineStyleId('Threshold')]:horizontal});const row=metadata(f);
 expect(row.stylesAvailable).toBe(true);expect({...row.renderedPlots['lvplot:Value']}).toEqual(numeric);expect({...row.renderedVisuals[scriptHlineStyleId('Threshold')]}).toEqual(horizontal);expect(row.renderedVisuals[scriptFillStyleId('Band')].color).toBe('rgba(171,205,239,0.533)');
 expect(Object.isFrozen(row)).toBe(true);expect(Object.isFrozen(row.renderedPlots)).toBe(true);expect(Object.isFrozen(row.renderedPlots['lvplot:Value'])).toBe(true);expect(row.renderedPlots['lvplot:Value']).not.toBe(f.model().settings.plots['lvplot:Value']);expect(row).not.toHaveProperty('values');expect(row).not.toHaveProperty('provenance');
});
it('does not clone history, inspect native bars, call list, or read result provenance',()=>{
 const f=fixture();mounted(f);let reads=0;Object.defineProperty(f.model().result,'provenance',{get(){reads++;throw Error('Forbidden history metadata');},configurable:true});const count=f.barReads;
 const list=vi.spyOn(f.port,'list').mockImplementation(()=>{throw Error('Forbidden list clone');}),clone=vi.spyOn(globalThis,'structuredClone').mockImplementation(()=>{throw Error('Forbidden clone');});
 const row=metadata(f);expect(row.stylesAvailable).toBe(true);expect(f.barReads).toBe(count);expect(reads).toBe(0);expect(list).not.toHaveBeenCalled();expect(clone).not.toHaveBeenCalled();
});
it('rejects combined over-cap metadata before inspecting any plot or line entry',()=>{
 const f=fixture();mounted(f);let reads=0;const plots=new Array(10000),hlines=[{}];Object.defineProperty(plots,'0',{get(){reads++;throw Error('Forbidden plot walk');}});Object.defineProperty(hlines,'0',{get(){reads++;throw Error('Forbidden line walk');}});
 f.model().result={plots,visuals:{hlines,fills:[],backgrounds:[],markers:[]}};const row=metadata(f);expect(reads).toBe(0);expect(row.stylesAvailable).toBe(false);expect(row.actualPaneId).toBe('price');expect(row.plots).toEqual([]);expect(row.title).toBe('Synthetic management study');
});
it('does not invoke accessor labels or styles and keeps the saved study manageable',()=>{
 const f=fixture();mounted(f);let reads=0;const plot={id:'lvplot:Value',color:'#123456',values:[]};Object.defineProperty(plot,'title',{get(){reads++;throw Error('Forbidden title accessor');}});f.model().result={plots:[plot]};const row=metadata(f);
 expect(reads).toBe(0);expect(row.stylesAvailable).toBe(false);expect(row.id).toBe(SYNTHETIC_BINDING.id);expect(row.actualPaneId).toBe('price');
});
it('uses actual native pane after a move and refuses replacement-model placement',()=>{
 const f=fixture();mounted(f);f.move();expect(metadata(f).actualPaneId).toBe('synthetic-other-pane');const native=[...f.core.registry.records.values()][0];native.native.instance={};const row=metadata(f);expect(row.actualPaneId).toBeNull();expect(row.stylesAvailable).toBe(false);expect(row.id).toBe(SYNTHETIC_BINDING.id);
});
it('rechecks native ownership after metadata work and never returns a stale pane',()=>{
 const f=fixture();mounted(f);const native=[...f.core.registry.records.values()][0];let replacements=0;
 f.model().settings.plots=new Proxy({},{getOwnPropertyDescriptor(target,key){if(key==='lvplot:Value'){native.model={...native.model};replacements++;}return Reflect.getOwnPropertyDescriptor(target,key);}});
 const row=metadata(f);expect(replacements).toBe(1);expect(row.actualPaneId).toBeNull();expect(row.stylesAvailable).toBe(false);expect(row.renderedPlots).toEqual({});
});
