// A typed Coordinates date past the loaded bars moved the anchor. The dialog projected a bar number at the last
// bar's cadence in absolute seconds; on a New York daily chart (bars at 04:00 UTC in daylight time) a typed Thu 19 Nov came back as
// Wed 18 Nov 23:00, the date field changed under the typing, and the owner's Fib end landed on 20 Nov 04:00 UTC (1795147200000).
// Synthetic bars only.
import {expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {coordinateAnchorFromDateTime,coordinateDraftSeconds,coordinateDateTimeText,coordinateBarFromDateTime} from '../../src/ui/drawing-dialog-model';
import {drawingDraftChanges,drawingEditor,patchDrawingCoordinates,barNumberToTime} from '../../src/chart/drawing-port';
import type {Bar} from '../../src/domain/types';

const NY='America/New_York';
/** Weekday daily bars at New York midnight in daylight time (04:00 UTC), 2026-08-03 .. 2026-10-29 (the owner's live GME 1D shape). */
function dailyBars():Bar[]{const out:Bar[]=[];for(let t=Date.UTC(2026,7,3,4)/1000;t<=Date.UTC(2026,9,29,4)/1000;t+=86400){const day=new Date(t*1000).getUTCDay();if(day!==0&&day!==6)out.push({time:t,open:20,high:21,low:19,close:20,volume:1});}return out;}
const bars=dailyBars(),last=bars[bars.length-1];
const fib=()=>createDrawing('fibretracement',{id:'synthetic-fib',paneId:'price',anchors:[{time:Date.UTC(2026,7,27,4),price:17.795},{time:Date.UTC(2026,9,15,4),price:28.305929418263425}]})!.serialize();

it('reproduces the defect: the old cadence projection shows a typed future date one day early at 23:00',()=>{
 expect(last.time).toBe(Date.UTC(2026,9,29,4)/1000);
 const bar=coordinateBarFromDateTime(bars,'2026-11-19','00:00',NY);
 expect(coordinateDateTimeText(barNumberToTime(bars,bar),NY)).toEqual({date:'2026-11-18',time:'23:00'});
 // The next keystroke reads that 23:00 back: 19 Nov 23:00 New York is the owner's saved 20 Nov 04:00 UTC.
 expect(barNumberToTime(bars,coordinateBarFromDateTime(bars,'2026-11-19','23:00',NY))*1000).toBe(1795147200000);
});

it('past the loaded bars a typed date and time is kept exactly; the fields show what was typed',()=>{
 const editor=drawingEditor(fib(),bars),original=editor.anchors[1];
 const draft=coordinateAnchorFromDateTime(bars,'2026-11-19','00:00',NY,original);
 expect(draft.barNumber).toBe(original.barNumber);expect(draft.timeSeconds).toBe(Date.UTC(2026,10,19,5)/1000);
 const shown=coordinateDateTimeText(coordinateDraftSeconds(bars,draft,original),NY);expect(shown).toEqual({date:'2026-11-19',time:'00:00'});
 // Typing on from what the fields show stays put (no drift into the next day).
 const again=coordinateAnchorFromDateTime(bars,shown.date,shown.time,NY,original);expect(again).toEqual(draft);
 // Apply writes exactly that instant.
 const changes=drawingDraftChanges(editor,{},[{price:editor.anchors[0].price,timeSeconds:editor.anchors[0].timeSeconds,barNumber:editor.anchors[0].barNumber},{price:original.price,...draft}]);
 expect(changes.coordinates?.[1]).toEqual({timeSeconds:Date.UTC(2026,10,19,5)/1000});
 const next=patchDrawingCoordinates(fib(),bars,changes.coordinates!);
 expect(next.anchors[1]).toEqual({time:Date.UTC(2026,10,19,5),price:28.305929418263425});expect(next.anchors[0]).toEqual(fib().anchors[0]);
});

it('inside the loaded bars a typed date still lands on the nearest bar, and typing back the saved instant is no change',()=>{
 const editor=drawingEditor(fib(),bars),original=editor.anchors[1];
 const draft=coordinateAnchorFromDateTime(bars,'2026-10-14','00:00',NY,original);
 expect(draft.timeSeconds).toBe(original.timeSeconds);expect(bars[draft.barNumber!].time).toBe(Date.UTC(2026,9,14,4)/1000);
 // Saturday lands on a neighbouring trading day.
 const weekend=coordinateAnchorFromDateTime(bars,'2026-10-17','00:00',NY,original);expect([Date.UTC(2026,9,16,4)/1000,Date.UTC(2026,9,19,4)/1000]).toContain(bars[weekend.barNumber!].time);
 // The last bar and half a bar past it are still bars.
 expect(coordinateAnchorFromDateTime(bars,'2026-10-29','00:00',NY,original).barNumber).toBe(bars.length-1);
 // A future date then the saved date again: the draft equals the saved anchor (no coordinates on Apply).
 const away=coordinateAnchorFromDateTime(bars,'2026-12-01','00:00',NY,original),back=coordinateAnchorFromDateTime(bars,'2026-10-15','00:00',NY,original);
 expect(away.timeSeconds).not.toBe(original.timeSeconds);
 const changes=drawingDraftChanges(editor,{},editor.anchors.map((anchor,index)=>index===1?{price:anchor.price,...back}:{price:anchor.price,timeSeconds:anchor.timeSeconds,barNumber:anchor.barNumber}));
 expect(changes.coordinates).toBeUndefined();
});

it('before the first bar the typed instant is kept too; an invalid entry keeps the refusal marker',()=>{
 const original=drawingEditor(fib(),bars).anchors[0];
 const early=coordinateAnchorFromDateTime(bars,'2026-06-01','09:30',NY,original);expect(early.timeSeconds).toBe(Date.UTC(2026,5,1,13,30)/1000);expect(early.barNumber).toBe(original.barNumber);
 const bad=coordinateAnchorFromDateTime(bars,'2026-02-30','00:00',NY,original);expect(bad.barNumber).toBeNaN();expect(bad.timeSeconds).toBe(original.timeSeconds);
 expect(coordinateDraftSeconds(bars,bad,original)).toBeNaN();
 expect(coordinateAnchorFromDateTime([],'2026-10-14','00:00',NY,original).barNumber).toBeNaN();
});

it('intraday: in range snaps to the nearest 30 minute bar; past the bars the exact typed time is kept across the DST change',()=>{
 const intraday:Bar[]=[];for(let t=Date.UTC(2026,9,26,13,30)/1000;t<=Date.UTC(2026,9,29,19,30)/1000;t+=1800)intraday.push({time:t,open:1,high:1,low:1,close:1,volume:1});
 const record=createDrawing('trendline',{id:'synthetic-tl',paneId:'price',anchors:[{time:intraday[2].time*1000,price:560},{time:intraday[10].time*1000,price:600}]})!.serialize();
 const editor=drawingEditor(record,intraday);
 const snapped=coordinateAnchorFromDateTime(intraday,'2026-10-26','13:17',NY,editor.anchors[1]);expect(intraday[snapped.barNumber!].time).toBe(Date.UTC(2026,9,26,17,30)/1000);
 const future=coordinateAnchorFromDateTime(intraday,'2026-11-03','10:00',NY,editor.anchors[0]);expect(future.timeSeconds).toBe(Date.UTC(2026,10,3,15)/1000);
});
