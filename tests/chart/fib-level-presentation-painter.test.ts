import {expect,it} from 'vitest';
import {createDrawing,deserializeDrawing} from '@luxalgo/vela';
import {fibBaselineHarness,fibBaselineRecord} from './fib-trend-line-painter-harness';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import {paintFibLevelPresentation} from '../../src/chart/fib-level-presentation-painter';
import {readFibBackground,readFibLayout,readFibText} from '../../src/chart/fib-level-presentation-data';
import {nativeDrawingHarness,drawingCommands,drawingProjection} from './drawing-native-harness';
const background=(opacity:number)=>({schemaVersion:1,opacity});
const text=(enabled:boolean,position='center')=>({schemaVersion:1,enabled,position});
function row(bg?:unknown,tx?:unknown){const value=fibBaselineRecord();value.props={...value.props,lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:false}};if(arguments.length>0)value.props.lvFibBackground=bg;if(arguments.length>1)value.props.lvFibText=tx;return value;}
it('native construction, partial/default updates, clone and settings keep separate supported and unknown members',()=>{
 const model=createDrawing('fibretracement',{id:'SYNTHETIC presentation native',paneId:'price',createdAt:1,props:{lvFibBackground:background(25),lvFibText:text(false,'right')}})!;
 expect(model.serialize().props).toMatchObject({lvFibBackground:background(25),lvFibText:text(false,'right')});model.applySettings({'lvFibBackground.opacity':50,'lvFibText.enabled':true});expect(model.serialize().props).toMatchObject({lvFibBackground:background(50),lvFibText:text(true,'right')});
 const unknown={schemaVersion:99,future:undefined,nested:{negativeZero:-0}};const other=createDrawing('fibretracement',{id:'SYNTHETIC presentation unknown',paneId:'price',createdAt:1,props:{lvFibBackground:unknown,lvFibText:text(false)}})!;const before=other.serialize();
 expect(()=>other.applySettings({'lvFibBackground.opacity':50})).toThrow();expect(other.serialize()).toEqual(before);expect(other.schema().fields.some(field=>field.path==='lvFibBackground.opacity')).toBe(false);expect(other.schema().fields.some(field=>field.path==='lvFibText.enabled')).toBe(true);
 const clone=deserializeDrawing(other.serialize())!;expect(clone.serialize().props!.lvFibBackground).toEqual(unknown);expect(clone.serialize().props!.lvFibBackground).not.toBe(unknown);
});
it('actual installed legacy omission and explicit compatibility defaults preserve the exact native command sequence',async()=>{
 const f=await fibBaselineHarness();try{const legacy=row();delete legacy.props!.lvFibBackground;delete legacy.props!.lvFibText;f.top.commands.length=0;f.sync([legacy]);const before=structuredClone(f.top.commands);const explicit=structuredClone(legacy);explicit.props!.lvFibBackground=background(6);explicit.props!.lvFibText=text(true);f.top.commands.length=0;f.sync([explicit]);expect(f.top.commands).toStrictEqual(before);expect(before.filter(command=>command.op==='fillRect')).toHaveLength(1);expect(before.filter(command=>command.op==='fillText')).toHaveLength(3);}finally{f.cleanup();}
});
it.each(['null','empty'] as const)('mechanically retains actual native body once for %s entries without repeating native geometry',async kind=>{
 const f=await nativeDrawingHarness();try{const model=createDrawing('fibretracement',{id:'SYNTHETIC empty native levels',paneId:'price',createdAt:1,anchors:kind==='null'?[]:[{time:1000000,price:100},{time:1240000,price:200}],props:kind==='empty'?{levels:[{ratio:0,color:'#123456',enabled:false}]}:{}})! as any,record=drawingCommands(),native=f.painter.paintFibRatios,entry=model.entryLines,bands=model.fillBands;let bodies=0,entries=0,bandCalls=0;
  // Direct helper counters only; these own wrappers are NOT genuine model or
  // annotation authority and never enter the installed production route.
  model.entryLines=function(...args:unknown[]){entries++;return Reflect.apply(entry,this,args);};model.fillBands=function(...args:unknown[]){bandCalls++;return Reflect.apply(bands,this,args);};
  paintFibLevelPresentation(f.painter,function(this:unknown,...args:unknown[]){bodies++;expect(this).toBe(f.painter);return Reflect.apply(native,this,args);},record.ctx,model,drawingProjection,{fontFamily:'sans-serif'},{background:readFibBackground(undefined),text:readFibText(undefined),check(){},local(){},note(){throw Error('SYNTHETIC empty data should not diagnose');}});
  expect(bodies).toBe(1);expect(entries).toBe(1);expect(bandCalls).toBe(0);expect(record.commands).toEqual([]);
 }finally{f.dispose();}
});
it('mechanical actual native entry overflow withholds only invalid custom glyphs when line and number geometry remain finite',async()=>{
 const f=await nativeDrawingHarness();try{const model=deserializeDrawing(row())! as any,record=drawingCommands(),notices:unknown[]=[];
  paintFibLevelPresentation(f.painter,f.painter.paintFibRatios,record.ctx,model,{...drawingProjection,xOf:()=>Number.MAX_VALUE,yOf:()=>150},{fontFamily:'sans-serif'},{background:readFibBackground(undefined),text:readFibText(undefined),check(){},local(){},note(error){notices.push(error);}});
  expect(notices).toHaveLength(1);expect(record.commands.filter(command=>command.op==='stroke')).toHaveLength(2);expect(record.commands.filter(command=>command.op==='fillText')).toHaveLength(2);expect(record.commands.filter(command=>command.op==='fillRect')).toHaveLength(1);expect(record.commands.some(command=>command.values.some((value:unknown)=>typeof value==='number'&&!Number.isFinite(value)))).toBe(false);
 }finally{f.dispose();}
});
it('mechanical actual native bands refuse overflowing height before any canvas call',async()=>{
 const f=await nativeDrawingHarness();try{const model=deserializeDrawing(row())! as any,record=drawingCommands();expect(()=>paintFibLevelPresentation(f.painter,f.painter.paintFibRatios,record.ctx,model,{...drawingProjection,yOf:(price:number)=>price>150?1e308:-1e308},{fontFamily:'sans-serif'},{background:readFibBackground(undefined),text:readFibText(undefined),check(){},local(){},note(){}})).toThrow(/band geometry/);expect(record.commands).toEqual([]);}finally{f.dispose();}
});
it('mechanical actual native very large but representable resolved entries retain all valid outputs',async()=>{
 const f=await nativeDrawingHarness();try{const model=deserializeDrawing(row())! as any,record=drawingCommands(),notices:unknown[]=[];paintFibLevelPresentation(f.painter,f.painter.paintFibRatios,record.ctx,model,{...drawingProjection,xOf:()=>1e307,yOf:()=>150},{fontFamily:'sans-serif'},{background:readFibBackground(undefined),text:readFibText(undefined),check(){},local(){},note(error){notices.push(error);}});expect(notices).toEqual([]);expect(record.commands.filter(command=>command.op==='stroke')).toHaveLength(2);expect(record.commands.filter(command=>command.op==='fillText')).toHaveLength(3);expect(record.commands.find(command=>command.op==='fillText'&&command.values[0]==='SYNTHETIC first')!.values).toEqual(['SYNTHETIC first',1e307,143]);}finally{f.dispose();}
});
it.each([0,6,25,50,100])('actual installed native body applies %s percent to fills only',async opacity=>{
 const f=await fibBaselineHarness();try{f.top.ctx.globalAlpha=.8;f.sync([row(background(opacity),text(true))]);const commands=f.top.commands,fill=commands.filter(command=>command.op==='fillRect');expect(fill).toHaveLength(1);expect(fill[0].alpha).toBe(.8*(opacity/100));expect(commands.filter(command=>['fillText','stroke'].includes(command.op)).every(command=>command.alpha===.8)).toBe(true);expect(f.top.ctx.globalAlpha).toBe(.8);}finally{f.cleanup();}
});
it.each(['left','center','right'])('actual installed ordinal custom glyph uses %s while automatic labels remain separate',async side=>{
 const f=await fibBaselineHarness();try{f.sync([row(background(50),text(true,side))]);const commands=f.top.commands,labels=commands.filter(command=>command.op==='fillText'),custom=labels.find(command=>command.values[0]==='SYNTHETIC first')!;expect(custom).toBeDefined();expect(custom.align).toBe(side);const number=labels.find(command=>String(command.values[0]).includes('0.236'))!;expect(number.align).toBe('left');const path=commands.filter(command=>command.op==='moveTo'||command.op==='lineTo');const x1=path[0].values[0],x2=path[1].values[0],expected=side==='left'?Math.min(x1,x2)+4:side==='right'?Math.max(x1,x2)-4:(x1+x2)/2;expect(custom.values[1]).toBe(expected);}finally{f.cleanup();}
});
it.each(['unknown-background','unknown-text','unknown-baseline','both-new-unknown'])('isolates %s interpretation under the shared actual owner',async kind=>{
 const f=await fibBaselineHarness();try{const value=row(kind==='unknown-background'||kind==='both-new-unknown'?undefined:background(50),kind==='unknown-text'||kind==='both-new-unknown'?{schemaVersion:99}:text(true,'right'));if(kind==='unknown-baseline')value.props!.lvFibTrendLine={schemaVersion:99,future:undefined};f.sync([value]);const commands=f.top.commands;expect(commands.filter(command=>command.op==='stroke')).toHaveLength(2);expect(commands.filter(command=>command.op==='fillRect')).toHaveLength(kind==='unknown-background'||kind==='both-new-unknown'?0:1);expect(commands.filter(command=>command.op==='fillText'&&command.values[0]==='SYNTHETIC first')).toHaveLength(kind==='unknown-text'||kind==='both-new-unknown'?0:1);expect(commands.filter(command=>command.op==='fillText')).toHaveLength(kind==='unknown-text'||kind==='both-new-unknown'?2:3);}finally{f.cleanup();}
});
it('retains pre-baseline common canonical ownership and aborts native continuation after equal replacement',async()=>{
 const f=await fibBaselineHarness();let original:Function|undefined;try{const value=row(background(50),text(true));value.props!.lvFibTrendLine={...nativeFibTrendLineDefaults(),enabled:true};f.sync([value]);const ctx=f.top.ctx;original=ctx.lineTo;let changed=0;ctx.lineTo=function(...args:unknown[]){const result=Reflect.apply(original!,this,args);if(!changed++&&args[1]!==f.top.commands.find(command=>command.op==='moveTo')?.values[1])f.document.load({version:1,drawings:[structuredClone(value)]});return result;};f.top.commands.length=0;expect(()=>f.render()).toThrow();expect(changed).toBeGreaterThan(0);expect(f.top.commands.filter(command=>command.op==='fillText'||command.op==='fillRect')).toEqual([]);}finally{if(original)f.top.ctx.lineTo=original;f.cleanup();}
});
it('source retirement in the effective alpha setter prevents the native fill and unwinds its acquired save',async()=>{
 const f=await fibBaselineHarness();try{const value=row(background(50),text(true));f.sync([value]);const ctx=f.top.ctx;let alpha=.8,injected=0,nextSave=0,bandSave:number|undefined;const active:number[]=[],restored:number[]=[],save=ctx.save,restore=ctx.restore;ctx.save=function(){active.push(++nextSave);return Reflect.apply(save,this,[]);};ctx.restore=function(){const id=active.pop();if(id!==undefined)restored.push(id);return Reflect.apply(restore,this,[]);};Object.defineProperty(ctx,'globalAlpha',{configurable:true,enumerable:true,get(){return alpha;},set(next){alpha=next;if(next===.4&&!injected++){bandSave=active.at(-1);f.retireSource();}}});f.top.commands.length=0;expect(()=>f.render()).toThrow();expect(injected).toBeGreaterThan(0);expect(f.top.commands.filter(command=>command.op==='fillRect'||command.op==='fillText')).toEqual([]);expect(bandSave).toBeDefined();expect(restored.filter(id=>id===bandSave)).toHaveLength(1);}finally{f.cleanup();}
});

it('applies a stored lvFibLayout: font size, label alignment and log-scale levels; absent layout keeps the native picture',async()=>{
 const f=await nativeDrawingHarness();try{
  const run=(layoutProps?:unknown)=>{const model=deserializeDrawing(row())! as any,record=drawingCommands(),notices:unknown[]=[];
   paintFibLevelPresentation(f.painter,f.painter.paintFibRatios,record.ctx,model,drawingProjection,{fontFamily:'sans-serif'},{background:readFibBackground(undefined),text:readFibText(undefined),layout:readFibLayout(layoutProps),check(){},local(){},note(error){notices.push(error);}});
   return{record,notices};};
  const plain=run(),absent=run(undefined);expect(absent.record.commands).toEqual(plain.record.commands);
  const layout={lvFibLayout:{schemaVersion:1,fontSize:20,labelHorz:'right',labelVert:'bottom',textHorz:'center',textVert:'middle',logScale:false}};
  const laid=run(layout);expect(laid.notices).toEqual([]);
  expect(laid.record.commands.filter(c=>c.op==='fillText')).toHaveLength(plain.record.commands.filter(c=>c.op==='fillText').length);
  expect(JSON.stringify(laid.record.commands)).toContain('20px sans-serif');expect(JSON.stringify(plain.record.commands)).not.toContain('20px');
  expect(JSON.stringify(laid.record.commands)).toContain('"right"');
  const logged=run({lvFibLayout:{...layout.lvFibLayout,logScale:true}});expect(logged.notices).toEqual([]);
  const ys=(r:ReturnType<typeof run>)=>r.record.commands.filter(c=>c.op==='moveTo').map(c=>c.values[1]);
  expect(ys(logged)).not.toEqual(ys(plain));
 }finally{f.dispose();}
});
