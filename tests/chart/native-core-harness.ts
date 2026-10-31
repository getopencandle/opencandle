import {NativeRenderer,getNativeIndicator,registerNativeIndicator,unregisterNativeIndicator,type NativeIndicatorOutput,type NativeIndicatorDescriptor,type Vela} from '@luxalgo/vela';
import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {resolve,dirname} from 'node:path';
import {createNativeFullModelBridge} from '../../src/chart/native-full-model';
import {createHash,randomUUID} from 'node:crypto';

/** Executes original pinned core functions; no DOM chart or synthetic replacement patcher. */
export async function nativeCoreHarness(bridged=true){
 const sourcePath=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(sourcePath,'utf8'),temporary=resolve('.cache',`lv-native-core-${process.pid}-${randomUUID()}.mjs`);
 const relocated=source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(sourcePath),relative)).href+after);
 mkdirSync(dirname(temporary),{recursive:true});writeFileSync(temporary,relocated+'\nexport { EngineOrchestrator as LVOriginalEngineOrchestrator };\n');
 let loaded:any;try{loaded=await import(/* @vite-ignore */ pathToFileURL(temporary).href);}finally{unlinkSync(temporary);}
 const renderer=new NativeRenderer(),native=renderer as any,records=new Map<string,any>(),core=Object.create(loaded.LVOriginalEngineOrchestrator.prototype);
 native.scheduler={invalidate(){}};native.inputsUI={upsert(){},remove(){},setValues(){},setVisible(){},setPane(){},setCollapsedPanes(){},reposition(){}};native.scene.ensurePane('price','price',0,3);
 Object.assign(core,{renderer,registry:{get:(id:string)=>records.get(id),all:()=>[...records.values()]},handles:new Map(),bars:[{time:1700000000000,open:10,high:11,low:9,close:10,volume:1}],switchingMarket:false,collapsedPanes:new Set(),maximizedPaneId:null,paneOrder:['price'],announce(){},events:{emit(){}}});
 const type='lv-actual-core-'+randomUUID(),descriptor:NativeIndicatorDescriptor={type,title:'Actual pinned native core',paneHint:'price',overlay:true,inputsSchema:()=>[],defaultInputs:()=>({}),create:()=>({start(){},onBars(){},onViewport(){},setInputs(){},suspend(){},resume(){},stop(){}})};
 registerNativeIndicator(descriptor);const record:any={id:'actual-native',title:descriptor.title,native:{type,descriptor},inputValues:{},hidden:false,loading:false,pendingStructural:false};records.set(record.id,record);core.handles.set(record.id,{id:record.id});
 const listeners=new Map<string,Set<(value:any)=>void>>(),instances=new Map<string,any>();
 core.events={emit(name:string,value:any){for(const callback of listeners.get(name)??[])callback(value);}};
 const chart={orchestrator:core,
 on(name:string,callback:(value:any)=>void){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name)!.add(callback);return()=>listeners.get(name)!.delete(callback);},
 getVisibleRange(){return null;},
 panes:{list(){return [...native.scene.panes.values()].map((pane:any)=>({id:pane.id,indicators:[...records.values()].filter(row=>row.model?.paneId===pane.id).map(row=>({id:row.id,ownScale:row.model.ownScale===true}))}));}},
 addNativeIndicator(type:string){const descriptor=getNativeIndicator(type)!;const id=randomUUID(),record:any={id,title:descriptor.title,native:{type,descriptor},inputValues:descriptor.defaultInputs(),hidden:false,loading:false,pendingStructural:false};const instance=descriptor.create();record.native.instance=instance;records.set(id,record);instances.set(id,instance);const handle={id,setInputs:(values:any)=>core.applyInputs(id,values),setVisible(visible:boolean){record.hidden=!visible;renderer.setIndicatorVisible(record.renderHandle,visible);},moveTo:(target:any)=>core.moveIndicator(id,target),remove(){instance.stop();if(record.renderHandle)renderer.removeIndicator(record.renderHandle);records.delete(id);instances.delete(id);core.events.emit('indicator:removed',{id});}};core.handles.set(id,handle);instance.start({id,symbol:"SYNTHETIC",timeframe:"1m",live:false,data:{} as any,pushData(){},bars:()=>core.bars,emit:(out:NativeIndicatorOutput)=>core.applyModel(id,core.buildNativeModel(record,out)),setStatus(){}},record.inputValues);return handle;},
 };
 const bridge=createNativeFullModelBridge(chart,renderer);let release=()=>{};
 if(bridged){release=bridge.claim(descriptor);const update=renderer.updateIndicator.bind(renderer);renderer.updateIndicator=(handle,patch)=>{if(!bridge.update(handle,patch))update(handle,patch);};}
 return {renderer,native,core,record,records,instances,descriptor,bridge,release,chart:chart as unknown as Vela,sourceHash:createHash('sha256').update(source).digest('hex'),emit(output:NativeIndicatorOutput){return core.applyModel(record.id,core.buildNativeModel(record,output));},dispose(){release();bridge.dispose();unregisterNativeIndicator(type);records.clear();}};
}
