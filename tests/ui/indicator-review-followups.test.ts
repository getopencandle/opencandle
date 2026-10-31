import {beforeEach,expect,it,vi} from 'vitest';
import {DOMAIN_INDICATORS} from '../../src/chart/indicator-settings';
import {makeHarness,valuesOf} from './indicator-real-port-harness';

// L1 follow-ups to (F8, F12). Actual settings/list handlers on
// the real indicator port with the minimal native host. Model + component-handler evidence only; no DOM/GUI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

it.each([...DOMAIN_INDICATORS])('F12 HIDE %s: Show restores byte-identical native output, not just a non-empty emission',kind=>{
 const ui=dialog({seed:[kind,kind]}),[one]=ui.ids,native=ui.host.live.get(ui.port.list()[0].rendererId),before=structuredClone(native.emitted),values=valuesOf(ui.port,one);
 ui.click('Hide '+ui.labels().get(one));expect(native.visible).toBe(false);expect(ui.port.list()[0].informationBars).toBeGreaterThan(0);
 ui.click('Show '+ui.labels().get(one));expect(native.visible).toBe(true);expect(native.emitted).toEqual(before);expect(valuesOf(ui.port,one)).toEqual(values);
});

it('F8 IND.VWAP.ANCHOR.SESSION: on zero-volume bars the Anchor editor really switches from Week to Session (results differ), giving the literal [null,20,null]',()=>{
 const bars=[['2024-03-04T14:00:00Z',10,0],['2024-03-04T15:00:00Z',20,2],['2024-03-05T14:00:00Z',30,0]].map(([iso,price,volume])=>({time:Date.parse(iso as string),open:price as number,high:price as number,low:price as number,close:price as number,volume:volume as number}));
 const ui=dialog({seed:['vwap'],initialSelected:0,bars}),[id]=ui.ids,vwap=()=>valuesOf(ui.port,id).find(series=>series.id==='vwap')!.values;
 ui.sEdit('Anchor period','Week');ui.sSubmit();expect(ui.port.list()[0].inputs.anchor).toBe('Week');expect(vwap()).toEqual([null,20,20]);// same week: (20*2+30*0)/2
 ui.sEdit('Anchor period','Session');ui.sSubmit();expect(ui.port.list()[0].inputs.anchor).toBe('Session');expect(vwap()).toEqual([null,20,null]);// new day with zero volume is unavailable
});

// A non-finite
// close no longer carries the prior total. That bar's OBV is unavailable (null, not zero), so a trailing missing close
// genuinely leaves the latest value unavailable and no tracking line is drawn. Missing volume still refuses the whole
// indicator. The superseded lane narrowing asserted a carried [0,101,203,306,410,410] with a line at 410.
it('OBV price line: a non-finite last close leaves the latest value unavailable and draws no line; missing volume refuses OBV and draws nothing',()=>{
 const base=Array.from({length:6},(_,i)=>({time:1700000000000+i*86400000,open:10+i,high:11+i,low:9+i,close:10+i,volume:100+i}));
 const nanClose=base.map((bar,i)=>i===5?{...bar,close:NaN}:bar),nanVolume=base.map((bar,i)=>i===5?{...bar,volume:NaN}:bar);
 const track=(ui:any)=>(ui.host.live.get(ui.port.list()[0].rendererId).emitted?.priceLines??[]).filter((line:any)=>line.id.includes('track:'));
 const complete=dialog({seed:['obv'],initialSelected:0,bars:base});complete.sClick('Style');complete.sCheck('obv trackPrice',true);complete.sSubmit();
 expect(valuesOf(complete.port,complete.ids[0]).find(series=>series.id==='obv')!.values).toEqual([0,101,203,306,410,515]);// +101,+102,+103,+104,+105
 expect(track(complete)).toEqual([expect.objectContaining({price:515})]);// the same settings draw a line when the latest value exists
 const a=dialog({seed:['obv'],initialSelected:0,bars:nanClose});a.sClick('Style');a.sCheck('obv trackPrice',true);a.sSubmit();
 expect(a.port.list()[0].plots.obv.trackPrice).toBe(true);expect(a.port.list()[0].diagnostics).toEqual([]);
 const obv=valuesOf(a.port,a.ids[0]).find(series=>series.id==='obv')!.values;expect(obv).toEqual([0,101,203,306,410,null]);// NaN close: unavailable, not 410 and not 0
 expect(track(a)).toEqual([]);
 const b=dialog({seed:['obv'],initialSelected:0,bars:nanVolume});b.sClick('Style');b.sCheck('obv trackPrice',true);b.sSubmit();
 expect(b.port.list()[0].plots.obv.trackPrice).toBe(true);expect(valuesOf(b.port,b.ids[0])).toEqual([]);expect(b.port.list()[0].diagnostics.join(' ')).toMatch(/volume/);expect(track(b)).toEqual([]);
});
