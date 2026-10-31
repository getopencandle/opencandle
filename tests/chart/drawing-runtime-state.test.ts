import {expect,it,vi} from 'vitest';
import {captureDrawingRuntimeState,type DrawingRuntimeStateHost} from '../../src/chart/drawing-runtime-state';

function fixture(){
 let current=true,defaults:Record<string,unknown>={trendline:{style:{lineColor:'#123456',lineWidth:2}}},tool:string|null='trendline',selection=['a','b'];
 const calls:string[]=[];
 const host:DrawingRuntimeStateHost={assertCurrent(){if(!current)throw Error('retired chart');},readDefaults:()=>defaults,writeDefaults(value){calls.push('defaults');defaults=structuredClone(value);},readTool:()=>tool,writeTool(value){calls.push('tool');tool=value;},readSelection:()=>selection,writeSelection(value){calls.push('selection');selection=[...value];}};
 return {host,calls,retire(){current=false;},change(){defaults={fibretracement:{props:{reverse:true}}};tool=null;selection=['c'];},read:()=>({defaults,tool,selection})};
}
it('restores exact runtime defaults, armed tool and ordered selection after partial edits',()=>{
 const f=fixture(),original=structuredClone(f.read()),recovery=captureDrawingRuntimeState(f.host);f.change();recovery.restore();expect(f.read()).toEqual(original);expect(f.calls).toEqual(['defaults','tool','selection']);
});
it('captures detached defaults and reports a silently dropped setting while attempting remaining recovery',()=>{
 const f=fixture(),recovery=captureDrawingRuntimeState(f.host);(f.read().defaults.trendline as any).style.lineColor='#ffffff';f.change();f.host.writeDefaults=()=>{f.calls.push('dropped');};
 expect(()=>recovery.restore()).toThrow(/incomplete/);expect(f.calls).toEqual(['dropped','tool','selection']);expect(f.read().selection).toEqual(['a','b']);
});
it('does not write into a replacement owner after a setter retires the chart',()=>{
 const f=fixture(),recovery=captureDrawingRuntimeState(f.host);f.change();f.host.writeDefaults=()=>{f.calls.push('retire');f.retire();};expect(()=>recovery.restore()).toThrow(AggregateError);expect(f.calls).toEqual(['retire']);expect(f.read().selection).toEqual(['c']);
});
it('keeps every recovery failure and does not reset an unchanged armed tool',()=>{
 const f=fixture(),recovery=captureDrawingRuntimeState(f.host),tool=vi.fn();f.host.writeTool=tool;f.host.writeDefaults=()=>{throw Error('defaults observer');};f.host.writeSelection=()=>{throw Error('selection observer');};
 try{recovery.restore();throw Error('missing failure');}catch(error){expect(error).toBeInstanceOf(AggregateError);expect((error as AggregateError).errors.map(String)).toEqual(['Error: defaults observer','Error: selection observer']);}expect(tool).not.toHaveBeenCalled();
});
it('rejects accessor state without reading it or changing runtime state',()=>{
 const f=fixture();let reads=0;Object.defineProperty(f.read().defaults,'unsafe',{enumerable:true,get(){reads++;return{};}});expect(()=>captureDrawingRuntimeState(f.host)).toThrow();expect(reads).toBe(0);expect(f.calls).toEqual([]);
});
it('a retained recovery callback cannot overwrite a later accepted state twice',()=>{
 const f=fixture(),recovery=captureDrawingRuntimeState(f.host);f.change();recovery.restore();f.change();const later=structuredClone(f.read()),count=f.calls.length;expect(()=>recovery.restore()).toThrow(/already attempted/);expect(f.read()).toEqual(later);expect(f.calls).toHaveLength(count);
});
