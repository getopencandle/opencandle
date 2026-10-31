import {vi} from 'vitest';
import {NativeRenderer,RendererControl} from '@luxalgo/vela';
import {installPriceScalePort,type PriceScalePortOptions} from '../../src/chart/price-scale-port';
import type {PriceScaleMenuMount,PriceScaleMenuViewProps} from '../../src/chart/price-scale-menu-view';

// SYNTHETIC harness: the package's real NativeRenderer and RendererControl (so scale
// features run the pinned Vela 0.8.4 code paths), with controlled panes/geometry and
// small event-target stand-ins for the chart host, document and window. No DOM,
// canvas, GUI or focus claim.
export function eventTarget(){
 const map=new Map<string,Set<(event:any)=>void>>();
 return{
  addEventListener(type:string,listener:(event:any)=>void){(map.get(type)??map.set(type,new Set()).get(type)!).add(listener);},
  removeEventListener(type:string,listener:(event:any)=>void){map.get(type)?.delete(listener);},
  dispatch(type:string,event:any){for(const listener of [...map.get(type)??[]])listener(event);return event;},
  count(type:string){return map.get(type)?.size??0;},
 };
}
export function event(extra:Record<string,unknown>={}){const value:any={defaultPrevented:false,stopped:false,preventDefault(){value.defaultPrevented=true;},stopPropagation(){value.stopped=true;},...extra};return value;}

export function priceScaleHarness(options:{panes?:Array<{id:string;kind:'price'|'study';top:number;height:number;scale:{min:number;max:number}}>;appearance?:Record<string,string|number|boolean>|null;availability?:()=>string|null;mount?:boolean;mergeScales?:PriceScalePortOptions['mergeScales'];tickSize?:()=>number|undefined}={}){
 const renderer=new NativeRenderer() as any,features=new RendererControl(renderer);
 const rows=options.panes??[{id:'price',kind:'price',top:0,height:500,scale:{min:100,max:150}}];
 rows.forEach((row,index)=>{const pane=renderer.scene.ensurePane(row.id,row.kind,index,1);pane.bounds={top:row.top,height:row.height};pane.scale={...row.scale};pane.scaleTarget={...row.scale};pane.initialized=true;});
 renderer.coords.setSize(800,600,1);renderer.coords.viewport.barSpacing=6;
 const invalidations:number[]=[];renderer.scheduler={invalidate(level:number){invalidations.push(level);},cancel(){}};
 renderer.input={el:{getBoundingClientRect:()=>({left:10,top:20,width:864,height:628})}};
 const viewport=new Set<()=>void>();
 const doc:any={...eventTarget(),body:{tag:'body'},documentElement:{tag:'html'},activeElement:null};
 const win:any={...eventTarget(),innerWidth:1400,innerHeight:900};doc.defaultView=win;
 const panel:any={tag:'chart-panel',isConnected:true,focus:vi.fn(),contains:(node:unknown)=>node===container||node===panel};
 const container:any={...eventTarget(),ownerDocument:doc,contains:(node:unknown)=>node===container,closest:(selector:string)=>selector==='[tabindex]'?panel:null};
 doc.activeElement=panel;
 let props:PriceScaleMenuViewProps|null=null;const renders:Array<PriceScaleMenuViewProps|null>=[],focused:Array<string|null>=[];
 const mount:PriceScaleMenuMount={render(value){props=value;renders.push(value);},focus(key){focused.push(key);},contains:target=>(target as unknown)==='inside-menu',dispose:vi.fn()};
 let appearance=options.appearance??null;
 const portOptions:PriceScalePortOptions={renderer,features:features as any,onViewportChanged:listener=>{viewport.add(listener);return()=>viewport.delete(listener);},container,availability:options.availability,appearance:()=>appearance,mount:()=>mount,...(options.mergeScales?{mergeScales:options.mergeScales}:{}),...(options.tickSize?{tickSize:options.tickSize}:{})};
 const port=installPriceScalePort(portOptions);
 return{renderer,features,port,container,doc,win,panel,mount,renders,focused,invalidations,
  props:()=>props,
  setAppearance(value:Record<string,string|number|boolean>|null){appearance=value;},
  viewportChanged(){for(const listener of [...viewport])listener();},viewportListeners:()=>viewport.size,
  pane:(id='price')=>renderer.scene.panes.get(id),
 };
}
