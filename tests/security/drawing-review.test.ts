import {it,expect} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {patchDrawingEdit,patchDrawingProperties,drawingEditor,drawingDraftChanges} from '../../src/chart/drawing-port';
import {createDrawingPreferencesPort,type PhysicalDrawingPreferences} from '../../src/chart/drawing-preferences-port';
import {connectDrawingPreferences,initialDrawingPreferences,type DrawingPreferences} from '../../src/ui/drawing-preferences';
const bars=[0,60,180].map(offset=>({time:1700000000+offset,open:100,high:110,low:90,close:105,volume:10}));
it('rejects hostile colors, blank/nonfinite levels and property-path injection before changing the original drawing',()=>{
 const record=createDrawing('fibretracement',{paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:110}]})!.serialize(),before=structuredClone(record);
 for(const value of ['url(https://example.com/private)','red; background:url(x)','var(--secret)','rgba(1,2,3,Infinity)','rgb(1,2,3) trailing','rgba(1,2,3,-0.1)'])expect(()=>patchDrawingProperties(record,{'levels.0.color':value})).toThrow();
 for(const value of ['',null,NaN,Infinity,'0'])expect(()=>patchDrawingProperties(record,{'levels.0.ratio':value})).toThrow();
 for(const path of ['__proto__.polluted','constructor.prototype.polluted','levels.999999.color'])expect(()=>patchDrawingProperties(record,{[path]:'red'})).toThrow();
 expect(()=>patchDrawingProperties(record,{'levels.0.label':'x'.repeat(20001)})).toThrow();
 expect(record).toEqual(before);expect(({} as any).polluted).toBeUndefined();
});
it('property geometry survives unchanged coordinate drafts, while conflicting deliberate prices reject atomically',()=>{
 const record=createDrawing('position',{paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:90},{time:bars[2].time*1000,price:120}]})!.serialize(),before=structuredClone(record),editor=drawingEditor(record,bars);
 const draft=drawingDraftChanges(editor,{...editor.values,entryPrice:105},editor.anchors);expect(draft.coordinates).toBeUndefined();
 expect(patchDrawingEdit(record,bars,draft.properties,draft.coordinates).anchors[0].price).toBe(105);
 expect(patchDrawingEdit(record,bars,{entryPrice:105},drawingDraftChanges(editor,editor.values,editor.anchors).coordinates).anchors[0].price).toBe(105);
 expect(()=>patchDrawingEdit(record,bars,{entryPrice:105},[{price:106},{},{}])).toThrow('not both');expect(record).toEqual(before);
});
it('a late coordinate failure cannot partially commit a validated style or position property change',()=>{
 const record=createDrawing('position',{paneId:'price',anchors:[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:90},{time:bars[2].time*1000,price:120}]})!.serialize(),before=structuredClone(record);
 expect(()=>patchDrawingEdit(record,bars,{entryPrice:105},[{timeSeconds:Number.MAX_VALUE},{},{}])).toThrow();expect(record).toEqual(before);
});
it('SDK position reflection overflow is rejected with the original finite record intact',()=>{
 const record=createDrawing('position',{paneId:'price',anchors:[{time:1000,price:Number.MAX_VALUE},{time:3000,price:1},{time:3000,price:Number.MAX_VALUE/2}]})!.serialize(),before=structuredClone(record);
 expect(()=>patchDrawingProperties(record,{direction:'long'})).toThrow('overflow');expect(record).toEqual(before);
});
it('preference setter failure rolls both physical values back without notifying native subscribers',()=>{
 let physical:PhysicalDrawingPreferences={magnet:'off',stay:false},snap=()=>{},stay=()=>{},notifications=0;
 const port=createDrawingPreferencesPort({read:()=>({...physical}),setMagnet:magnet=>{physical.magnet=magnet;snap();},setStay:value=>{physical.stay=value;stay();if(value)throw Error('Synthetic setter failure');},onSnap:callback=>{snap=callback;return()=>{};},onStay:callback=>{stay=callback;return()=>{};}});
 port.subscribe(()=>notifications++);expect(()=>port.apply({magnet:'strong',stay:true})).toThrow('Synthetic setter failure');expect(physical).toEqual({magnet:'off',stay:false});expect(notifications).toBe(0);
 physical.magnet='weak';snap();expect(notifications).toBe(1);port.dispose();physical.magnet='strong';snap();expect(notifications).toBe(1);
});
it('detached preference callbacks cannot persist stale native state or read a replacement chart session',()=>{
 let state:DrawingPreferences={...initialDrawingPreferences},notify:(value:PhysicalDrawingPreferences)=>void=()=>{},reads=0,commits=0,errors=0,offCalls=0;
 const off=connectDrawingPreferences({get:()=>({magnet:'off',stay:false}),apply:()=>{},subscribe:callback=>{notify=callback;return()=>{offCalls++;};}},()=>{reads++;return state;},next=>{state=next;commits++;},()=>errors++);
 notify({magnet:'strong',stay:true});expect(commits).toBe(1);off();const detachedReads=reads;notify({magnet:'weak',stay:false});notify({magnet:'invalid',stay:false} as any);expect(reads).toBe(detachedReads);expect(commits).toBe(1);expect(errors).toBe(0);expect(offCalls).toBe(1);
});
it('native preference events before a React render cannot be dropped because saved props are stale',()=>{
 const rendered={...initialDrawingPreferences};let saved:DrawingPreferences={...rendered},notify:(value:PhysicalDrawingPreferences)=>void=()=>{},commits=0;
 const off=connectDrawingPreferences({get:()=>({magnet:'off',stay:false}),apply:()=>{},subscribe:callback=>{notify=callback;return()=>{};}},()=>rendered,next=>{saved=next;commits++;},error=>{throw error;});
 notify({magnet:'strong',stay:false});notify({magnet:'off',stay:false});
 expect(commits).toBe(2);expect(saved.magnet).toBe('off');expect(saved.lastEnabledMagnet).toBe('strong');off();
});
it('remembered strong strength survives Off and a subsequent external restored snapshot rebases native changes',()=>{
 let rendered:DrawingPreferences={...initialDrawingPreferences,magnet:'strong',lastEnabledMagnet:'strong'},saved={...rendered},notify:(value:PhysicalDrawingPreferences)=>void=()=>{},commits=0;
 const off=connectDrawingPreferences({get:()=>({magnet:rendered.magnet,stay:rendered.stay}),apply:()=>{},subscribe:callback=>{notify=callback;return()=>{};}},()=>rendered,next=>{saved=next;commits++;},error=>{throw error;});
 notify({magnet:'off',stay:false});expect(saved).toMatchObject({magnet:'off',lastEnabledMagnet:'strong'});
 rendered={...initialDrawingPreferences,stay:true};notify({magnet:'off',stay:false});
 expect(saved).toMatchObject({magnet:'off',stay:false,lastEnabledMagnet:'weak'});expect(commits).toBe(2);off();
});
