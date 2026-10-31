// SYNTHETIC image byte fixtures for tests: headers, a minimal body and the format trailer only. They are not real pictures
// nothing here is decoded by a codec, and nothing reads the network or the file system.
const u32=(value:number)=>[(value>>>24)&255,(value>>>16)&255,(value>>>8)&255,value&255];
const u16le=(value:number)=>[value&255,(value>>>8)&255];
const u16be=(value:number)=>[(value>>>8)&255,value&255];
const u32le=(value:number)=>[value&255,(value>>>8)&255,(value>>>16)&255,(value>>>24)&255];
const text=(value:string)=>[...value].map(char=>char.charCodeAt(0));
const pad=(bytes:number[],total?:number)=>total&&bytes.length<total?[...bytes,...new Array(total-bytes.length).fill(0)]:bytes;

/** PNG: signature, IHDR, an optional filler IDAT chunk that brings the file to `total` bytes, IEND with its fixed CRC. */
function png(width:number,height:number,total?:number):Uint8Array{
 const head=[0x89,...text('PNG'),0x0D,0x0A,0x1A,0x0A,...u32(13),...text('IHDR'),...u32(width),...u32(height),8,2,0,0,0,0,0,0,0];
 const end=[...u32(0),...text('IEND'),0xAE,0x42,0x60,0x82];
 const filler=total&&total>head.length+end.length+12?[...u32(total-head.length-end.length-12),...text('IDAT'),...new Array(total-head.length-end.length-12).fill(7),0,0,0,0]:[];
 return Uint8Array.from([...head,...filler,...end]);
}
function gif(width:number,height:number):Uint8Array{return gifFrames(width,height,[{left:0,top:0,width,height}]);}
function jpeg(width:number,height:number):Uint8Array{
 return Uint8Array.from([0xFF,0xD8,0xFF,0xE0,0,16,...text('JFIF'),0,1,1,0,0,1,0,1,0,0,
  0xFF,0xC0,0,17,8,...u16be(height),...u16be(width),3,1,0x22,0,2,0x11,1,3,0x11,1,
  0xFF,0xDA,0,12,3,1,0,2,0x11,3,0x11,0,0x3F,0,1,2,3,0xFF,0xD9]);
}
function riff(chunk:number[]):Uint8Array{
 const body=[...text('WEBP'),...chunk];
 const even=body.length%2?[...body,0]:body;
 return Uint8Array.from([...text('RIFF'),...u32le(even.length),...even]);
}
function webpX(width:number,height:number):Uint8Array{
 const w=width-1,h=height-1;
 return riff([...text('VP8X'),...u32le(10),0,0,0,0,w&255,(w>>8)&255,(w>>16)&255,h&255,(h>>8)&255,(h>>16)&255]);
}
function webpL(width:number,height:number):Uint8Array{
 const bits=((width-1)&0x3FFF)|(((height-1)&0x3FFF)<<14);
 return riff([...text('VP8L'),...u32le(10),0x2F,...u32le(bits>>>0),0,0,0,0,0]);
}
function webpLossy(width:number,height:number):Uint8Array{
 return riff([...text('VP8 '),...u32le(10),0,0,0,0x9D,0x01,0x2A,...u16le(width),...u16le(height)]);
}

/** GIF with explicit frames: logical screen, then per frame an optional graphic-control extension, an image descriptor, one LZW sub-block, then the trailer. */
function gifFrames(screenW:number,screenH:number,frames:Array<{left:number;top:number;width:number;height:number}>,options:{noTrailer?:boolean;badBlock?:boolean;overrun?:boolean}={}):Uint8Array{
 const out:number[]=[...text('GIF89a'),...u16le(screenW),...u16le(screenH),0,0,0];
 for(const frame of frames){
  out.push(0x21,0xF9,4,0,0,0,0,0);
  out.push(0x2C,...u16le(frame.left),...u16le(frame.top),...u16le(frame.width),...u16le(frame.height),0);
  out.push(2,options.overrun?200:1,0x44,0);
 }
 if(options.badBlock)out.push(0x99);
 if(!options.noTrailer)out.push(0x3B);
 return Uint8Array.from(out);
}
/** A PNG followed by a copy of its own IEND chunk. */
function pngWithSecondEnd(width:number,height:number):Uint8Array{const base=png(width,height);return Uint8Array.from([...base,...base.subarray(base.length-12)]);}

/** JPEG with two SOF segments before the scan (a decoder sizes from the first one). */
function jpegTwoSof(firstW:number,firstH:number,secondW:number,secondH:number):Uint8Array{
 const sof=(w:number,h:number)=>[0xFF,0xC0,0,17,8,...u16be(h),...u16be(w),3,1,0x22,0,2,0x11,1,3,0x11,1];
 return Uint8Array.from([0xFF,0xD8,0xFF,0xE0,0,16,...text('JFIF'),0,1,1,0,0,1,0,1,0,0,...sof(firstW,firstH),...sof(secondW,secondH),0xFF,0xDA,0,12,3,1,0,2,0x11,3,0x11,0,0x3F,0,1,2,3,0xFF,0xD9]);
}
/** WebP with a VP8X canvas followed by a lossless VP8L image chunk of its own size. */
function webpCanvasWithInner(canvasW:number,canvasH:number,innerW:number,innerH:number):Uint8Array{
 const w=canvasW-1,h=canvasH-1,bits=((innerW-1)&0x3FFF)|(((innerH-1)&0x3FFF)<<14);
 return riff([...text('VP8X'),...u32le(10),0,0,0,0,w&255,(w>>8)&255,(w>>16)&255,h&255,(h>>8)&255,(h>>16)&255,...text('VP8L'),...u32le(10),0x2F,...u32le(bits>>>0),0,0,0,0,0]);
}
/** The same image with extra bytes after its trailer. For WebP the RIFF size is left alone, so the file length no longer matches it. */
function withTrailer(image:Uint8Array,extra:Uint8Array):Uint8Array{return Uint8Array.from([...image,...extra]);}

export const imageFixture=Object.freeze({png,gif,gifFrames,pngWithSecondEnd,jpegTwoSof,webpCanvasWithInner,jpeg,webpX,webpL,webpLossy,withTrailer,pad});
