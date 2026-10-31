import {describe,expect,it} from 'vitest';
import {
 CHART_SETTINGS_TEMPLATE_LIMIT,defaultChartSettingsDocument,restoreChartSettingsDocument,sameDocument,validTemplateName,withTemplate,withoutTemplate,type ChartSettingsDocument,
} from '../../src/chart/chart-settings-document';
import {serializeAppearance} from '../../src/ui/themes';
import {factoryAppearance} from '../../src/chart/chart-settings-bindings';

const template=(name:string,document=defaultChartSettingsDocument())=>({name,appearance:serializeAppearance(factoryAppearance()),statusLine:document.statusLine,scales:document.scales,canvas:document.canvas,symbol:document.symbol,typeSettings:{line:{color:'#123456'}}});
let counter=0;const id=()=>'t'+(++counter);

describe('Chart Settings document persistence',()=>{
 it('a workspace saved before the document existed restores factory defaults',()=>{
  expect(restoreChartSettingsDocument(undefined)).toEqual(defaultChartSettingsDocument());
  expect(defaultChartSettingsDocument()).not.toBe(defaultChartSettingsDocument());
 });
 it('round-trips every group and template through JSON exactly',()=>{
  let document:ChartSettingsDocument=defaultChartSettingsDocument();
  document.statusLine.volume=true;document.statusLine.title={visible:false,source:'symbolAndName'};document.statusLine.background={visible:true,transparency:80};
  document.scales.dateFormat='format-10';document.scales.timeHours='12';document.scales.prePostColors=['#111111','#222222','rgba(1, 2, 3, 0.5)'];
  document.canvas.watermark={ticker:true,interval:true,description:false,replay:false,color:'#abcdef80'};document.canvas.rightMarginBars=25;
  document.trading.positionPL={visible:false,display:'percent'};document.trading.executionSound={enabled:true,volume:0.25,melody:'Alarm Clock'};
  document.alerts.lines={visible:true,color:'#ff0000'};document.alerts.volume={enabled:false,level:1};
  document.events.earnings={visible:false,breaks:true};document.symbol.precision='1/32';
  document=withTemplate(document,template('Night'),id);
  const restored=restoreChartSettingsDocument(JSON.parse(JSON.stringify(document)));
  expect(restored).toEqual(document);expect(sameDocument(restored,document)).toBe(true);
 });
 it('absent fields take their default; unknown fields and wrong types are refused with a message',()=>{
  const partial=restoreChartSettingsDocument({statusLine:{volume:true},trading:{alignment:'left'}});
  expect(partial.statusLine.volume).toBe(true);expect(partial.statusLine.logo).toBe(true);expect(partial.trading.alignment).toBe('left');expect(partial.alerts).toEqual(defaultChartSettingsDocument().alerts);
  expect(()=>restoreChartSettingsDocument({statusLine:{fancy:true}})).toThrow('unknown field: fancy');
  expect(()=>restoreChartSettingsDocument({future:{}})).toThrow('unknown field: future');
  expect(()=>restoreChartSettingsDocument({statusLine:{logo:'yes'}})).toThrow('statusLine.logo must be true or false');
  expect(()=>restoreChartSettingsDocument({scales:{dateFormat:'format-99'}})).toThrow('scales.dateFormat');
  expect(()=>restoreChartSettingsDocument({scales:{bidAskColors:['#000000']}})).toThrow('2 supported colors');
  expect(()=>restoreChartSettingsDocument({canvas:{rightMarginBars:2.5}})).toThrow('whole number');
  expect(()=>restoreChartSettingsDocument({canvas:{watermark:{color:'notacolor'}}})).toThrow('supported color');
  expect(()=>restoreChartSettingsDocument({alerts:{volume:{level:1.5}}})).toThrow('between 0 and 1');
  expect(()=>restoreChartSettingsDocument({version:2})).toThrow('version');
  expect(()=>restoreChartSettingsDocument([])).toThrow('must be an object');
  expect(restoreChartSettingsDocument({alerts:{lines:{visible:true,color:null}}}).alerts.lines.color).toBeNull();
 });
 it('templates: names are trimmed, unique case-insensitively (same name replaces), bounded and removable',()=>{
  let document=withTemplate(defaultChartSettingsDocument(),template('  Night  '),id);
  expect(document.templates.map(row=>row.name)).toEqual(['Night']);
  const first=document.templates[0].id;
  document=withTemplate(document,{...template('night'),typeSettings:{}},id);
  expect(document.templates).toHaveLength(1);expect(document.templates[0].id).toBe(first);expect(document.templates[0].name).toBe('night');expect(document.templates[0].typeSettings).toEqual({});
  expect(()=>validTemplateName('   ')).toThrow('Enter a template name');expect(()=>validTemplateName('x'.repeat(65))).toThrow('at most 64');expect(()=>validTemplateName('a\u0007b')).toThrow('control characters');
  for(let index=1;index<CHART_SETTINGS_TEMPLATE_LIMIT;index++)document=withTemplate(document,template('T'+index),id);
  expect(document.templates).toHaveLength(CHART_SETTINGS_TEMPLATE_LIMIT);
  expect(()=>withTemplate(document,template('One more'),id)).toThrow('Remove one first');
  const removed=withoutTemplate(document,first);expect(removed.templates.some(row=>row.id===first)).toBe(false);expect(document.templates.some(row=>row.id===first)).toBe(true);
  expect(()=>withoutTemplate(removed,first)).toThrow('no longer exists');
  expect(()=>restoreChartSettingsDocument({templates:[{...removed.templates[0]},{...removed.templates[0]}]})).toThrow('distinct ids');
 });
});
