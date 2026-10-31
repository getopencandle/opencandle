'use strict';
const fs=require('node:fs');
const path=require('node:path');
const EVENTS=new Set(['start','ready','window-created','ready-to-show','load-finished','load-failed','renderer-gone','child-gone','startup-failed','before-quit','quit','profile-migration']);
const TYPES=new Set(['main','renderer','Utility','Zygote','Sandbox helper','GPU','Pepper Plugin','Pepper Plugin Broker','Unknown']);
const REASONS=new Set(['clean-exit','abnormal-exit','killed','crashed','oom','launch-failed','integrity-failure','memory-eviction','copied','kept','none','failed']);
const BUILD_ID=/^\d{8}T\d{9}Z-[a-f0-9]{12}$/;
/** Electron may report a Windows status as signed or unsigned32. Never coerce
 * arbitrary values or serialize an error object's message/code/stack. */
function safeCode(value){return typeof value==='number'&&Number.isInteger(value)&&value>=-2147483648&&value<=4294967295?value:null;}
function data(object,key){if(!object||typeof object!=='object')return;const d=Object.getOwnPropertyDescriptor(object,key);return d&&Object.hasOwn(d,'value')?d.value:undefined;}
/** Small local event tail only; callers create this after acquiring the profile.
 * Diagnostics never change application control flow, including write failures. */
function createStartupDiagnostics(options={}){
 let destination,writer,buildId='unknown',startedAt,enabled=false;
 try{
  if(data(options,'ownsProfile')===true){
   const directory=data(options,'userDataPath'),candidate=data(options,'buildId'),injected=data(options,'writer'),writerField=Object.getOwnPropertyDescriptor(options,'writer');
   if(typeof directory==='string'&&path.isAbsolute(directory)&&(!writerField||Object.hasOwn(writerField,'value'))&&(injected===undefined||typeof injected==='function')){
    destination=path.join(directory,'startup-status.json');
    buildId=typeof candidate==='string'&&BUILD_ID.test(candidate)?candidate:'unknown';
    startedAt=new Date().toISOString();
    writer=injected||((file,text)=>{try{fs.mkdirSync(directory,{recursive:true});}catch{/* An existing directory may still permit this bounded write. */}fs.writeFileSync(file,text,{encoding:'utf8'});});
    enabled=true;
   }
  }
 }catch{/* Invalid diagnostic options must not prevent application startup. */}
 let sequence=0,events=[],writing=false;
 const controller=Object.freeze({record(event,details={}){
  if(this!==controller||!enabled||writing||typeof event!=='string'||!EVENTS.has(event))return;
  try{
   const type=data(details,'type'),reason=data(details,'reason'),exitCode=safeCode(data(details,'exitCode'));
   const row={sequence:sequence<Number.MAX_SAFE_INTEGER?++sequence:sequence,event};
   if(typeof type==='string'&&TYPES.has(type))row.type=type;
   if(typeof reason==='string'&&REASONS.has(reason))row.reason=reason;
   if(exitCode!==null)row.exitCode=exitCode;
   events=[...events.slice(-31),row];
   const text=JSON.stringify({schemaVersion:1,buildId,startedAt,events});
   if(Buffer.byteLength(text,'utf8')>16384)return;
   writing=true;try{writer(destination,text);}finally{writing=false;}
  }catch{/* No diagnostic, formatting, or I/O failure escapes into lifecycle handlers. */}
 }});
 return controller;
}
module.exports=Object.freeze({createStartupDiagnostics,safeCode});
