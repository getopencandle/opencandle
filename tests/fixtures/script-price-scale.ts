import {RendererControl} from '@luxalgo/vela';
import {logicalScriptFixture} from './script-derived-position';
import {installedPainters,commandCanvas} from '../chart/chart-paint-harness';
import {priceScaleHarness} from '../chart/price-scale-harness';
import {installIndicatorDisplay} from '../../src/chart/indicator-display';
import {installPriceScalePort,capturePriceScaleDisplayPrecision} from '../../src/chart/price-scale-port';
import {statusLinePriceFormat} from '../../src/chart/status-line-model';

/** SYNTHETIC actual worker/Runtime/adapter source/native model. Only host/document scheduling and formatting are controlled.
 * The formatting boundary uses a genuine price-scale port; it cannot provide script values, native owners or input proof.
 * This is not complete createChartProbe construction or an executable UI/reference test. */
export async function scriptPriceScaleFixture(style='candles'){
 const h=await logicalScriptFixture({style}),dom=priceScaleHarness();dom.port.dispose();let price:ReturnType<typeof installPriceScalePort>|undefined,display:ReturnType<typeof installIndicatorDisplay>|undefined,closed=false;
 const cleanup=()=>{if(closed)return;closed=true;const errors:unknown[]=[];for(const release of [()=>display?.dispose(),()=>price?.dispose(),()=>h.dispose()])try{release();}catch(error){errors.push(error);}if(errors.length)throw new AggregateError(errors,'Synthetic scale glyph fixture cleanup failed.');};
 try{
  const loaded=await installedPainters(),recording=commandCanvas();h.native.backend=new loaded.module.LVActualCanvas2dBackend();h.native.chrome.ctx=recording.ctx;h.native.chrome.canvas=recording.canvas;
  h.native.syncSize=()=>{};h.native.scene.showAxisLabels=true;h.native.scene.showPriceLabel=false;h.native.scene.showCountdown=false;h.native.scene.marks.visible=false;h.native.scene.tradeMarkers.visible=false;
  price=installPriceScalePort({renderer:h.renderer,features:new RendererControl(h.renderer),container:dom.container,onViewportChanged:listener=>h.chart.on('viewport:changed',listener),tickSize:()=>.01,mount:()=>dom.mount});
  const formatHooks:{beforeFormat?:(value:number)=>void}={};
  h.produced.host.capturePriceScaleFormat=()=>{
   const precision=capturePriceScaleDisplayPrecision(price!),source=h.input,view=h.port.captureReadout!(h.binding.id);if(!precision||view.state!=='ready')return null;
   const assertCurrent=()=>{precision.assertCurrent();view.assertCurrent();if(h.input!==source)throw Error('Synthetic display owner changed.');};
   const format=statusLinePriceFormat(precision.precision,.01);assertCurrent();return{assertCurrent,format(value:number){assertCurrent();formatHooks.beforeFormat?.(value);const text=format(value);assertCurrent();return text;}};
  };
  const pane=h.native.scene.panes.get('price');Object.assign(pane,{bounds:{top:0,height:180},scale:{min:0,max:40,log:false,invert:false},collapsed:false});h.native.coords.setSize(300,180,1);
  const coords=h.native.coords;display=installIndicatorDisplay(h.renderer,h.chart,h.nativeIndicators,h.port);
  const labels=()=>recording.commands.filter(row=>row.op==='fillText'&&(row.values[3]===53||row.values[3]===45));
  return{...h,price,display,recording,coords,pane,formatHooks,
   paint(){recording.commands.length=0;h.native.chrome.drawMergedScaleColumns(recording.ctx,h.native.scene,coords,300);return labels();},
   paintLeft(){recording.commands.length=0;h.native.chrome.lvDrawLeftScale(h.native.scene,coords,h.native.theme,{},h.native.scene.orderedPanes());return labels();},
   dispose:cleanup};
 }catch(error){try{cleanup();}catch(cleanupError){throw new AggregateError([error,cleanupError],'Synthetic scale glyph setup and cleanup failed.');}throw error;}
}
