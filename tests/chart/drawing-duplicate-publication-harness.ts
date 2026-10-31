import {expect,it} from 'vitest';
import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingDuplicatePublisher,DrawingDuplicatePublicationError,type DrawingDuplicatePublicationHost} from '../../src/chart/drawing-duplicate-publication';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {nativeDrawingHarness} from './drawing-native-harness';

export async function drawingDuplicatePublicationFixture(count=1){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const rows=Array.from({length:count},(_,index)=>{
  const row=createDrawing('trendline',{id:'SYNTHETIC-source-'+index,paneId:'price',zIndex:index+0.5,anchors:[{time:1000000,price:100},{time:1240000,price:200}],style:{lineColor:'#123456',lineWidth:3,lineStyle:'dashed'}})!.serialize();
  return {...row,lvPaneBinding:{schemaVersion:1,target:{kind:'price'}},future:{index,absent:undefined,zero:-0},props:{...row.props,lvTrendlineStats:{schemaVersion:1,priceRange:true,percentChange:false,barsRange:false,dateTimeRange:false,alwaysShow:false,position:'above'}}};
 });
 document.load({version:1,drawings:rows});native.controller.fromJSON({version:1,drawings:rows});
 native.controller.select(rows.map(row=>row.id));
 const history=createWorkspaceHistory<any>();let workspace={drawings:document.serialize()},source=true,holds=0,notifications=0,quarantines=0,sequence=0;
 let allocate=()=> 'SYNTHETIC-copy-'+(++sequence),preparing=()=>{},afterWrite=()=>{},beforeWrite=()=>{},notify=()=>{},ackMode:'once'|'missing'|'double'='once';
 let retainedAck:(()=>void)|undefined;
 const facade={ctrl:native.controller};
 const host:DrawingDuplicatePublicationHost={
  document,facade,
  captureSource(){return()=>{if(!source)throw Error('Synthetic source retired.');};},
  assertMutable(){if(!source)throw Error('Synthetic chart unavailable.');},
  captureWorkspace(){
   let expected=workspace,prepared=false;
   const assertCurrent=()=>{if(workspace!==expected)throw Error('Synthetic workspace replaced.');};
   return {assertCurrent,prepare(candidate){
    assertCurrent();if(prepared)throw Error('Already prepared');prepared=true;preparing();assertCurrent();
    const next={drawings:structuredClone(candidate)},undo=history.prepareRecord(workspace,null);let phase:'prepared'|'publishing'|'accepted'='prepared';
    return {assertCurrent(){assertCurrent();if(phase==='prepared')undo.assertCurrent();},publish(ack){
     assertCurrent();if(phase!=='prepared')throw Error('Already published');phase='publishing';beforeWrite();assertCurrent();
     undo.commit();workspace=next;expected=next;phase='accepted';retainedAck=ack;
     if(ackMode!=='missing')ack();if(ackMode==='double')ack();afterWrite();
    }};
   }};
  },
  captureProjection(){return{occupiedIds:[],stackingFloor:0,assertCurrent(){if(!source)throw Error('Synthetic pane retired.');},assertFreshIds(ids){for(const id of ids)if(native.controller.store.has(id))throw Error('Synthetic occupied ID');},project(value){return (value.drawings as SerializedDrawing[]).map(row=>deserializeDrawing(row)!.serialize());}};},
  makeId(){return allocate();},
  begin(){if(holds)throw Error('Nested hold');holds++;let live=true;return{release(){if(!live)throw Error('Repeated release');live=false;holds--;}};},
  reserve(ids){native.controller.reserveIds(ids);},select(ids){native.controller.select([...ids]);},selection:()=>native.selection(),
  notify(){notifications++;notify();},quarantine(){quarantines++;}
 };
 const publisher=createDrawingDuplicatePublisher(host),selected=rows.map(row=>row.id),action=()=>{if(!source)throw Error('Synthetic action retired.');};
 return {native,document,rows,host,publisher,history,selected,action,run:()=>publisher.duplicate(selected,action),state:()=>({workspace,holds,notifications,quarantines}),
  allocate(fn:()=>string){allocate=fn;},prepare(fn:()=>void){preparing=fn;},afterWrite(fn:()=>void){afterWrite=fn;},beforeWrite(fn:()=>void){beforeWrite=fn;},notify(fn:()=>void){notify=fn;},ack(mode:typeof ackMode){ackMode=mode;},retainedAck:()=>retainedAck!,retire(){source=false;},replaceWorkspace(){workspace={drawings:document.serialize()};},dispose:()=>native.dispose()};
}

