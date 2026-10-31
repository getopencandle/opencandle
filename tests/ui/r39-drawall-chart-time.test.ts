import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {coordinateDateTimeText} from '../../src/ui/drawing-dialog-model';

// The drawing dialog's Coordinates date and time text now comes from the shared chart-time formatter
// (chart-time-text.ts). The behaviour is unchanged: this pins it to a copy of the local helper. SYNTHETIC times.
function previous(seconds:number,timeZone?:string,withSeconds=false):{date:string;time:string}{
 const zoneOrUtc=(zone:string|undefined):string=>{try{new Intl.DateTimeFormat('en-US',{timeZone:zone||'UTC'});return zone||'UTC';}catch{return'UTC';}};
 if(!Number.isFinite(seconds)||!Number.isFinite(new Date(seconds*1000).getTime()))return{date:'',time:''};
 const parts=new Map(new Intl.DateTimeFormat('en-US',{timeZone:zoneOrUtc(timeZone),hourCycle:'h23',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(new Date(Math.round(seconds)*1000)).map(part=>[part.type as string,part.value]));
 const read=(name:string)=>Number(parts.get(name)),two=(n:number)=>String(n).padStart(2,'0');
 return{date:String(read('year')).padStart(4,'0')+'-'+two(read('month'))+'-'+two(read('day')),time:two(read('hour')%24)+':'+two(read('minute'))+(withSeconds?':'+two(read('second')):'')};
}

describe('Coordinates date and time text on the shared chart-time formatter',()=>{
 const zones=[undefined,'UTC','America/New_York','Asia/Kolkata','Australia/Lord_Howe','Not/AZone',''];
 const times=[0,1704205800,1704205815.4,1704205815.6,1710054000,1710057600,1730613600,1730617200,-86400*365*30,253402300799,Number.NaN,Number.POSITIVE_INFINITY,8.64e15+1];
 it('gives the same date and time as the local helper it replaced, with and without seconds',()=>{
  for(const zone of zones)for(const at of times)for(const withSeconds of [false,true])
   expect(coordinateDateTimeText(at,zone,withSeconds),`${zone} ${at} ${withSeconds}`).toEqual(previous(at,zone,withSeconds));
 });
 it('reads New York wall time, midnight as 00, and an unknown zone as UTC',()=>{
  expect(coordinateDateTimeText(1704205800,'America/New_York')).toEqual({date:'2024-01-02',time:'09:30'});
  expect(coordinateDateTimeText(1704153600,'UTC',true)).toEqual({date:'2024-01-02',time:'00:00:00'});
  expect(coordinateDateTimeText(1704205800,'Not/AZone')).toEqual({date:'2024-01-02',time:'14:30'});
 });
 it('the model imports the shared formatter and keeps its own typed-value reader',()=>{
  const source=readFileSync('src/ui/drawing-dialog-model.ts','utf8');
  expect(source).toContain("import {formatChartDateTime} from './chart-time-text';");
  expect(source).toContain('export function coordinateDateTimeSeconds(');
 });
});
