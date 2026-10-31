import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorSettings,indicatorInvalidFieldMessage} from '../../src/ui/IndicatorDialog';
import {createIndicatorLibrary,factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {indicatorInputSchema} from '../../src/chart/indicator-settings';
import type {IndicatorId} from '../../src/domain/indicators';
import type {IndicatorInstanceView} from '../../src/chart/indicator-port';

// Settings Ok for ALMA and Zig zag did nothing, because the browser refused the default (step mismatch)
// and a form with an invalid control never submits. The rendered inputs now accept their defaults, and a refused control
// shows a plain message instead of silence. Actual IndicatorSettings callbacks under deterministic hooks; the browser's
// constraint validation itself is not run here (no DOM): the invalid event is delivered explicitly.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},
 useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},
 useEffect:(effect:()=>void|(()=>void))=>{const i=hooks.cursor++;if(!(i in hooks.cells)){hooks.cells[i]=true;effect();}}};});
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(tree:any,predicate:(node:any)=>boolean):any{let found:any;const visit=(node:any)=>{if(found)return;if(Array.isArray(node))return node.forEach(visit);if(!node?.props)return;if(predicate(node))found=node;else visit(node.props.children);};visit(tree);if(!found)throw new Error('Handler target missing');return found;}
function setup(kind:IndicatorId){
 let row:IndicatorInstanceView={id:'one',kind,...factoryIndicatorDefault(kind),paneId:'price',rendererId:'native-one',diagnostics:[],presentationDiagnostics:[],policies:[],series:[],informationBars:3,latestInformationTime:3};
 const onApply=vi.fn((patch:any)=>{row={...row,...structuredClone(patch)};return true;});
 const library=createIndicatorLibrary();
 const props={get row(){return row;},chart:{indicators:{list:()=>[row],inputSchema:indicatorInputSchema}} as any,library,getLibrary:()=>library,assertCurrent:()=>{},onApply,onMove:vi.fn(()=>true),onLibraryChange:vi.fn(()=>true)};
 const render=()=>{hooks.cursor=0;return IndicatorSettings(props);};
 return{render,onApply,field:(label:string)=>find(render(),node=>node.props['aria-label']===label),status:()=>text(render())};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
const onGrid=(value:number,min:number,step:number)=>{const k=(value-min)/step;return Math.abs(k-Math.round(k))<=1e-9;};

it.each([['alma','Sigma',6],['zigzag','Price deviation for reversals (%)',5]] as const)('%s: the rendered %s input accepts its default, so Ok can submit',(kind,label,defval)=>{
 const ui=setup(kind),input=ui.field(label);
 expect(input.props.type).toBe('number');expect(Number(input.props.value)).toBe(defval);
 expect(input.props.step).not.toBe('any');
 expect(onGrid(defval,Number(input.props.min),Number(input.props.step)),`min ${input.props.min} step ${input.props.step}`).toBe(true);
});
it('a control refused by constraint validation shows a plain message naming it; nothing is applied',()=>{
 const ui=setup('alma'),form=ui.render();expect(form.type).toBe('form');expect(form.props.onInvalidCapture).toBeTypeOf('function');
 const attributes:Record<string,string>={'aria-label':'Sigma',min:'0.1',max:'100000',step:'0.1'};
 form.props.onInvalidCapture({target:{getAttribute:(name:string)=>attributes[name]??null,validity:{stepMismatch:true},validationMessage:'Please enter a valid value.'}});
 expect(ui.status()).toContain('Sigma must be 0.1 plus a whole number of 0.1 steps. Nothing was applied.');
 expect(ui.onApply).not.toHaveBeenCalled();
});
it('message wording for each refusal kind',()=>{
 expect(indicatorInvalidFieldMessage({label:'Length',validity:{rangeUnderflow:true},min:'1'})).toBe('Length must be at least 1. Nothing was applied.');
 expect(indicatorInvalidFieldMessage({label:'Offset',validity:{rangeOverflow:true},max:'1'})).toBe('Offset must be at most 1. Nothing was applied.');
 expect(indicatorInvalidFieldMessage({label:'Sigma',validity:{badInput:true}})).toBe('Sigma needs a number. Nothing was applied.');
 expect(indicatorInvalidFieldMessage({label:'Sigma',validity:{stepMismatch:true},step:'0.5'})).toBe('Sigma must be 0 plus a whole number of 0.5 steps. Nothing was applied.');
 expect(indicatorInvalidFieldMessage({label:'',validationMessage:'Value not accepted.'})).toBe('A setting: Value not accepted. Nothing was applied.');
});
