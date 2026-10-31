import type {LosslessDrawingDocument} from './contracts';
import {prepareWorkspaceJSON,measureWorkspaceJSON} from '../ui/workspace-json';
import {retainFibLevelFormatPresence} from './fib-level-format';
import {retainFibTrendLineMember} from './fib-trend-line-data';
import {retainFibLevelPresentationMembers} from './fib-level-presentation-data';
type Row=Record<string,unknown>;
type Method=(this:any,...args:any[])=>any;
export interface NativeDrawingProjectionAuthority{readonly count:number}
export interface NativeDrawingProjectionPass{readonly count:number}
interface Capture{document:LosslessDrawingDocument;canonical:Row;previous:Map<unknown,Row>;native:Row[];rows:Row[];projected:Row[];models:object[];check():void;checkModel(index:number):void;checkValues():void;used:number}
const authorities=new WeakMap<object,Capture>(),passes=new WeakMap<object,Capture>();
const same=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function own(value:unknown,key:string):any{if(!value||typeof value!=='object')throw Error('Native projection owner unavailable');const d=Object.getOwnPropertyDescriptor(value,key);if(!d||!Object.hasOwn(d,'value'))throw Error('Native projection ownership requires data members');return d.value;}
function method(value:object,key:string):Method{for(let next:object|null=value;next;next=Object.getPrototypeOf(next)){const d=Object.getOwnPropertyDescriptor(next,key);if(d){if(!Object.hasOwn(d,'value')||typeof d.value!=='function')throw Error('Native projection method must be data');return d.value;}}throw Error('Native projection method unavailable');}
function safeRows(value:unknown):Row[]{const metrics=measureWorkspaceJSON({rows:value});if(metrics.bytes>16*1024*1024||metrics.nodes>300000||metrics.depth>40)throw Error('Native projection resource bound exceeded');const rows=prepareWorkspaceJSON({rows:value}).rows;if(!Array.isArray(rows)||rows.length>10000)throw Error('Native projection requires bounded complete rows');return rows.map((row,index)=>retainFibLevelPresentationMembers((value as unknown[])[index],retainFibTrendLineMember((value as unknown[])[index],retainFibLevelFormatPresence((value as unknown[])[index],row)))) as Row[];}
/** Only actual complete owned model serialization can issue removal authority. Projection may
 * adjust existing visibility metadata; it cannot alter identity/text/style or become a full intent. */
export function captureNativeDrawingProjection(facade:object,document:LosslessDrawingDocument,assertSource:()=>void,project:(rows:Row[])=>Row[]=rows=>rows):{rows:Row[];authority:NativeDrawingProjectionAuthority}{
 assertSource();const documentObject=own(document,'document'),canonical=document.serialize();assertSource();if(own(document,'document')!==documentObject)throw Error('Native projection canonical owner changed');
 const controller=own(facade,'ctrl'),store=own(controller,'store'),all=method(store,'all'),get=method(store,'get');
 const scope=()=>{assertSource();if(own(document,'document')!==documentObject||own(facade,'ctrl')!==controller||own(controller,'store')!==store||method(store,'all')!==all||method(store,'get')!==get)throw Error('Native projection owner changed');};
 scope();const models=Reflect.apply(all,store,[]);scope();if(!Array.isArray(models)||models.length>10000)throw Error('Native projection model capacity exceeded');const ids=new Set<string>(),orderedIds:string[]=[],serializers:Method[]=[];
 for(const model of models){scope();const id=own(model,'id');if(typeof id!=='string'||ids.has(id)||Reflect.apply(get,store,[id])!==model)throw Error('Native projection model identity unavailable');scope();ids.add(id);orderedIds.push(id);serializers.push(method(model,'serialize'));}
 const checkModel=(index:number)=>{scope();const model=models[index];if(own(model,'id')!==orderedIds[index]||Reflect.apply(get,store,[orderedIds[index]])!==model||method(model,'serialize')!==serializers[index])throw Error('Native projection model changed');scope();};
 const check=()=>{scope();const current=Reflect.apply(all,store,[]);scope();if(!Array.isArray(current)||current.length!==models.length||current.some((value,index)=>value!==models[index]))throw Error('Native projection model order or membership changed');for(let index=0;index<models.length;index++)checkModel(index);};
 const serialize=()=>{const rows:unknown[]=[];check();for(let index=0;index<models.length;index++){checkModel(index);rows.push(Reflect.apply(serializers[index],models[index],[]));checkModel(index);}check();return safeRows(rows);};
 const native=serialize();if(!same(document.serialize(),canonical))throw Error('Native projection canonical records changed');check();
 const raw=project(structuredClone(native));check();const rows=safeRows(raw);check();
 if(rows.length!==native.length)throw Error('Partial native projection cannot acquire complete intent authority');
 for(let index=0;index<rows.length;index++){const withoutVisibility=(row:Row)=>{const next={...row};delete next.visible;delete next.showOn;return next;};if(!same(withoutVisibility(rows[index]),withoutVisibility(native[index])))throw Error('Projection cannot change native identity, ordinal or non-visibility fields');}
 const capture:Capture={document,canonical,previous:new Map((canonical.drawings as Row[]).map(row=>[row.id,row])),native,rows,projected:structuredClone(rows),models,used:0,check:scope,checkModel,checkValues(){check();if(!same(serialize(),native)||!same(document.serialize(),canonical)||!same(rows,capture.projected))throw Error('Native projection values or canonical records changed');check();}};
 capture.checkValues();const authority=Object.freeze({count:rows.length});authorities.set(authority,capture);return{rows,authority};
}
/** One whole pass, on the exact private canonical document and exact issued row objects. */
export function beginNativeDrawingProjection(authority:NativeDrawingProjectionAuthority,document:LosslessDrawingDocument,rows:readonly Row[],previous:readonly Row[]):NativeDrawingProjectionPass{
 const capture=authorities.get(authority);if(!capture)throw Error('Foreign, copied or consumed native projection authority');authorities.delete(authority);
 if(capture.document!==document||rows.length!==capture.rows.length||rows.some((row,index)=>row!==capture.rows[index])||!same(previous,capture.canonical.drawings))throw Error('Native projection document or row authority changed');capture.checkValues();
 const pass=Object.freeze({count:rows.length});passes.set(pass,capture);return pass;
}
export function consumeNativeDrawingProjectionRow(pass:NativeDrawingProjectionPass,previous:Row,current:Row):boolean{
 const capture=passes.get(pass);if(!capture)throw Error('Native projection pass is retired');capture.check();const index=capture.used++,expected=capture.rows[index];if(!expected)throw Error('Native projection pass has no matching ordinal');capture.checkModel(index);
 if(current!==expected||current.id!==capture.native[index].id||!same(current,capture.projected[index])||!same(previous,capture.previous.get(current.id)??{}))throw Error('Native projection row identity or ordinal changed');return true;
}
export function finishNativeDrawingProjection(pass:NativeDrawingProjectionPass):void{const capture=passes.get(pass);if(!capture)throw Error('Native projection pass is retired');try{if(capture.used!==capture.rows.length)throw Error('Native projection pass was incomplete');capture.checkValues();}finally{passes.delete(pass);}}
export function retireNativeDrawingProjection(pass:NativeDrawingProjectionPass):void{passes.delete(pass);}
