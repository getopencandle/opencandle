import {afterEach,expect,it,vi} from 'vitest';
import type {DrawingBox} from '@luxalgo/vela';
import {ownedSourceFixture,stamp} from '../fixtures/seasonality-c-owned-source';
import {createImportDraft,prepareImportDraft,exampleDraft} from '../../src/domain/data-setup';
import {newYorkWallTime} from '../../src/domain/us-market-hours';
import {commandCanvas} from './chart-paint-harness';

// Genuine installed CoordinateSystem and DrawingSceneRenderer, with a recording
// Canvas2D boundary only. No replacement mapper/painter, DOM, screenshot or reference claim.
type Fixture=Awaited<ReturnType<typeof ownedSourceFixture>>;
const fixtures:Fixture[]=[];
const monthlyInputs={startYear:2021,endYear:2022,calendar:'utc-continuous',session:'continuous',dateLabels:'utc-date',closedThrough:'2024-01-01T00:00:00Z'};
function monthly(){
 const rows=[['2020-12',100],['2021-01',110],['2021-02',110],['2021-12',200],['2022-01',260],['2022-02',260],['2022-03',270]] as const;
 const text='date,symbol,open,high,low,close,volume,label\n'+rows.map(([month,close])=>`${month}-01,SYNTHETIC,${close},${close+1},${close-1},${close},100,SYNTHETIC EXAMPLE - not market data`).join('\n');
 const parsed=prepareImportDraft({...createImportDraft(),text,symbol:'SYNTHETIC',exchange:'SYNTHETIC-EXAMPLE',resolution:'1M',adjustment:'raw',session:'unknown',sourceLabel:'SYNTHETIC native month geometry'},{now:stamp('2024-01-01')});
 if(!parsed.dataset)throw Error(parsed.preview.headline);return parsed.dataset;
}
async function own(dataset=monthly()){
 const h=await ownedSourceFixture({dataset});fixtures.push(h);return h;
}
async function boxes(h:Fixture,inputs=monthlyInputs):Promise<DrawingBox[]>{
 const id=h.port.add('seasonality',inputs);
 await vi.waitFor(()=>expect(h.port.values(id).series).toHaveLength(4));
 const rendererId=h.port.list().find(row=>row.id===id)?.rendererId;
 if(!rendererId)throw Error('The actual accepted native Seasonality model is missing.');
 return h.records.get(rendererId).model.boxes;
}
function paint(h:Fixture,box:DrawingBox,invert=false){
 const coords=h.native.coords,pane=h.native.scene.panes.get('price');
 pane.bounds={top:0,height:200};pane.scale={min:100,max:300,log:false,invert};
 const painter=h.native.indicatorSlices.drawScene,recording=commandCanvas();
 painter.setDeps({timeToLogical:(ms:number)=>coords.timeToLogical(ms),barAt:()=>null,theme:h.native.theme});
 painter.setSet({boxes:[box],lines:[],labels:[],polylines:[],linefills:[]});
 // The same native logical/time and per-pane price resolvers used by paintEntry.
 painter.drawBoxes(recording.ctx,800,200,(logical:number)=>coords.logicalToX(logical),(price:number)=>coords.priceToY(price,pane.scale,pane.bounds));
 return recording.commands;
}
afterEach(()=>{
 const failures:unknown[]=[];
 for(const h of fixtures.splice(0).reverse())try{h.dispose();}catch(error){failures.push(error);}
 if(failures.length)throw new AggregateError(failures,'Native mapping fixture cleanup failed.');
});

it('paints an accepted loaded monthly projection at native bar slots and normalizes its inverted price rectangle',async()=>{
 const h=await own(),output=await boxes(h),box=output.find(row=>row.left===Date.UTC(2022,0,1))!;
 expect(box).toMatchObject({right:Date.UTC(2022,1,1),bottom:200});expect(box.top).toBeCloseTo(220,10);
 const coords=h.native.coords;coords.setSize(800,200,1);coords.setViewport({barSpacing:20,rightOffset:0});
 expect(coords.timeToLogical(box.left)).toBe(4);expect(coords.timeToLogical(box.right)).toBe(5);
 const normal=paint(h,box).find(row=>row.op==='strokeRect')!,inverted=paint(h,box,true).find(row=>row.op==='strokeRect')!;
 expect(normal.values.slice(0,1)).toEqual([760]);expect(normal.values[1]).toBeCloseTo(80,10);expect(normal.values[2]).toBe(20);expect(normal.values[3]).toBeCloseTo(20,10);
 expect(inverted.values[0]).toBe(760);expect(inverted.values[1]).toBe(100);expect(inverted.values[2]).toBe(20);expect(inverted.values[3]).toBeCloseTo(20,10);
});

it('keeps a genuine zero-return box at the exact next loaded month with a flat native stroke and zero text',async()=>{
 const h=await own(),output=await boxes(h),box=output.find(row=>row.left===Date.UTC(2022,1,1))!;
 expect(box).toMatchObject({right:Date.UTC(2022,2,1),top:260,bottom:260,text:'0.00%'});
 h.native.coords.setSize(800,200,1);h.native.coords.setViewport({barSpacing:20,rightOffset:0});
 const normal=paint(h,box),inverted=paint(h,box,true);
 const normalRect=normal.find(row=>row.op==='strokeRect')!.values,invertedRect=inverted.find(row=>row.op==='strokeRect')!.values;
 expect([normalRect[0],normalRect[2],normalRect[3]]).toEqual([780,20,0]);expect(normalRect[1]).toBeCloseTo(40,10);
 expect([invertedRect[0],invertedRect[2],invertedRect[3]]).toEqual([780,20,0]);expect(invertedRect[1]).toBeCloseTo(160,10);
 expect(normal.filter(row=>row.op==='fillText').map(row=>row.values[0])).toEqual(['0.00%']);
});

function calendarMidnightDaily(){
 const draft=exampleDraft('seasonality-equity-csv');
 // Construct a distinct privately identified original through the real parser.
 // The conversion is source preparation only; expected test timestamps below
 // are independent literal UTC instants, never computed by this helper.
 const text=draft.text.split('\n').map(line=>line.replace(/^(\d{4}-\d{2}-\d{2})(?=,)/,date=>new Date(newYorkWallTime(date,0)*1000).toISOString())).join('\n');
 const parsed=prepareImportDraft({...draft,text,sourceLabel:'SYNTHETIC NY-midnight coordinate exercise'},{now:stamp('2024-01-01')});
 if(!parsed.dataset)throw Error(parsed.preview.headline);return parsed.dataset;
}

it('maps a genuine NY-calendar-midnight daily source through loaded DST and weekend gaps',async()=>{
 const h=await own(calendarMidnightDaily()),output=await boxes(h,{...monthlyInputs,startYear:2016,endYear:2017,calendar:'nyse',session:'regular',dateLabels:'calendar-midnight'});
 const february=output.find(row=>row.left===Date.UTC(2017,1,1,5))!,march=output.find(row=>row.left===Date.UTC(2017,2,1,5))!;
 // Genuine declared exchange-midnight labels: EST before DST, EDT afterward.
 expect(february.right).toBe(Date.UTC(2017,2,1,5));expect(march.right).toBe(Date.UTC(2017,3,1,4));
 const times=h.raw().map(row=>row.time*1000),feb1=times.indexOf(Date.UTC(2017,1,1,5)),mar1=times.indexOf(Date.UTC(2017,2,1,5)),mar31=times.indexOf(Date.UTC(2017,2,31,4)),mar10=times.indexOf(Date.UTC(2017,2,10,5)),mar13=times.indexOf(Date.UTC(2017,2,13,4));
 expect(feb1).toBeGreaterThan(-1);expect(mar1-feb1).toBe(19);expect(mar31-mar1).toBe(22);expect(mar13-mar10).toBe(1);
 expect(times[mar13]-times[mar10]).toBe(71*60*60*1000);
 const coords=h.native.coords;coords.setSize(800,200,1);coords.setViewport({barSpacing:2,rightOffset:mar31+5-(times.length-1)});
 expect(coords.timeToLogical(february.right)).toBe(mar1);
 // Apr1 Saturday04Z is 24h into the loaded Fri04Z?Mon04Z 72h gap.
 expect(coords.timeToLogical(march.right)).toBeCloseTo(mar31+1/3,12);
 // DST weekend: SunMar12 05Z is 48h into Fri05Z?Mon04Z's 71h gap.
 expect(coords.timeToLogical(Date.UTC(2017,2,12,5))).toBeCloseTo(mar10+48/71,12);
 const rectangle=paint(h,march).find(row=>row.op==='strokeRect')!;
 expect(rectangle.values[0]).toBeCloseTo(746,10);expect(rectangle.values[2]).toBeCloseTo(44+2/3,10);
 expect(Number(rectangle.values[3])).toBeGreaterThan(0);
});
