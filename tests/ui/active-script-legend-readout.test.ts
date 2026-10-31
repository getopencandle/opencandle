import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text} from '../helpers/alert-dialog-harness';
import {ScriptLegendRows,type ScriptLegendRowsProps} from '../../src/ui/ScriptSettingsDialog';
import {scriptLegendValueParts} from '../../src/ui/script-legend-readout';
import {scriptPresentationFixture,SYNTHETIC_BINDING,syntheticRows,syntheticResult,settle} from '../fixtures/script-presentation';
import {logicalScriptFixture} from '../fixtures/script-derived-position';
import {defaultPlotStyle} from '../../src/chart/indicator-port';
import {statusLinePriceFormat} from '../../src/chart/status-line-model';

// Genuine Runtime/adapter-host/native-model scalar proof. React scheduling and controller notifications are synthetic.
let frames:Map<number,()=>void>,sequence:number;
const fixtures:ReturnType<typeof scriptPresentationFixture>[]=[],logical:Awaited<ReturnType<typeof logicalScriptFixture>>[]=[],mounted:Array<{dispose():void}>=[];
beforeEach(()=>{frames=new Map();sequence=0;vi.stubGlobal('requestAnimationFrame',(callback:()=>void)=>{frames.set(++sequence,callback);return sequence;});vi.stubGlobal('cancelAnimationFrame',(id:number)=>frames.delete(id));});
afterEach(()=>{for(const view of mounted.splice(0).reverse())view.dispose();for(const f of fixtures.splice(0).reverse())f.close();for(const f of logical.splice(0).reverse())f.dispose();vi.restoreAllMocks();vi.unstubAllGlobals();});
const flush=()=>{const callbacks=[...frames.values()];frames.clear();for(const callback of callbacks)callback();};
const fixture=(options:Parameters<typeof scriptPresentationFixture>[0]={})=>{const f=scriptPresentationFixture(options);fixtures.push(f);return f;};
async function accept(f:ReturnType<typeof fixture>,result=syntheticResult()){f.runtime().update(f.context());f.complete(0,result);await settle();}
function mount(port:ReturnType<typeof fixture>['port'],bindings:ScriptLegendRowsProps['bindings']=[SYNTHETIC_BINDING]){
 const chart:any={scripts:port,getDataWindow:vi.fn(()=>{throw Error('No inspection capture from the legend.');}),getSourceBars:vi.fn(()=>{throw Error('No source clone from the legend.');}),getCalculationBars:vi.fn(()=>{throw Error('No calculation clone from the legend.');})};
 const props:ScriptLegendRowsProps={chart,bindings,owner:{},showTitles:true,showValues:true,position:{kind:'latest'},isCurrent:()=>true,onBindingsChange:vi.fn(()=>true)};
 const ui=mountControlledComponent(()=>ScriptLegendRows(props));mounted.push(ui);ui.settle();return{chart,props,ui};
}
const values=(tree:unknown)=>all(tree,node=>node.props['data-legend-values']==='true').map(node=>text(node));

it('renders ordinary latest and exact cursor scalars through the private free reader without changing ordinary view keys',async()=>{
 const f=fixture();await accept(f);const view=f.port.captureReadout!(SYNTHETIC_BINDING.id);expect(Object.keys(view).sort()).toEqual(['assertCurrent','readAt','state']);
 const h=mount(f.port);expect(values(h.ui.render())).toEqual(['11.00']);h.props.position={kind:'axis-time',time:100};expect(values(h.ui.render())).toEqual(['7.00']);h.props.position={kind:'axis-time',time:160};expect(values(h.ui.render())).toEqual(['∅']);
});
it('does not carry a sparse value across an omitted accepted row',async()=>{
 const f=fixture();await accept(f,syntheticResult([[100,7],[220,11]]));const h=mount(f.port);h.props.position={kind:'axis-time',time:160};expect(values(h.ui.render())).toEqual(['∅']);
});
it('invalid and unavailable cursors never retry latest and leave valid subsequent queries available',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port);
 for(const position of [{kind:'axis-time',time:130},{kind:'axis-time',time:999},{kind:'axis-time',time:NaN},{kind:'unavailable'}]as const){h.props.position=position;expect(values(h.ui.render())).toEqual([]);expect(all(h.ui.render(),node=>node.props['data-study-values']==='unavailable')).toHaveLength(1);}
 h.props.position={kind:'axis-time',time:100};expect(values(h.ui.render())).toEqual(['7.00']);
});
it('withholds pending worker values until actual acceptance publishes the genuine model',async()=>{
 const f=fixture();f.runtime().update(f.context());const h=mount(f.port);expect(values(h.ui.render())).toEqual([]);f.complete();await settle();flush();expect(values(h.ui.settle())).toEqual(['11.00']);
});
it('keeps identical script IDs separate across genuine chart owners',async()=>{
 const a=fixture(),b=fixture();await accept(a);await accept(b,syntheticResult([[100,27],[160,null],[220,31]]));const av=mount(a.port),bv=mount(b.port);av.props.position={kind:'axis-time',time:100};bv.props.position={kind:'axis-time',time:100};expect(values(av.ui.render())).toEqual(['7.00']);expect(values(bv.ui.render())).toEqual(['27.00']);
 av.props.chart=bv.chart;av.props.owner={};expect(values(av.ui.render())).toEqual([]);expect(values(av.ui.settle())).toEqual(['27.00']);
});
it('shows accepted Heikin Ashi units and refuses a raw-native replacement',async()=>{
 const f=fixture({style:'heikinashi'});await accept(f,syntheticResult([[100,10.5],[160,14],[220,17]]));const h=mount(f.port);h.props.position={kind:'axis-time',time:100};expect(values(h.ui.render())).toEqual(['10.50']);f.nativeOnly(f.input.bars);expect(values(h.ui.render())).toEqual([]);
});
it('preserves title and global value toggles independently of Hide Settings and Remove controls',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port);h.props.showTitles=false;h.props.showValues=false;const tree=h.ui.settle();expect(text(tree)).not.toContain(SYNTHETIC_BINDING.name);expect(values(tree)).toEqual([]);
 for(const label of ['Hide '+SYNTHETIC_BINDING.name,'Settings for '+SYNTHETIC_BINDING.name,'Remove script '+SYNTHETIC_BINDING.name])expect(all(tree,node=>node.props['aria-label']===label)).toHaveLength(1);
 h.props.showValues=true;expect(values(h.ui.settle())).toEqual(['11.00']);h.props.showTitles=true;expect(text(h.ui.render())).toContain(SYNTHETIC_BINDING.name);
});
it('inherits main-series two four and zero decimal display without rounding accepted calculations',async()=>{
 const f=fixture();await accept(f,syntheticResult([[100,7.123456],[220,11.987654]]));const h=mount(f.port);
 for(const [precision,expected]of [['2','11.99'],['4','11.9877'],['integer','12']]as const){h.props.formatValue=statusLinePriceFormat(precision,.01);expect(values(h.ui.render())).toEqual([expected]);}
 h.props.formatValue=statusLinePriceFormat('default',.0001);expect(values(h.ui.render())).toEqual(['11.9877']);const view=f.port.captureReadout!(SYNTHETIC_BINDING.id);if(view.state!=='ready')throw Error(view.message);expect(view.readAt(220).plots[0].value).toBe(11.987654);
});
it('uses frozen admitted ordinals for distinct scalar spans with duplicate human plot labels',async()=>{
 const f=fixture(),result=syntheticResult();result.plots=[{id:'lvplot:first',title:'Duplicate',color:'#123456',values:[{time:100,value:3},{time:220,value:5}]},{id:'lvplot:second',title:'Duplicate',color:'#654321',values:[{time:100,value:7},{time:220,value:11}]}];await accept(f,result);const h=mount(f.port),spans=all(h.ui.render(),node=>node.props['data-plot']==='Duplicate');expect(spans.map(text)).toEqual(['5.00','11.00']);expect(spans.map(node=>(node as any).key)).toEqual(['0','1']);
});
it('honors owned plot legend exclusion and color changes after native style acceptance',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port),style={...defaultPlotStyle('sma','lvplot:Value',0),color:'#abcdef'};f.port.replaceStyles(SYNTHETIC_BINDING.id,{'lvplot:Value':style});flush();expect(all(h.ui.settle(),node=>node.props['data-plot']==='Value')[0].props.style).toEqual({color:'#abcdef'});
 f.port.replaceStyles(SYNTHETIC_BINDING.id,{'lvplot:Value':{...style,legend:false}});flush();expect(values(h.ui.settle())).toEqual([]);expect(all(h.ui.render(),node=>node.props['data-study-values']==='unavailable')).toHaveLength(0);
});
it('suppresses an actual hidden plot with legend enabled through the private typed reader',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port),style={...defaultPlotStyle('sma','lvplot:Value',0),visible:false,legend:true};f.port.replaceStyles(SYNTHETIC_BINDING.id,{'lvplot:Value':style});flush();expect(values(h.ui.settle())).toEqual([]);expect(all(h.ui.render(),node=>node.props['data-study-values']==='unavailable')).toHaveLength(0);
 f.port.replaceStyles(SYNTHETIC_BINDING.id,{'lvplot:Value':{...style,visible:true}});flush();expect(values(h.ui.settle())).toEqual(['11.00']);
});
it('suppresses a whole hidden binding and reacquires its exact accepted scalar when shown',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port,f.bindings),hidden=[{...f.bindings[0],visible:false}];f.setBindings(hidden);f.runtime().update(f.context());h.props.bindings=hidden;flush();expect(values(h.ui.settle())).toEqual([]);expect(all(h.ui.render(),node=>node.props['data-hidden']==='true')).toHaveLength(1);
 const shown=[{...hidden[0],visible:true}];f.setBindings(shown);f.runtime().update(f.context());h.props.bindings=shown;flush();expect(values(h.ui.settle())).toEqual(['11.00']);expect(f.pending).toHaveLength(1);
});
it('retains hidden-plot identity across genuinely accepted duplicate-label output reorder',async()=>{
 const f=fixture(),first={id:'lvplot:first',title:'Duplicate',color:'#123456',values:[{time:100,value:3},{time:220,value:5}]},second={id:'lvplot:second',title:'Duplicate',color:'#654321',values:[{time:100,value:7},{time:220,value:11}]},result=syntheticResult();result.plots=[first,second];const hiddenFirst={...defaultPlotStyle('sma',first.id,0),color:first.color,visible:false,legend:true};f.setBindings([{...SYNTHETIC_BINDING,plots:{[first.id]:hiddenFirst}}]);await accept(f,result);const h=mount(f.port,f.bindings);expect(values(h.ui.render())).toEqual(['11.00']);
 const nextRows=syntheticRows();nextRows[2].close=19;f.publish(nextRows);f.runtime().update(f.context());f.complete(1,{...syntheticResult(),plots:[structuredClone(second),structuredClone(first)]});await settle();flush();expect(values(h.ui.settle())).toEqual(['11.00']);expect(all(h.ui.render(),node=>node.props['data-plot']==='Duplicate')).toHaveLength(1);
});
it('never executes forged snapshot fields while requesting numerical authority',()=>{
 let calls=0;const fake:any={};for(const key of ['state','assertCurrent','readAt'])Object.defineProperty(fake,key,{get(){calls++;throw Error('Synthetic forged field.');}});
 expect(scriptLegendValueParts(fake,{kind:'latest'},()=>true)).toBeNull();expect(calls).toBe(0);
});
it('renders three distinct literal duplicate-event Renko values through the genuine worker/native chain',async()=>{
 const f=await logicalScriptFixture();logical.push(f);await f.start();const h=mount(f.port,[f.binding]);expect(values(h.ui.render())).toEqual(['16.00']);
 for(const [time,expected]of [[100,'12.00'],[160,'14.00'],[220,'16.00']]as const){h.props.position={kind:'axis-time',time};expect(values(h.ui.render())).toEqual([expected]);}
 h.props.position={kind:'axis-time',time:280};expect(values(h.ui.render())).toEqual([]);h.props.position={kind:'latest'};expect(values(h.ui.render())).toEqual(['16.00']);
});
it('preserves an actual logical sparse gap instead of borrowing a duplicate event value',async()=>{
 const f=await logicalScriptFixture();logical.push(f);await f.start(`({onBar(ctx){if(ctx.index!==1)ctx.plot('Sparse',ctx.bar.close);}})`);const h=mount(f.port,[f.binding]);h.props.position={kind:'axis-time',time:160};expect(values(h.ui.render())).toEqual(['∅']);h.props.position={kind:'latest'};expect(values(h.ui.render())).toEqual(['16.00']);
});
it('discards formatted scalar text when its formatter retires the active UI owner',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port);let current=true;h.props.isCurrent=()=>current;h.props.formatValue=value=>{current=false;return value.toFixed(2);};const tree=h.ui.render();expect(values(tree)).toEqual([]);expect(all(tree,node=>node.props['data-study-values']==='unavailable')).toHaveLength(1);
});
it('discards formatted text when a formatter publishes a replacement source through the genuine host',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port),rows=syntheticRows();rows[2].close=19;let calls=0;h.props.formatValue=value=>{calls++;f.publish(rows);return value.toFixed(2);};const tree=h.ui.render();expect(calls).toBe(1);expect(values(tree)).toEqual([]);expect(all(tree,node=>node.props['data-study-values']==='unavailable')).toHaveLength(1);
});
it('discards formatted text when a formatter replaces the actual native frame without a UI owner change',async()=>{
 const f=fixture();await accept(f);const h=mount(f.port);h.props.formatValue=value=>{f.core.bars=[...f.core.bars];return value.toFixed(2);};const tree=h.ui.render();expect(values(tree)).toEqual([]);expect(all(tree,node=>node.props['data-study-values']==='unavailable')).toHaveLength(1);
});
it('checks the private native view after a final owner callback mutates native rows and still returns true',async()=>{
 const f=fixture();await accept(f);const view=f.port.captureReadout!(SYNTHETIC_BINDING.id);let guards=0,formats=0;const parts=scriptLegendValueParts(view,{kind:'latest'},()=>{if(++guards===3)f.core.bars=[...f.core.bars];return true;},value=>{formats++;return value.toFixed(2);});expect(guards).toBe(3);expect(formats).toBe(1);expect(parts).toBeNull();
});
