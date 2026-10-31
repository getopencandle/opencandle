import {expect,it} from 'vitest';
import {composeChartExport,chartExportFooterText} from '../../src/chart/image-export';
function fakeCanvas(){const texts:{text:string;align:string}[]=[],ctx:any={textAlign:'left',fillText:(text:string)=>texts.push({text,align:ctx.textAlign}),measureText:()=>({width:1}),createLinearGradient:()=>({addColorStop(){}})};for(const op of ['save','restore','beginPath','rect','clip','fillRect','drawImage','fill','roundRect','moveTo','bezierCurveTo','closePath'])ctx[op]=()=>{};const canvas:any={width:0,height:0,getContext:()=>ctx};return{canvas:canvas as HTMLCanvasElement,texts};}
it('export footer draws symbol, interval, date and the OpenCandle mark right-aligned beside the provenance caption',()=>{
 const native=fakeCanvas().canvas;native.width=400;native.height=200;const out=fakeCanvas();
 const source:any={datasetId:'d',revision:1,fixture:true,label:'SYNTHETIC GME'};
 composeChartExport(native,null,source,()=>out.canvas,1,undefined,{symbol:'GME',interval:'1D',dateText:'2026-10-27'});
 const footer=out.texts.find(t=>t.text==='GME · 1D · 2026-10-27');expect(footer?.align).toBe('right');expect(out.texts.some(t=>t.text==='LV')).toBe(false);expect(out.texts.some(t=>t.text.startsWith('OpenCandle'))).toBe(true);
 const bare=fakeCanvas();composeChartExport(native,null,source,()=>bare.canvas,1);expect(bare.texts.some(t=>t.text==='GME · 1D · 2026-10-27')).toBe(false);
 expect(chartExportFooterText({symbol:'A\nB',interval:'',dateText:'d'})).toBe('A B · d');
});
