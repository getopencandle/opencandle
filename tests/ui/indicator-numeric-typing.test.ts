import {beforeEach,expect,it,vi} from 'vitest';
import {makeHarness} from './indicator-real-port-harness';

// Typing a number left to right into an indicator Inputs field (actual IndicatorSettings
// handlers, real indicator port). The field text follows React 19's controlled type="number" rule: the
// browser value getter is "" for a partial entry ("-", "-0."), and React replaces the field text only when
// (value===0 && node.value==='') || node.value != value. Model evidence only; no DOM or GUI claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

/** HTML "valid floating-point number"; anything else reads back as "" from a number input. */
const validFloat=(text:string)=>/^-?(\d+(\.\d+)?|\.\d+)([eE][-+]?\d+)?$/.test(text);
/** Select the field and type `chars` left to right; returns the text the field shows afterwards. */
function typeLeftToRight(ui:ReturnType<typeof dialog>,title:string,chars:string){
 let shown='';
 for(const char of chars){
  const typed=shown+char,nodeValue=validFloat(typed)?typed:'';
  ui.sEdit(title,nodeValue);
  const value=ui.sField(title).props.value;
  // eslint-disable-next-line eqeqeq
  shown=(value===0&&nodeValue==='')||nodeValue!=value?String(value):typed;
 }
 return shown;
}

it('F3: "-0.1" typed left to right keeps its leading minus and is refused by validation (Standard deviations)',()=>{
 const ui=dialog({seed:['bb'],initialSelected:0});
 expect(typeLeftToRight(ui,'Standard deviations','-0.1')).toBe('-0.1');
 expect(ui.sAlert()).not.toBe('');expect(ui.sButton('Apply indicator settings').props.disabled).toBe(true);
 const update=vi.spyOn(ui.port,'update');ui.sSubmit();expect(update).not.toHaveBeenCalled();expect(ui.port.list()[0].inputs.multiplier).toBe(2);
});
it('F3: a zero after the decimal point survives while typing ("1.05" stays 1.05, not 15)',()=>{
 const ui=dialog({seed:['bb'],initialSelected:0});
 expect(typeLeftToRight(ui,'Standard deviations','1.05')).toBe('1.05');
 expect(ui.sAlert()).toBe('');ui.sSubmit();expect(ui.port.list()[0].inputs.multiplier).toBe(1.05);
 expect(ui.sField('Standard deviations').props.value).toBe('1.05');
});
it('F3: validation semantics are unchanged; an integer field still refuses a fraction, and a reload shows the committed value',()=>{
 const ui=dialog({seed:['bb'],initialSelected:0});
 expect(typeLeftToRight(ui,'Length','2.5')).toBe('2.5');expect(ui.sAlert()).not.toBe('');
 expect(typeLeftToRight(ui,'Standard deviations','-0')).toBe('-0');
 ui.sClick('Discard draft and reload');expect(ui.sField('Length').props.value).toBe('20');expect(ui.sField('Standard deviations').props.value).toBe('2');expect(ui.sAlert()).toBe('');
});
