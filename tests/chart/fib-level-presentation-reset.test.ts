import {expect,it} from 'vitest';
import {createDrawing} from '@luxalgo/vela';
import {nativeResetHarness} from './native-drawing-reset-harness';
import {FIB_TEXT_DEFAULTS} from '../../src/chart/fib-level-presentation-data';
import '../../src/chart/fib-level-format-native';
// the recorded facts (fillBackground true, transparency 80 = opacity 20): the fresh Fib's background. FIB_BACKGROUND_DEFAULTS (6) stays the legacy reading of an absent member.
const FRESH_FIB_BACKGROUND={schemaVersion:1,opacity:20};
it('native popup Reset writes explicit known presentation defaults as one owned command',async()=>{
 const row=createDrawing('fibretracement',{id:'SYNTHETIC presentation Reset',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],props:{lvFibBackground:{schemaVersion:1,opacity:37.5},lvFibText:{schemaVersion:1,enabled:false,position:'right'}}})!.serialize(),f=await nativeResetHarness([row]);
 try{const before=f.document.serialize();f.open().actions.resetSettings();for(const value of [f.document.all()[0],f.core.controller.all()[0]]){expect(value.props!.lvFibBackground).toStrictEqual(FRESH_FIB_BACKGROUND);expect(value.props!.lvFibText).toStrictEqual(FIB_TEXT_DEFAULTS);}expect(f.intents.filter(intent=>intent.kind==='edit'||intent.kind==='edit-many')).toHaveLength(1);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);}finally{f.dispose();}
});
it('native popup Reset preserves canonical absence of both legacy presentation members',async()=>{
 const row=createDrawing('fibretracement',{id:'SYNTHETIC legacy presentation Reset',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],style:{lineColor:'#abcdef',lineWidth:7,lineStyle:'dashed'}})!.serialize();delete row.props!.lvFibBackground;delete row.props!.lvFibText;const f=await nativeResetHarness([row]);
 try{const before=f.document.serialize();f.open().actions.resetSettings();expect((f.document.all()[0].props as Record<string,unknown>).lvFibBackground).toStrictEqual(FRESH_FIB_BACKGROUND);expect(Object.hasOwn(f.document.all()[0].props!,'lvFibText')).toBe(false);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);}finally{f.dispose();}
});
it.each(['undefined','future'] as const)('native popup Reset retains unknown %s presentation values and resets unrelated native style',async kind=>{
 const row=createDrawing('fibretracement',{id:'SYNTHETIC unknown presentation Reset',paneId:'price',createdAt:1,anchors:[{time:1000,price:100},{time:2000,price:200}],style:{lineColor:'#abcdef',lineWidth:7,lineStyle:'dotted'}})!.serialize(),member=kind==='undefined'?undefined:{schemaVersion:99,future:{own:undefined,zero:-0}};row.props!.lvFibBackground=member;row.props!.lvFibText=member;const f=await nativeResetHarness([row]);
 try{const before=f.document.serialize();f.open().actions.resetSettings();for(const value of [f.document.all()[0],f.core.controller.all()[0]])for(const key of ['lvFibBackground','lvFibText']){expect(Object.hasOwn(value.props!,key)).toBe(true);expect(value.props![key]).toStrictEqual(member);}expect(f.document.all()[0].style).toStrictEqual(createDrawing('fibretracement',{paneId:'price',createdAt:0})!.serialize().style);expect(f.document.undo()).toBe(true);expect(f.document.serialize()).toStrictEqual(before);expect(f.document.undo()).toBe(false);}finally{f.dispose();}
});
