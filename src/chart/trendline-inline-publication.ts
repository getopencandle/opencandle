import type {SerializedDrawing} from '@luxalgo/vela';
import type {LosslessDrawingDocument} from './contracts';
import type {TrendlineInlineOpening} from './trendline-inline-editor';
import {captureInlineDrawingOwner} from './drawing-inline-owner';
import {DrawingEditRecoveryError} from './drawing-edit-transaction';
import {readTrendlineAnnotation} from './trendline-annotation-data';

export interface TrendlineInlinePublicationHost {
 readonly document:LosslessDrawingDocument;
 readonly facade:object;
 assertSource():void;
 assertMutable():void;
 update(id:string,patch:Record<string,unknown>):{accepted:true;changed:boolean};
}

/** Adapter-only opening capability. It delegates one text edit to the reviewed publisher. */
export function captureTrendlineInlineOpening(host:TrendlineInlinePublicationHost,id:string):TrendlineInlineOpening {
 const {document,facade,assertSource,assertMutable,update}=host;
 assertSource();assertMutable();assertSource();
 const record=document.all().find(row=>row.id===id) as unknown as SerializedDrawing|undefined;
 if(!record||record.type!=='trendline'||record.visible!==true||record.locked!==false||typeof record.paneId!=='string')throw Error('Inline text requires a visible unlocked Trendline.');
 const annotation=readTrendlineAnnotation(record.text);
 if(annotation.state==='unavailable'||!annotation.enabled||typeof record.text?.value!=='string'||!record.text.value.trim())throw Error('Inline entry requires visible accepted text. Use drawing settings to add text.');
 const owner=captureInlineDrawingOwner(document,facade,id,record,assertSource);
 let live=true,busy=false,opening:TrendlineInlineOpening;
 const check=()=>{if(!live)throw Error('Inline text opening retired.');try{owner();assertSource();owner();}catch(error){live=false;throw error;}};
 opening=Object.freeze({paneId:record.paneId,initialValue:record.text.value,
  assertCurrent(){if(this!==opening)throw Error('Inline opening receiver changed.');check();},
  commit(value:string){
   if(this!==opening)throw Error('Inline opening receiver changed.');if(busy)throw Error('Inline text publication is already in progress.');check();
   if(typeof value!=='string'||value.length>20000)throw Error('Inline text must contain at most 20000 UTF-16 units.');
   busy=true;
   try{assertMutable();check();const receipt=update(id,{'text.value':value});live=false;return receipt;}
   catch(error){if(error instanceof DrawingEditRecoveryError)live=false;else try{check();}catch{live=false;}throw error;}
   finally{busy=false;}
  }
 });check();return opening;
}
