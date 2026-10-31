import {expect,it} from 'vitest';
import {createDrawing,deserializeDrawing} from '@luxalgo/vela';
import {drawingEditor,patchDrawingCoordinates} from '../../src/chart/drawing-port';
const bars=[0,60,180,240].map(time=>({time:1700000000+time,open:100,high:130,low:90,close:110,volume:10}));
const source=()=>createDrawing('parallelchannel',{id:'channel',paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120},{time:(bars[0].time+90)*1000,price:115}]})!.serialize();
const projection={xOf:(time:number)=>time/1000-bars[0].time,yOf:(price:number)=>price};
it('reads the same literal midpoint offset that the actual pinned model renders',()=>{
 const record=source(),native=deserializeDrawing(record) as any;
 expect(native.offset()).toBe(5);expect(native.geometry(projection).segments).toEqual([[0,100,180,120],[0,105,180,125]]);
 expect(drawingEditor(record,bars).priceOffset).toBe(5);
});
it('edits both baseline endpoints and a negative width into matching actual geometry',()=>{
 const record=source(),before=structuredClone(record),next=patchDrawingCoordinates(record,bars,[{barNumber:1,price:110},{barNumber:3,price:130},{}],-7),native=deserializeDrawing(next) as any;
 expect(next.anchors[2]).toEqual({time:(bars[0].time+90)*1000,price:113});
 expect(native.offset()).toBe(-7);expect(native.geometry(projection).segments).toEqual([[60,110,240,130],[60,103,240,123]]);
 expect(native.handlePoints(projection)[2]).toEqual([150,113]);expect(drawingEditor(next,bars).priceOffset).toBe(-7);expect(record).toEqual(before);
});
it('preserves actual signed width when one endpoint moves and rejects nonrenderable midpoint arithmetic',()=>{
 const record=source(),next=patchDrawingCoordinates(record,bars,[{price:110},{},{}]),native=deserializeDrawing(next) as any;
 expect(next.anchors[2].price).toBe(120);expect(native.offset()).toBe(5);expect(native.geometry(projection).segments[1]).toEqual([0,115,180,125]);
 const before=structuredClone(record);expect(()=>patchDrawingCoordinates(record,bars,[{price:1e308},{price:1e308},{}],0)).toThrow(/overflow|representable/i);expect(record).toEqual(before);
});
