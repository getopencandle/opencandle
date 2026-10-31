import React from 'react';
import {lvDarkChartExtras} from './themes';
import {watermarkView,type WatermarkSettings,type WatermarkSubject} from '../chart/chart-watermark';

/** The symbol watermark of one chart cell (model and citations in src/chart/chart-watermark.ts). It never takes
 * pointer input and is hidden from assistive technology: the same text is in the status line. */
export function ChartWatermark({settings,subject}:{settings:WatermarkSettings;subject:WatermarkSubject}){
 const view=watermarkView(settings,subject);if(!view)return null;
 return <div className="lv-chart-watermark" aria-hidden="true" data-lv-watermark={view.lines.map(line=>line.id).join(' ')}
  style={{position:'absolute',inset:0,zIndex:1,pointerEvents:'none',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',overflow:'hidden',containerType:'size',color:view.color,fontFamily:lvDarkChartExtras.canvasFontFamily,textAlign:'center',userSelect:'none'}}>
  {view.lines.map(line=><div key={line.id} data-lv-watermark-line={line.id} style={{fontSize:`min(${line.fontSize}px, ${Math.round(160/Math.max(1,line.text.length))}cqw)`,lineHeight:line.lineHeight/line.fontSize,whiteSpace:'nowrap',maxWidth:'100%'}}>{line.text}</div>)}
 </div>;
}
