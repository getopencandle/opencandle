import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {createIndicatorTemplates,instantiateIndicatorTemplate,restoreIndicatorTemplates,type IndicatorTemplate,type IndicatorTemplates} from '../../src/ui/indicator-templates';
import {indicatorNames} from '../../src/ui/indicator-dialog-model';
import {DOMAIN_INDICATORS,indicatorActivePlotIds,indicatorPlotIds} from '../../src/chart/indicator-settings';
import type {IndicatorId} from '../../src/domain/indicators';
import {makeHarness,realChart,valuesOf,expected,settingsOf,overlayKinds,find,text} from './indicator-real-port-harness';

// L1 lane evidence: per-kind lifecycle through the ACTUAL IndicatorDialog / IndicatorTemplatesDialog
// handlers wired to the REAL indicator port (real validation, calculation, presentation and pane
// registry). The native chart is a minimal in-memory host, not the packaged renderer: this is
// model + component-handler evidence only. No DOM mount, focus, keyboard or packaged GUI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,renderIn,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
/** A visible, valid edit of one calculation input per kind plus an invalid value for the same editor. */
// Phase 2: keyed by the original ten kinds (IndicatorId now also covers the extended catalog).
const edits:Record<string,{field:string;value:string;key:string;parsed:unknown;invalidField:string;invalid:string}>={
 volume:{field:'MA Length',value:'10',key:'length',parsed:10,invalidField:'MA Length',invalid:'0'},
 sma:{field:'Length',value:'5',key:'length',parsed:5,invalidField:'Length',invalid:'2.5'},
 ema:{field:'Length',value:'5',key:'length',parsed:5,invalidField:'Length',invalid:''},
 rsi:{field:'Length',value:'7',key:'length',parsed:7,invalidField:'Length',invalid:'100001'},
 macd:{field:'Fast length',value:'8',key:'fast',parsed:8,invalidField:'Slow length',invalid:'0'},
 bb:{field:'Length',value:'10',key:'length',parsed:10,invalidField:'Standard deviations',invalid:'-1'},
 vwap:{field:'Anchor period',value:'Week',key:'anchor',parsed:'Week',invalidField:'Calendar anchor time zone',invalid:'Not/A_Zone'},
 stochastic:{field:'Length',value:'10',key:'length',parsed:10,invalidField:'K smoothing',invalid:'0'},
 atr:{field:'Length',value:'7',key:'length',parsed:7,invalidField:'Length',invalid:'-3'},
 obv:{field:'Smoothing type',value:'SMA',key:'smoothingType',parsed:'SMA',invalidField:'Smoothing length',invalid:'0'},
};
const kinds=[...DOMAIN_INDICATORS];
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));

it.each(kinds)('ADD + MULTIPLE_INSTANCES %s: the catalog Add creates distinct calculated instances with separate native ownership',kind=>{
 const ui=dialog();ui.click('Add '+indicatorNames[kind]);
 let rows=ui.port.list();expect(rows).toHaveLength(1);const first=rows[0],factory=factoryIndicatorDefault(kind);
 expect(first.kind).toBe(kind);expect(settingsOf(first)).toEqual({kind,...factory});
 expect(first.series.map(series=>series.id)).toEqual(indicatorActivePlotIds(kind,first.inputs));
 expect(valuesOf(ui.port,first.id)).toEqual(expected(kind,first.inputs));expect(valuesOf(ui.port,first.id).some(series=>series.values.some(value=>value!==null))).toBe(true);
 expect(ui.selected()).toBeNull();expect(ui.text()).toContain(' added');
 ui.click('Add '+indicatorNames[kind]);rows=ui.port.list();expect(rows).toHaveLength(2);const second=rows[1];
 expect(second.id).not.toBe(first.id);expect(second.rendererId).not.toBe(first.rendererId);expect(ui.host.live.size).toBe(2);
 const emitted=[...ui.host.live.values()].map(row=>row.emitted.series.map((series:any)=>series.id));expect(emitted[0].some((id:string)=>emitted[1].includes(id))).toBe(false);
 expect(valuesOf(ui.port,second.id)).toEqual(valuesOf(ui.port,first.id));
 const labels=ui.labels();expect(labels.get(first.id)).toMatch(/ #1$/);expect(labels.get(second.id)).toMatch(/ #2$/);
 expect(ui.text()).toContain(indicatorNames[kind]+' added (2 on chart)');expect(ui.text()).toContain('2 on chart');expect(ui.selected()).toBeNull();
});

it.each(kinds)('EDIT %s: Apply recalculates only the selected instance; invalid drafts and Cancel leave committed state; restart keeps the edit',kind=>{
 const edit=edits[kind],ui=dialog({seed:[kind,kind],initialSelected:1}),[one,two]=ui.ids,beforeOne=valuesOf(ui.port,one),beforeTwo=valuesOf(ui.port,two),settingsOne=settingsOf(ui.port.list()[0]);
 ui.sEdit(edit.field,edit.value);expect(ui.sText()).toContain('Unapplied changes.');expect(valuesOf(ui.port,two)).toEqual(beforeTwo);
 ui.sClick('Cancel');expect(ui.selected()).toBeNull();expect(ui.port.list()[1].inputs[edit.key]).toBe(factoryIndicatorDefault(kind).inputs[edit.key]);expect(valuesOf(ui.port,two)).toEqual(beforeTwo);
 ui.click('Edit '+ui.labels().get(two));ui.sEdit(edit.field,edit.value);ui.sSubmit();
 const rows=ui.port.list();expect(rows[1].inputs[edit.key]).toBe(edit.parsed);expect(valuesOf(ui.port,two)).toEqual(expected(kind,rows[1].inputs));expect(valuesOf(ui.port,two)).not.toEqual(beforeTwo);
 expect(settingsOf(rows[0])).toEqual(settingsOne);expect(valuesOf(ui.port,one)).toEqual(beforeOne);expect(ui.props.onChange).toHaveBeenCalledTimes(1);
 const committed=structuredClone(rows[1]),update=vi.spyOn(ui.port,'update');
 ui.sEdit(edit.invalidField,edit.invalid);expect(ui.sButton('Apply indicator settings').props.disabled).toBe(true);expect(ui.sAlert()).not.toBe('');
 ui.sSubmit();expect(update).not.toHaveBeenCalled();expect(settingsOf(ui.port.list()[1])).toEqual(settingsOf(committed));expect(valuesOf(ui.port,two)).toEqual(expected(kind,committed.inputs));
 ui.sClick('Discard draft and reload');expect(ui.sText()).toContain('No unapplied changes.');
 const restarted=realChart();restarted.port.restore(JSON.parse(JSON.stringify(ui.port.serialize())));
 expect(restarted.port.list().map(settingsOf)).toEqual(ui.port.list().map(settingsOf));expect(valuesOf(restarted.port,two)).toEqual(valuesOf(ui.port,two));expect(valuesOf(restarted.port,one)).toEqual(beforeOne);
});

it.each(kinds)('HIDE %s: Hide suspends only the chosen instance and Show restores identical values; restart keeps the hidden flag',kind=>{
 const ui=dialog({seed:[kind,kind]}),[one,two]=ui.ids,beforeOne=valuesOf(ui.port,one),beforeTwo=valuesOf(ui.port,two),natives=[...ui.host.live.values()];
 ui.click('Hide '+ui.labels().get(one));
 expect(ui.port.list().map(row=>row.visible)).toEqual([false,true]);expect(natives.map(row=>row.visible)).toEqual([false,true]);
 expect(valuesOf(ui.port,two)).toEqual(beforeTwo);expect(ui.text()).toContain('Hidden: not calculated while hidden.');
 expect(find(ui.render(),node=>node.props?.['aria-label']==='Show '+ui.labels().get(one))).toBeTruthy();
 const restarted=realChart();restarted.port.restore(JSON.parse(JSON.stringify(ui.port.serialize())));expect(restarted.port.list().map(row=>row.visible)).toEqual([false,true]);expect([...restarted.host.live.values()].map(row=>row.visible)).toEqual([false,true]);
 ui.click('Show '+ui.labels().get(one));expect(ui.port.list().map(row=>row.visible)).toEqual([true,true]);expect(natives[0].visible).toBe(true);
 expect(valuesOf(ui.port,one)).toEqual(beforeOne);expect(natives[0].emitted.series.length).toBeGreaterThan(0);expect(valuesOf(ui.port,two)).toEqual(beforeTwo);
});

it.each(kinds)('REMOVE %s: Remove deletes only the chosen instance and its native registration, clearing its open editor',kind=>{
 const ui=dialog({seed:[kind,kind],initialSelected:0}),[one,two]=ui.ids,beforeTwo=valuesOf(ui.port,two),removedLabel=ui.labels().get(one)!,nativeOne=ui.port.list()[0].rendererId;
 expect(ui.selected()).toBe(one);ui.click('Remove '+removedLabel);
 expect(ui.port.list().map(row=>row.id)).toEqual([two]);expect(ui.host.live.has(nativeOne)).toBe(false);expect(ui.host.live.size).toBe(1);
 expect(valuesOf(ui.port,two)).toEqual(beforeTwo);expect(ui.selected()).toBeNull();expect(ui.text()).toContain('Removed '+removedLabel+'.');
 expect(()=>ui.port.values(one)).toThrow(/Unknown indicator instance/);
 ui.click('Remove '+ui.labels().get(two));expect(ui.port.list()).toEqual([]);expect(ui.host.live.size).toBe(0);expect(ui.text()).toContain('Add an indicator to configure its inputs and plots.');
});

it.each(kinds)('PANE_PLACEMENT %s: LV default pane, then price/new/existing-pane moves keep numerical identity and survive restart',kind=>{
 const partner:IndicatorId=kind==='rsi'?'macd':'rsi',ui=dialog({seed:[kind,partner],initialSelected:0}),[id,partnerId]=ui.ids,before=valuesOf(ui.port,id);
 const paneOf=(target:string)=>ui.port.list().find(row=>row.id===target)!.paneId;
 if(overlayKinds.has(kind))expect(paneOf(id)).toBe('price');else{expect(paneOf(id)).not.toBe('price');expect(paneOf(id)).not.toBe(paneOf(partnerId));}
 ui.sClick('Placement');
 if(overlayKinds.has(kind)){expect(ui.sText()).toContain('Current placement: Price pane');expect(ui.sButton('Move to price pane').props.disabled).toBe(true);ui.sClick('Move to new pane');expect(paneOf(id)).not.toBe('price');expect(ui.sText()).toContain('Indicator moved to a new pane.');}
 else{expect(ui.sButton('Move to new pane').props.disabled).toBe(true);ui.sClick('Move to price pane');expect(paneOf(id)).toBe('price');expect(ui.sText()).toContain('Indicator moved to the price pane.');ui.sClick('Move to new pane');expect(paneOf(id)).not.toBe('price');}
 expect(valuesOf(ui.port,id)).toEqual(before);
 ui.sClick('Move to pane with '+ui.labels().get(partnerId));expect(paneOf(id)).toBe(paneOf(partnerId));expect(ui.sText()).toContain('Indicator moved to the selected pane.');expect(valuesOf(ui.port,id)).toEqual(before);
 const saved=ui.port.serialize();expect(saved[0].paneId).toBe(saved[1].paneId);
 const restarted=realChart();restarted.port.restore(JSON.parse(JSON.stringify(saved)));const rows=restarted.port.list();expect(rows[0].paneId).toBe(rows[1].paneId);expect(rows[0].paneId).not.toBe('price');expect(valuesOf(restarted.port,id)).toEqual(before);
 ui.sClick('Move to price pane');expect(paneOf(id)).toBe('price');expect(valuesOf(ui.port,id)).toEqual(before);
});

it.each(kinds)('RESET_DEFAULTS %s: factory reset is staged until Apply, saved defaults seed and reset drafts, and restoring factory clears them',kind=>{
 // A new Volume colors its columns by candle direction (0.8.1), which disables the single Volume color, so its MA color is edited.
 const edit=edits[kind],plot=kind==='volume'?'ma':indicatorPlotIds[kind][0],factory=factoryIndicatorDefault(kind),ui=dialog({seed:[kind],initialSelected:0}),[id]=ui.ids;
 ui.sEdit(edit.field,edit.value);ui.sClick('Style');ui.sEdit(plot+' color','#123456');ui.sClick('Inputs');ui.sEdit('Display offset (bars)','2');ui.sSubmit();
 let row=ui.port.list()[0];expect(row.inputs[edit.key]).toBe(edit.parsed);expect(row.plots[plot].color).toBe('#123456');expect(row.offset).toBe(2);
 ui.sClick('Reset draft to factory');expect(ui.sText()).toContain('Factory settings staged.');expect(ui.port.list()[0].inputs[edit.key]).toBe(edit.parsed);expect(ui.sText()).toContain('Unapplied changes.');
 ui.sSubmit();row=ui.port.list()[0];expect(settingsOf(row)).toEqual({kind,...factory});expect(valuesOf(ui.port,id)).toEqual(expected(kind,factory.inputs));
 ui.sEdit(edit.field,edit.value);ui.sClick('Save as default');expect(ui.library.defaults[kind]?.inputs[edit.key]).toBe(edit.parsed);expect(ui.port.list()[0].inputs[edit.key]).toBe(factory.inputs[edit.key]);
 ui.sClick('Discard draft and reload');ui.sClick('Reset draft to saved defaults');expect(ui.sText()).toContain('Saved defaults staged.');ui.sSubmit();expect(ui.port.list()[0].inputs[edit.key]).toBe(edit.parsed);
 ui.click('Add '+indicatorNames[kind]);expect(ui.port.list()[1].inputs[edit.key]).toBe(edit.parsed);
 ui.click('Edit '+ui.labels().get(id));ui.sClick('Restore factory default');expect(ui.library.defaults[kind]).toBeDefined();ui.sClick('Confirm factory default');expect(ui.library.defaults[kind]).toBeUndefined();expect(ui.sText()).toContain('Future instances use factory defaults.');
 expect(ui.port.list()[0].inputs[edit.key]).toBe(edit.parsed);ui.click('Add '+indicatorNames[kind]);expect(settingsOf(ui.port.list()[2])).toEqual({kind,...factory});
});

it.each(kinds)('TEMPLATE %s: a saved template carries this kind with its settings and pane sharing into fresh instances after a restart',async kind=>{
 const source=realChart(),edit=edits[kind],a=source.port.add(kind,factoryIndicatorDefault(kind).inputs,factoryIndicatorDefault(kind)),b=source.port.add(kind,factoryIndicatorDefault(kind).inputs,factoryIndicatorDefault(kind));
 source.port.update(b,{inputs:{[edit.key]:edit.parsed},offset:-1});if(!overlayKinds.has(kind))source.port.move(b,{pane:source.port.list()[0].paneId!});
 let library:IndicatorTemplates=createIndicatorTemplates();const target=realChart(),applied:IndicatorTemplate[]=[];
 const props={get library(){return library;},onLibraryChange:vi.fn((next:IndicatorTemplates)=>{library=next;}),capture:()=>({content:{indicators:source.port.serialize(),scripts:[],rememberSymbol:false,rememberInterval:false,source:null},assertCurrent:()=>{}}),
  previewApply:vi.fn(async(template:IndicatorTemplate)=>({lines:['Replace indicators'],apply:async()=>{applied.push(template);let n=0;target.port.restore(instantiateIndicatorTemplate(template,()=>'fresh-'+kind+'-'+ ++n,target.port.list().map(row=>row.id)).indicators);}})),onClose:vi.fn()};
 const render=()=>renderIn('templates',()=>IndicatorTemplatesDialog({...props,library}));
 const click=(value:string)=>find(render(),node=>node.type==='button'&&text(node)===value).props.onClick();
 click('Save current chart');find(render(),node=>node.type==='input'&&node.props.required).props.onChange({target:{value:'Kind '+kind}});find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){}});await flush();
 expect(library.records).toHaveLength(1);expect(library.records[0].indicators.map(row=>row.kind)).toEqual([kind,kind]);
 library=restoreIndicatorTemplates(JSON.parse(JSON.stringify(library)));scopes.delete('templates');// restart: the library is reloaded from JSON and the dialog remounted
 click('Kind '+kind+' · 2 indicators · 0 scripts');click('Apply');await flush();expect(applied).toHaveLength(1);
 const original=source.port.list(),copied=target.port.list();expect(copied.map(settingsOf)).toEqual(original.map(settingsOf));
 expect(copied.map(row=>row.id)).toEqual((overlayKinds.has(kind)?[1,2]:[1,3]).map(n=>'fresh-'+kind+'-'+n));
 expect(copied.every(row=>!original.some(other=>other.id===row.id))).toBe(true);
 if(overlayKinds.has(kind))expect(copied.map(row=>row.paneId)).toEqual(['price','price']);else{expect(copied[0].paneId).toBe(copied[1].paneId);expect(copied[0].paneId).not.toBe('price');}
 copied.forEach((row,index)=>expect(valuesOf(target.port,row.id)).toEqual(valuesOf(source.port,original[index].id)));
 expect(valuesOf(target.port,copied[1].id)).toEqual(expected(kind,copied[1].inputs));
});
