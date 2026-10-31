import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {randomUUID} from 'node:crypto';
import {NativeRenderer,type Vela} from '@luxalgo/vela';
import {realVelaChart} from '../helpers/real-vela-chart';
import {nativeDrawingHarness} from './drawing-native-harness';
import {createNativeFullModelBridge} from '../../src/chart/native-full-model';
import {createPaneRegistry} from '../../src/chart/pane-registry';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {createRendererFramePort,coreModelAbsence} from '../../src/chart/renderer-frame';
import type {AnalysisPaneInventory} from '../../src/chart/analysis-transaction';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import {historicalOwnerKey} from '../../src/chart/historical-frame';

// SYNTHETIC hidden-indicator harness. No DOM, canvas or GUI claim.
// - Chart: tests/helpers/real-vela-chart.ts (Vela.prototype + the package's PanesControl), so
//   chart.addNativeIndicator / chart.panes.list / chart.on run the pinned 0.8.4 code.
// - Core: an EngineOrchestrator-prototype object with the constructor's registry, handle, pane
//   order and event fields, so add/start/emit/applyModel/setVisible/removeIndicator/listPanes
//   are the ACTUAL pinned methods (hide drops the scene model; show remounts it).
// - Renderer: the package NativeRenderer, unmounted (scheduler and legend row sink stubbed).
// - LV: the actual indicator port, pane registry, native full-model bridge and renderer frame
//   port, plus the CURRENT analysisInventory source sliced from src/chart/adapter.ts.
let internals:Promise<{Engine:any;Registry:any;Bus:any}>|undefined;
async function load(){
 const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(path,'utf8'),temporary=resolve('.cache',`lv-hidden-indicator-${randomUUID()}.mjs`);
 mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { EngineOrchestrator as LVHiddenEngine, IndicatorRegistry as LVHiddenRegistry, TypedEventBus as LVHiddenBus };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  return {Engine:module.LVHiddenEngine,Registry:module.LVHiddenRegistry,Bus:module.LVHiddenBus};
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}
/** One adapter.ts closure (a single source line), compiled from the CURRENT adapter source. */
function adapterClosure<T>(marker:string,name:string,injected:Record<string,unknown>):T{
 const source=readFileSync('src/chart/adapter.ts','utf8'),begin=source.indexOf(marker),end=source.indexOf('\n',begin);
 if(begin<0||end<0||source.indexOf(marker,begin+1)>=0)throw Error('SYNTHETIC harness: adapter '+name+' source moved');
 const code=stripTypeScriptTypes(`(function(injected){const {${Object.keys(injected).join(',')}}=injected;${source.slice(begin,end)}return ${name};})`,{mode:'strip'});
 return (0,eval)(code)(injected);
}
export const hostBars=Array.from({length:60},(_,i)=>{const close=100+5*Math.sin(i/5)+(i%4)*0.5;return {time:1700000000000+i*86400000,open:close-0.4,high:close+1.2,low:close-1.1,close,volume:1000+(i*53)%500};});
const quiet=new Proxy({},{get:()=>()=>{}});

export async function hiddenIndicatorHarness(){
 const {Engine,Registry,Bus}=await(internals??=load()),drawing=await nativeDrawingHarness();
 const renderer=new NativeRenderer(),native=renderer as any;
 native.scheduler={invalidate(){}};native.inputsUI=quiet;native.scene.ensurePane('price','price',0,3);
 const core=Object.create(Engine.prototype);
 Object.assign(core,{renderer,drawings:drawing.controller,events:new Bus(),registry:new Registry(),paneOrder:['price'],collapsedPanes:new Set(),maximizedPaneId:null,handles:new Map(),bars:hostBars,rawBars:hostBars,config:{market:{symbol:'SYNTHETIC',timeframe:'1D'},live:false},replayQueue:null,readyPromise:Promise.resolve(),switchingMarket:false,dataControl:{},contextEmitAt:new Map(),volumeOptedOut:false});
 const real=await realVelaChart({renderer,core:drawing.controller,orchestrator:core}),chart=real.chart as Vela;
 const bridge=createNativeFullModelBridge(chart,renderer),update=renderer.updateIndicator.bind(renderer);
 renderer.updateIndicator=(handle,patch)=>{if(!bridge.update(handle,patch))update(handle,patch);};
 const paneRegistry=createPaneRegistry(chart),port=createIndicatorPort(chart,paneRegistry,undefined,undefined,bridge.claim,()=>({resolution:'1D'}));
 // The production wiring (adapter.ts): the pinned core registry is the hidden authority.
 const modelAbsence=coreModelAbsence(chart,renderer),frames=createRendererFramePort(renderer,modelAbsence);
 const scripts={list:()=>[],placementStatus:()=>({ready:true})};
 const inventory=adapterClosure<()=>AnalysisPaneInventory>('  const analysisInventory=():AnalysisPaneInventory=>','analysisInventory',{indicators:port,scripts,comparisons:{list:()=>[]},chart,paneRegistry,document:{all:()=>[]}});
 /** The adapter's analysis settle step: every saved logical pane resolves to the owner's native pane. */
 const waitPlacement=adapterClosure<()=>Promise<void>>('  const waitPlacement=async()=>','waitPlacement',{disposed:false,indicators:port,chart,paneRegistry,scripts});
 const layout=()=>chart.panes.list().map(({id,order,collapsed,maximized})=>({id,order,collapsed,maximized}));
 const dataset=fixtureDataset('GME',5),source=sourceContextForDataset(dataset,dataset.bars);
 /** The adapter's captureHistoricalFrame route: every listed owner carries a fingerprint. */
 const context=()=>({source,style:'candles',calculationFingerprints:Object.fromEntries(inventory().panes.flatMap(pane=>pane.owners).map(owner=>[historicalOwnerKey({kind:owner.kind as 'built',id:owner.id}),'synthetic-fingerprint']))});
 const captureHistoricalFrame=()=>frames.captureHistorical(inventory(),context(),layout());
 /** Async native start and pane binding settle within a few macrotasks. */
 const settle=async()=>{for(let turn=0;turn<5;turn++)await new Promise(resolve=>setTimeout(resolve,0));};
 const add=async(kind:Parameters<typeof port.add>[0],saved?:Parameters<typeof port.add>[2])=>{const id=port.add(kind,{},saved);await settle();return id;};
 const row=(id:string)=>port.list().find(item=>item.id===id)!;
 return {renderer,native,core,chart,drawing,paneRegistry,port,frames,modelAbsence,inventory,waitPlacement,layout,context,captureHistoricalFrame,settle,add,row,
  model:(id:string)=>native.scene.indicators.get(row(id).rendererId),
  record:(id:string)=>core.registry.get(row(id).rendererId),
  dispose(){try{port.dispose();}finally{try{bridge.dispose();}finally{drawing.dispose();}}}};
}
