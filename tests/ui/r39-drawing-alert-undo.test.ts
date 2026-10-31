import {beforeEach,expect,it,vi} from 'vitest';
import {drawingAdditions} from '../../src/domain/drawing-alert-links';
import {DrawingAlertCleanup,DRAWING_ALERT_PROMPT_TITLE,restoredDrawingAlerts} from '../../src/ui/DrawingAlertCleanup';
import type {LocalAlert} from '../../src/domain/alerts';

// Undo of a drawing deletion restores its deleted alerts. SYNTHETIC saved layouts and alerts under
// controlled React hooks (no DOM).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');const cell=(initial:()=>any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=initial();return i;};return{...actual,
 useState:(initial:any)=>{const i=cell(()=>typeof initial==='function'?initial():initial);return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},
 useRef:(initial:any)=>hooks.cells[cell(()=>({current:initial}))],
 useEffect:(run:()=>void)=>{run();}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const match=find(child,test);if(match)return match;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});

const cell=(ids:string[],instrumentId='US:GME')=>({datasetId:'synthetic',drawings:{version:1,drawings:ids.map(id=>({id}))},drawingScopes:{schemaVersion:1,activeBasis:{instrumentId},inactive:[]}});
function alert(id:string,drawingId:string|null):LocalAlert{
 const source=drawingId?{kind:'drawing-boundary',instanceId:drawingId,snapshotId:'s',geometry:{drawingId},mutationPolicy:'follow'}:{kind:'price',field:'close'};
 return {definition:{id,instrumentId:'US:GME',sourceId:'s',name:'Alert '+id,message:'',condition:{kind:'crossing-up',value:0},frequency:'every-time',createdAt:1,expiresAt:null,mode:'ordinary',runId:'r',observationBinding:{schemaVersion:2,datasetKey:'[]',sessionId:'s',replayRunId:null,fixture:true,completionPolicy:'unknown',source}},
  revision:3,armedAt:1,status:'active',lastSequence:4,lastTime:null,lastValue:2,closedBars:[],currentBarId:null,previousClosedValue:null,lastTriggeredBar:null,lastTriggeredAt:null,missedDataGaps:0,history:[{id:'n1'} as never]} as unknown as LocalAlert;
}

it('additions mirror removals: same layout, same cell and scope, ids no cell held before',()=>{
 const before={layoutId:'L1',grid:{cells:{a:cell(['d9']),b:cell(['d5'])}}};
 expect(drawingAdditions(before,{layoutId:'L1',grid:{cells:{a:cell(['d9','d1']),b:cell(['d5'])}}})).toEqual([{instrumentId:'US:GME',ids:['d1']}]);
 expect(drawingAdditions(before,{layoutId:'L1',grid:{cells:{a:cell(['d9','d5']),b:cell([])}}})).toEqual([]);
 expect(drawingAdditions(before,{layoutId:'L2',grid:{cells:{a:cell(['d9','d1'])}}})).toEqual([]);
 expect(drawingAdditions(before,{layoutId:'L1',grid:{cells:{a:cell(['d9','d1'],'US:SPY')}}})).toEqual([]);
});

it('Delete alerts, then Undo: the alerts come back as they were; a second Undo does nothing more',()=>{
 let saved=[alert('a1','d1'),alert('a2',null)];const published:LocalAlert[][]=[],messages:string[]=[];
 const withDrawing={cells:{a:cell(['d1','d9'])}},without={cells:{a:cell(['d9'])}};
 const render=(grid:unknown,layoutId='L1')=>{hooks.cursor=0;return DrawingAlertCleanup({layoutId,grid:grid as never,alerts:saved,readAlerts:()=>saved,enabled:true,onAlertsChange:next=>{published.push(next);saved=next;return true;},onMessage:message=>messages.push(message)});};
 render(withDrawing);render(without);const tree=render(without);
 expect(tree?.props.title).toBe(DRAWING_ALERT_PROMPT_TITLE);
 find(tree,node=>node.type==='button'&&text(node)==='Delete alerts').props.onClick();
 expect(saved.map(row=>row.definition.id)).toEqual(['a2']);
 render(withDrawing);
 expect(saved.map(row=>row.definition.id)).toEqual(['a2','a1']);
 expect(saved[1]).toEqual(alert('a1','d1'));
 expect(messages.at(-1)).toBe('Restored 1 alert with its drawing.');
 render(without);render(withDrawing);
 expect(published).toHaveLength(2);
});

it('a drawing that comes back while the question is open takes its alerts out of the question',()=>{
 const saved=[alert('a1','d1')];const render=(grid:unknown)=>{hooks.cursor=0;return DrawingAlertCleanup({layoutId:'L1',grid:grid as never,alerts:saved,readAlerts:()=>saved,enabled:true,onAlertsChange:()=>true});};
 const withDrawing={cells:{a:cell(['d1'])}},without={cells:{a:cell([])}};
 render(withDrawing);render(without);expect(render(without)?.props.title).toBe(DRAWING_ALERT_PROMPT_TITLE);
 render(withDrawing);expect(render(withDrawing)).toBeNull();
});

it('restoredDrawingAlerts keeps alerts of other layouts or instruments, and never duplicates a present alert',()=>{
 const entry=(id:string,layoutId:string|null,instrumentId='US:GME')=>({layoutId,instrumentId,drawingIds:['d1'],alert:alert(id,'d1')});
 const stash=[entry('a1','L1'),entry('a2','L2'),entry('a3','L1','US:SPY'),entry('a4','L1')];
 const result=restoredDrawingAlerts(stash,'L1',[{instrumentId:'US:GME',ids:['d1']}],[alert('a4','d1')]);
 expect(result.restore.map(row=>row.definition.id)).toEqual(['a1']);
 expect(result.stash.map(row=>row.alert.definition.id)).toEqual(['a2','a3']);
});
