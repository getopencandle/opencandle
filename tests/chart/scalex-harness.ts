import {readFileSync,writeFileSync,mkdirSync,unlinkSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomUUID} from 'node:crypto';

// SCALEX harness. Loads the pinned @luxalgo/vela 0.8.4 chrome classes that are not package exports
// (AxisScaleButtons, PaneControls, EngineOrchestrator, PanesControl) from a temporary copy of the installed chunk under
// .tmp\ (deleted right after import), and gives them a minimal SYNTHETIC element/document stand-in. The class code that
// runs is the pinned renderer's own; the stand-in only records style, children and listeners. No layout, canvas,
// GUI or packaged-build claim.
export interface VelaChrome {AxisScaleButtons:new(plot:unknown,theme:unknown,deps:unknown)=>any;PaneControls:new(plot:unknown,theme:unknown,deps:unknown)=>any;EngineOrchestrator:{prototype:object};PanesControl:new(controller:object)=>any}
let loaded:Promise<VelaChrome>|undefined;
export function velaChrome():Promise<VelaChrome>{
 return loaded??=(async()=>{
  const path=resolve('node_modules/@luxalgo/vela/dist/chunk-UNUVPQFW.js'),source=readFileSync(path,'utf8'),temporary=resolve('.tmp',`scalex-vela-${randomUUID()}.mjs`);
  mkdirSync(dirname(temporary),{recursive:true});
  try{
   writeFileSync(temporary,source.replace(/(from\s+['"])(\.\/[^'"]+)(['"])/g,(_all,before,relative,after)=>before+pathToFileURL(resolve(dirname(path),relative)).href+after)+'\nexport { AxisScaleButtons as LVAxisScaleButtons, PaneControls as LVPaneControls, EngineOrchestrator as LVEngineOrchestrator, PanesControl as LVPanesControl };\n');
   const module=await import(/* @vite-ignore */pathToFileURL(temporary).href);
   return{AxisScaleButtons:module.LVAxisScaleButtons,PaneControls:module.LVPaneControls,EngineOrchestrator:module.LVEngineOrchestrator,PanesControl:module.LVPanesControl};
  }finally{try{unlinkSync(temporary);}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;}}
 })();
}

export interface FakeElement {tag:string;style:Record<string,string>;children:FakeElement[];parent:FakeElement|null;dataset:Record<string,string>;attributes:Record<string,string>;className:string;textContent:string|null;innerHTML:string;title:string;type:string;disabled:boolean;id:string;ownerDocument:FakeDocument;
 classList:{toggle(name:string,on?:boolean):void;contains(name:string):boolean};
 appendChild(child:FakeElement):FakeElement;append(...children:FakeElement[]):void;remove():void;
 setAttribute(name:string,value:string):void;getAttribute(name:string):string|null;
 addEventListener(type:string,listener:(event:any)=>void):void;removeEventListener(type:string,listener:(event:any)=>void):void;dispatch(type:string,event:any):void;
 getBoundingClientRect():{left:number;top:number;width:number;height:number;right:number;bottom:number};
 contains(node:unknown):boolean;
}
export interface FakeDocument {createElement(tag:string):FakeElement;getElementById(id:string):unknown;head:FakeElement;body:FakeElement;documentElement:FakeElement;activeElement:unknown;defaultView:any;addEventListener(type:string,listener:(event:any)=>void):void;removeEventListener(type:string,listener:(event:any)=>void):void}

export function fakeDocument(rect={left:0,top:0,width:864,height:628}):FakeDocument{
 const docListeners=new Map<string,Set<(event:any)=>void>>();
 const doc={} as FakeDocument;
 const make=(tag:string):FakeElement=>{
  const listeners=new Map<string,Set<(event:any)=>void>>(),classes=new Set<string>();
  const element:FakeElement={tag,style:{},children:[],parent:null,dataset:{},attributes:{},className:'',textContent:'',innerHTML:'',title:'',type:'',disabled:false,id:'',ownerDocument:doc,
   classList:{toggle(name,on){if(on??!classes.has(name))classes.add(name);else classes.delete(name);},contains:name=>classes.has(name)},
   appendChild(child){child.parent?.children.splice(child.parent.children.indexOf(child),1);child.parent=element;element.children.push(child);return child;},
   append(...children){for(const child of children)element.appendChild(child);},
   remove(){if(element.parent){element.parent.children.splice(element.parent.children.indexOf(element),1);element.parent=null;}},
   setAttribute(name,value){element.attributes[name]=String(value);},getAttribute:name=>element.attributes[name]??null,
   addEventListener(type,listener){(listeners.get(type)??listeners.set(type,new Set()).get(type)!).add(listener);},
   removeEventListener(type,listener){listeners.get(type)?.delete(listener);},
   dispatch(type,event){for(const listener of [...listeners.get(type)??[]])listener(event);},
   getBoundingClientRect:()=>({...rect,right:rect.left+rect.width,bottom:rect.top+rect.height}),
   contains(node){let at=node as FakeElement|null;while(at){if(at===element)return true;at=at.parent;}return false;},
  };
  return element;
 };
 Object.assign(doc,{createElement:make,getElementById:()=>({}),head:make('head'),body:make('body'),documentElement:make('html'),activeElement:null,defaultView:{innerWidth:1400,innerHeight:900,addEventListener(){},removeEventListener(){}},
  addEventListener(type:string,listener:(event:any)=>void){(docListeners.get(type)??docListeners.set(type,new Set()).get(type)!).add(listener);},
  removeEventListener(type:string,listener:(event:any)=>void){docListeners.get(type)?.delete(listener);}});
 return doc;
}
