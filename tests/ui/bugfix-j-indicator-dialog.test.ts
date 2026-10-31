import {beforeEach,expect,it,vi} from 'vitest';
import {makeHarness} from './indicator-real-port-harness';
import type {IndicatorSnapshot} from '../../src/chart/indicator-settings';
import type {IndicatorId} from '../../src/domain/indicators';

// Dialog Save as default, PRE-R7-3 (native min/max on an unchanged restored value) and
// PRE-R7-4 (asymmetric ENV pair display) from Actual IndicatorDialog /
// IndicatorSettings handlers on the real indicator port with SYNTHETIC bars. Native constraint validation is modelled
// from the HTML rules over the rendered attributes; no DOM, browser validation, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

/** HTML number input range validation: a form with such a field does not submit (Chromium blocks Apply). */
function nativeValid(props:any,value=String(props.value)){
 if(value==='')return true;const number=Number(value);if(!Number.isFinite(number))return false;
 if(props.min!==undefined&&number<Number(props.min))return false;
 if(props.max!==undefined&&number>Number(props.max))return false;
 return true;
}
const snap=(id:string,kind:IndicatorId,inputs:Record<string,unknown>,offset=0):IndicatorSnapshot=>({id,kind,inputs,plots:{},offset,visible:true,paneId:null} as unknown as IndicatorSnapshot);
function restored(rows:IndicatorSnapshot[]){
 const ui=dialog();ui.port.restore(rows);
 const open=(id:string)=>{scopes.clear();ui.click('Edit '+ui.labels().get(id));};
 return Object.assign(ui,{open,row:(id:string)=>ui.port.list().find(item=>item.id===id)!});
}

it('PRE-R7-1: a newly typed CCI Length 5000 is not saved as a default; the refusal names the fact bound',()=>{
 const ui=dialog({seed:['cci'],initialSelected:0});
 ui.sEdit('Length','5000');ui.sClick('Save as default');
 expect(ui.library.defaults.cci,'nothing saved').toBeUndefined();
 expect(ui.props.onLibraryChange).not.toHaveBeenCalled();
 expect(ui.sText()).toMatch(/1 through 2000/);
 ui.click('Add Commodity channel index');
 expect(ui.port.list().filter(row=>row.kind==='cci').map(row=>row.inputs.length)).toEqual([20,20]);
});

it('PRE-R7-1: Save as default from an instance restored with a pre-fix value copies that value (restored legacy, not new input)',()=>{
 const ui=restored([snap('cci-long','cci',{length:5000,source:'close'})]);ui.open('cci-long');
 ui.sClick('Save as default');
 expect(ui.library.defaults.cci?.inputs).toEqual({length:5000,source:'close'});
});

it('PRE-R7-3: an unchanged restored value above the fact bound does not block a style-only Apply, and its state is shown',()=>{
 const ui=restored([snap('cci-long','cci',{length:5000,source:'close'}),snap('wma-far','wma',{length:4,source:'close'},2000)]);
 ui.open('cci-long');
 const length=ui.sField('Length');
 expect(nativeValid(length.props),'the native max must not invalidate the unchanged legacy value').toBe(true);
 expect(ui.sText()).toMatch(/5000 is outside the current range 1 to 2000/);
 ui.sClick('Style');ui.sEdit('cci color','#123456');ui.sSubmit();ui.sClick('Inputs');
 expect(ui.row('cci-long').plots.cci.color).toBe('#123456');expect(ui.row('cci-long').inputs.length).toBe(5000);
 // Changing it is new input: the native bound applies again.
 ui.sEdit('Length','4000');expect(ui.sField('Length').props.max).toBe(2000);expect(nativeValid(ui.sField('Length').props)).toBe(false);
 ui.sEdit('Length','5000');expect(nativeValid(ui.sField('Length').props),'typing the stored value back restores the legacy state').toBe(true);
 ui.open('wma-far');
 const offset=ui.sField('Display offset (bars)');
 expect(nativeValid(offset.props)).toBe(true);expect(ui.sText()).toMatch(/2000 is outside the current range -500 to 500/);
});

it('PRE-R7-3: the offset of a restored WMA keeps its value through a style-only Apply; a new offset meets -500..500',()=>{
 const ui=restored([snap('wma-far','wma',{length:4,source:'close'},2000)]);ui.open('wma-far');
 expect(nativeValid(ui.sField('Display offset (bars)').props),'an unchanged legacy offset does not block Apply').toBe(true);
 ui.sClick('Style');ui.sEdit('wma color','#654321');ui.sSubmit();ui.sClick('Inputs');
 expect(ui.row('wma-far')).toMatchObject({offset:2000});expect(ui.row('wma-far').plots.wma.color).toBe('#654321');
 ui.sEdit('Display offset (bars)','1000');
 const offset=ui.sField('Display offset (bars)');expect([offset.props.min,offset.props.max]).toEqual([-500,500]);expect(nativeValid(offset.props)).toBe(false);
});

it('PRE-R7-4: an asymmetric legacy ENV pair is shown as a custom upper/lower state, and an untouched Apply keeps it',()=>{
 const ui=restored([snap('env-asym','env',{length:5,upperPercent:10,lowerPercent:5,source:'close',exponential:false})]);ui.open('env-asym');
 const percent=ui.sField('Percent');
 expect(percent.props.value,'the default 10 is not displayed as if it were the setting').toBe('');
 expect(percent.props.placeholder).toMatch(/Custom/);
 expect(ui.sText()).toMatch(/Upper percentage 10.*Lower percentage 5/);
 ui.sClick('Style');ui.sEdit('basis color','#123456');ui.sSubmit();ui.sClick('Inputs');
 expect(ui.row('env-asym').inputs).toEqual({length:5,upperPercent:10,lowerPercent:5,source:'close',exponential:false});
 ui.sEdit('Length','6');ui.sSubmit();
 expect(ui.row('env-asym').inputs).toEqual({length:6,upperPercent:10,lowerPercent:5,source:'close',exponential:false});
 // Entering a Percent replaces both (user-visible), and the display then shows it.
 ui.sEdit('Percent','10');expect(ui.sField('Percent').props.value).toBe('10');ui.sSubmit();
 expect(ui.row('env-asym').inputs).toEqual({length:6,percent:10,source:'close',exponential:false});
 expect(ui.sText()).not.toMatch(/Upper percentage 10/);
});
