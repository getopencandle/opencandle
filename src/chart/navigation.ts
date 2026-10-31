export type RangePreset='1D'|'5D'|'1W'|'1M'|'3M'|'6M'|'YTD'|'1Y'|'5Y'|'ALL'|'All';
export type PriceScaleMode='linear'|'percent'|'indexed'|'logarithmic';
export function rangeStart(lastSeconds:number,preset:RangePreset):number|null{
  if(!Number.isFinite(lastSeconds))throw new Error('Range requires finite source time');
  if(preset==='ALL'||preset==='All')return null;
  const date=new Date(lastSeconds*1000);
  if(preset==='1D')date.setUTCDate(date.getUTCDate()-1);
  else if(preset==='5D')date.setUTCDate(date.getUTCDate()-5);
  else if(preset==='1W')date.setUTCDate(date.getUTCDate()-7);
  else if(preset==='1M'||preset==='3M'||preset==='6M')date.setUTCMonth(date.getUTCMonth()-Number(preset.slice(0,-1)));
  else if(preset==='1Y'||preset==='5Y')date.setUTCFullYear(date.getUTCFullYear()-Number(preset.slice(0,-1)));
  else if(preset==='YTD')return Date.UTC(date.getUTCFullYear(),0,1)/1000;
  else throw new Error(`Unsupported range preset: ${preset}`);
  return date.getTime()/1000;
}
export interface ChartOptions {source:'open'|'high'|'low'|'close'|'hl2'|'hlc3'|'ohlc4';scale:PriceScaleMode;invert:boolean;auto:boolean;timezone:string}
export function validateChartOptions(options:ChartOptions){
  if(!['open','high','low','close','hl2','hlc3','ohlc4'].includes(options.source)||!['linear','percent','indexed','logarithmic'].includes(options.scale)||typeof options.invert!=='boolean'||typeof options.auto!=='boolean')throw new Error('Invalid chart option');
  new Intl.DateTimeFormat('en',{timeZone:options.timezone});
}
