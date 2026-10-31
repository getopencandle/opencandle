/** Original PNG ancillary-metadata writer. W3C PNG 3, iTXt: https://www.w3.org/TR/png-3/#11iTXt */
export interface ChartPngProvenance {schemaVersion:1;datasetId:string;revision:string;fixture:boolean;label:string;basisIdentity?:string;inputIdentity?:string}
const SIGNATURE=[137,80,78,71,13,10,26,10],KEYWORD='OpenCandle.Source',MAX_PNG=64*1024*1024,MAX_METADATA=256*1024;
const encoder=new TextEncoder();
const crcTable=Uint32Array.from({length:256},(_,value)=>{let next=value;for(let bit=0;bit<8;bit++)next=next&1?0xedb88320^(next>>>1):next>>>1;return next>>>0;});
function crc32(bytes:Uint8Array):number{let crc=0xffffffff;for(const byte of bytes)crc=crcTable[(crc^byte)&255]^(crc>>>8);return(crc^0xffffffff)>>>0;}
function uint32(bytes:Uint8Array,offset:number):number{return new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength).getUint32(offset);}
function chunk(payload:Uint8Array):Uint8Array{
 const output=new Uint8Array(payload.length+12),view=new DataView(output.buffer);view.setUint32(0,payload.length);output.set(encoder.encode('iTXt'),4);output.set(payload,8);view.setUint32(output.length-4,crc32(output.subarray(4,output.length-4)));return output;
}
/** Stores identity as uncompressed UTF-8 iTXt; the provenance is not painted into the chart. */
export function chartPngWithProvenance(dataUrl:string,provenance:ChartPngProvenance):string{
 const prefix='data:image/png;base64,';if(!dataUrl.startsWith(prefix)||dataUrl.length>Math.ceil(MAX_PNG*4/3)+prefix.length)throw Error('Chart image provenance requires a bounded PNG.');
 const json=encoder.encode(JSON.stringify(provenance));if(json.length>MAX_METADATA)throw Error('Chart image provenance is too large.');
 let decoded:string;try{decoded=atob(dataUrl.slice(prefix.length));}catch{throw Error('Chart image contains invalid PNG encoding.');}
 const png=Uint8Array.from(decoded,char=>char.charCodeAt(0));if(png.length>MAX_PNG||!SIGNATURE.every((byte,index)=>png[index]===byte))throw Error('Chart image has an invalid PNG signature.');
 let end=-1,header=false,pixels=false;
 for(let offset=8;offset<png.length;){
  if(offset+12>png.length)throw Error('Chart PNG has a truncated chunk.');const length=uint32(png,offset),next=offset+length+12;if(next>png.length)throw Error('Chart PNG has a truncated chunk.');
  const type=String.fromCharCode(...png.subarray(offset+4,offset+8));
  if(offset===8){if(type!=='IHDR'||length!==13)throw Error('Chart PNG has no valid image header.');header=true;}
  if(type==='IDAT')pixels=true;
  if(type==='IEND'){if(!header||!pixels||length!==0||next!==png.length)throw Error('Chart PNG has an invalid end chunk.');end=offset;break;}
  offset=next;
 }
 if(end<0)throw Error('Chart PNG has no end chunk.');
 // Keyword terminator, compression flag/method, empty language and empty translated keyword.
 const keyword=encoder.encode(KEYWORD),payload=new Uint8Array(keyword.length+5+json.length);payload.set(keyword);payload.set(json,keyword.length+5);
 const metadata=chunk(payload),output=new Uint8Array(png.length+metadata.length);output.set(png.subarray(0,end));output.set(metadata,end);output.set(png.subarray(end),end+metadata.length);
 const pieces:string[]=[];for(let offset=0;offset<output.length;offset+=16384)pieces.push(String.fromCharCode(...output.subarray(offset,offset+16384)));
 return prefix+btoa(pieces.join(''));
}
