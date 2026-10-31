import React from 'react';
import {readFileSync} from 'node:fs';
import {renderToStaticMarkup} from 'react-dom/server';
import {describe,expect,it,vi} from 'vitest';
import {NativeRenderer} from '@luxalgo/vela';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createIntervalMenuState,editIntervalMenu} from '../../src/domain/intervals';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import {IntervalDialog} from '../../src/ui/IntervalDialog';
import {shortIntervalText} from '../../src/ui/interval-display';
import {chartIntervalText} from '../../src/chart/range-interval';
import {statusLineParts} from '../../src/chart/status-line-model';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {axisPriceText} from '../../src/chart/axis-labels';
import {chipRelabel,installAppearancePainters,relabelContext,type AxisLabelContext} from '../../src/chart/appearance-painters';
import {painterFixture,withHexColorProbe} from './chart-paint-harness';
import {crosshairChipText,installPrecisionCrosshair} from '../../src/chart/precision-crosshair';

// Static markup and pure functions on SYNTHETIC fixtures; no desktop interaction claim.
const current=fixtureDataset('GME',10);
const menuBase={datasets:[current],current,state:createIntervalMenuState(),onApply:()=>{},onEditMenu:()=>{},onAdvanced:()=>{},onClose:()=>{}};
const PRESETS=['1 range','10 ranges','100 ranges','1000 ranges'];

describe('RANGE2-1028 item 1: Ranges presets in the interval menu',()=>{
 it('lists 1, 10, 100 and 1000 ranges, each with a favorite star, on any chart type',()=>{
  for(const props of [{},{onRangeInterval:()=>true,rangeActive:false,rangeSize:100},{onRangeInterval:()=>true,rangeActive:true,rangeSize:100}]){
   const markup=renderToStaticMarkup(React.createElement(IntervalMenu,{...menuBase,...props}));
   const group=markup.slice(markup.indexOf('aria-label="Ranges"'));expect(markup).toContain('aria-label="Ranges"');
   for(const label of PRESETS){expect(group).toContain('<span>'+label+'</span>');expect(group).toContain('aria-label="Favorite '+label+'"');}
  }
  const active=renderToStaticMarkup(React.createElement(IntervalMenu,{...menuBase,onRangeInterval:()=>true,rangeActive:true,rangeSize:100}));
  expect(active.match(/<button[^>]*role="menuitemradio"[^>]*aria-checked="true"[^>]*><span>([^<]*)<\/span>/)?.[1]).toBe('100 ranges');
 });
 it('a favorited R preset is stored by id and shown as typed on the toolbar',()=>{
  const state=editIntervalMenu(createIntervalMenuState(),{type:'favorite',interval:'100R'});
  expect(state.favorites).toEqual(['100R']);expect(shortIntervalText('100R')).toBe('100R');
  const markup=renderToStaticMarkup(React.createElement(IntervalMenu,{...menuBase,state,onRangeInterval:()=>true}));
  expect(markup).toMatch(/data-favorite=""[^>]*><button[^>]*><span>100 ranges<\/span>/);
 });
});

describe('RANGE2-1028 item 2: the Advanced interval dialog and the legend know R intervals',()=>{
 const dialog=(props:Record<string,unknown>)=>renderToStaticMarkup(React.createElement(IntervalDialog,{current,datasets:[current],state:createIntervalMenuState(),onApply:()=>{},onClose:()=>{},...props}));
 it('on a Range chart the dialog opens on the current R interval and previews the Range chart',()=>{
  const markup=dialog({onRangeInterval:()=>true,rangeActive:true,rangeSize:100});
  expect(markup).toContain('aria-pressed="true">100 ranges</button>');expect(markup).toContain('Requested interval: <strong>100R</strong>');
  expect(markup).toContain('Range chart: 100 ranges (100R)');expect(markup).not.toContain('disabled="">Apply');
  expect(markup).toContain('<small>Range chart</small>');expect(markup).toContain('250R');
 });
 it('a non-standard size shows as its own checked row without favorite or remove buttons',()=>{
  const markup=dialog({onRangeInterval:()=>true,rangeActive:true,rangeSize:250});
  expect(markup).toContain('aria-pressed="true">250 ranges</button>');expect(markup).not.toContain('aria-label="Favorite 250R"');expect(markup).not.toContain('aria-label="Hide 250R"');
 });
 it('without a Range handler, or on another chart type, the dialog keeps the data interval',()=>{
  expect(dialog({})).toContain('<small>Loaded bars only</small>');expect(dialog({})).not.toContain('Range chart:');
  const candles=dialog({onRangeInterval:()=>true,rangeActive:false,rangeSize:100});expect(candles).toContain('Exact supplied data');expect(candles).not.toContain('Range chart:');
  const typed=dialog({onRangeInterval:()=>true,initialTarget:'0R'});expect(typed).toContain('A range interval is a whole number');expect(typed).toContain('disabled="">Apply');
 });
 it('the status line names the R interval on a Range chart and the data interval otherwise',()=>{
  const settings=defaultChartSettingsDocument().statusLine,series=(interval:string)=>({symbol:'GME',name:'Synthetic',exchange:'SYN',interval,logoUrl:null});
  const interval=(text:string)=>(statusLineParts(settings,series(text),null,null,[],{legendVisible:true}).parts.find(part=>part.id==='interval') as {text?:string}).text;
  expect(interval(chartIntervalText('range',undefined,'1D'))).toBe('100R');expect(interval(chartIntervalText('range',{range:{range:25} as any},'1D'))).toBe('25R');
  expect(interval(chartIntervalText('candles',undefined,'1D'))).toBe('1D');
  const app=readFileSync('src/ui/App.tsx','utf8');
  expect(app).toContain('exchange:displayExchange(dataset.instrument.exchange),interval:chartIntervalText(workspace.chartStyle,workspace.chartTypeSettings,shortIntervalText(dataset.resolution))}'); // Status line shows short labels (1h)
  expect(app).toContain('onRangeInterval={(size,state)=>{assertDialogContext();return applyRangeInterval(size,state).ok;}}');
 });
});

describe('RANGE2-1028 item 3: chips and OpenCandle axis labels follow the stored precision',()=>{
 const scale={min:90,max:110},context={scale,height:400,mintick:0.01};
 it('OpenCandle axis labels print Integer, 9 to 15 decimals and 1/N; Default, 1 to 8 decimals and percent keep the tick path',()=>{
  expect(axisPriceText(101.456,{...context,precision:'integer'})).toBe('101');
  expect(axisPriceText(101.456,{...context,precision:'12'})).toBe('101.456000000000');
  expect(axisPriceText(101.4,{...context,precision:'1/4'})).toBe('101.50');
  for(const precision of [undefined,'default','2','8'])expect(axisPriceText(101.456,{...context,precision})).toBe(axisPriceText(101.456,context));
  expect(axisPriceText(105,{...context,precision:'integer',percent:{baseline:100,indexed:false}})).toBe('+5.00%');
 });
 it('the last price chip swaps exactly the native price text through a context view',()=>{
  const pane={kind:'price',scale,bounds:{top:0,height:400}},scene={scaleMode:'price',priceMintick:0.01};
  expect(chipRelabel(101.456,scene,pane,'integer')).toEqual({from:'101.46',to:'101'});
  expect(chipRelabel(101.456,scene,pane,'2')).toBeNull();expect(chipRelabel(101.456,scene,pane,undefined)).toBeNull();
  expect(chipRelabel(101.456,{...scene,scaleMode:'percent'},pane,'integer')).toBeNull();
  const calls:unknown[][]=[],real:any={fillStyle:'',fillText(...args:unknown[]){calls.push(['fill',...args]);},measureText(text:string){calls.push(['measure',text]);return{width:text.length};}};
  const view:any=relabelContext(real,'101.46','101');view.fillStyle='#fff';view.measureText('101.46');view.fillText('101.46',1,2);view.fillText('12:00',1,3);
  expect(real.fillStyle).toBe('#fff');expect(calls).toEqual([['measure','101'],['fill','101',1,2],['fill','12:00',1,3]]);
  expect(relabelContext(real,'a','a')).toBe(real);
 });
 it('on the real installed chip painter the last price chip and OpenCandle labels print the stored precision',async()=>{
  const f=await painterFixture(false);let precision:string|undefined='integer';
  const context=():AxisLabelContext=>({labels:{symbolName:false,prevClose:false,highLow:true,noOverlap:true},lines:{prevCloseLine:false},symbol:'SYNTH',timezone:'UTC',session:{kind:'continuous',extended:true},drawings:()=>[],selected:()=>[],precision});
  const dispose=installAppearancePainters(f.renderer,context);
  try{
   f.native.scene.priceStyle='line';f.native.scene.style.line.color='#22ab94';f.native.scene.showCountdown=false;f.native.scene.showPriceLabel=true;f.native.theme={...f.native.theme,background:'#131722',textColor:'#d1d4dc'};
   f.native.scene.bars=[{time:86_400_000,open:10.2,high:22.3,low:8.4,close:20.37,volume:1}];
   const paint=()=>{f.recording.commands.length=0;withHexColorProbe(()=>f.native.chrome.drawPriceLineAndCountdown(f.recording.ctx,f.native.scene,f.coords,f.native.theme,300,f.pane));return f.recording.commands.filter(row=>row.op==='fillText').map(row=>row.values[0]);};
   expect(paint()).toEqual(expect.arrayContaining(['20','22']));expect(paint()).not.toContain('20.37');
   precision='1/4';expect(paint()).toEqual(expect.arrayContaining(['20.25','22.25']));
   precision=undefined;expect(paint()).toEqual(expect.arrayContaining(['20.37','22.30']));
  }finally{dispose();f.dispose();}
 });
 it('the crosshair chip text follows the precision on the price pane only',()=>{
  const price={kind:'price'},scene={scaleMode:'price'};
  expect(crosshairChipText(101.4567,scene,price,'1/8')).toBe('101.500');expect(crosshairChipText(101.4567,scene,price,'5')).toBeNull();
  expect(crosshairChipText(101.4567,scene,{kind:'study'},'integer')).toBeNull();expect(crosshairChipText(101.4567,{scaleMode:'indexed'},price,'integer')).toBeNull();
 });
 it('the crosshair seam wraps the real renderer layer shape, rewrites chip text in a frame and uninstalls cleanly',()=>{
  const real:any=new NativeRenderer();
  expect(typeof real.crosshairLayer?.render).toBe('function');expect(typeof real.crosshairLayer?.lvAxisChip).toBe('function');
  expect(Object.hasOwn(real.crosshairLayer,'render')).toBe(false);expect(Object.hasOwn(real.crosshairLayer,'lvAxisChip')).toBe(false);
  const shown:string[]=[];
  class Layer{render(scene:any,coords:any,_t:any,_s:any,external:any){this.lvAxisChip({kind:'price'},null,0,40,'101.46');if(external)this.lvAxisChip({kind:'price'},null,0,external.y,'99.00');this.lvAxisChip({kind:'study'},null,0,40,'5.00');void scene;void coords;}lvAxisChip(_p:any,_c:any,_x:any,_y:any,text:string){shown.push(text);}}
  const renderer:any={crosshairLayer:new Layer()};let precision:string|undefined='integer';
  const off=installPrecisionCrosshair(renderer,()=>precision);
  expect(()=>installPrecisionCrosshair(renderer,()=>precision)).toThrow('already installed');
  const coords={yToPrice:(y:number)=>101.46+y*0};
  renderer.crosshairLayer.render({scaleMode:'price'},coords,{},null,{y:70,price:98.6});
  expect(shown).toEqual(['101','99','5.00']);shown.length=0;
  precision='default';renderer.crosshairLayer.render({scaleMode:'price'},coords,{},null,null);expect(shown).toEqual(['101.46','5.00']);shown.length=0;
  renderer.crosshairLayer.lvAxisChip({kind:'price'},null,0,1,'outside');expect(shown).toEqual(['outside']);
  off();expect(Object.hasOwn(renderer.crosshairLayer,'render')).toBe(false);expect(Object.hasOwn(renderer.crosshairLayer,'lvAxisChip')).toBe(false);
 });
 it('on the real installed renderer the crosshair price chip prints the stored precision',()=>{
  vi.stubGlobal('document',{createElement:()=>({getContext:()=>null})});
  try{
   const r:any=new NativeRenderer();r.scheduler={invalidate(){},cancel(){}};r.animator={active:false};
   const T0=Date.UTC(2023,10,14,22,0),bars=Array.from({length:50},(_,i)=>({time:T0+i*60_000,open:100+i/10,high:101+i/10,low:99+i/10,close:100+i/10,volume:10}));
   const price=r.scene.ensurePane('price','price',0,3);price.bounds={top:0,height:400};price.scale={min:90,max:110,log:false,invert:false};
   r.coords.setSize(800,400,1);r.coords.setBars(bars.map(b=>b.time));r.bars=bars;r.scene.bars=bars;r.scene.timezone='UTC';
   const commands:unknown[][]=[],ctx=new Proxy({} as Record<string|symbol,unknown>,{get(target,key){if(key==='measureText')return(text:string)=>({width:String(text).length*6});if(key in target)return target[key];if(key==='getLineDash')return()=>[];return(...values:unknown[])=>{commands.push([String(key),...values]);};},set(target,key,value){target[key]=value;return true;}});
   r.crosshairLayer.mount({width:864,height:400,getContext:()=>ctx});
   const chip=()=>{commands.length=0;r.scene.crosshair={x:400,y:200};r.crosshairLayer.render(r.scene,r.coords,r.theme,null,null);return commands.filter(row=>row[0]==='fillText').map(row=>row[1] as string);};
   const before=chip(),y=r.coords.yToPrice(200,price.scale,price.bounds);expect(Math.abs(Number(before[0])-y)).toBeLessThan(0.1);expect(before[0]).not.toBe(String(Math.round(y)));
   let precision:string|undefined='integer';const off=installPrecisionCrosshair(r,()=>precision);
   try{expect(chip()[0]).toBe(String(Math.round(y)));expect(chip()[1]).toBe(before[1]);precision='13';expect(chip()).toContain(y.toFixed(13));precision=undefined;expect(chip()).toEqual(before);}
   finally{off();}
   expect(chip()).toEqual(before);
  }finally{vi.unstubAllGlobals();}
 });
});
