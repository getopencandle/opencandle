import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
import {indicatorSettingsFocus} from '../../src/ui/indicator-settings-route';

// Legend and template App wiring, as App source pins. Their own files carry the
// behavior tests (lane-b-legend-view, lane-b-indicator-live-preview, lane-b-template-menu).
const app=readFileSync('src/ui/App.tsx','utf8');

describe('LANE-B App wiring',()=>{
 it('section 1: legend rows show live values and stack per pane',()=>{
  expect(app).toContain("import {groupLegendByPane,indicatorLegendValues} from '../chart/legend-pane-model';");
  expect(app).toMatch(/legendValuesView,legendPaneView/);
  // The legend reads the port's shared frozen snapshot (peekValues) instead of a deep copy per hover frame; values() is the fallback.
  expect(app).toContain('legendPort=chart?{values:(id:string)=>({series:(chart.indicators.peekValues?.(id)??chart.indicators.values(id)).series');
  expect(app).toContain('legendValuesView(indicatorLegendValues(legendPort,row,validInspection?.displayed.index??null,(kind,plot)=>defaultPlotStyle(kind as IndicatorId,plot,0)))');
  expect(app).toMatch(/className="lv-legend-title"[^\n]*?<\/button>\s*\{values\}/);
  expect(app).toContain('groupLegendByPane(indicatorViews).map(group=>');
  expect(app).not.toContain('indicatorViews.map(legendRow)');
 });
 it('section 2: legend settings open the compact window; Add indicator keeps the full dialog',()=>{
  // The compact focus moved into indicatorSettingsFocus (src/ui/indicator-settings-route.ts), which always sets compact:true.
  expect(app).toMatch(/function openIndicatorSettings\(row:IndicatorInstanceView,tab\?:string\)\{[^\n]*indicatorFocus\.current=indicatorSettingsFocus\(dialogAuthority\.current,row\.id,tab\)/);
  expect(indicatorSettingsFocus({},'SYNTHETIC-1')).toMatchObject({compact:true});
  expect(app).toContain('compact={indicatorFocus.current?.authority===renderedDialogAuthority&&indicatorFocus.current.compact===true}');
 });
 it('section 4: the toolbar templates control opens the dropdown; Save and Manage open the dialog tab',()=>{
  expect(app).toContain("import {IndicatorTemplatesMenu} from './IndicatorTemplatesMenu';");
  expect(app).toMatch(/aria-label="Indicator templates" aria-haspopup="menu" aria-expanded=\{templateMenu\}/);
  expect(app).toContain('{templateMenu&&chart&&<IndicatorTemplatesMenu library={workspace.indicatorTemplates} applied={appliedTemplate}');
  expect(app).toContain("onSave={()=>{setTemplateTab('save');setDialog('templates');}}");
  expect(app).toContain("onManage={()=>{setTemplateTab('saved');setDialog('templates');}}");
  expect(app).toContain("onUndo={()=>{setAppliedTemplate(null);void restoreHistory('undo');}}");
  expect(app).toMatch(/<IndicatorTemplatesDialog initialTab=\{templateTab\}/);
 });
});
