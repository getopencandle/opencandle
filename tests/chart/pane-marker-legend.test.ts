import {describe,expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {installPatternLabelLayout,legendBoxesOver} from '../../src/chart/indicator-pattern-layout';

/** The installed (patched) renderer's drawing scene. */
async function renderedScene():Promise<any>{
 const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),temporary=resolve('.cache',`lv-pane-marker-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{writeFileSync(temporary,readFileSync(path,'utf8').replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { DrawingSceneRenderer as LVScene };\n');return await import(/* @vite-ignore */ pathToFileURL(temporary).href);}
 finally{try{unlinkSync(temporary);}catch{/* already gone */}}
}

describe('pane markers keep clear of their pane legend',()=>{
 it('reads the legend rows of every pane, not only the price pane',()=>{
  const box=(left:number,top:number,right:number,bottom:number)=>({left,top,right,bottom,width:right-left,height:bottom-top});
  class FakeElement {constructor(private rect:ReturnType<typeof box>,public ownerDocument?:unknown){}getBoundingClientRect(){return this.rect;}}
  const rows:Record<string,FakeElement[]>={
   '.chart-heading > *':[new FakeElement(box(10,10,300,30))],
   '.lv-legend-pane > *':[new FakeElement(box(10,40,200,60)),/* an RSI pane legend row */new FakeElement(box(10,610,260,632)),/* a hidden pane legend */new FakeElement(box(0,0,0,0))],
  };
  const doc={querySelectorAll:(selector:string)=>selector.split(',').map(part=>part.trim()).flatMap(part=>rows[part]??[])};
  const previous=(globalThis as any).Element;(globalThis as any).Element=FakeElement;
  try{
   const canvas=new FakeElement(box(0,0,1000,800),doc);
   expect(legendBoxesOver(canvas)).toEqual([{left:10,top:10,right:300,bottom:30},{left:10,top:40,right:200,bottom:60},{left:10,top:610,right:260,bottom:632}]);
  }finally{(globalThis as any).Element=previous;}
 });
 it('moves an RSI pane marker at the pane top off the pane legend (the pane is translated down the canvas)',async()=>{
  const {LVScene}=await renderedScene();
  const rows=Array.from({length:40},()=>({high:75,low:60}));
  const paint=(blocked:{left:number;top:number;right:number;bottom:number}[])=>{
   const scene=new LVScene({timeToLogical:(ms:number)=>ms,barAt:(at:number)=>rows[Math.round(at)]??null,theme:{textColor:'#fff',fontFamily:'sans-serif'}});
   const chrome=Object.assign(Object.create({drawingsRange(){return null;}}),{drawScene:scene});
   const dispose=installPatternLabelLayout({indicatorSlices:{drawScene:scene},chrome} as never,()=>blocked);
   try{
    const id=`lv-decoration:${JSON.stringify(['rsifs','pattern:marker:0'])}`;
    scene.setSet({lines:[],boxes:[],labels:[{id,xloc:'bar_time',x:5,yloc:'price',y:200/3,text:'FS top',style:'label_down',size:'small',color:'#f00',textColor:'#fff',textAlign:'center'}],polylines:[],linefills:[]},0);
    const texts:{text:string;y:number}[]=[];
    // The RSI pane starts 600 px down the plot canvas; its own coordinates run 0..120.
    const ctx=new Proxy({font:'12px sans-serif',measureText:(t:string)=>({width:String(t).length*6}),getTransform:()=>({a:1,f:600}),fillText:(text:string,_x:number,y:number)=>texts.push({text,y})} as Record<string,any>,{get:(target,key)=>typeof key==='string'&&key in target?target[key]:()=>{},set:(target,key,value)=>{target[key as string]=value;return true;}});
    scene.render(ctx,800,120,(logical:number)=>10+logical*10,(price:number)=>120-price*1.2);// RSI 100 at the top
    return texts.find(row=>row.text==='FS top')!.y;
   }finally{dispose();}
  };
  const free=paint([]),legend=paint([{left:10,top:610,right:260,bottom:632}]);// the pane legend row, in plot pixels
  // On its own the bubble sits above its point at pane y 40, over pane y 10..40, where the legend row is (pane y 10..32).
  expect(free).toBeLessThan(40);
  // With the legend it has no room above (the pane top), so it flips below its bar, clear of the legend row.
  expect(legend).toBeGreaterThan(60);
 });
});
