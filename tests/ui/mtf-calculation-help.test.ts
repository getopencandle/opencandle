import {beforeEach,expect,it,vi} from 'vitest';
import {makeHarness} from './indicator-real-port-harness';

// Synthetic component-handler fixture only. The readonly row mode is supplied as
// presentation data; these checks do not grant or prove market-source ownership.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>scopes.clear());
type Mode='legacy'|'accepted-calendar'|'pending'|'unavailable';
function settings(mode:Mode){
 const ui=dialog({seed:['sma'],initialSelected:0});
 Object.defineProperty(ui.props,'instances',{get:()=>ui.port.list().map(row=>({...row,timeframeCalculation:mode}))});
 return ui;
}
it('keeps the accepted New York mode separate from an unapplied weekly selection',()=>{
 const ui=settings('accepted-calendar');
 ui.sEdit('Indicator timeframe','1W');
 expect(ui.port.list()[0].presentation?.timeframe).toBeUndefined();
 const text=ui.sText();
 expect(text).toContain('Selected timeframe: 1W.');
 expect(text).toContain('Current calculation: New York regular-session daily bars');
 expect(text).toContain('Confirmation requires the session close observed by the source.');
 expect(text).not.toContain('UTC day, Monday week, calendar month');
});
it('shows a pending source without describing it as an accepted calendar calculation',()=>{
 const ui=settings('pending');ui.sEdit('Indicator timeframe','1D');
 expect(ui.sText()).toContain('Current calculation: waiting for the source and chart to settle.');
 expect(ui.sText()).not.toContain('Current calculation: New York');
});
it('keeps an unavailable current calculation visible when the draft returns to Chart',()=>{
 const ui=settings('unavailable');
 expect(ui.sField('Indicator timeframe').props.value).toBe('');
 expect(ui.sText()).toContain('Selected timeframe: Chart.');
 expect(ui.sText()).toContain('Current calculation: unavailable.');
 expect(ui.sText()).not.toContain('Current calculation: New York');
});
it('preserves legacy help when the optional current mode is absent',()=>{
 const ui=dialog({seed:['sma'],initialSelected:0});
 ui.sEdit('Indicator timeframe','1D');
 expect(ui.sText()).toContain('UTC day, Monday week, calendar month');
 expect(ui.sText()).not.toContain('Current calculation:');
});
