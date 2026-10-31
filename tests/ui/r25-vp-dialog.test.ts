import {beforeEach,expect,it,vi} from 'vitest';
import {makeHarness} from './indicator-real-port-harness';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';

// The histogram row colors and the extras in the ACTUAL IndicatorDialog settings over the REAL indicator port
// (in-memory native host). Component-handler evidence only; no DOM, focus or GUI claim. SYNTHETIC fixture bars.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

it('the Style tab names the four row backgrounds, and an edited Up volume color is saved on the instance',()=>{
 const ui=dialog({seed:['vrvp'],initialSelected:0});
 ui.sClick('Style');
 const shown=ui.sText();
 for(const legend of ['Up volume','Down volume','Value area up','Value area down'])expect(shown).toContain(legend);
 expect(shown).not.toContain('Band fill');
 ui.sEdit('vpUp fill color','#00ff00');ui.sSubmit();
 expect(ui.port.list()[0].presentation!.fills.vpUp).toMatchObject({visible:true,color:'#00ff00'});
});
it('the four extras are boolean inputs of both profile kinds',()=>{
 for(const kind of ['vrvp','pvp'] as const){
  const fields=indicatorInputSchema(kind).filter(field=>['developingPoc','developingVa','extendPocRight','rowValues'].includes(field.key));
  expect(fields.map(field=>[field.title,field.type,field.defval])).toEqual([['Developing POC','bool',false],['Developing VA','bool',false],['Extend POC right','bool',false],['Row volume labels','bool',false]]);
 }
});
