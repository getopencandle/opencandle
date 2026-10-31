import {afterEach,describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createDrawing,getDrawingType} from '@luxalgo/vela';
import {captureToolDefault,connectToolDefaults,loadSharedToolDefaults,restoreDrawingToolDefaults,sharedToolDefaults,withToolDefault,type DrawingToolDefaults} from '../../src/chart/drawing-tool-defaults';
import {clipboardGroups,createObjectClipboard,pastedGroups,pasteRouteFor} from '../../src/chart/drawing-object-clipboard';
import {createDrawingManager,type DrawingManagerHost} from '../../src/chart/drawing-manager';
import {lvDrawingTypeStatus} from '../../src/chart/lv-drawing-types';
import {LV_STICKER,STICKER_DEFAULT_PX,STICKER_PROP,STICKER_ROW} from '../../src/chart/lv-types/sticker';
import {DEFAULT_STICKER,STICKERS,STICKER_IDS,pickSticker,resetStickerPicker,selectedSticker} from '../../src/chart/lv-types/sticker-set';
import {DRAWING_TOOL_CATALOG} from '../../src/ui/drawing-tool-catalog';
import {StickerArt,StickerPicker} from '../../src/ui/StickerPicker';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {drawingCommands,drawingProjection,nativeDrawingHarness} from './drawing-native-harness';

// Drawing Save as default / Reset settings, group-keeping copy and paste, and the Stickers tool. SYNTHETIC rows;
// the real pinned native drawing controller runs the tool-defaults path, the real registry runs the sticker type.
type Row=Record<string,unknown>;
const read=(path:string)=>readFileSync(path,'utf8');
const T0=1_000_000;
const projector={...drawingProjection,pxToPoint:(x:number,y:number)=>({time:T0+(x-20)*1000,price:300-y}),paneIdAtY:()=>'price'};

afterEach(()=>{loadSharedToolDefaults(undefined);resetStickerPicker();});

describe('drawing tool defaults (Save as default)',()=>{
 const saved:DrawingToolDefaults={schemaVersion:1,tools:{trendline:{style:{lineColor:'#ff0000',lineWidth:3,lineStyle:'dashed'}}}};
 it('restores the workspace block exactly and refuses anything else',()=>{
  expect(restoreDrawingToolDefaults(saved)).toEqual(saved);
  for(const bad of [null,[],{schemaVersion:2,tools:{}},{schemaVersion:1},{schemaVersion:1,tools:{},extra:1},{schemaVersion:1,tools:{'bad type':{style:{}}}},
   {schemaVersion:1,tools:{trendline:{}}},{schemaVersion:1,tools:{trendline:{style:[]}}},{schemaVersion:1,tools:{trendline:{text:{value:'hi'}}}},{schemaVersion:1,tools:{trendline:{other:{}}}},{schemaVersion:1,tools:{trendline:{style:{w:Number.NaN}}}}])
   expect(()=>restoreDrawingToolDefaults(bad),JSON.stringify(bad)).toThrow();
 });
 it('captures style, text styling without the text, and props without a picked symbol; saves and forgets per tool',()=>{
  expect(captureToolDefault({id:'a',type:'trendline',style:{lineColor:'#00ff00'},text:{value:'secret',size:'large',bold:true},props:{x:1}})).toEqual({type:'trendline',value:{style:{lineColor:'#00ff00'},text:{size:'large',bold:true},props:{x:1}}});
  expect(captureToolDefault({id:'e',type:'lvemoji',style:{lineColor:'#fff'},props:{glyph:'X',size:'large'}}).value).toEqual({style:{lineColor:'#fff'},props:{size:'large'}});
  expect(captureToolDefault({id:'s',type:LV_STICKER,style:{lineColor:'#fff'},props:{[STICKER_PROP]:'star'}}).value).toEqual({style:{lineColor:'#fff'}});
  const one=withToolDefault(undefined,'trendline',{style:{lineColor:'#ff0000'}});
  expect(one).toEqual({schemaVersion:1,tools:{trendline:{style:{lineColor:'#ff0000'}}}});
  expect(withToolDefault(one,'box',{style:{fillColor:'#000'}}).tools).toHaveProperty('box');
  expect(withToolDefault(one,'trendline',null)).toEqual({schemaVersion:1,tools:{}});
 });
 it('workspace restore keeps a present block, leaves an absent one absent and fails on an invalid one',()=>{
  const defaults=createInitialWorkspace();
  expect(restoreWorkspace({...createInitialWorkspace(),drawingToolDefaults:saved},defaults).drawingToolDefaults).toEqual(saved);
  expect(Object.hasOwn(restoreWorkspace(createInitialWorkspace(),defaults),'drawingToolDefaults')).toBe(false);
  expect(()=>restoreWorkspace({...createInitialWorkspace(),drawingToolDefaults:{schemaVersion:1,tools:{trendline:{text:{value:'x'}}}}},defaults)).toThrow();
 });
 it('a new drawing of the tool starts from the saved default on the real native controller; the saved one beats the remembered look; reset goes back to factory',async()=>{
  const t=await nativeDrawingHarness();try{
   const factory=(createDrawing('trendline',{paneId:'price'}) as any).style.lineColor;
   loadSharedToolDefaults(saved);
   const off=connectToolDefaults(t.controller,callback=>t.on('drawing:defaults',callback));
   const anchors=[{time:T0,price:100},{time:T0+5000,price:120}];
   t.controller.add('trendline',{anchors});
   const first=t.controller.all()[0];
   expect(first.style).toMatchObject({lineColor:'#ff0000',lineWidth:3,lineStyle:'dashed'});
   // An edit makes the renderer remember that look; the saved default is put back.
   t.controller.updateDrawing(first.id,{style:{...first.style,lineColor:'#0000ff'}});
   expect(t.controller.toolDefaults().trendline).toEqual(saved.tools.trendline);
   t.controller.add('trendline',{anchors});expect(t.controller.all()[1].style.lineColor).toBe('#ff0000');
   // Another chart loading a change re-applies; forgetting the default resets the tool to factory settings.
   loadSharedToolDefaults({schemaVersion:1,tools:{}});
   expect(t.controller.toolDefaults().trendline).toBeUndefined();
   t.controller.add('trendline',{anchors});expect(t.controller.all()[2].style.lineColor).toBe(factory);
   off();loadSharedToolDefaults(saved);expect(t.controller.toolDefaults().trendline).toBeUndefined();
   expect(sharedToolDefaults()).toEqual(saved);
  }finally{t.dispose();}
 });
 it('the dialog offers Save as default and Reset settings; App saves them in the workspace and loads them into every chart',()=>{
  const dialog=read('src/ui/DrawingDialog.tsx'),app=read('src/ui/App.tsx'),adapter=read('src/chart/adapter.ts');
  expect(dialog).toContain('>Save as default</option>');expect(dialog).toContain('>Reset settings</option>');
  expect(dialog).toContain("value===\'__save-default\')saveToolDefault()");expect(dialog).toContain('captureToolDefault(row)');
  expect(app).toContain('onToolDefault={(type,value)=>commit({drawingToolDefaults:withToolDefault(current.current.drawingToolDefaults,type,value)})}');
  expect(app).toContain('loadSharedToolDefaults(workspace.drawingToolDefaults)');
  expect(adapter).toContain("connectToolDefaults(chart.drawings as unknown as ToolDefaultsFacade,callback=>chart.on('drawing:defaults',callback))");
 });
});

function managerHost(rows:Row[]){
 let doc:Row={version:1,drawings:rows};
 const host:DrawingManagerHost={read:()=>doc,write:next=>{doc=structuredClone(next);},known:type=>type==='trendline',update:()=>{},remove:()=>{},select:()=>{},front:()=>{},back:()=>{},transaction:operation=>operation(),changed:()=>{},insert:next=>{doc=structuredClone(next);}};
 return{manager:createDrawingManager(host),doc:()=>doc};
}
const line=(id:string):Row=>({id,type:'trendline',paneId:'price',anchors:[{time:1000,price:100}],style:{lineColor:'#123456'}});

describe('copy and paste keeps drawing groups',()=>{
 it('a copy keeps each group with its copied members; a paste re-keys them to the pasted ids',()=>{
  const groups=[{id:'g1',name:'Setup',memberIds:['a','b','c']},{id:'g2',name:'Other',memberIds:['d']}];
  expect(clipboardGroups(groups,['b','a','x'])).toEqual([{name:'Setup',memberIds:['a','b']}]);
  expect(clipboardGroups(groups,['x'])).toEqual([]);
  expect(pastedGroups([{name:'Setup',memberIds:['a','b']}],['b','a'],['p2','p1'])).toEqual([{name:'Setup',memberIds:['p1','p2']}]);
  expect(()=>pastedGroups([],['a'],[])).toThrow();
  const clip=createObjectClipboard(),owner={};
  clip.copy([line('a'),line('b')],{owner,symbol:null},false,[{name:'Setup',memberIds:['a','b','zz']}]);
  expect(clip.read()!.groups).toEqual([{name:'Setup',memberIds:['a','b']}]);
  // With groups, even a same-chart paste inserts, so the copies and their group land in one step.
  expect(pasteRouteFor(clip.read()!,owner,new Set(['a','b']))).toBe('insert');
  clip.copy([line('a')],{owner,symbol:null});expect(clip.read()!.groups).toBeUndefined();expect(pasteRouteFor(clip.read()!,owner,new Set(['a']))).toBe('duplicate');
 });
 it('the manager inserts the pasted rows and their new groups in one document write, keeping old groups',()=>{
  const t=managerHost([line('a'),line('b')]);const old=t.manager.group(['a','b'],'Setup');
  expect(t.manager.insert([line('p1'),line('p2')],[{name:'Setup',memberIds:['p1','p2']}])).toEqual(['p1','p2']);
  const groups=t.manager.state().groups;
  expect(groups.map(group=>[group.name,group.memberIds])).toEqual([['Setup',['a','b']],['Setup',['p1','p2']]]);
  expect(groups[1].id).not.toBe(old);
  expect(()=>t.manager.insert([line('q1')],[{name:'G',memberIds:['a']}])).toThrow('do not match');
  expect(()=>t.manager.insert([line('q1')],[{name:'G',memberIds:['q1']},{name:'H',memberIds:['q1']}])).toThrow('do not match');
  expect(()=>t.manager.insert([line('q1')],[{name:'',memberIds:['q1']}])).toThrow();
  expect((t.doc().drawings as Row[]).map(row=>row.id)).toEqual(['a','b','p1','p2']);
 });
 it('the adapter copies groups on copy and cut and inserts them with the paste',()=>{
  const adapter=read('src/chart/adapter.ts');
  expect(adapter).toContain('sharedObjectClipboard.copy(rows,{owner:document,symbol:currentSource.label||null},false,copiedGroups(rows))');
  expect(adapter).toContain('sharedObjectClipboard.copy(rows,{owner:document,symbol:currentSource.label||null},true,copiedGroups(rows))');
  expect(adapter).toContain('drawingManager.insert(rows,pastedGroups(snapshot.groups??[],snapshot.rows.map(row=>String(row.id)),rows.map(row=>String(row.id))))');
 });
});

describe('Stickers tool (original art)',()=>{
 it('registers on the pinned native box class behind the paint hook and arms the Stickers row',()=>{
  expect(lvDrawingTypeStatus().filter(row=>row.type===LV_STICKER)).toEqual([{type:LV_STICKER,base:'box',state:'registered'}]);
  const row=DRAWING_TOOL_CATALOG.flatMap(group=>group.sections.flatMap(section=>section.leaves)).find(leaf=>leaf.id===STICKER_ROW)!;
  expect(row.target).toEqual({kind:'tool',type:LV_STICKER});expect(row.label).toBe('Stickers');
  expect(getDrawingType(LV_STICKER as never)).toBeTruthy();
 });
 it('the set is OpenCandle vector art: unique ids, labels, only plain shapes, no images or URLs',()=>{
  expect(new Set(STICKER_IDS).size).toBe(STICKERS.length);expect(STICKERS.length).toBeGreaterThanOrEqual(12);
  for(const sticker of STICKERS){expect(sticker.label).toMatch(/^[A-Z][a-z ]+$/);expect(sticker.shapes.length).toBeGreaterThan(0);for(const shape of sticker.shapes)expect(['poly','line','circle','text']).toContain(shape.k);}
  const source=read('src/chart/lv-types/sticker-set.ts')+read('src/ui/StickerPicker.tsx');
  expect(source).not.toMatch(/https?:|data:image|<image|\.png|\.svg['"]|tradingview/i);
 });
 it('a click drops the picked sticker centred at the default size; a drag sizes it; it moves, resizes and round-trips',()=>{
  expect(selectedSticker()).toBe(DEFAULT_STICKER);expect(pickSticker('nope')).toBe(false);expect(pickSticker('rocket')).toBe(true);
  const sticker=createDrawing(LV_STICKER as never,{paneId:'price',anchors:[{time:T0+100_000,price:150}]}) as any;
  expect(sticker.lvSticker).toBe('rocket');expect(sticker.placementMode()).toBe('drag');expect(sticker.anchorSchema().min).toBe(1);
  sticker.onPlaced(projector);
  const box=sticker.bounds(projector);
  expect(box).toEqual({x:120-STICKER_DEFAULT_PX/2,y:150-STICKER_DEFAULT_PX/2,w:STICKER_DEFAULT_PX,h:STICKER_DEFAULT_PX});
  expect(sticker.hitTest(120,150,projector,3)).toBe(true);expect(sticker.hitTest(300,150,projector,3)).toBe(false);
  expect(sticker.handlePoints(projector)).toHaveLength(2);// two corner handles: drag either one to resize
  const dragged=createDrawing(LV_STICKER as never,{paneId:'price',anchors:[{time:T0,price:200},{time:T0+120_000,price:80}]}) as any;
  dragged.onPlaced(projector);expect(dragged.bounds(projector)).toEqual({x:20,y:100,w:120,h:120});
  const record=sticker.serialize();expect(record.props).toEqual({[STICKER_PROP]:'rocket'});
  const back=getDrawingType(LV_STICKER as never)!.create(record as never) as any;expect(back.lvSticker).toBe('rocket');expect(back.anchors).toEqual(record.anchors);
  const moved=back.translateBody(5000,-10,back.anchors);expect(moved).toHaveLength(2);
  expect(back.schema().fields.map((field:any)=>field.path)).toEqual([STICKER_PROP]);
 });
 it('paints its own shapes into the box (no image), and an unknown saved sticker paints a placeholder',()=>{
  const sticker=createDrawing(LV_STICKER as never,{paneId:'price',anchors:[{time:T0,price:200},{time:T0+100_000,price:100}],props:{[STICKER_PROP]:'buy'}}) as any;
  const record=drawingCommands();sticker.lvPaint(record.ctx,projector,{fontFamily:'sans-serif',textColor:'#fff',background:'#000'});
  const ops=record.commands.map(command=>command.op);
  expect(ops).toContain('fill');expect(record.commands.find(command=>command.op==='fillText')?.values[0]).toBe('BUY');
  const unknown=createDrawing(LV_STICKER as never,{paneId:'price',anchors:[{time:T0,price:200},{time:T0+100_000,price:100}],props:{[STICKER_PROP]:'future-sticker'}}) as any;
  expect(unknown.serialize().props).toEqual({[STICKER_PROP]:'future-sticker'});
  const placeholder=drawingCommands();unknown.lvPaint(placeholder.ctx,projector,{fontFamily:'sans-serif',textColor:'#fff',background:'#000'});
  expect(placeholder.commands.map(command=>command.op)).toEqual(['setLineDash','setLineDash','beginPath','rect','stroke']);
 });
 it('the picker renders every sticker as inline SVG and the Icons flyout has Emojis and Stickers tabs',()=>{
  const html=renderToStaticMarkup(createElement(StickerPicker,{onPick:()=>{}}));
  for(const sticker of STICKERS)expect(html).toContain('data-sticker="'+sticker.id+'"');
  expect(html.match(/<svg /g)?.length).toBe(STICKERS.length);
  expect(renderToStaticMarkup(createElement(StickerArt,{sticker:STICKERS[0],size:30}))).toContain('>BUY</text>');
  const toolbar=read('src/ui/DrawingToolbar.tsx');
  expect(toolbar).toContain("<StickerPicker onPick={()=>choose(sticker,group,alternativeIndex)}/>");expect(toolbar).toContain('role="tablist" aria-label="Icon kinds"');
 });
});
