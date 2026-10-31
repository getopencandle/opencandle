import {beforeEach,expect,it,vi} from 'vitest';
import {PriceScaleToolbar} from '../../src/ui/price-scale-toolbar';
import {priceScaleHarness} from '../chart/price-scale-harness';

// Actual toolbar component handlers on the actual port (package NativeRenderer) with
// mocked React hooks; element tree only. No DOM mount, GUI or focus claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>,cleanups:[] as unknown[]}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];hooks.cleanups=[];});
const render=(props:any)=>{hooks.cursor=0;hooks.effects=[];return PriceScaleToolbar(props) as any;};
const buttons=(tree:any)=>tree.props.children as any[];

it('WS.BOTTOM.PERCENT_TOGGLE/LOG_TOGGLE/AUTO_TOGGLE render in reference order with tooltips, data names and pressed state',()=>{
 const h=priceScaleHarness(),chart={priceScale:h.port} as any;const tree=render({chart});
 expect(tree.props.role).toBe('group');
 expect(buttons(tree).map(row=>[row.props.children,row.props.title,row.props['data-name'],row.props['aria-pressed']])).toEqual([['%','Toggle Percentage','percentage',false],['log','Toggle Log Scale','logarithm',false],['auto','Toggle Auto Scale','auto',true]]);
});
it('clicks change the real scale through the bound gesture host and the subscription re-renders pressed state',()=>{
 const h=priceScaleHarness(),chart={priceScale:h.port} as any,messages:string[]=[],trace:string[]=[];
 let tree=render({chart,onMessage:(value:string)=>messages.push(value)});for(const effect of hooks.effects)hooks.cleanups.push(effect());
 buttons(tree)[1].props.onClick();expect(h.renderer.scene.logScale).toBe(false);expect(messages[0]).toMatch(/not connected/); // unbound: refused, nothing changes
 h.port.bindHost({gesture:{begin(){trace.push('begin');return true;},finish(){trace.push('finish');}}});
 const revision=hooks.cells[0];buttons(tree)[1].props.onClick();expect(h.renderer.scene.logScale).toBe(true);expect(trace).toEqual(['begin','finish']);expect(hooks.cells[0]).toBeGreaterThan(revision);
 tree=render({chart});expect(buttons(tree).map(row=>row.props['aria-pressed'])).toEqual([false,true,true]);
 buttons(tree)[0].props.onClick();tree=render({chart});expect(buttons(tree).map(row=>row.props['aria-pressed'])).toEqual([true,false,true]);
 buttons(tree)[2].props.onClick();tree=render({chart});expect(buttons(tree)[2].props['aria-pressed']).toBe(false);expect(h.pane().manualScale).toEqual({min:100,max:150});
 const before=hooks.cells[0];h.port.execute('percent');expect(hooks.cells[0]).toBeGreaterThan(before); // external change notifies
 (hooks.cleanups[0] as ()=>void)();const after=hooks.cells[0];h.port.execute('percent');expect(hooks.cells[0]).toBe(after);
});
it('without a chart the toggles render the factory state disabled',()=>{
 const tree=render({chart:null});expect(buttons(tree).map(row=>[row.props.disabled,row.props['aria-pressed']])).toEqual([[true,false],[true,false],[true,true]]);
});
