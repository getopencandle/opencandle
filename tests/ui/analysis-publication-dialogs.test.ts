import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorDialog} from '../../src/ui/IndicatorDialog';
import {ComparisonDialog} from '../../src/ui/ComparisonDialog';
import {createIndicatorLibrary} from '../../src/ui/indicator-library';
import {AnalysisPublicationError} from '../../src/chart/analysis-publication';
import {fixtureDataset} from '../../src/domain/fixtures';
import {Modal} from '../../src/ui/Modal';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(v:any)=>{hooks.cells[i]=typeof v==='function'?v(hooks.cells[i]):v;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;}};});
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
function setup(kind:'indicator'|'comparison'){
 const add=vi.fn(()=> 'one'),changed=vi.fn<()=>boolean|void>(()=>true),close=vi.fn(),dataset=fixtureDataset('GME',1),chart={indicators:{catalog:['sma'],list:()=>[],add,subscribe:()=>()=>{}},comparisons:{list:()=>[],add,subscribe:()=>()=>{}}};
 let props:any={chart,instances:[],library:createIndicatorLibrary(),onLibraryChange:()=>true,onClose:close,onChange:changed,datasets:[dataset],ownerToken:{}};
 const render=()=>{hooks.cursor=0;return kind==='indicator'?IndicatorDialog(props):ComparisonDialog(props);};
 const button=()=>find(render(),node=>node.type==='button'&&(kind==='indicator'?node.props['aria-label']==='Add Simple Moving Average':text(node).includes('GME')));
 return {add,changed,close,render,button,replace(){props={...props,ownerToken:{}};render();}};
}
// Actual retained callbacks with controlled React hooks, not DOM or packaged GUI evidence.
it.each(['indicator','comparison'] as const)('%s terminal accepted-publication failure cannot duplicate Add and still permits Close',kind=>{
 const h=setup(kind);h.add.mockImplementation(()=>{throw new AnalysisPublicationError(kind,[Error('Literal rejected save')]);});const add=h.button();add.props.onClick();add.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);expect(h.changed).not.toHaveBeenCalled();find(h.render(),node=>node.type===Modal).props.onClose();expect(h.close).toHaveBeenCalledTimes(1);
});
it.each(['indicator','comparison'] as const)('%s rejects a false post-edit publication result and retires its accepted action',kind=>{
 const h=setup(kind);h.changed.mockReturnValue(false);const add=h.button();add.props.onClick();add.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);expect(h.changed).toHaveBeenCalledTimes(1);expect(text(find(h.render(),node=>node.props.role==='alert'))).toContain('publication');
});
it.each(['indicator','comparison'] as const)('%s preaccept validation error remains retryable',kind=>{
 const h=setup(kind);h.add.mockImplementationOnce(()=>{throw Error('Literal invalid input before mutation');});const add=h.button();add.props.onClick();add.props.onClick();expect(h.add).toHaveBeenCalledTimes(2);expect(h.changed).toHaveBeenCalledTimes(1);
});
it.each(['indicator','comparison'] as const)('%s busy action cannot reenter its retained Add callback',kind=>{
 const h=setup(kind),add=h.button();let calls=0;h.add.mockImplementation(()=>{if(++calls===1)add.props.onClick();return'one';});add.props.onClick();expect(h.add).toHaveBeenCalledTimes(1);expect(h.changed).toHaveBeenCalledTimes(1);
});
