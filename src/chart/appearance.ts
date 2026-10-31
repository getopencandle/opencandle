import type { ChartConfig, LineStyle } from '@luxalgo/vela';
import type { ChartDiagnostic } from './contracts';
export type AppearanceSettings = Record<string, string | number | boolean>;
export interface AppearanceMapping { config: Record<string, unknown>; diagnostics: ChartDiagnostic[]; retainedSettings: AppearanceSettings }
export function mapAppearance(settings: AppearanceSettings): AppearanceMapping {
  const get = (key: string) => settings[key];
  const text = (key: string) => String(get(key) ?? '');
  const bool = (key: string) => get(key) === true || get(key) === 1 || get(key) === '1';
  const numeric = (key: string) => Number(get(key));
  const s = 'mainSeriesProperties.'; const c = s + 'candleStyle.'; const p = 'paneProperties.';
  const style: LineStyle = numeric(p+'crossHairProperties.style') === 1 ? 'dotted' : numeric(p+'crossHairProperties.style') === 2 ? 'dashed' : 'solid';
  const mode = text(p+'gridLinesMode');
  const candles: ChartConfig['candles'] = {upColor:text(c+'upColor'),downColor:text(c+'downColor'),bodyVisible:bool(c+'drawBody'),borderVisible:bool(c+'drawBorder'),borderUpColor:text(c+'borderUpColor'),borderDownColor:text(c+'borderDownColor'),wickVisible:bool(c+'drawWick'),wickUpColor:text(c+'wickUpColor'),wickDownColor:text(c+'wickDownColor')};
  const config = {version:1,layout:{background:text(p+'background'),textColor:text('scalesProperties.textColor'),fontSize:numeric('scalesProperties.fontSize')},candles,
    grid:{vertLines:{visible:mode==='both'||mode==='vertical',color:text(p+'vertGridProperties.color')},horzLines:{visible:mode==='both'||mode==='horizontal',color:text(p+'horzGridProperties.color')}},
    crosshair:{color:text(p+'crossHairProperties.color'),width:numeric(p+'crossHairProperties.width'),style},
    priceScale:{borderColor:text('scalesProperties.lineColor'),currentPriceLine:bool(s+'showPriceLine'),countdown:bool(s+'showCountdown')},
    panes:{separatorColor:text(p+'separatorColor')},margins:{top:numeric(p+'topMargin'),bottom:numeric(p+'bottomMargin')},
  };
  const unsupported = [
    ...(text(p+'backgroundType')==='gradient' ? [p+'backgroundType',p+'backgroundGradientStartColor',p+'backgroundGradientEndColor'] : []),
    ...(bool(c+'barColorsOnPrevClose') ? [c+'barColorsOnPrevClose'] : []),
    ...(text(s+'priceLineColor')!=='' ? [s+'priceLineColor'] : []),
    s+'priceLineWidth',
    ...(bool(s+'highLowAvgPrice.highLowPriceLinesVisible') ? [s+'highLowAvgPrice.highLowPriceLinesVisible',s+'highLowAvgPrice.highLowPriceLinesColor',s+'highLowAvgPrice.highLowPriceLinesWidth'] : []),
  ];
  return {config,retainedSettings:structuredClone(settings),diagnostics:unsupported.map(feature=>({code:'APPEARANCE_RENDERER_UNAVAILABLE',feature,message:`The current renderer cannot apply ${feature}; its value is preserved.`,severity:'unavailable'}))};
}
