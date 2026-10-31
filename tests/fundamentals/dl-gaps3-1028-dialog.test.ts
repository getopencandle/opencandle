import {beforeEach,describe,expect,it,vi} from 'vitest';
import {normalizeCompanyFacts,type FactsDocument} from '../../src/fundamentals/company-facts';
import {catalogFacts} from './fixtures/dl-gaps3-catalog-facts';
// Actual dialog and metrics components with controlled React hook state (same harness as
// fundamentals-dialog.test.ts). SYNTHETIC facts only; no DOM, IPC or packaged-app evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return [hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>fn()};});
import {FundamentalsDialog} from '../../src/ui/FundamentalsDialog';
import {FundamentalsMetrics} from '../../src/ui/FundamentalsMetrics';
const text=(node:any):string=>typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(tree:any,match:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,match);if(found)return found;}return null;}if(!tree?.props)return null;if(match(tree))return tree;return find(tree.props.children,match);}
const doc:FactsDocument={id:'synthetic-facts:catalog',facts:normalizeCompanyFacts(catalogFacts()),source:{kind:'synthetic',label:'Demo companyfacts',retrievedAt:'2025-03-01T00:00:00Z',sourceUrl:null,sha256:null}};
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
describe('Metrics tab',()=>{
 it('the dialog offers a Metrics tab that shows the metric catalog with the period controls',()=>{
  const props:any={symbol:'SYNC',documents:[doc],onChange:vi.fn(()=>true),onClose:vi.fn(),now:()=>new Date('2025-03-05T12:00:00Z')};
  const render=()=>{hooks.cursor=0;return FundamentalsDialog(props);};
  const tab=()=>find(render(),n=>n.props.role==='tab'&&text(n.props.children)==='Metrics');
  expect(tab().props['aria-selected']).toBe(false);tab().props.onClick();expect(tab().props['aria-selected']).toBe(true);
  const metrics=find(render(),n=>n.type===FundamentalsMetrics);expect(metrics.props.currency).toBe('USD');expect(metrics.props.basis).toBe('FY');expect(typeof metrics.props.onExport).toBe('function');
  expect(find(render(),n=>n.props['aria-label']==='Statement period')).toBeTruthy();
 });
 it('the metrics view lists groups, the unavailable list and an inspectable detail',()=>{
  const props={document:doc,basis:'FY' as const,currency:'USD',asOf:null,revisions:'latest' as const,columns:4,scale:'auto' as const,price:null,today:'2025-03-05',onExport:vi.fn()};
  const render=()=>{hooks.cursor=0;return FundamentalsMetrics(props);};
  const all=text(render());expect(all).toContain('Debt and coverage');expect(all).toContain('Not available from local sources');expect(all).toContain('No loaded price, so valuation rows are unavailable.');expect(all).not.toContain('—');
  find(render(),n=>n.props['aria-label']==='Inspect Net debt').props.onClick();
  const detail=text(find(render(),n=>n.props['aria-label']==='Metric detail'));expect(detail).toContain('Formula: Total debt - Cash and short-term investments');expect(detail).toContain('Total debt = 250');
  find(render(),n=>n.props['aria-label']==='Metric group').props.onChange({target:{value:'unavailable'}});expect(text(render())).toContain('Free float');
  find(render(),n=>n.type==='button'&&text(n.props.children)==='Export metrics CSV').props.onClick();expect(props.onExport).toHaveBeenCalledTimes(1);
 });
});
