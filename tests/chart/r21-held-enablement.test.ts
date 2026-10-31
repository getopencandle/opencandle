import {expect,it} from 'vitest';
import {factoryAppearance,factoryPriceScale,findRow,writeRow,type ChartSettingsSources} from '../../src/chart/chart-settings-bindings';
import {defaultChartSettingsDocument} from '../../src/chart/chart-settings-document';
import {priceScaleLabelItems} from '../../src/chart/price-scale-menu';
import {defaultPriceScaleSettings} from '../../src/chart/price-scale-state';

// held patch: the price-axis menu entry for name labels and the 12-hours choice become selectable.
const sources=()=>({appearance:factoryAppearance(),document:defaultChartSettingsDocument(),documentConnected:true,priceScale:factoryPriceScale(),ratio:0.5,style:'candles',typeSettings:null,timezone:'UTC',exchangeTimezone:'America/New_York'}) as ChartSettingsSources;

it('the Labels submenu offers "Indicators and financials name labels" as a live checkbox (fact default off)',()=>{
 const ctx=(indName:boolean)=>({pane:{paneId:'price',kind:'price' as const,mode:'regular' as const,auto:true,invert:false},settings:{...defaultPriceScaleSettings(),labels:{...defaultPriceScaleSettings().labels,indName}},ratio:null,scaleCount:1,host:{appearance:true,openSettings:true}});
 const off=priceScaleLabelItems(ctx(false)).find((row:any)=>row.id==='labels.indName') as any;
 expect(off).toMatchObject({role:'menuitemcheckbox',checked:false,label:'Indicators and financials name labels',factId:'labels.indName'});expect(off.disabled).toBeUndefined();
 expect((priceScaleLabelItems(ctx(true)).find((row:any)=>row.id==='labels.indName') as any).checked).toBe(true);
});

it('Settings > Scales and lines > Time hours format offers 12-hours and saves it',()=>{
 const row=findRow('scales',sources(),'scales.timeHoursFormat')!;
 expect(row.options!.map(option=>option.value)).toEqual(['24','12']);expect(row.optionDisabled).toBeUndefined();
 expect(writeRow(sources(),'scales.timeHoursFormat',{selected:'12'}).document.scales.timeHours).toBe('12');
});
