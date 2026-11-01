import {afterEach,describe,expect,it} from 'vitest';
import {deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {capturePositionDrawing} from '../../src/domain/alert-position';
import {registerPositionChartContext,POSITION_ATR_DEFAULTS,POSITION_ATR_FIELD,positionAtr,positionAtrStop,positionLabels,positionStats,validatePositionAtr} from '../../src/chart/lv-types/position-tool';
import {bars as fixtureBars} from './dwb3-helpers';
let unregister:()=>void=()=>{};
afterEach(()=>{unregister();unregister=()=>{};});

// SYNTHETIC bars with hand-computed Wilder ATR oracles for the Stop from ATR option of Long and Short position.
const DAY=86_400_000,T0=1_700_000_000_000;
const flat=(count:number)=>Array.from({length:count},(_,i)=>({time:T0+i*DAY,open:100,high:101,low:99,close:100,volume:1}));
// Twenty bars with a true range of 2 each: ATR(14) is 2 at every bar from the 14th on, so k 2 gives a stop 4 from the entry.
const BARS=flat(20),ENTRY_TIME=T0+19*DAY,END=ENTRY_TIME+10*DAY;
const ATR_ON={enabled:true,multiplier:2,length:14};
const record=(type:string,props:Record<string,unknown>,target=120,id='atr-'+type):SerializedDrawing=>({id,type,paneId:'price',anchors:[{time:ENTRY_TIME,price:100},{time:END,price:target>100?90:110},{time:END,price:target}],style:{lineColor:'#808080',lineWidth:1,lineStyle:'solid'},locked:false,visible:true,zIndex:0,createdAt:1,props:{accountBalance:1000,riskPercent:25,...props}} as unknown as SerializedDrawing);
const proj=(bars:readonly {time:number}[]=BARS)=>({xOf:(t:number)=>(t-T0)/DAY*20+10,yOf:(p:number)=>400-p*2,pxToPoint:()=>({time:T0,price:100}),paneIdAtY:()=>'price',barsInRange:(from:number,to:number)=>bars.filter(bar=>bar.time>=from&&bar.time<=to)}) as never;
function paint(model:any,p=proj()){const texts:string[]=[];const ctx:any={globalAlpha:1,save(){},restore(){},beginPath(){},stroke(){},fill(){},rect(){},fillRect(){},moveTo(){},lineTo(){},setLineDash(){},measureText:(s:string)=>({width:s.length*7}),fillText:(s:string)=>{texts.push(s);}};model.lvPaint(ctx,p,{fontFamily:'sans-serif',textColor:'#000',background:'#fff'});return texts;}

describe('Stop from ATR numbers',()=>{
 it("Wilder's ATR: the mean of the first true ranges, then (previous x (n - 1) + TR) / n, up to the entry bar",()=>{
  // Closes stay at 100, so each true range is high minus low: 2, 4, 6, 1, 7. ATR(3): 4 at bar 2, (4 x 2 + 1) / 3 = 3, (3 x 2 + 7) / 3 = 13 / 3.
  const ranges=[2,4,6,1,7],bars=ranges.map((range,i)=>({time:T0+i*DAY,high:100+range/2,low:100-range/2,close:100}));
  expect(positionAtr(bars,T0+2*DAY,3)).toBe(4);
  expect(positionAtr(bars,T0+3*DAY,3)).toBe(3);
  expect(positionAtr(bars,T0+4*DAY,3)).toBeCloseTo(13/3,12);
  // An entry inside bar 3 (after its open) still reads bar 3; bars after the entry never count.
  expect(positionAtr(bars,T0+3*DAY+3_600_000,3)).toBe(3);
  expect(positionAtr(bars,T0+DAY,3)).toBeNull();expect(positionAtr(bars,T0-1,3)).toBeNull();expect(positionAtr(null,T0,3)).toBeNull();
  // A gap counts from the previous close: high 106, low 104 after a close of 100 is a true range of 6; (2 + 6) / 2 = 4.
  expect(positionAtr([{time:T0,high:101,low:99,close:100},{time:T0+DAY,high:106,low:104,close:105}],T0+DAY,2)).toBe(4);
  expect(positionAtr(BARS,ENTRY_TIME,14)).toBe(2);
 });
 it('the stop sits k x ATR below a long entry and above a short one',()=>{
  expect(positionAtrStop({entry:100,target:120},2,2)).toBe(96);
  expect(positionAtrStop({entry:100,target:80},2,2)).toBe(104);
  expect(positionAtrStop({entry:100,target:120},2.5,1.5)).toBe(96.25);
  expect(positionAtrStop({entry:100,target:120},null,2)).toBeNull();expect(positionAtrStop({entry:100,target:120},0,2)).toBeNull();
 });
 it('sizing floors risk amount / (k x ATR x lot size) to whole lots',()=>{
  const money={accountBalance:1000,riskPercent:25,lotSize:1,precision:2,tick:0.01,wholeLots:true};
  // 250 / 4 = 62.5 -> 62 lots; the stop amount is 62 x 4 = 248.
  expect(positionStats({entry:100,stop:96,target:120},money)).toMatchObject({qty:62,riskAmount:250,stop:{offset:4,amount:248}});
  expect(positionStats({entry:100,stop:97,target:120},money).qty).toBe(83);
  expect(positionStats({entry:100,stop:96,target:120},{...money,lotSize:2}).qty).toBe(31);
  // 300 / 0.1 is 2999.9999999999995 in binary floating point; it is 3000 lots.
  expect(positionStats({entry:100,stop:99.9,target:120},{...money,riskPercent:30}).qty).toBe(3000);
  // Without whole lots the quantity rounds to Qty precision as before.
  expect(positionStats({entry:100,stop:96,target:120},{...money,wholeLots:false}).qty).toBe(62.5);
 });
 it('the middle plate shows the ATR and k x ATR, full and compact',()=>{
  const s=positionStats({entry:100,stop:96,target:120},{accountBalance:1000,riskPercent:25,lotSize:1,precision:2,tick:0.01,wholeLots:true});
  const atr={value:2,multiplier:2,length:14};
  expect(positionLabels(s,{state:'waiting'},{compact:false,priceDecimals:2,precision:2,atr}).middle).toEqual(['Not filled, Qty: 62.00','Risk/reward ratio: 5','ATR (14): 2.00, 2 x ATR: 4.00']);
  expect(positionLabels(s,{state:'waiting'},{compact:true,priceDecimals:2,precision:0,atr:{...atr,multiplier:1.5}}).middle).toEqual(['Not filled, Qty: 62, R/R: 5, ATR (14): 2.00, 1.5 x ATR: 3.00']);
  expect(positionLabels(s,{state:'waiting'},{compact:false,priceDecimals:2,precision:2,atr:{...atr,value:null}}).middle[2]).toBe('ATR (14): needs 14 bars');
 });
 it('validates the saved member whole',()=>{
  expect(validatePositionAtr(ATR_ON)).toEqual(ATR_ON);expect(POSITION_ATR_DEFAULTS).toEqual({enabled:false,multiplier:2,length:14});
  for(const bad of [{...ATR_ON,multiplier:0},{...ATR_ON,length:1.5},{...ATR_ON,length:0},{...ATR_ON,extra:1},{enabled:true,multiplier:2},[],null,{...ATR_ON,enabled:'yes'}])expect(()=>validatePositionAtr(bad)).toThrow();
 });
});

describe.each(['position','lvshortposition'] as const)('%s with Stop from ATR',kind=>{
 const target=kind==='position'?120:80,atrStop=kind==='position'?96:104;
 it('an old saved position (no member) loads and saves unchanged and reads as off',()=>{
  const old=record(kind,{},target),before=JSON.stringify(old),model=deserializeDrawing(structuredClone(old))! as any;
  paint(model);
  const again=model.serialize();expect(Object.hasOwn(again.props,POSITION_ATR_FIELD)).toBe(false);expect(again.props).toMatchObject(old.props!);
  expect(again.anchors.map((anchor:any)=>anchor.price)).toEqual([100,kind==='position'?90:110,target]);expect(JSON.stringify(old)).toBe(before);
  expect(model.lvStats(proj()).stats.qty).toBe(25);
  const editor=drawingEditor(old,fixtureBars);
  expect(editor.values).toMatchObject({'lvPosition.atrStop':false,'lvPosition.atrMultiplier':2,'lvPosition.atrLength':14});
  expect(editor.fields.find(field=>field.path==='lvPosition.atrMultiplier')?.when).toEqual({path:'lvPosition.atrStop',in:[true]});
 });
 it('on: the paint puts the stop at k x ATR, sizes whole lots and labels the ATR',()=>{
  const model=deserializeDrawing(record(kind,{[POSITION_ATR_FIELD]:ATR_ON},target))! as any;
  const texts=paint(model);
  expect(model.stopPrice).toBe(atrStop);
  const stats=model.lvStats(proj()).stats;expect(stats.qty).toBe(62);expect(stats.stop.offset).toBe(4);
  expect(texts).toContain('ATR (14): 2.00, 2 x ATR: 4.00');expect(texts).toContain('Stop: 4.00 (4.00%) 400, Amount: 248.00');
  const saved=model.serialize();expect(saved.props[POSITION_ATR_FIELD]).toEqual(ATR_ON);expect(saved.anchors[1].price).toBe(atrStop);
  // The stop follows the entry when it is dragged and snaps back when the stop handle is dragged.
  model.anchors[0].price=110;model.constrainHandleDrag(0);expect(model.stopPrice).toBe(kind==='position'?106:114);
  model.anchors[1].price=kind==='position'?100:120;model.constrainHandleDrag(1);expect(model.stopPrice).toBe(kind==='position'?106:114);
 });
 it('with too few bars the stop stays, the quantity is the usual one and the plate says why',()=>{
  const model=deserializeDrawing(record(kind,{[POSITION_ATR_FIELD]:ATR_ON},target,'atr-few-'+kind))! as any,few=proj(flat(20).slice(10));
  const texts=paint(model,few);
  expect(model.stopPrice).toBe(kind==='position'?90:110);expect(model.lvStats(few).stats.qty).toBe(25);
  expect(texts).toContain('ATR (14): needs 14 bars');
 });
 it('the settings turn it on; the first paint writes the ATR stop to the saved record once; later edits read it back',()=>{
  const old=record(kind,{},target,'atr-edit-'+kind),far=kind==='position'?90:110;
  // Apply has no chart bars: the member turns on, the stop waits for the chart.
  const on=patchDrawingEdit(old,fixtureBars,{'lvPosition.atrStop':true});
  expect((on.props as any)[POSITION_ATR_FIELD]).toEqual(ATR_ON);expect(on.anchors[1].price).toBe(far);
  expect(Object.hasOwn(on.props!,'lvPositionInputs')).toBe(false);
  const model=deserializeDrawing(structuredClone(on))! as any,persisted:string[]=[];
  unregister=registerPositionChartContext({owns:({model:item})=>item===model,persist:id=>persisted.push(id)});
  paint(model);paint(model);paint(model);
  expect(model.stopPrice).toBe(atrStop);expect(persisted).toEqual([on.id]);
  // What the chart's quiet reconciliation writes: the model's record, now with the ATR stop.
  const synced=model.serialize() as SerializedDrawing;expect(synced.anchors[1].price).toBe(atrStop);
  // A rebuilt model reads ATR = |entry - stop| / k = 2 back from the saved record: k 3 puts the stop 6 away.
  const k3=patchDrawingEdit(synced,fixtureBars,{'lvPosition.atrMultiplier':3});expect(k3.anchors[1].price).toBe(kind==='position'?94:106);
  // Moving the entry price (same entry bar) keeps 3 x ATR.
  const moved=patchDrawingEdit(k3,fixtureBars,{entryPrice:kind==='position'?101:99});expect(moved.anchors[1].price).toBe(kind==='position'?95:105);
  // A new length cannot be read back: the stop waits for the chart (ATR(5) of these bars is 2 as well, so it stays).
  const len=patchDrawingEdit(k3,fixtureBars,{'lvPosition.atrLength':5});expect((len.props as any)[POSITION_ATR_FIELD]).toEqual({enabled:true,multiplier:3,length:5});
  const again=deserializeDrawing(structuredClone(len))! as any;unregister();unregister=registerPositionChartContext({owns:({model:item})=>item===again,persist:id=>persisted.push(id)});
  paint(again);expect(again.stopPrice).toBe(kind==='position'?94:106);expect(persisted).toHaveLength(1);
  const off=patchDrawingEdit(len,fixtureBars,{'lvPosition.atrStop':false});
  expect((off.props as any)[POSITION_ATR_FIELD].enabled).toBe(false);expect(off.anchors[1].price).toBe(kind==='position'?94:106);
  expect(drawingEditor(off,fixtureBars).values['lvPosition.atrStop']).toBe(false);
  expect(()=>patchDrawingEdit(on,fixtureBars,{'lvPosition.atrMultiplier':0})).toThrow();
 });
 it('a position alert sizes whole lots like the drawing while Stop from ATR is on',()=>{
  const synced=record(kind,{[POSITION_ATR_FIELD]:ATR_ON},target);synced.anchors[1]={...synced.anchors[1],price:atrStop};
  const quantity=(drawing:SerializedDrawing)=>{const result=capturePositionDrawing(drawing,{symbol:'GME',currency:'USD'});if(!result.ok)throw Error(result.diagnostics.join());return result.position.quantity;};
  // 250 / 4 = 62.5 -> 62; lot size 3: 250 / (4 x 3) = 20.8 -> 20 lots = 60 units; off: 62.5 as before.
  expect(quantity(synced)).toBe(62);
  expect(quantity({...synced,props:{...synced.props,lvPositionInputs:{lotSize:3}}})).toBe(60);
  expect(quantity({...synced,props:{...synced.props,[POSITION_ATR_FIELD]:{...ATR_ON,enabled:false}}})).toBe(62.5);
  // The drawing shows the same 62 lots.
  const model=deserializeDrawing(structuredClone(synced))! as any;expect(model.lvStats(proj()).stats.qty).toBe(62);
 });
 it('an unreadable saved member is kept verbatim and reads as off',()=>{
  const bad={enabled:true,multiplier:-1,length:14},model=deserializeDrawing(record(kind,{[POSITION_ATR_FIELD]:bad},target,'atr-bad-'+kind))! as any;
  paint(model);expect(model.stopPrice).toBe(kind==='position'?90:110);expect(model.serialize().props[POSITION_ATR_FIELD]).toEqual(bad);
  expect(()=>model.applySettings({'lvPosition.atrStop':true})).toThrow(/unreadable/);
 });
});

describe('Qty plate colours follow the chart background',()=>{
 const painted=(model:any,background:string,p=proj())=>{const plates:{text:string;fill:string;ink:string}[]=[];let fill='';const ctx:any={globalAlpha:1,save(){},restore(){},beginPath(){},stroke(){},rect(){},fillRect(){},moveTo(){},lineTo(){},setLineDash(){},
  set fillStyle(v:string){fill=v;},get fillStyle(){return fill;},fill(){plates.push({text:'',fill,ink:''});},measureText:(s:string)=>({width:s.length*7}),fillText(s:string){const last=plates.at(-1)!;if(!last.text){last.text=s;last.ink=fill;}}};
  model.lvPaint(ctx,p,{fontFamily:'sans-serif',textColor:'#000',background});return plates;};
 it('a light background gives the unsigned Qty plate a light box with dark text; dark keeps the line-colour box',()=>{
  const model=deserializeDrawing(record('position',{},120,'plate-light'))! as any,none=proj([]);// no bars after the entry: Not filled
  const light=painted(model,'#ffffff',none).find(plate=>plate.text.startsWith('Not filled'))!;
  expect(light).toMatchObject({fill:'#e0e3eb',ink:'#131722'});
  const dark=painted(model,'#131722',none).find(plate=>plate.text.startsWith('Not filled'))!;
  expect(dark).toMatchObject({fill:'#808080',ink:'#ffffff'});
  // The target and stop plates keep their own colours on either background.
  for(const background of ['#ffffff','#131722']){const plates=painted(model,background,none);expect(plates.find(plate=>plate.text.startsWith('Target'))!.fill).toBe(model.profitColor);expect(plates.find(plate=>plate.text.startsWith('Stop'))!.fill).toBe(model.lossColor);}
 });
 it('a filled trade keeps the P&L colour on a light background',()=>{
  const model=deserializeDrawing(record('position',{},120,'plate-pnl'))! as any,up=proj([...BARS,{time:ENTRY_TIME+DAY,open:100,high:105,low:99,close:104,volume:1}]);
  const plate=painted(model,'#ffffff',up).find(row=>row.text.startsWith('Open P&L'))!;expect(plate.fill).toBe(model.profitColor);
 });
});
