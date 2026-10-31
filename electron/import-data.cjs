'use strict';
const fs=require('node:fs/promises');
const path=require('node:path');
const {BoundaryError,exactKeys,MAX_IMPORT_BYTES}=require('./validation.cjs');
function importDataInput(value){
  exactKeys(value,['kind']);
  const descriptor=Object.getOwnPropertyDescriptor(value,'kind');
  if(Reflect.ownKeys(value).length!==1||!descriptor?.enumerable||!Object.hasOwn(descriptor,'value'))throw new BoundaryError('INVALID_ARGUMENT','Choose one explicit local data kind.');
  if(!['fundamentals','calendar','news','scripts','watchlist','watchlist-advanced','screener','indicator-templates','workspace','layouts','strategy-report','heatmap-metadata'].includes(descriptor.value))throw new BoundaryError('INVALID_ARGUMENT','Choose a supported local data kind.');
  return descriptor.value;
}
const titles=Object.freeze({fundamentals:'Import local company facts (JSON)',calendar:'Import local calendar (JSON or CSV)','heatmap-metadata':'Import local heatmap metadata (CSV or JSON)',news:'Import local news (JSON)',scripts:'Import local CandleScript library (JSON)',watchlist:'Import local watchlist (TXT or JSON)','watchlist-advanced':'Import local watchlist analysis (JSON)',screener:'Import local saved screens (JSON)','indicator-templates':'Import local indicator templates (JSON)',workspace:'Import local workspace export (JSON)',layouts:'Import local layout (JSON)','strategy-report':'Open saved OpenCandle strategy report (JSON)'});
const limits=Object.freeze({fundamentals:MAX_IMPORT_BYTES,calendar:MAX_IMPORT_BYTES,'heatmap-metadata':MAX_IMPORT_BYTES,news:MAX_IMPORT_BYTES,scripts:MAX_IMPORT_BYTES,watchlist:2*1024*1024,'watchlist-advanced':10*1024*1024,screener:MAX_IMPORT_BYTES,'indicator-templates':8*1024*1024,workspace:MAX_IMPORT_BYTES,layouts:32*1024*1024,'strategy-report':20*1024*1024});
// Only main passes a path returned by its native picker. This helper is never exposed in preload.
async function readLocalText(filename,extensions,maxBytes=MAX_IMPORT_BYTES){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_IMPORT_BYTES)throw new BoundaryError('INVALID_ARGUMENT','Invalid local import byte limit.');
  const limitMessage='Import limit is '+(maxBytes/(1024*1024))+' MiB.';
  const extension=path.extname(filename).toLowerCase();
  if(!extensions.includes(extension))throw new BoundaryError('INVALID_FORMAT','Select a supported local file format.');
  const handle=await fs.open(filename,'r');
  try{
    const stat=await handle.stat();if(!stat.isFile()||stat.size>maxBytes)throw new BoundaryError('FILE_TOO_LARGE',limitMessage);
    const chunks=[];let bytes=0;
    for await(const chunk of handle.createReadStream({autoClose:false})){bytes+=chunk.length;if(bytes>maxBytes)throw new BoundaryError('FILE_TOO_LARGE',limitMessage);chunks.push(chunk);}
    let text;try{text=new TextDecoder('utf-8',{fatal:true}).decode(Buffer.concat(chunks,bytes));}catch{throw new BoundaryError('INVALID_ENCODING','Select a valid UTF-8 local text file.');}
    return{fileName:path.basename(filename),format:extension.slice(1),text,bytes};
  }finally{await handle.close();}
}
module.exports={importDataInput,titles,limits,readLocalText};
