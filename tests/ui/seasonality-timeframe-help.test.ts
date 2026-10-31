import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {makeHarness,findAll} from './indicator-real-port-harness';
// Actual settings component and real port; SYNTHETIC numerical host and controlled hook cells.
// These tests establish controls/drafts only, not source qualification, DOM focus or packaged GUI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return[cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}
};});
const {scopes,dialog}=makeHarness(hooks),owned:ReturnType<typeof dialog>[]=[];
beforeEach(()=>scopes.clear());
afterEach(()=>{const failures:unknown[]=[];for(const ui of owned.splice(0))try{ui.port.dispose();}catch(error){failures.push(error);}if(failures.length===1)throw failures[0];if(failures.length)throw new AggregateError(failures,'Settings test cleanup failed.');});
function open(kind:'seasonality'|'sma'){const ui=dialog({seed:[kind],initialSelected:0});owned.push(ui);return ui;}

it('Seasonality explains the original source and omits unsupported generic timeframe/wait controls without mutating settings',()=>{
 const ui=open('seasonality'),before=ui.port.serialize();
 expect(ui.sHas('Indicator timeframe')).toBe(false);
 expect(ui.sHas('Wait for timeframe closes')).toBe(false);
 for(const name of ['Starting year','Declared local source calendar','Declared local source session','Declared daily/monthly date labels','Local observations closed through (UTC)'])expect(ui.sHas(name),name).toBe(true);
 expect(ui.sText()).toContain('original daily or monthly source');
 expect(ui.sText()).toContain('calendar, session, date labels and completion time declared above');
 expect(ui.sText()).toContain('It does not resample chart bars.');
 expect(ui.sText()).toContain('An independent timeframe and waiting for timeframe closes are unavailable for this study.');
 expect(ui.sText()).toContain('Live intraday multi-year history is not yet supported.');
 expect(ui.sText()).not.toContain('Chart: the indicator uses the chart bars.');
 expect(ui.port.serialize()).toEqual(before);
});

it('Seasonality keeps its source and Style drafts with Cancel while the explanation remains presentation-only',()=>{
 const ui=open('seasonality'),before=ui.port.serialize();
 ui.sEdit('Starting year','2016');ui.sClick('Style');ui.sEdit('Table width (%)','55');ui.sClick('Inputs');
 expect(ui.sField('Starting year').props.value).toBe('2016');
 expect(ui.sHas('Indicator timeframe')).toBe(false);expect(ui.sHas('Wait for timeframe closes')).toBe(false);
 expect(ui.port.serialize()).toEqual(before);ui.sClick('Cancel');expect(ui.port.serialize()).toEqual(before);
});

it('ordinary SMA retains the actual timeframe choices and wait draft handlers and Cancel semantics',()=>{
 const ui=open('sma'),before=ui.port.serialize(),select=ui.sField('Indicator timeframe');
 const choices=findAll(select,node=>node.type==='option').map(node=>node.props.value);
 expect(choices[0]).toBe('');expect(choices).toContain('1D');expect(choices).toContain('240m');
 expect(ui.sField('Wait for timeframe closes').props.checked).toBe(true);
 ui.sEdit('Indicator timeframe','1D');ui.sCheck('Wait for timeframe closes',false);
 expect(ui.sField('Indicator timeframe').props.value).toBe('1D');
 expect(ui.sField('Wait for timeframe closes').props.checked).toBe(false);
 expect(ui.sText()).toContain('The indicator calculates on 1D bars built from the loaded chart bars');
 expect(ui.sText()).not.toContain('Seasonality uses its original daily or monthly source');
 expect(ui.port.serialize()).toEqual(before);ui.sClick('Cancel');expect(ui.port.serialize()).toEqual(before);
});
