import {NativeRenderer,type Vela} from '@luxalgo/vela';
import {captureNativeInlineDOMPorts} from '../../src/chart/native-inline-dom-ports';
import {installTrendlineAnnotation} from '../../src/chart/trendline-annotation';
import {installOwnedTrendlineInlineGeometry,clientToInlinePlot} from '../../src/chart/trendline-inline-geometry';
import {annotationNativeHarness,annotationRecord} from '../chart/trendline-annotation-native-harness';

/** Synthetic DOM layout only; actual NativeRenderer.paintData and native drawing bodies execute. */
export async function inlineDOMPortsFixture(configure?:(renderer:any,plot:any,surface:any,document:any)=>void){
 const f=await annotationNativeHarness(),renderer=f.renderer as any,controller=f.controller as any;
 let epoch=0,style:Record<string,string>={transform:'none',rotate:'none',scale:'none',translate:'none',perspective:'none',zoom:'1'};
 const document:any={defaultView:{getComputedStyle:()=>({...style,width:'460px',height:'330px',paddingLeft:'0px',paddingRight:'0px',paddingTop:'0px',paddingBottom:'0px',borderLeftWidth:'0px',borderRightWidth:'0px',borderTopWidth:'0px',borderBottomWidth:'0px'})}},plot:any={ownerDocument:document,parentNode:{},parentElement:null,isConnected:true,clientWidth:460,clientHeight:330,getBoundingClientRect:()=>({left:20,top:40,width:920,height:660})};
 const surface:any={ownerDocument:document,parentNode:plot,parentElement:plot,isConnected:true,width:920,height:660,getBoundingClientRect:()=>({left:20,top:40,width:920,height:660})};
 Object.assign(controller.canvas,{ownerDocument:document,parentNode:plot});Object.assign(controller,{activeTool:null,measureMode:false,eraserMode:false});controller.popup.isOpen=()=>false;
 Object.assign(renderer,{dataCanvas:surface,plot,coords:{devicePixelRatio:2,widthPx:400,dataHeightPx:300},input:{el:surface,drawings:true,dragging:false,touches:new Map()},bars:[],extLayers:[],animator:{active:true},scene:{panes:new Map(),orderedPanes:()=>[{id:'price'}]},backend:{render(){events.push('backend');}},modelAlpha:1,candleBodyAlpha:1,candleStructureAlpha:1,syncLayerCanvasOrder(){},stampScaleInvert(){},indicatorSlices:{prepare:()=>new Map()},backdropRenderer:{render(){}},chrome:{render(){events.push('chrome');}},axisSurface(){return{};},trackMarkPopover(){},paintedData:false});
 const events:string[]=[],owner=()=>{const captured=epoch;return()=>{if(epoch!==captured)throw Error('SYNTHETIC source retired');};},assertSource=owner();configure?.(renderer,plot,surface,document);const ports=captureNativeInlineDOMPorts(renderer,assertSource);
 return{...f,renderer,ports,plot,surface,document,events,setStyle(value:Record<string,string>){style={...style,...value};},retireSource(){epoch++;},owner,cleanup(){f.dispose();}};
}

