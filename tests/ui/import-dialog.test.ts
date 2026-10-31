import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {ImportDialog} from '../../src/ui/ImportDialog';
import {IMPORT_EXAMPLES} from '../../src/domain/data-setup';
import type {BarDataset} from '../../src/domain/types';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
// Controlled handler tests. These do not exercise DOM rendering, native dialogs or the packaged application.
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,predicate);if(found)return found;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
const NOW=1792022400;
function mount(props:{onImport?:(dataset:BarDataset)=>boolean|void;onClose?:()=>void;existing?:BarDataset[]}={}){
 const onImport=vi.fn(props.onImport??(()=>true)),onClose=vi.fn(props.onClose??(()=>{}));
 const render=()=>{hooks.cursor=0;return ImportDialog({onImport,onClose,existing:props.existing,now:NOW});};
 const button=(label:string)=>find(render(),node=>node.type==='button'&&text(node)===label);
 const select=(label:string)=>find(render(),node=>node.type==='select'&&node.props['aria-label']===label);
 const input=(label:string)=>find(render(),node=>node.type==='input'&&node.props['aria-label']===label);
 const textarea=()=>find(render(),node=>node.type==='textarea');
 const submit=()=>find(render(),node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()});
 return {onImport,onClose,render,button,select,input,textarea,submit,view:()=>text(render())};
}
const flush=()=>new Promise(resolve=>setTimeout(resolve,0));
const example=(id:string)=>IMPORT_EXAMPLES.find(row=>row.id===id)!;
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});afterEach(()=>vi.unstubAllGlobals());

it('loads the GME synthetic example, previews it and publishes a SYNTHETIC-labeled local import',()=>{
 const ui=mount();expect(ui.view()).toContain('Choose a file, paste data or load a demo example');
 expect(ui.button('Import and open').props.disabled).toBe(true);
 ui.select('Synthetic example').props.onChange({target:{value:'gme-daily-csv'}});
 expect(ui.textarea().props.value).toBe(example('gme-daily-csv').draft.text);
 expect(ui.view()).toContain('Ready: 12 bars for GME (SYNTHETIC)');expect(ui.view()).toContain('4 days between 2024-01-12 and 2024-01-16');
 expect(ui.button('Import and open').props.disabled).toBe(false);
 ui.submit();expect(ui.onImport).toHaveBeenCalledOnce();expect(ui.onClose).toHaveBeenCalledOnce();
 const dataset=ui.onImport.mock.calls[0][0] as BarDataset;
 expect(dataset.provenance.datasetId).toMatch(/^local-import:/);expect(dataset.provenance).toMatchObject({fixture:true,adjustment:'raw',session:'regular'});expect(dataset.bars).toHaveLength(12);
});
it('blocks the practice file with row-level messages and never calls the publication path',()=>{
 const ui=mount();ui.select('Synthetic example').props.onChange({target:{value:'practice-mistakes-csv'}});
 const view=ui.view();expect(view).toContain('Import blocked');expect(view).toContain('Data row 5: OHLC range is inconsistent');expect(view).toContain('Data row 10: Duplicate timestamp');
 expect(ui.button('Import and open').props.disabled).toBe(true);ui.submit();expect(ui.onImport).not.toHaveBeenCalled();expect(ui.view()).toContain('Fix the problems listed in the preview');
});
it('shows inline metadata errors and recovers once they are corrected',()=>{
 const ui=mount();ui.select('Synthetic example').props.onChange({target:{value:'spy-daily-json'}});
 ui.input('Import currency').props.onChange({target:{value:'us'}});ui.input('Import timezone').props.onChange({target:{value:'Nowhere/City'}});
 const view=ui.view();expect(view).toContain('three-letter code');expect(view).toContain('IANA name');expect(ui.button('Import and open').props.disabled).toBe(true);
 ui.input('Import currency').props.onChange({target:{value:'usd'}});ui.input('Import timezone').props.onChange({target:{value:'America/New_York'}});
 ui.input('Import symbol').props.onChange({target:{value:'qqq'}});expect(ui.view()).toContain('labeled SPY, but the Symbol field says QQQ');
 ui.input('Import symbol').props.onChange({target:{value:'spy'}});expect(ui.view()).toContain('Ready: 10 bars for SPY');
});
it('cancel and Escape route discard the draft without publishing',()=>{
 const ui=mount();ui.select('Synthetic example').props.onChange({target:{value:'lvdemo-5m-csv'}});ui.button('Cancel').props.onClick();
 expect(ui.onClose).toHaveBeenCalledOnce();expect(ui.onImport).not.toHaveBeenCalled();
 const modal=ui.render();expect(modal.props.onClose).toBe(ui.onClose);
});
it('workspace rejection keeps the draft for an explicit retry',()=>{
 let accept=false;const ui=mount({onImport:()=>accept});ui.select('Synthetic example').props.onChange({target:{value:'lvdemo-5m-csv'}});
 ui.submit();expect(ui.onClose).not.toHaveBeenCalled();expect(ui.view()).toContain('import was rejected');expect(ui.textarea().props.value).toBe(example('lvdemo-5m-csv').draft.text);
 accept=true;ui.submit();expect(ui.onImport).toHaveBeenCalledTimes(2);expect(ui.onClose).toHaveBeenCalledOnce();
});
it('file chooser cancel keeps the draft; a later choice replaces it and the previous draft can be restored',async()=>{
 const importBars=vi.fn();vi.stubGlobal('window',{lv:{importBars}});
 const ui=mount(),pasted='date,open,high,low,close,volume\n2024-01-02,10,12,9,11,1000';
 ui.textarea().props.onChange({target:{value:pasted}});ui.input('Import symbol').props.onChange({target:{value:'ABC'}});
 importBars.mockResolvedValueOnce({ok:false,error:{code:'CANCELLED',message:'Import cancelled.'}});ui.button('Choose CSV or JSON file').props.onClick();await flush();
 expect(ui.view()).toContain('File selection cancelled. Your current draft is unchanged.');expect(ui.textarea().props.value).toBe(pasted);
 importBars.mockResolvedValueOnce({ok:false,error:{code:'TOO_LARGE',message:'The file exceeds 64 MiB.'}});ui.button('Choose CSV or JSON file').props.onClick();await flush();
 expect(ui.view()).toContain('The file exceeds 64 MiB. Your current draft is unchanged');expect(ui.textarea().props.value).toBe(pasted);
 const spy=example('spy-daily-json').draft.text.replace('SYNTHETIC EXAMPLE - not market data','my export');
 importBars.mockResolvedValueOnce({ok:true,value:{fileName:'spy.json',format:'json',text:spy,bytes:spy.length}});ui.button('Choose CSV or JSON file').props.onClick();await flush();
 expect(ui.textarea().props.value).toBe(spy);expect(ui.view()).toContain('Current: spy.json');expect(ui.view()).toContain('labeled SPY, but the Symbol field says ABC');
 ui.button('Restore previous draft').props.onClick();expect(ui.textarea().props.value).toBe(pasted);expect(ui.view()).toContain('Ready: 1 bar for ABC');
});
it('ignores a stale file result that arrives after the user switched to an example',async()=>{
 let resolve!:(value:unknown)=>void;const importBars=vi.fn(()=>new Promise(done=>{resolve=done;}));vi.stubGlobal('window',{lv:{importBars}});
 const ui=mount();ui.button('Choose CSV or JSON file').props.onClick();ui.select('Synthetic example').props.onChange({target:{value:'gme-daily-csv'}});
 resolve({ok:true,value:{fileName:'late.csv',format:'csv',text:'date,open,high,low,close,volume\n2024-01-02,1,2,1,2,3',bytes:50}});await flush();
 expect(ui.textarea().props.value).toBe(example('gme-daily-csv').draft.text);expect(ui.view()).not.toContain('late.csv');
});
it('switching sources warns about repeated imports and explains the Source selector',()=>{
 const first=mount();first.select('Synthetic example').props.onChange({target:{value:'gme-daily-csv'}});first.submit();
 const existing=[first.onImport.mock.calls[0][0] as BarDataset];hooks.cells=[];
 const ui=mount({existing});ui.select('Synthetic example').props.onChange({target:{value:'gme-daily-csv'}});expect(ui.view()).toContain('already imported for GME');
 ui.textarea().props.onChange({target:{value:example('gme-daily-csv').draft.text.replace('1500000','1500100')}});expect(ui.view()).toContain("switch between them with the chart's Source selector");
});
it('without the desktop bridge, file selection explains the paste and example alternatives',async()=>{
 const ui=mount();ui.button('Choose CSV or JSON file').props.onClick();await flush();expect(ui.view()).toContain('Paste data below or load a demo example');
});
it('saves a chosen example through the existing local export bridge',async()=>{
 const exportData=vi.fn(async()=>({ok:true,value:{fileName:'bars-GME-synthetic-daily.csv',bytes:1041}}));vi.stubGlobal('window',{lv:{exportData}});
 const ui=mount();ui.select('Synthetic example').props.onChange({target:{value:'gme-daily-csv'}});ui.button('Save example file').props.onClick();await flush();
 expect(exportData).toHaveBeenCalledWith({text:example('gme-daily-csv').draft.text,suggestedName:'bars-GME-synthetic-daily.csv',format:'csv'});expect(ui.view()).toContain('Saved bars-GME-synthetic-daily.csv');
});
it('includes first-use steps and the supplied versus not-supplied tool table',()=>{
 const view=mount().view();for(const fragment of ['After import: making the chart and tools use this data','What your imported bars give each tool','Paper trading','Not included',"chart's Source selector"])expect(view).toContain(fragment);
});
it('F5: a file that arrives after the user edited the data does not overwrite the edit',async()=>{
 let resolve!:(value:unknown)=>void;const importBars=vi.fn(()=>new Promise(done=>{resolve=done;}));vi.stubGlobal('window',{lv:{importBars}});
 const ui=mount(),typed='date,open,high,low,close,volume\n2024-01-02,10,11,9,10,7';
 ui.button('Choose CSV or JSON file').props.onClick();ui.textarea().props.onChange({target:{value:typed}});
 resolve({ok:true,value:{fileName:'late.csv',format:'csv',text:'date,open,high,low,close,volume\n2024-01-02,10,11,9,10,8',bytes:50}});await flush();
 expect(ui.textarea().props.value).toBe(typed);expect(ui.view()).toContain('late.csv was not loaded because the data was edited while the file chooser was open');
 importBars.mockResolvedValueOnce({ok:true,value:{fileName:'again.csv',format:'csv',text:'date,open,high,low,close,volume\n2024-01-02,10,11,9,10,9',bytes:50}});ui.button('Choose CSV or JSON file').props.onClick();await flush();
 expect(ui.view()).toContain('Current: again.csv');ui.button('Restore previous draft').props.onClick();expect(ui.textarea().props.value).toBe(typed);
});
