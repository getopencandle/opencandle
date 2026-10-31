import {nativeCoreHarness} from './native-core-harness';
import {installedPainters,commandCanvas} from './chart-paint-harness';
import {createIndicatorPort} from '../../src/chart/indicator-port';
import {installIndicatorDisplay} from '../../src/chart/indicator-display';

export async function indicatorDisplayHarness(install=true){
 const t=await nativeCoreHarness(),loaded=await installedPainters(),recording=commandCanvas();
 const repaint={failures:0,requests:0};t.native.scheduler.invalidate=()=>{repaint.requests++;if(repaint.failures>0){repaint.failures--;throw Error('literal repaint failure');}};
 t.native.syncSize=()=>{}; // Controlled unmounted DOM sizing boundary; actual scale/painter methods remain.
 t.native.backend=new loaded.module.LVActualCanvas2dBackend();
 const rows=[10,20].map((close,i)=>({time:1700000000000+i*60000,open:close,high:close+1,low:close-1,close,volume:i+1}));t.core.bars=rows;t.native.bars=rows;t.native.scene.bars=rows;
 const pane=t.native.scene.panes.get('price');Object.assign(pane,{bounds:{top:0,height:180},scale:{min:0,max:40,log:false},collapsed:false});
 Object.assign(t.native.scene,{showAxisLabels:true,showPriceLabel:false,showCountdown:false,priceMintick:.01});t.native.scene.marks.visible=false;t.native.scene.tradeMarkers.visible=false;
 const coords={dpr:1,width:300,height:180,barCount:2,barInterval:60000,visibleLogicalRange:()=>({from:0,to:1}),visibleTimeRange:()=>({from:rows[0].time,to:rows[1].time}),timeToX:(time:number)=>(time-rows[0].time)/60000*200,bodySpacing:()=>20,pxPerBar:()=>20,logicalToX:(i:number)=>50+i*20,priceToY:(value:number,scale:any,bounds:any)=>{const unit=scale.log?(Math.log(value)-Math.log(scale.min))/(Math.log(scale.max)-Math.log(scale.min)):(value-scale.min)/(scale.max-scale.min);return bounds.top+bounds.height*(scale.invert?unit:1-unit);}};
 t.native.coords=coords;t.native.chrome.ctx=recording.ctx;t.native.chrome.canvas=recording.canvas;
 const seenLegend:any[]=[];t.native.inputsUI.setPlotValues=(value:unknown)=>seenLegend.push(value);
 let resolution='1m';const port=createIndicatorPort(t.chart,undefined,undefined,undefined,t.bridge.claim,()=>({resolution}));
 let display=install?installIndicatorDisplay(t.renderer,t.chart,port):null;
 const endpointLabels=()=>recording.commands.filter(row=>row.op==='fillText'&&row.values.length===4&&(row.values[3]===53||row.values[3]===45));
 return {...t,recording,coords,pane,port,seenLegend,repaint,get display(){return display!;},setResolution(value:string){resolution=value;},install(){display=installIndicatorDisplay(t.renderer,t.chart,port);return display;},paint(){recording.commands.length=0;t.native.chrome.drawMergedScaleColumns(recording.ctx,t.native.scene,coords,coords.width);return endpointLabels();},paintAll(){recording.commands.length=0;t.native.chrome.render(t.native.scene,coords,t.native.theme,{background:'#131722',textColor:'#fff'});return endpointLabels();},dispose(){repaint.failures=0;display?.dispose();port.dispose();t.dispose();}};
}
