import {prepareWorkspaceJSON} from '../ui/workspace-json';
import {attemptEveryCleanup} from './chart-retirement';

export interface DrawingRuntimeStateHost {
 assertCurrent:()=>void;
 readDefaults:()=>Record<string,unknown>;
 writeDefaults:(value:Record<string,unknown>)=>void;
 readTool:()=>string|null;
 writeTool:(value:string|null)=>void;
 readSelection:()=>readonly string[];
 writeSelection:(value:readonly string[])=>void;
}
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,canonical((value as Record<string,unknown>)[key])])):value;
const equal=(a:unknown,b:unknown)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));

/** Runtime tool defaults are collateral drawing state, separate from saved layouts. */
export function captureDrawingRuntimeState(host:DrawingRuntimeStateHost){
 const read=()=>{
  host.assertCurrent();const rawDefaults=host.readDefaults();host.assertCurrent();
  const defaults=prepareWorkspaceJSON({defaults:rawDefaults}).defaults;host.assertCurrent();
  const tool=host.readTool();host.assertCurrent();const rawSelection=host.readSelection();host.assertCurrent();
  const selection=prepareWorkspaceJSON({selection:rawSelection}).selection;host.assertCurrent();
  return prepareWorkspaceJSON({defaults,tool,selection});
 };
 const saved=read();
 const defaults=saved.defaults as Record<string,unknown>,tool=saved.tool as string|null,selection=saved.selection as string[];
 if(!defaults||typeof defaults!=='object'||Array.isArray(defaults)||tool!==null&&(typeof tool!=='string'||!tool||tool.length>128)||!Array.isArray(selection)||selection.some(id=>typeof id!=='string'||!id)||new Set(selection).size!==selection.length)throw Error('Drawing runtime state is unavailable');
 host.assertCurrent();let used=false;
 return {restore(){
  if(used)throw Error('Drawing runtime recovery was already attempted');used=true;
  attemptEveryCleanup([
   ()=>{host.assertCurrent();host.writeDefaults(structuredClone(defaults));host.assertCurrent();const actual=prepareWorkspaceJSON({defaults:host.readDefaults()});host.assertCurrent();if(!equal(actual.defaults,defaults))throw Error('Drawing tool defaults did not restore exactly');},
   ()=>{host.assertCurrent();const current=host.readTool();host.assertCurrent();if(current!==tool){host.writeTool(tool);host.assertCurrent();}if(host.readTool()!==tool)throw Error('Armed drawing tool did not restore exactly');host.assertCurrent();},
   ()=>{host.assertCurrent();host.writeSelection([...selection]);host.assertCurrent();const actual=prepareWorkspaceJSON({selection:host.readSelection()});host.assertCurrent();if(!equal(actual.selection,selection))throw Error('Drawing selection did not restore exactly');},
   ()=>{const actual=read();if(!equal(actual,saved))throw Error('Drawing runtime state changed during recovery');},
  ],'Drawing runtime state recovery was incomplete');
 }};
}
