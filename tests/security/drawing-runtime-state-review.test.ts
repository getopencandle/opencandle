import {expect,it,vi} from 'vitest';
import {captureDrawingRuntimeState,type DrawingRuntimeStateHost} from '../../src/chart/drawing-runtime-state';
function fixture(){
 let current=true,defaults:Record<string,unknown>={trendline:{style:{lineColor:'#123456'}}},tool:string|null='trendline',selection=['line'];
 const host:DrawingRuntimeStateHost={assertCurrent(){if(!current)throw Error('independent retired owner');},readDefaults:()=>defaults,writeDefaults:value=>{defaults=structuredClone(value);},readTool:()=>tool,writeTool:value=>{tool=value;},readSelection:()=>selection,writeSelection:value=>{selection=[...value];}};
 return{host,retire:()=>{current=false;},change:()=>{defaults={};tool=null;selection=[];},setDefaults:(value:Record<string,unknown>)=>{defaults=value;},read:()=>({defaults,tool,selection})};
}
it('capture stops before reading another host capability once a read retires the owner',()=>{
 const f=fixture(),readTool=vi.fn(f.host.readTool),readSelection=vi.fn(f.host.readSelection),read=f.host.readDefaults;f.host.readTool=readTool;f.host.readSelection=readSelection;f.host.readDefaults=()=>{const value=read();f.retire();return value;};
 expect(()=>captureDrawingRuntimeState(f.host)).toThrow(/retired/);expect(readTool).not.toHaveBeenCalled();expect(readSelection).not.toHaveBeenCalled();
});
it('does not report complete recovery when a later setter invalidates already-restored defaults',()=>{
 const f=fixture(),recovery=captureDrawingRuntimeState(f.host),writeTool=f.host.writeTool;f.change();f.host.writeTool=value=>{writeTool(value);f.setDefaults({trendline:{style:{lineColor:'#abcdef'}}});};
 expect(()=>recovery.restore()).toThrow(/recover|restore|incomplete/i);
});
it('keeps the runtime snapshot detached from later nested default mutations',()=>{
 const f=fixture(),expected=structuredClone(f.read()),recovery=captureDrawingRuntimeState(f.host);(f.read().defaults.trendline as any).style.lineColor='#abcdef';f.change();recovery.restore();expect(f.read()).toEqual(expected);
});
