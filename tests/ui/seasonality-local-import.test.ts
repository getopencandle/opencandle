import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ImportDialog} from '../../src/ui/ImportDialog';
import {IMPORT_EXAMPLES,SEASONALITY_IMPORT_EXAMPLES,findImportExample} from '../../src/domain/data-setup';
import {captureLocalCandleOrigin} from '../../src/domain/local-candle-origin';
import type {BarDataset} from '../../src/domain/types';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
/** Actual controlled component handlers. No DOM, chooser, filesystem export or packaged app is launched. */
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]=typeof initial==='function'?initial():initial;return[hooks.cells[at],(next:any)=>{hooks.cells[at]=typeof next==='function'?next(hooks.cells[at]):next;}];},useRef:(initial:any)=>{const at=hooks.cursor++;if(!(at in hooks.cells))hooks.cells[at]={current:initial};return hooks.cells[at];},useEffect:()=>{hooks.cursor++;},useMemo:(make:()=>any)=>{hooks.cursor++;return make();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,predicate);if(found)return found;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
function mount(){const onImport=vi.fn<((dataset:BarDataset)=>boolean)>(()=>true),onClose=vi.fn(),render=()=>{hooks.cursor=0;return ImportDialog({onImport,onClose,now:1792022400});};return{onImport,onClose,render,select:()=>find(render(),node=>node.type==='select'&&node.props['aria-label']==='Synthetic example'),button:(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label),submit:()=>find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){}})};}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});afterEach(()=>vi.unstubAllGlobals());
it('actual chooser keeps four short examples and adds a distinct multi-year synthetic exercise group',()=>{
 const ui=mount(),group=find(ui.render(),node=>node.type==='optgroup'&&node.props.label==='Multi-year demo examples');expect(group).not.toBeNull();expect(IMPORT_EXAMPLES).toHaveLength(4);expect(SEASONALITY_IMPORT_EXAMPLES).toHaveLength(1);
 ui.select().props.onChange({target:{value:'seasonality-equity-csv'}});expect(text(ui.render())).toContain('Multi-year equity history (synthetic)');expect(text(ui.render())).toContain('2015-12-01');expect(text(ui.render())).toContain('2023-12-29');expect(ui.button('Import and open').props.disabled).toBe(false);
 ui.submit();expect(ui.onImport).toHaveBeenCalledOnce();expect(ui.onClose).toHaveBeenCalledOnce();const data=ui.onImport.mock.calls[0][0];expect(data.provenance.fixture).toBe(true);expect(data.provenance.datasetId).toMatch(/^local-import:/);expect(data.bars[0].close).toBe(125);expect(data.bars.at(-1)?.close).toBe(205);
 const source=captureLocalCandleOrigin(data,{externalNumericSlots:0,externalOperations:0});expect(source).not.toBeNull();expect(source?.calendar).toBe('undeclared');source?.dispose();
});
it('cancel discards the multi-year exercise without publishing any source',()=>{const ui=mount();ui.select().props.onChange({target:{value:'seasonality-equity-csv'}});ui.button('Cancel').props.onClick();expect(ui.onClose).toHaveBeenCalledOnce();expect(ui.onImport).not.toHaveBeenCalled();});
it('Save example file uses the selected additional example through the existing synthetic bridge contract',async()=>{
 const exportData=vi.fn().mockResolvedValue({ok:true,value:{fileName:'synthetic-multi-year.csv'}});vi.stubGlobal('window',{lv:{exportData}});const ui=mount();ui.select().props.onChange({target:{value:'seasonality-equity-csv'}});ui.button('Save example file').props.onClick();await Promise.resolve();await Promise.resolve();
 const example=findImportExample('seasonality-equity-csv')!;expect(exportData).toHaveBeenCalledExactlyOnceWith({text:example.draft.text,suggestedName:example.fileName,format:'csv'});expect(ui.onImport).not.toHaveBeenCalled();expect(text(ui.render())).toContain('Saved synthetic-multi-year.csv');
});
