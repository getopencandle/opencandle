import {expect,it} from 'vitest';
import {chartPngWithProvenance} from '../../src/chart/png-provenance';
import {chartExportPngDataUrl,chartExportProvenance,composeChartExport} from '../../src/chart/image-export';
// Original synthetic 1x1 PNG fixture, no image capture. Its native chunks must remain byte-for-byte intact.
const png='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=';
const provenance={schemaVersion:1 as const,datasetId:'synthetic-gme',revision:'42',fixture:true,label:'SYNTHETIC GME café',basisIdentity:'["synthetic", "regular"]',inputIdentity:'synthetic-bar-content-42'};
function chunks(url:string){const bytes=Buffer.from(url.split(',')[1],'base64'),result:{type:string;payload:Buffer;raw:Buffer}[]=[];for(let at=8;at<bytes.length;){const size=bytes.readUInt32BE(at),end=at+size+12;result.push({type:bytes.toString('ascii',at+4,at+8),payload:bytes.subarray(at+8,end-4),raw:bytes.subarray(at,end)});at=end;}return result;}
function crc(bytes:Buffer){let value=0xffffffff;for(const byte of bytes){value^=byte;for(let bit=0;bit<8;bit++)value=(value>>>1)^((value&1)?0xedb88320:0);}return(value^0xffffffff)>>>0;}
it('adds valid UTF-8 iTXt provenance without changing source pixels or native PNG chunks',()=>{
 const result=chunks(chartPngWithProvenance(png,provenance)),native=chunks(png);expect(result.map(c=>c.type)).toEqual(['IHDR','IDAT','iTXt','IEND']);expect(result.filter(c=>c.type!=='iTXt').map(c=>c.raw)).toEqual(native.map(c=>c.raw));
 const added=result[2],keyword=Buffer.from('OpenCandle.Source');expect(added.payload.subarray(0,keyword.length)).toEqual(keyword);expect([...added.payload.subarray(keyword.length,keyword.length+5)]).toEqual([0,0,0,0,0]);expect(JSON.parse(added.payload.subarray(keyword.length+5).toString('utf8'))).toEqual(provenance);expect(added.raw.readUInt32BE(added.raw.length-4)).toBe(crc(added.raw.subarray(4,-4)));
});
it('rejects malformed images and oversized provenance without producing a partial artifact',()=>{
 expect(()=>chartPngWithProvenance('data:image/jpeg;base64,AA==',provenance)).toThrow('bounded PNG');expect(()=>chartPngWithProvenance('data:image/png;base64,AA==',provenance)).toThrow('signature');expect(()=>chartPngWithProvenance(png,{...provenance,label:'x'.repeat(262145)})).toThrow('too large');
 const truncated=Buffer.from(png.split(',')[1],'base64').subarray(0,-1);expect(()=>chartPngWithProvenance('data:image/png;base64,'+truncated.toString('base64'),provenance)).toThrow('truncated');
 const noHeader=Buffer.concat([Buffer.from(png.split(',')[1],'base64').subarray(0,8),chunks(png).at(-1)!.raw]);expect(()=>chartPngWithProvenance('data:image/png;base64,'+noHeader.toString('base64'),provenance)).toThrow('header');
});
it('the visible footer keeps source words while exact source identity stays in PNG metadata',()=>{
 const labels:string[]=[],ctx:any={fillRect(){},drawImage(){},save(){},beginPath(){},rect(){},clip(){},restore(){},fillText(text:string){labels.push(text);}},out={width:0,height:0,getContext:()=>ctx,toDataURL:()=>png} as unknown as HTMLCanvasElement;
 composeChartExport({width:100,height:50} as HTMLCanvasElement,null,{...provenance,fixture:true},()=>out);
 expect(labels).toEqual(['OpenCandle · SYNTHETIC · SYNTHETIC GME café']);expect(chartExportProvenance(out)).toEqual(provenance);expect(chunks(chartExportPngDataUrl(out)).some(c=>c.type==='iTXt')).toBe(true);expect(()=>chartExportPngDataUrl({} as HTMLCanvasElement)).toThrow('unavailable');
});

// The optional footer adds symbol, interval, date and the OpenCandle flame mark without changing the caption or strip height.
import {chartExportFooterText} from '../../src/chart/image-export';
it('export footer is text-only data supplied by the caller and drawn right-aligned with the mark',()=>{
  expect(chartExportFooterText({symbol:'GME',interval:'1D',dateText:'2026-10-27'})).toBe('GME · 1D · 2026-10-27');
  expect(chartExportFooterText({symbol:'A\nB',interval:'',dateText:'x'})).toBe('A B · x');
  const texts:string[]=[],ctx:any={fillRect(){},drawImage(){},save(){},restore(){},beginPath(){},rect(){},clip(){},fill(){},moveTo(){},bezierCurveTo(){},closePath(){},fillText(text:string){texts.push(text);}},out={width:0,height:0,getContext:()=>ctx,toDataURL:()=>''} as unknown as HTMLCanvasElement;
  composeChartExport({width:100,height:50} as HTMLCanvasElement,null,{label:'S',datasetId:'d',revision:'r',fixture:true} as never,()=>out,1,undefined,{symbol:'GME',interval:'1D',dateText:'2026-10-27'});
  expect(texts.slice(1)).toEqual(['GME · 1D · 2026-10-27']);expect(out.height).toBe(78);
});
