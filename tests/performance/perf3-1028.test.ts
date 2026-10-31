// App's legend-bottom measurement forced a layout inside every symbol and interval switch, because each switch
// hands every indicator view new data counts (informationBars, latestInformationTime) and the effect depended on the views'
// identity. It now depends on the views' layout inputs only. Any change that can move the legend still re-measures.
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';

const app=readFileSync(new URL('../../src/ui/App.tsx',import.meta.url),'utf8');
const start=app.indexOf('function legendLayoutKey('),end=app.indexOf('\n',start);
const legendLayoutKey=Function(stripTypeScriptTypes(app.slice(start,end),{mode:'transform'})+';return legendLayoutKey;')() as (views:unknown[])=>string;
const view=(over:object={})=>({id:'bb',kind:'bb',inputs:{length:20},paneId:null,series:[{id:'basis',label:'Basis'}],diagnostics:[],informationBars:500,latestInformationTime:1000,...over});

it('a switch that changes only data counts keeps the legend layout key; layout inputs change it',()=>{
 expect(legendLayoutKey([view()])).toBe(legendLayoutKey([view({informationBars:120,latestInformationTime:9999})]));
 expect(legendLayoutKey([view()])).not.toBe(legendLayoutKey([view({paneId:'pane-2'})]));
 expect(legendLayoutKey([view()])).not.toBe(legendLayoutKey([view({inputs:{length:21}})]));
 expect(legendLayoutKey([view()])).not.toBe(legendLayoutKey([view(),view({id:'rsi'})]));
 expect(legendLayoutKey([view()])).not.toBe(legendLayoutKey([view({diagnostics:['warning']})]));
});
it('the legend-bottom effect depends on the key, not on the views identity',()=>{
 expect(app).toContain('if(paneLegendOwnerCurrent())setLegendBottom(previous=>previous===bottom?previous:bottom);},[legendLayoutKey(indicatorViews),workspace.scriptBindings,');
});
