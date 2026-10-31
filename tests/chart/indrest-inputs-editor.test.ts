import {beforeEach,expect,it,vi} from 'vitest';
import {indicatorNames} from '../../src/ui/indicator-dialog-model';
import {indicatorLegacyDefaults} from '../../src/chart/indicator-settings';
import {makeHarness,valuesOf,expected} from '../ui/indicator-real-port-harness';

// /3: edits made through the actual Inputs editor handlers (read-only import of the dialog and its model) on the
// real indicator port. SYNTHETIC bars from the harness. Closes the earlier refusals (ADX DI length, Supertrend factor, LSMA
// regression offset), the AO Edit surface, the RSI divergence toggle and the SMA/EMA/BB/WMA offset bounds. Not a packaged-GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

it.each([
 ['adx','DI length','diLength',20,'0'],
 ['supertrend','Factor','factor',2.5,'-1'],
 ['lsma','Regression offset','regressionOffset',2,'1.5'],
] as const)('%s: the "%s" control edits %s through the Inputs editor, recalculates, and refuses an invalid entry',(kind,title,key,value,invalid)=>{
 const ui=dialog();ui.addAndEdit('Add '+indicatorNames[kind]);
 const row=ui.port.list()[0],before=valuesOf(ui.port,row.id);
 ui.sEdit(title,String(value));ui.sSubmit();
 const edited=ui.port.list()[0];expect(edited.inputs[key]).toBe(value);
 expect(valuesOf(ui.port,row.id)).toEqual(expected(kind,edited.inputs));expect(valuesOf(ui.port,row.id)).not.toEqual(before);
 const update=vi.spyOn(ui.port,'update');
 ui.sEdit(title,invalid);expect(ui.sAlert()).not.toBe('');expect(ui.sButton('Apply indicator settings').props.disabled).toBe(true);ui.sSubmit();
 expect(update).not.toHaveBeenCalled();expect(ui.port.list()[0].inputs[key]).toBe(value);update.mockRestore();
});

it('ao: Edit has no calculation inputs (SBI#ao.std sourceInputsCount 0); Style changes commit on Ok and revert on Cancel',()=>{
 const ui=dialog();ui.addAndEdit('Add '+indicatorNames.ao);
 const row=ui.port.list()[0];
 expect(ui.sHas('Length')).toBe(false);expect(ui.sHas('Source')).toBe(false);expect(ui.sHas('Fast length')).toBe(false);
 ui.sClick('Style');
 const plot=ui.port.list()[0].series[0].id,width=ui.port.list()[0].plots[plot]?.width;
 ui.sEdit(plot+' width','3');
 ui.sClick('Discard draft and reload');// Cancel
 expect(ui.port.list()[0].plots[plot]?.width).toBe(width);
 ui.sClick('Style');ui.sEdit(plot+' width','3');ui.sSubmit();// Ok
 expect(ui.port.list()[0].plots[plot].width).toBe(3);
 expect(valuesOf(ui.port,row.id)).toEqual(expected('ao',ui.port.list()[0].inputs));
});

it('rsi: the Inputs tab offers Calculate divergence off by default; turning it on adds two plots and leaves the RSI values unchanged',()=>{
 const ui=dialog();ui.addAndEdit('Add '+indicatorNames.rsi);
 const row=ui.port.list()[0],base=valuesOf(ui.port,row.id)[0];
 expect(ui.sField('Calculate divergence').props.checked).toBe(false);
 expect(Object.hasOwn(row.inputs,'divergence')).toBe(false);
 ui.sCheck('Calculate divergence',true);ui.sSubmit();
 expect(ui.port.list()[0].inputs.divergence).toBe(true);
 expect(ui.port.list()[0].series.map(s=>s.id)).toEqual(['rsi','smooth','divergenceBullish','divergenceBearish']);// A new RSI starts with the RSI-based MA (SMA 21)
 expect(valuesOf(ui.port,row.id)[0]).toEqual(base);
 // The Style tab lists the two divergence plots with the five style rows (visible, color, width, line style, price line).
 ui.sClick('Style');
 for(const plot of ['divergenceBullish','divergenceBearish']){for(const control of ['visible','color','width','line style','trackPrice'])expect(ui.sHas(plot+' '+control),plot+' '+control).toBe(true);}
 ui.sCheck('divergenceBullish visible',false);ui.sEdit('divergenceBearish width','4');ui.sEdit('divergenceBullish color','#123456');ui.sEdit('divergenceBearish line style','dashed');ui.sCheck('divergenceBullish trackPrice',true);
 ui.sEdit('divergenceBullish width','3');ui.sCheck('divergenceBearish visible',false);ui.sEdit('divergenceBearish color','#654321');ui.sEdit('divergenceBullish line style','dotted');ui.sCheck('divergenceBearish trackPrice',true);ui.sSubmit();
 const plots=ui.port.list()[0].plots;
 expect(plots.divergenceBullish).toMatchObject({visible:false,color:'#123456',width:3,lineStyle:'dotted',trackPrice:true});
 expect(plots.divergenceBearish).toMatchObject({visible:false,color:'#654321',width:4,lineStyle:'dashed',trackPrice:true});
 expect(indicatorLegacyDefaults.rsi).toEqual({length:14,source:'close'});
});

it.each(['sma','ema','bb','wma'] as const)('%s: Display offset 500 is accepted and 501 is refused through the Inputs editor',kind=>{
 const ui=dialog();ui.addAndEdit('Add '+indicatorNames[kind]);
 ui.sEdit('Display offset (bars)','500');ui.sSubmit();expect(ui.port.list()[0].offset).toBe(500);
 ui.sEdit('Display offset (bars)','501');ui.sSubmit();
 expect(ui.sText()).toContain('The indicator change was rejected. The draft is retained.');
 expect(ui.port.list()[0].offset).toBe(500);// the committed offset is untouched by the refused edit
 ui.sEdit('Display offset (bars)','-501');ui.sSubmit();expect(ui.port.list()[0].offset).toBe(500);
 ui.sEdit('Display offset (bars)','-500');ui.sSubmit();expect(ui.port.list()[0].offset).toBe(-500);
});

it('a stored SMA offset of 1000 still loads and the editor flags it as outside the fact range until it is changed',()=>{
 const ui=dialog();ui.addAndEdit('Add '+indicatorNames.sma);
 const id=ui.port.list()[0].id;ui.port.update(id,{offset:100});// within the shared range; the edit bound below only applies to changed values
 const stored=ui.port.serialize();stored[0]={...stored[0],offset:1000};
 const restarted=dialog();restarted.port.restore(stored);expect(restarted.port.list()[0].offset).toBe(1000);
 restarted.click('Edit '+restarted.labels().get(id));
 expect(restarted.sText()).toContain('Saved value 1000 is outside the current range -500 to 500. It is kept until you change it.');
});
