import {it,expect} from 'vitest';
import {DrawingStore,createDrawing} from '@luxalgo/vela';
import {createDrawingIdReservations} from '../../src/chart/drawing-id-reservations';
import {LosslessDrawingDocument} from '../../src/chart/contracts';
import {resolvePortableDrawingDocument} from '../../src/chart/drawing-document-bindings';
const known=new Set(['trendline']),inventory={panes:[{paneId:'price',logicalPaneId:'price',replaceable:false,owners:[]}],occupiedIds:[]};
it('adapter lifecycle reserves every canonical ID before filtering native load, including withheld known and opaque records',()=>{
 const canonical=new LosslessDrawingDocument(),native=new DrawingStore(),reservation=createDrawingIdReservations(ids=>native.reserveIds(ids)),knownRow=createDrawing('trendline',{id:'dw-7',paneId:'price',anchors:[]})!.serialize();canonical.load({version:1,drawings:[knownRow,{...knownRow,id:'dw-8',paneId:'missing'},{id:'dw-9',type:'future-pattern',future:'retained'}]});const before=canonical.serialize(),resolved=resolvePortableDrawingDocument(before,inventory,known);reservation.apply(canonical.ids());native.load(resolved.nativeDocument as any);expect(native.all().map(row=>row.id)).toEqual(['dw-7']);expect(native.nextId()).toBe('dw-10');expect(canonical.serialize()).toEqual(before);
});
it('scope switch and deletion replace only active reservations; revisiting a retained scope restores its IDs',()=>{
 const native=new DrawingStore(),reservation=createDrawingIdReservations(ids=>native.reserveIds(ids));reservation.apply(['dw-1']);native.load({version:1,drawings:[]});expect(native.nextId()).toBe('dw-2');reservation.apply([]);native.load({version:1,drawings:[]});expect(native.nextId()).toBe('dw-1');reservation.apply(['dw-1']);native.load({version:1,drawings:[]});expect(native.nextId()).toBe('dw-2');
});
it('unchanged identity sets do not reserve repeatedly; failed native replacement retries without claiming success',()=>{
 let fail=true,calls=0;const reservation=createDrawingIdReservations(()=>{calls++;if(fail)throw Error('native rejection');});expect(()=>reservation.apply(['a','b'])).toThrow('native');fail=false;reservation.apply(['a','b']);reservation.apply(['b','a']);expect(calls).toBe(2);reservation.apply(['b']);expect(calls).toBe(3);
});
it('unsafe or duplicate reservation inputs reject before native calls or getter execution',()=>{
 let reads=0,calls=0;const reservation=createDrawingIdReservations(()=>{calls++;}),getter:string[]=[];Object.defineProperty(getter,'0',{enumerable:true,get(){reads++;return 'dw-1';}});const hidden=['dw-1'];Object.defineProperty(hidden,'0',{value:'dw-1',enumerable:false});for(const value of [getter,hidden,Array(1),['a','a'],[''],['x'.repeat(4097)],Array(10001).fill('x')])expect(()=>reservation.apply(value)).toThrow();expect(reads).toBe(0);expect(calls).toBe(0);
});
