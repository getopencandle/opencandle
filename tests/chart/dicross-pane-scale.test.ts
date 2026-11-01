import {describe,expect,it} from 'vitest';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {calculateIndicator} from '../../src/domain/indicators';
import {renderIndicatorPresentation} from '../../src/chart/indicator-presentation';
import {defaultIndicatorPresentation,indicatorDefaults} from '../../src/chart/indicator-settings';
import {setDemoDataMode} from '../../src/domain/demo-mode';
import {demoDataset} from '../../src/ui/workspace-grid';

/** The installed (patched) renderer's own pane autoscale and drawing split (the code the chart runs). */
async function renderer():Promise<any>{
 const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),temporary=resolve('.cache',`lv-dicross-scale-${randomUUID()}.mjs`);mkdirSync(dirname(temporary),{recursive:true});
 try{writeFileSync(temporary,readFileSync(path,'utf8').replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { DrawingSceneRenderer as LVScene, computePaneScale as lvComputePaneScale, modelDrawingSet as lvModelDrawingSet };\n');return await import(/* @vite-ignore */ pathToFileURL(temporary).href);}
 finally{try{unlinkSync(temporary);}catch{/* already gone */}}
}

describe('DI cross signals: the extreme point (a price) never scales or draws in the DI pane',()=>{
 it('keeps Extreme point and Extreme point hit out of the DI pane and its scale, in the data window, and draws the level on the price pane',async()=>{
  setDemoDataMode('example');
  const bars=demoDataset('BTC').bars,settings={id:'di',kind:'dicross' as const,inputs:{...indicatorDefaults.dicross} as never,plots:{},offset:0,visible:true,presentation:defaultIndicatorPresentation('dicross')};
  const result=calculateIndicator('dicross',bars,settings.inputs,{resolution:'1D'});
  const extreme=result.series.find(row=>row.id==='extremePoint')!.values.filter((value):value is number=>value!==null&&value>1000);
  expect(extreme.length).toBeGreaterThan(0);// prices in the tens of thousands, far above any DI value
  const out=renderIndicatorPresentation(settings as never,result,bars,{resolution:'1D'}).output as any;
  for(const id of ['extremePoint','extremeHit']){
   const native=out.series.find((row:any)=>row.title===result.series.find(plot=>plot.id===id)!.label);
   expect(native.display).toMatchObject({pane:false,priceScale:false,dataWindow:true});
  }
  // DI cross draws one line per extreme point level (its only lines).
  const levels=out.lines??[];
  expect(levels.length).toBeGreaterThan(0);
  expect(levels.every((line:any)=>line.overlay===true)).toBe(true);
  // The renderer's own split and autoscale: the DI pane folds in only its own (non-overlay) drawings and pane series.
  const {LVScene,lvComputePaneScale,lvModelDrawingSet}=await renderer();
  const index=new Map(bars.map((bar,i)=>[bar.time*1000,i])),model={id:'di',series:out.series,priceLines:out.priceLines??[],lines:out.lines??[],labels:out.labels??[],boxes:[],polylines:[],linefills:[]};
  const own=lvModelDrawingSet(model,false),overlay=lvModelDrawingSet(model,true);
  expect(own.lines).toEqual([]);expect(overlay.lines.length).toBe(levels.length);
  const scene=new LVScene({timeToLogical:(ms:number)=>index.get(ms)??NaN,barAt:(at:number)=>bars[Math.round(at)]??null,theme:{}});
  const lo=0,hi=bars.length-1;scene.setSet(own,0);
  const scale=lvComputePaneScale([model],bars,false,lo,hi,scene.priceRange(lo,hi));
  expect(scale.max).toBeLessThan(150);expect(scale.min).toBeGreaterThan(-50);
 });
});
