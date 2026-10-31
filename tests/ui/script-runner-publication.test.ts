import {beforeEach,expect,it,vi} from 'vitest';
import {ScriptBindingsRunner} from '../../src/ui/ScriptBindingsRunner';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';
import type {ScriptBinding} from '../../src/ui/script-library';
// Actual Runner subscription closure, controlled hooks. Runtime execution,
// native event delivery and React effect scheduling are separate checks.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,layout:[] as Array<()=>any>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useRef:(initial:any)=>{const i=hooks.cursor++;return hooks.cells[i]??(hooks.cells[i]={current:initial});},useState:(initial:any)=>{hooks.cursor++;return[initial,vi.fn()];},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();},useEffect:()=>{hooks.cursor++;},useLayoutEffect:(fn:()=>any)=>{hooks.cursor++;hooks.layout.push(fn);}};});
const binding:ScriptBinding={id:'one',documentId:'doc',version:1,name:'Synthetic',source:'({onBar(){}})',pane:'price',visible:true,plots:{}};
function fixture(){let listener!:(event:any)=>void;const off=vi.fn(),chart={scripts:{onInteraction:(fn:any)=>{listener=fn;return off;}}},dataset=fixtureDataset('GME',2),changed=vi.fn((_value:ScriptBinding[])=>true),props={chart:chart as any,bars:dataset.bars,source:sourceContextForDataset(dataset),style:'candles',bindings:[binding],ready:false,onBindingsChange:changed};const render=()=>{hooks.cursor=0;hooks.layout=[];ScriptBindingsRunner(props);};render();const cleanup=hooks.layout[0]();return{props,changed,off,render,cleanup,fire:(event:any)=>listener(event)};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.layout=[];});
it('rejected removal preserves the original binding for a later current interaction before rerender',()=>{const s=fixture();s.changed.mockReturnValueOnce(false);s.fire({kind:'removed',id:'one'});expect(s.changed).toHaveBeenCalledWith([]);s.fire({kind:'visibility',id:'one',visible:false});expect(s.changed).toHaveBeenCalledTimes(2);expect(s.changed.mock.calls[1][0]).toEqual([{...binding,visible:false}]);s.cleanup();});
it('retired native listeners cannot publish even if their queued callback runs after unsubscribe failure',()=>{const s=fixture();s.off.mockImplementation(()=>{throw new Error('synthetic unsubscribe failure');});expect(()=>s.cleanup()).toThrow('unsubscribe');s.fire({kind:'removed',id:'one'});expect(s.changed).not.toHaveBeenCalled();});
it('a previous chart listener cannot retarget a replacement renderer before React cleanup',()=>{const s=fixture();s.props.chart={scripts:{}};s.render();s.fire({kind:'visibility',id:'one',visible:false});expect(s.changed).not.toHaveBeenCalled();s.cleanup();});
