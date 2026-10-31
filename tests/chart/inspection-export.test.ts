import {it,expect} from 'vitest';
import {normalizedCrosshair,inspectedBar,centeredDateRange} from '../../src/chart/inspection';
import {composeChartExport,chartExportProvenance} from '../../src/chart/image-export';
it('crosshair conversion preserves study-pane identity and independent value map',()=>{
 const values=new Map([['series-a',5]]),event={time:1700000000000,price:42,paneKind:'study' as const,values,ohlc:{time:1700000000000,open:1,high:4,low:1,close:3,volume:0}},result=normalizedCrosshair(event);
 expect(result.time).toBe(1700000000);expect(result.ohlc?.time).toBe(1700000000);expect(result.paneKind).toBe('study');values.set('series-a',9);expect(result.values.get('series-a')).toBe(5);
});
it('inspection uses exact hovered timestamps and latest-bar fallback only when no hover exists',()=>{
 const bars=[1,2,3].map(time=>({time,open:time,high:time,low:time,close:time,volume:0}));expect(inspectedBar(bars,2)).toEqual({index:1,bar:bars[1],hovered:true});expect(inspectedBar(bars,null).index).toBe(2);expect(inspectedBar(bars,2.5).bar).toBeNull();expect(inspectedBar([],null).bar).toBeNull();
 expect(centeredDateRange(100,300,500)).toEqual({from:400,to:600});expect(()=>centeredDateRange(1,1,5)).toThrow();
});
it('user export composition paints retained gradient before native layers and includes synthetic provenance',()=>{
 const calls:any[]=[];let fillStyle:any;const ctx={createLinearGradient:(...args:any[])=>{calls.push(['gradient',...args]);return{addColorStop:(...stop:any[])=>calls.push(['stop',...stop])};},set fillStyle(value:any){fillStyle=value;},get fillStyle(){return fillStyle;},fillRect:(...args:any[])=>calls.push(['fill',...args]),drawImage:()=>calls.push(['native']),save:()=>{},beginPath:()=>{},rect:()=>{},clip:()=>{},fillText:(text:string)=>calls.push(['caption',text]),restore:()=>{}};
 const native={width:800,height:400} as HTMLCanvasElement,out={width:0,height:0,getContext:()=>ctx} as unknown as HTMLCanvasElement;
 composeChartExport(native,{'paneProperties.backgroundType':'gradient','paneProperties.backgroundGradientStartColor':'#00112280','paneProperties.backgroundGradientEndColor':'#33445540'},{fixture:true,label:'Synthetic fixture',datasetId:'synthetic-a',revision:'2'},()=>out,2);
 expect(out.width).toBe(800);expect(out.height).toBe(456);expect(calls.slice(0,5)).toEqual([['gradient',0,0,0,400],['stop',0,'#00112280'],['stop',1,'#33445540'],['fill',0,0,800,456],['native']]);expect(calls.at(-1)[1]).toContain('SYNTHETIC');// Internal identity belongs in PNG metadata, while the visible footer stays readable.
 expect(calls.at(-1)[1]).not.toContain('synthetic-a @ 2');expect(chartExportProvenance(out)).toMatchObject({datasetId:'synthetic-a',revision:'2',fixture:true});
});
it('unrendered export surfaces and unavailable canvas contexts fail explicitly',()=>{
 const source={fixture:false,label:'Local',datasetId:'local',revision:'1'};
 expect(()=>composeChartExport({width:0,height:0} as HTMLCanvasElement,null,source,()=>({}) as HTMLCanvasElement)).toThrow('no usable rendered surface');
 expect(()=>composeChartExport({width:1,height:1} as HTMLCanvasElement,null,source,()=>({getContext:()=>null}) as unknown as HTMLCanvasElement)).toThrow('unavailable');
});
