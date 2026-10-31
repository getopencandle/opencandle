import {expect,it} from 'vitest';
import {fibBaselineHarness,fibBaselineRecord} from '../chart/fib-trend-line-painter-harness';
import {nativeFibTrendLineDefaults} from '../../src/chart/fib-level-format-native';
import {statsPainterHarness} from '../chart/trendline-stats-painter-harness';
import {registerOwnedFibTrendLine} from '../../src/chart/trendline-annotation';
import {readFibBackground,readFibText} from '../../src/chart/fib-level-presentation-data';

// All fixtures are synthetic. These invoke the actual registered painter,
// annotation frame, canonical/core owners and retained native method bodies.
function record(legacy=false){
 const row=fibBaselineRecord();row.props={...row.props,lvFibTrendLine:{...nativeFibTrendLineDefaults(),enabled:false},showPrices:false};
 if(legacy){delete row.props.lvFibBackground;delete row.props.lvFibText;}
 else{row.props.lvFibBackground={schemaVersion:1,opacity:40};row.props.lvFibText={schemaVersion:1,enabled:true,position:'right'};}
 return row;
}
function drawing(commands:any[]){return commands.filter(command=>['fillRect','stroke','fillText'].includes(command.op));}
function failure(action:()=>void){let error:unknown;try{action();}catch(cause){error=cause;}return error;}
function errors(error:unknown):string[]{return error instanceof AggregateError?[String(error),...error.errors.flatMap(errors)]:[String(error)];}

it('legacy omission stops before subsequent native strokes or glyphs after source loss in the first native path callback',async()=>{
 const f=await fibBaselineHarness();let original:Function|undefined;
 try{
  f.sync([record(true)]);expect(f.top.commands.filter(command=>command.op==='stroke')).toHaveLength(2);
  const ctx=f.top.ctx;original=ctx.moveTo;let injected=0,cut=0;
  ctx.moveTo=function(...args:unknown[]){const result=Reflect.apply(original!,this,args);if(!injected++){f.retireSource();cut=f.top.commands.length;}return result;};
  f.top.commands.length=0;const error=failure(()=>f.render());
  expect(injected).toBeGreaterThan(0);expect(error).toBeInstanceOf(Error);
  expect(f.top.commands.slice(cut).filter(command=>['lineTo','stroke','fillText','fillRect'].includes(command.op))).toStrictEqual([]);
 }finally{if(original)f.top.ctx.moveTo=original;f.cleanup();}
});

it('the common owner predates a baseline state setter and never reacquires after equal canonical replacement',async()=>{
 const f=await fibBaselineHarness();let previous:PropertyDescriptor|undefined;
 try{
  const row=record();row.props!.lvFibTrendLine={...nativeFibTrendLineDefaults(),enabled:true,color:'rgba(20,40,60,0.25)',width:5,style:'dashed'};
  f.sync([row]);expect(f.top.commands.some(command=>command.op==='stroke'&&command.color==='rgba(20,40,60,0.25)')).toBe(true);
  const ctx=f.top.ctx;previous=Object.getOwnPropertyDescriptor(ctx,'strokeStyle');let value=ctx.strokeStyle,injected=0,cut=0;
  Object.defineProperty(ctx,'strokeStyle',{configurable:true,enumerable:true,get(){return value;},set(next){value=next;if(next==='rgba(20,40,60,0.25)'&&!injected++){f.document.load({version:1,drawings:[structuredClone(row)]});cut=f.top.commands.length;}}});
  f.top.commands.length=0;const error=failure(()=>f.render());
  expect(injected).toBeGreaterThan(0);expect(error).toBeInstanceOf(Error);expect(drawing(f.top.commands.slice(cut))).toStrictEqual([]);
 }finally{if(previous)Object.defineProperty(f.top.ctx,'strokeStyle',previous);f.cleanup();}
});

it.each(['source','layout','native','target'] as const)('a real automatic glyph callback losing %s aborts all subsequent custom glyphs and levels',async kind=>{
 const f=await fibBaselineHarness();let previous:Function|undefined;
 try{
  const row=record();f.sync([row]);expect(f.top.commands.filter(command=>command.op==='fillText')).toHaveLength(3);
  const ctx=f.top.ctx;previous=ctx.fillText;let injected=0,cut=0;
  ctx.fillText=function(...args:unknown[]){const result=Reflect.apply(previous!,this,args);if(!injected++){
   if(kind==='source')f.retireSource();
   else if(kind==='layout')f.pane.scale.max+=1;
   else if(kind==='native')f.core.controller.store.get(row.id)!.applySettings({'lvFibText.enabled':false});
   else f.controller.drawings[0].applySettings({'lvFibText.enabled':false});
   cut=f.top.commands.length;
  }return result;};
  f.top.commands.length=0;const error=failure(()=>f.render());
  if(kind==='source'){expect(injected).toBe(1);expect(error).toBeInstanceOf(Error);expect(drawing(f.top.commands.slice(cut))).toStrictEqual([]);}
  // Layout/native/target loss has no per-operation re-proof (only source liveness is checked per op); the frame completes and is refused at its completion guard.
  else{expect(injected).toBe(3);expect(error).toBeInstanceOf(Error);expect(drawing(f.top.commands.slice(cut)).length).toBeGreaterThan(0);}
 }finally{if(previous)f.top.ctx.fillText=previous;f.cleanup();}
});

it('a real effective-alpha setter losing layout prevents the band fill and all native glyphs',async()=>{
 const f=await fibBaselineHarness();let prior:PropertyDescriptor|undefined;
 try{
  f.sync([record()]);const ctx=f.top.ctx;prior=Object.getOwnPropertyDescriptor(ctx,'globalAlpha');let alpha=.5,injected=0;
  Object.defineProperty(ctx,'globalAlpha',{configurable:true,enumerable:true,get(){return alpha;},set(value){alpha=value;if(value===.2&&!injected++)f.pane.scale.max+=1;}});
  f.top.commands.length=0;const error=failure(()=>f.render());expect(injected).toBeGreaterThan(0);expect(error).toBeInstanceOf(Error);
  // No per-operation re-proof; the frame completes and is refused at its completion guard.
  expect(drawing(f.top.commands).length).toBeGreaterThan(0);
 }finally{if(prior)Object.defineProperty(f.top.ctx,'globalAlpha',prior);f.cleanup();}
});

it('the real incoming-alpha getter is a guarded callback before its band fill',async()=>{
 const f=await fibBaselineHarness();let previousSave:Function|undefined,previousFill:Function|undefined,prior:PropertyDescriptor|undefined;
 try{
  f.sync([record()]);const ctx=f.top.ctx;previousSave=ctx.save;previousFill=ctx.fillRect;
  let saves=0,bandSave=0,insideSave=false,armed=false,injected=0;
  ctx.save=function(){saves++;insideSave=true;try{return Reflect.apply(previousSave!,this,[]);}finally{insideSave=false;}};
  ctx.fillRect=function(...args:unknown[]){bandSave=saves;return Reflect.apply(previousFill!,this,args);};
  f.top.commands.length=0;f.render();expect(f.top.commands.filter(command=>command.op==='fillRect')).toHaveLength(1);expect(bandSave).toBeGreaterThan(0);
  prior=Object.getOwnPropertyDescriptor(ctx,'globalAlpha');let alpha=.5;
  Object.defineProperty(ctx,'globalAlpha',{configurable:true,enumerable:true,get(){if(armed&&!insideSave&&saves===bandSave&&!injected++)f.retireSource();return alpha;},set(value){alpha=value;}});
  saves=0;armed=true;f.top.commands.length=0;const error=failure(()=>f.render());
  expect(injected).toBeGreaterThan(0);expect(error).toBeInstanceOf(Error);expect(drawing(f.top.commands)).toStrictEqual([]);
 }finally{if(prior)Object.defineProperty(f.top.ctx,'globalAlpha',prior);if(previousSave)f.top.ctx.save=previousSave;if(previousFill)f.top.ctx.fillRect=previousFill;f.cleanup();}
});

it('partial band failure attempts its own save cleanup once and retains both primary and restore errors without replay',async()=>{
 const f=await fibBaselineHarness();let previousFill:Function|undefined,previousSave:Function|undefined,previousRestore:Function|undefined;
 try{
  f.sync([record()]);const ctx=f.top.ctx;previousFill=ctx.fillRect;previousSave=ctx.save;previousRestore=ctx.restore;
  let next=0,band:number|undefined;const active:number[]=[],attempts:number[]=[];
  ctx.save=function(){active.push(++next);return Reflect.apply(previousSave!,this,[]);};
  ctx.restore=function(){const id=active.pop();if(id!==undefined)attempts.push(id);const result=Reflect.apply(previousRestore!,this,[]);if(id===band)throw Error('SYNTHETIC independent band restore failure');return result;};
  ctx.fillRect=function(){band=active.at(-1);throw Error('SYNTHETIC independent band paint failure');};
  f.top.commands.length=0;const error=failure(()=>f.render());
  expect(band).toBeDefined();expect(attempts.filter(id=>id===band)).toHaveLength(1);
  expect(errors(error).join('\n')).toContain('SYNTHETIC independent band paint failure');expect(errors(error).join('\n')).toContain('SYNTHETIC independent band restore failure');
  expect(drawing(f.top.commands)).toStrictEqual([]);
  // This does not certify parent NativePainter.paintClipped save-stack debt.
 }finally{if(previousFill)f.top.ctx.fillRect=previousFill;if(previousSave)f.top.ctx.save=previousSave;if(previousRestore)f.top.ctx.restore=previousRestore;f.cleanup();}
});

it.each(['background','text','baseline'] as const)('unknown %s leaves the other actual native operations independent',async unknown=>{
 const f=await fibBaselineHarness();try{
  const row=record();row.props![unknown==='background'?'lvFibBackground':unknown==='text'?'lvFibText':'lvFibTrendLine']=undefined;
  f.sync([row]);const commands=f.top.commands;
  expect(commands.filter(command=>command.op==='stroke')).toHaveLength(2);
  expect(commands.filter(command=>command.op==='fillRect')).toHaveLength(unknown==='background'?0:1);
  expect(commands.filter(command=>command.op==='fillText').map(command=>command.values[0])).toStrictEqual(unknown==='text'?['0.236','0.618']:['0.236','SYNTHETIC first','0.618']);
 }finally{f.cleanup();}
});

it('empty automatic strings and duplicate custom strings retain actual native ordinal order and literal right placement',async()=>{
 const f=await fibBaselineHarness();try{
  const row=record();Object.assign(row.props!,{showRatios:false,showPrices:false,levels:[
   {ratio:.236,color:'#123456',enabled:true,label:'SYNTHETIC duplicate'},
   {ratio:.236,color:'#abcdef',enabled:true,label:'SYNTHETIC duplicate'},
   {ratio:.618,color:'#fedcba',enabled:true,label:'SYNTHETIC duplicate'},
  ]});f.sync([row]);const glyphs=f.top.commands.filter(command=>command.op==='fillText');
  expect(glyphs.map(command=>command.values[0])).toStrictEqual(['','SYNTHETIC duplicate','','SYNTHETIC duplicate','','SYNTHETIC duplicate']);
  for(const ordinal of [1,3,5]){expect(glyphs[ordinal].align).toBe('right');expect(glyphs[ordinal].values[1]).toBe(396);}
  for(const ordinal of [0,2,4])expect(glyphs[ordinal].align).toBe('left');
  expect(f.top.commands.filter(command=>command.op==='stroke')).toHaveLength(3);expect(f.top.commands.filter(command=>command.op==='fillRect')).toHaveLength(2);
 }finally{f.cleanup();}
});

it.each(['borrowed receiver','second call','swallowed canvas reentry'] as const)('real annotation continuation rejects %s and expires after its invocation',async kind=>{
 const f=await statsPainterHarness([]);let mode='healthy',target:any,continuation:Function|undefined,nested=0,original:Function|undefined;
 const row=record(),options={background:readFibBackground(row.props),text:readFibText(row.props),check(){},local(){},note(){}};
 // Trusted controlled hook tests only the private annotation protocol. Its
 // no-op check is NOT claimed as canonical/core common-owner authority; the
 // actual installed common owner is exercised by all preceding cases.
 const registration=registerOwnedFibTrendLine(f.renderer,{paint(){},hit(){return undefined;},paintWithLevels(value,_ctx,_projector,_theme,_stroke,invoke){
  target=value;continuation=invoke;
  if(mode==='borrowed receiver'){Reflect.apply(invoke,{...value},[options]);return;}
  Reflect.apply(invoke,value,[options]);if(mode==='second call')Reflect.apply(invoke,value,[options]);
 }});
 try{
  f.document.load({version:1,drawings:[row]});f.core.controller.fromJSON({version:1,drawings:[row]});
  expect(f.top.commands.filter(command=>command.op==='stroke')).toHaveLength(2);
  const before=f.top.commands.slice();expect(()=>Reflect.apply(continuation!,target,[options])).toThrow();expect(f.top.commands).toStrictEqual(before);
  if(kind==='swallowed canvas reentry'){
   original=f.top.ctx.fillRect;f.top.ctx.fillRect=function(...args:unknown[]){const result=Reflect.apply(original!,this,args);try{Reflect.apply(continuation!,target,[options]);}catch{nested++;}return result;};
  }
  mode=kind;f.top.commands.length=0;const error=failure(()=>f.render());expect(error).toBeInstanceOf(Error);
  if(kind==='borrowed receiver')expect(drawing(f.top.commands)).toStrictEqual([]);
  else if(kind==='second call'){expect(f.top.commands.filter(command=>command.op==='stroke')).toHaveLength(2);expect(f.top.commands.filter(command=>command.op==='fillText')).toHaveLength(3);}
  else{expect(nested).toBe(1);expect(f.top.commands.filter(command=>command.op==='fillRect')).toHaveLength(1);expect(f.top.commands.filter(command=>command.op==='stroke'||command.op==='fillText')).toStrictEqual([]);}
 }finally{if(original)f.top.ctx.fillRect=original;registration.dispose();f.cleanup();}
});

it.each(['sparse levels','own array provider','nonfinite anchor'] as const)('actual model admission refuses %s before native paint',async kind=>{
 const f=await fibBaselineHarness();try{
  f.sync([record()]);const model=f.controller.drawings[0] as any;let providers=0;
  if(kind==='sparse levels'){const levels=[];levels[0]=model.levels[0];levels[2]=model.levels[1];model.levels=levels;}
  else if(kind==='own array provider'){const anchors=model.anchors.map((point:any)=>({...point}));Object.defineProperty(anchors,'map',{configurable:true,value(){providers++;return[];}});model.anchors=anchors;}
  else model.anchors[1].price=Infinity;
  f.top.commands.length=0;expect(failure(()=>f.render())).toBeInstanceOf(Error);expect(providers).toBe(0);expect(drawing(f.top.commands)).toStrictEqual([]);
 }finally{f.cleanup();}
});

it('finite anchor subtraction overflow never sends nonfinite resolved coordinates to actual Canvas operations',async()=>{
 const f=await fibBaselineHarness();try{
  const row=record();row.anchors[0].price=Number.MAX_VALUE;row.anchors[1].price=-Number.MAX_VALUE;
  expect(Number.isFinite(row.anchors[0].price)&&Number.isFinite(row.anchors[1].price)).toBe(true);
  f.top.commands.length=0;failure(()=>f.sync([row]));
  const malformed=f.top.commands.filter(command=>['moveTo','lineTo','fillRect','fillText'].includes(command.op)&&command.values.some((value:unknown)=>typeof value==='number'&&!Number.isFinite(value)));
  expect(malformed).toStrictEqual([]);
 }finally{f.cleanup();}
});

it('preserves a thrown undefined primary and the exact restore Error in their original order',async()=>{
 const f=await fibBaselineHarness();let previousFill:Function|undefined,previousSave:Function|undefined,previousRestore:Function|undefined;
 try{
  f.sync([record()]);const ctx=f.top.ctx;previousFill=ctx.fillRect;previousSave=ctx.save;previousRestore=ctx.restore;
  const cleanupCause=Error('SYNTHETIC exact independent restore identity');let next=0,band:number|undefined,primary=0;const active:number[]=[],attempts:number[]=[];
  ctx.save=function(){active.push(++next);return Reflect.apply(previousSave!,this,[]);};
  ctx.restore=function(){const id=active.pop();if(id!==undefined)attempts.push(id);const result=Reflect.apply(previousRestore!,this,[]);if(id===band)throw cleanupCause;return result;};
  ctx.fillRect=function(){band=active.at(-1);primary++;throw undefined;};
  f.top.commands.length=0;const error=failure(()=>f.render());
  expect(primary).toBe(1);expect(band).toBeDefined();expect(attempts.filter(id=>id===band)).toHaveLength(1);expect(drawing(f.top.commands)).toStrictEqual([]);
  expect(error).toBeInstanceOf(AggregateError);const causes=(error as AggregateError).errors;
  expect(causes).toHaveLength(2);expect(causes[0]).toBeUndefined();expect(causes[1]).toBe(cleanupCause);
 }finally{if(previousFill)f.top.ctx.fillRect=previousFill;if(previousSave)f.top.ctx.save=previousSave;if(previousRestore)f.top.ctx.restore=previousRestore;f.cleanup();}
});
