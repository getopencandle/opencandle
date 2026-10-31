import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';
import {Vela,NativeRenderer,DrawingsControl,RendererControl,DataControl,MarksControl,ReplayControl,MultiProviderFeed} from '@luxalgo/vela';

// Shared real-shape chart for installers that inspect Vela members (SYNTHETIC
// test construction; no DOM, canvas or GUI claim).
//
// A real `new Vela(...)` cannot be built under the node test environment: the
// constructor runs `renderer.mount(container)` (chunk-UNUVPQFW.js:23836 ->
// NativeRenderer.mount :20713), which needs a live DOM/canvas, and
// NativeRenderer.userDrawings stays null until that mount (:19539). So the chart
// is Object.create(Vela.prototype), the genuine class prototype from the
// package, with the constructor's own fields assigned in its exact order by
// plain assignment, so every descriptor matches (data, writable, enumerable,
// configurable). The public surfaces `renderer`, `panes`, `data`, `drawings`,
// `marks`, `replay` and `market` stay Vela.prototype getters (:30245-30331).
// `chart.drawings` is therefore NOT an own member; it is `get drawings(){return
// this.drawingsControl}` (:30310-30311).

/** Own data fields of a constructed @luxalgo/vela 0.8.4 Vela, in constructor assignment order (chunk-UNUVPQFW.js:30075-30084). */
export const VELA_OWN_FIELDS=Object.freeze(['rendererControl','dataControl','orchestrator','panesControl','drawingsControl','marksControl','replayControl'] as const);

interface VelaInternals {EngineOrchestrator:{prototype:object};PanesControl:new(controller:object)=>object}
let internals:Promise<VelaInternals>|undefined;
/** EngineOrchestrator and PanesControl are not package exports; read them from a pinned-source copy (same pattern as the native drawing harnesses). */
async function loadInternals():Promise<VelaInternals>{
 const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(path,'utf8'),temporary=resolve('.cache',`lv-real-vela-chart-${randomUUID()}.mjs`);
 mkdirSync(dirname(temporary),{recursive:true});
 try{
  writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { EngineOrchestrator as LVActualEngineOrchestrator, PanesControl as LVActualPanesControl };\n');
  const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
  return {EngineOrchestrator:module.LVActualEngineOrchestrator,PanesControl:module.LVActualPanesControl};
 }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
}

export interface RealVelaChartOptions {
 renderer:NativeRenderer;
 /** The native DrawingController: a real orchestrator owns it as `drawings`, and DrawingsControl wraps it as `ctrl` (:30082). */
 core:object;
 /** Reuse an orchestrator that other installers already captured. It must own `renderer` as data. Omitted: an EngineOrchestrator-prototype object owning `renderer` and `drawings`. */
 orchestrator?:Record<string,unknown>;
}
export interface RealVelaChart {
 readonly chart:Vela;
 readonly orchestrator:Record<string,unknown>;
 /** The package's own DrawingsControl, the value `chart.drawings` returns. */
 readonly facade:DrawingsControl;
 readonly core:object;
 /** Plain assignment, the way the Vela constructor wrote the field. `chart.drawings` then returns `next`. */
 setFacade(next:unknown):void;
}

export async function realVelaChart(options:RealVelaChartOptions):Promise<RealVelaChart>{
 const {renderer,core}=options;
 if(!(renderer instanceof NativeRenderer))throw Error('SYNTHETIC real Vela chart requires a NativeRenderer');
 if(!core||typeof core!=='object')throw Error('SYNTHETIC real Vela chart requires the native drawing core');
 const {EngineOrchestrator,PanesControl}=await(internals??=loadInternals());
 let orchestrator=options.orchestrator;
 if(!orchestrator){orchestrator=Object.create(EngineOrchestrator.prototype) as Record<string,unknown>;orchestrator.renderer=renderer;orchestrator.drawings=core;}
 const owned=Object.getOwnPropertyDescriptor(orchestrator,'renderer');
 if(!owned||!Object.hasOwn(owned,'value')||owned.value!==renderer)throw Error('SYNTHETIC orchestrator must own its renderer as data');
 const chart=Object.create(Vela.prototype) as Record<string,unknown>;
 chart.rendererControl=new RendererControl(renderer as never);
 chart.dataControl=new DataControl(new MultiProviderFeed());
 chart.orchestrator=orchestrator;
 chart.panesControl=new PanesControl(orchestrator);
 chart.drawingsControl=new DrawingsControl(core as never);
 chart.marksControl=new MarksControl(orchestrator.marks as never);
 chart.replayControl=new ReplayControl(orchestrator as never);
 const facade=chart.drawingsControl as DrawingsControl;
 if(Object.hasOwn(chart,'drawings')||Reflect.get(chart,'drawings')!==facade||Reflect.ownKeys(chart).join()!==VELA_OWN_FIELDS.join())throw Error('SYNTHETIC real Vela chart shape unavailable');
 return Object.freeze({chart:chart as unknown as Vela,orchestrator,facade,core,setFacade(next:unknown){chart.drawingsControl=next;}});
}
