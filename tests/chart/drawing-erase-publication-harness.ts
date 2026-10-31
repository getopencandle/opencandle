import {createDrawing,deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {createDrawingErasePublisher,type DrawingErasePublicationHost} from '../../src/chart/drawing-erase-publication';
import {createWorkspaceHistory} from '../../src/ui/workspace-history';
import {nativeDrawingHarness} from './drawing-native-harness';

/** Actual native controller plus explicit synchronous workspace model; no GUI. */
export async function drawingErasePublicationFixture(){
 const native=await nativeDrawingHarness(),document=new LosslessDrawingDocument();
 const rows=['SYNTHETIC-a','SYNTHETIC-b'].map((id,index)=>({...createDrawing('trendline',{id,paneId:'price',anchors:[{time:1000000,price:20+index},{time:1001000,price:30+index}]})!.serialize(),future:{absent:undefined,zero:-0}}));
 const manager={schemaVersion:1,groups:[{id:'SYNTHETIC-group',name:'SYNTHETIC group',memberIds:rows.map(row=>row.id),future:'preserve'}],templates:[]};
 document.load({version:1,drawings:rows,lvDrawingManager:manager,future:'SYNTHETIC retained'});
 native.controller.fromJSON({version:1,drawings:rows});
 native.controller.select([]);
 let workspace={drawings:document.serialize()},alive=true,holds=0,notifications=0,quarantines=0;
 let beforePrepare=()=>{},beforeWrite=()=>{},afterWrite=()=>{},notification=()=>{},eligible=(_row:Record<string,unknown>)=>{},ackMode:'once'|'double'|'missing'='once',savedAck:(()=>void)|undefined;
 const history=createWorkspaceHistory<typeof workspace>();
 const source=()=>{if(!alive)throw Error('SYNTHETIC source retired');};
 const host:DrawingErasePublicationHost={
  document,facade:{ctrl:native.controller},captureSource:()=>{source();return source;},assertMutable:source,
  assertEligible:row=>{if(row.locked===true||row.visible===false)throw Error('SYNTHETIC target protected');eligible(row);},
  captureProjection:()=>({assertCurrent:source,project:value=>(value.drawings as SerializedDrawing[]).map(row=>structuredClone(row))}),
  captureWorkspace:()=>{
   source();let expected=workspace,prepared=false;
   const current=()=>{source();if(workspace!==expected)throw Error('SYNTHETIC workspace retired');};
   return{assertCurrent:current,prepare(candidate){current();if(prepared)throw Error('SYNTHETIC prepared twice');prepared=true;beforePrepare();current();const next={drawings:structuredClone(candidate)},record=history.prepareRecord(workspace,null);return{
    assertCurrent:current,publish(mark){current();beforeWrite();current();record.commit();workspace=next;expected=next;savedAck=mark;if(ackMode!=='missing')mark();if(ackMode==='double')mark();afterWrite();}
   };}};
  },
  begin:()=>{holds++;let released=false;return{release(){if(released)throw Error('SYNTHETIC released twice');released=true;holds--;}};},
  selection:()=>native.selection(),notify:()=>{notifications++;notification();},quarantine:()=>{quarantines++;},
 };
 const publisher=createDrawingErasePublisher(host);
 return{native,document,rows,host,publisher,history,run:(id=rows[0].id)=>publisher.erase(id,source),dispose:()=>native.dispose(),
  state:()=>({workspace,holds,notifications,quarantines}),retire:()=>{alive=false;},
  prepare:(callback:()=>void)=>{beforePrepare=callback;},beforeWrite:(callback:()=>void)=>{beforeWrite=callback;},afterWrite:(callback:()=>void)=>{afterWrite=callback;},notify:(callback:()=>void)=>{notification=callback;},eligible:(callback:typeof eligible)=>{eligible=callback;},
  ack:(mode:typeof ackMode)=>{ackMode=mode;},retainedAck:()=>savedAck!
 };
}
