import {beforeEach,expect,it,vi} from 'vitest';
import {ComparisonDialog} from '../../src/ui/ComparisonDialog';
import {Modal} from '../../src/ui/Modal';
import {fixtureDataset} from '../../src/domain/fixtures';

// Actual component callbacks under controlled hooks, without DOM/native claims.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const chart=()=>({comparisons:{list:vi.fn(()=>[]),subscribe:vi.fn(()=>()=>{}),add:vi.fn(),update:vi.fn(),remove:vi.fn()}});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
function setup(){const source=fixtureDataset('GME',3),native=chart(),closed=vi.fn(),changed=vi.fn();let owner=true;let props:any={chart:native,datasets:[source],onClose:closed,onChange:changed,assertOwner(){if(!owner)throw Error('Comparison owner changed');}};const render=()=>{hooks.cursor=0;return ComparisonDialog(props);};return{native,closed,changed,render,replace(){props={...props,chart:chart()};},retire(){owner=false;},button:()=>find(render(),node=>node.type==='button'&&text(node).includes('GME'))};}

it('closing a comparison dialog revokes retained native actions immediately',()=>{
 const ui=setup(),add=ui.button();find(ui.render(),node=>node.type===Modal).props.onClose();add.props.onClick();
 expect(ui.native.comparisons.add).not.toHaveBeenCalled();expect(ui.changed).not.toHaveBeenCalled();expect(ui.closed).toHaveBeenCalledOnce();
 expect(text(ui.render())).toContain('closed');
});
it('comparison mutations check parent ownership before touching a native chart',()=>{
 // A retired parent cannot publish old diagnostics either. The actual-App ownership/eligibility
 // reentry regression lives in tests/security/analysis-dialog-availability-independent.test.ts.
 const ui=setup(),add=ui.button();ui.retire();add.props.onClick();expect(ui.native.comparisons.add).not.toHaveBeenCalled();expect(ui.changed).not.toHaveBeenCalled();expect(text(find(ui.render(),node=>node.props.role==='alert'))).toBe('');
});
it('a retained comparison button cannot mutate a replaced chart instance',()=>{
 const ui=setup(),add=ui.button();ui.replace();ui.render();add.props.onClick();expect(ui.native.comparisons.add).not.toHaveBeenCalled();expect(ui.changed).not.toHaveBeenCalled();
});
