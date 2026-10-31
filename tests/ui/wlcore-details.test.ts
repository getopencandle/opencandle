import {beforeEach,expect,it,vi} from 'vitest';
import {SymbolDetails,type SymbolDetailsProps} from '../../src/ui/SymbolDetails';
import {Modal} from '../../src/ui/Modal';
import {defaultDetailPreferences,type DetailSnapshot} from '../../src/watchlists/details';
// Actual component handlers with controlled hooks (no DOM). Categories by instrument type are our own choice.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
function harness(assetClass:string|null){
 const snapshot:DetailSnapshot={symbol:'IDX',exchange:'SYNTHETIC',synthetic:true,description:'Synthetic instrument',blocks:{summary:[{label:'Last supplied close',value:1}],daily:[{label:'Daily snapshot volume',value:1234}],identity:assetClass===null?[{label:'Currency',value:'USD'}]:[{label:'Asset class',value:assetClass}],source:[{label:'Provider',value:'Synthetic only'}]},diagnostic:'No live data',disclaimer:'Independent watchlist snapshot'};
 const saved:any[]=[];let props:SymbolDetailsProps={snapshot,identity:'a',ownerToken:{},preferences:defaultDetailPreferences(),notes:[],assertOwner(){},onBegin(){},onPreferences(next){saved.push(next);return true;}};
 const render=()=>{hooks.cursor=0;return SymbolDetails(props);};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&(node.props['aria-label']===label||text(node)===label));
 return{render,button,saved,modal:()=>find(render(),node=>node.type===Modal)};
}
it('shows an inapplicable category disabled with its reason instead of hiding it, in both the view and the expanded view',()=>{
 const ui=harness('index'),view=text(ui.render());
 expect(view).toContain('Daily snapshot');expect(view).toContain('Not available for this instrument type');expect(view).not.toMatch(/1[,.]?234/);expect(view).toContain('Price snapshot');
 ui.button('Expand details').props.onClick();const expanded=text(ui.modal());expect(expanded).toContain('Daily snapshot');expect(expanded).toContain('Not available for this instrument type');expect(expanded).not.toMatch(/1[,.]?234/);
 expect(ui.saved).toEqual([]);
});
it('lists every category in the chooser, disables the inapplicable checkbox and leaves saved blocks untouched',()=>{
 const ui=harness('index');ui.button('Customize blocks').props.onClick();const chooser=ui.modal();
 const show=(label:string)=>find(chooser,node=>node.type==='input'&&node.props['aria-label']===label);
 expect(show('Show Daily snapshot').props.disabled).toBe(true);expect(show('Show Daily snapshot').props.checked).toBe(true);expect(show('Show Price snapshot').props.disabled).toBe(false);
 for(const label of ['Price snapshot','Daily snapshot','Instrument','Data source','Local notes'])expect(show('Show '+label)).toBeTruthy();
 expect(text(chooser)).toContain('Daily snapshot (Not available for this instrument type)');
 find(chooser,node=>node.type==='form').props.onSubmit({preventDefault(){}});expect(ui.saved).toHaveLength(1);expect(ui.saved[0]).toEqual(defaultDetailPreferences());
});
it('shows every category normally for a stock and when the type is unknown',()=>{
 for(const kind of ['stock',null]){const ui=harness(kind),view=text(ui.render());expect(view).toMatch(/1[,.]?234/);expect(view).not.toContain('Not available for this instrument type');}
});
