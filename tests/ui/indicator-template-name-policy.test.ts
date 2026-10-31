import {beforeEach,expect,it,vi} from 'vitest';
import {IndicatorTemplatesDialog} from '../../src/ui/IndicatorTemplatesDialog';
import {copyIndicatorTemplate,createIndicatorTemplates,deleteIndicatorTemplate,importIndicatorTemplates,renameIndicatorTemplate,restoreIndicatorTemplates,saveIndicatorTemplate,templateName,type IndicatorTemplateContent,type IndicatorTemplates} from '../../src/ui/indicator-templates';
import {factoryIndicatorDefault} from '../../src/ui/indicator-library';
import {find,findAll,text} from './indicator-real-port-harness';

// Evidence for the template name policy (model functions + ACTUAL template dialog
// handlers) and a current-contract check for serialized source references. No DOM/focus/GUI.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
let cells:any[]=[];beforeEach(()=>{cells=[];});
const content=(length=9):IndicatorTemplateContent=>({indicators:[{id:'sma-one',kind:'sma',...factoryIndicatorDefault('sma'),inputs:{...factoryIndicatorDefault('sma').inputs,length},paneId:'price'}],scripts:[],rememberSymbol:false,rememberInterval:false,source:null});
function ui(initial:IndicatorTemplates,captured=content()){
 let library=initial;const props={get library(){return library;},onLibraryChange:vi.fn((next:IndicatorTemplates)=>{library=next;}),capture:()=>({content:captured,assertCurrent:()=>{}}),previewApply:vi.fn(),onClose:vi.fn()};
 const render=()=>{hooks.cells=cells;hooks.cursor=0;return IndicatorTemplatesDialog({...props,library});};
 const click=(value:string)=>find(render(),node=>node.type==='button'&&text(node)===value).props.onClick();
 const button=(value:string)=>find(render(),node=>node.type==='button'&&text(node)===value);
 const nameInput=()=>findAll(render(),node=>node.type==='input'&&node.props.maxLength===100&&node.props.value!==undefined&&node.props.onChange).at(-1);
 return {props,render,click,button,nameInput,status:()=>text(find(render(),node=>node.props?.role==='status')),get library(){return library;},set library(next:IndicatorTemplates){library=next;}};
}

it('NAME_POLICY model: NFC + outer whitespace normalization, case-insensitive matching, explicit overwrite keeps identity and bumps revision; copy/import allocate fresh IDs; stale revisions are refused',()=>{
 expect(templateName('  Café Setup \t')).toBe('Café Setup');
 for(const bad of ['','   ','a\u0007b','x'.repeat(101),42])expect(()=>templateName(bad)).toThrow(/Invalid template text/);
 const one=saveIndicatorTemplate(createIndicatorTemplates(),'  Café Setup ',content(),()=> 'id-one');expect(one.records[0]).toMatchObject({id:'id-one',name:'Café Setup',revision:1});
 for(const collide of ['CAFÉ SETUP','café setup','  café setup  '])expect(()=>saveIndicatorTemplate(one,collide,content(),()=> 'id-two')).toThrow(/overwrite/);expect(one.records).toHaveLength(1);
 const replaced=saveIndicatorTemplate(one,'CAFÉ SETUP',content(20),()=>{throw new Error('overwrite must keep its identity');},{id:'id-one',expectedRevision:1});
 expect(replaced.records).toEqual([expect.objectContaining({id:'id-one',name:'CAFÉ SETUP',revision:2})]);expect(replaced.records[0].indicators[0].inputs.length).toBe(20);
 expect(()=>saveIndicatorTemplate(replaced,'Other',content(),()=> 'x',{id:'id-one',expectedRevision:1})).toThrow(/changed or was removed/);
 const renamed=renameIndicatorTemplate(replaced,'id-one',2,' Renamed ');expect(renamed.records[0]).toMatchObject({id:'id-one',name:'Renamed',revision:3});expect(()=>renameIndicatorTemplate(renamed,'id-one',2,'Again')).toThrow(/changed/);
 const copied=copyIndicatorTemplate(renamed,'id-one',3,'Renamed copy',()=> 'id-copy');expect(copied.records[1]).toMatchObject({id:'id-copy',name:'Renamed copy',revision:1});expect(()=>copyIndicatorTemplate(renamed,'id-one',3,'renamed',()=> 'id-x')).toThrow(/overwrite/);
 let sequence=0;const imported=importIndicatorTemplates(createIndicatorTemplates(),JSON.stringify(copied),()=> 'fresh-'+ ++sequence);expect(imported.records.map(row=>[row.id,row.name,row.revision])).toEqual([['fresh-1','Renamed',1],['fresh-2','Renamed copy',1]]);
 expect(()=>importIndicatorTemplates(copied,JSON.stringify({schemaVersion:1,records:[{...copied.records[0],id:'new',name:'Unique'},{...copied.records[1],id:'new2',name:' RENAMED '}]}),()=> 'z'+ ++sequence)).toThrow(/overwrite/);expect(copied.records).toHaveLength(2);
 expect(()=>deleteIndicatorTemplate(copied,'id-one',2)).toThrow(/changed/);expect(deleteIndicatorTemplate(copied,'id-one',3).records.map(row=>row.id)).toEqual(['id-copy']);
 expect(()=>restoreIndicatorTemplates({schemaVersion:1,records:[copied.records[0],{...copied.records[1],name:'renamed'}]})).toThrow(/Duplicate/);
});

it('NAME_POLICY dialog: a normalized case-insensitive collision is named, Save replaces it in place (identity kept), and stale targets are rejected',()=>{
 const start=saveIndicatorTemplate(createIndicatorTemplates(),'Café',content(),()=> 'cafe'),view=ui(start,content(30));
 view.click('Save current chart');view.nameInput().props.onChange({target:{value:'  CAFÉ '}});
 // One Save button; a same-named template is replaced in place, no preview/confirm.
 expect(text(view.render())).toContain('Saving replaces the template named Café.');expect(view.button('Save').props.disabled).toBe(false);
 find(view.render(),node=>node.type==='form').props.onSubmit({preventDefault(){}});
 expect(view.library.records).toEqual([expect.objectContaining({id:'cafe',name:'CAFÉ',revision:2})]);expect(view.library.records[0].indicators[0].inputs.length).toBe(30);expect(view.props.onClose).toHaveBeenCalled();
 // Stale pin: a selected template replaced elsewhere cannot be renamed or deleted from the old selection.
 view.click('Saved templates');view.click('CAFÉ · 1 indicator · 0 scripts');view.library=renameIndicatorTemplate(view.library,'cafe',2,'Elsewhere');
 view.click('Delete');view.click('Delete template');expect(view.status()).toContain('This template changed. Select it again');expect(view.library.records[0]).toMatchObject({name:'Elsewhere',revision:3});
});

it('current source contract: serialized indicator/plot source references are rejected atomically; OHLC sources survive',()=>{
 const good=saveIndicatorTemplate(createIndicatorTemplates(),'Good',{...content(),indicators:[{...content().indicators[0],inputs:{...content().indicators[0].inputs,source:'hlc3'}}]},()=> 'good');
 expect(good.records[0].indicators[0].inputs.source).toBe('hlc3');
 for(const reference of [{instanceId:'rsi-one',plot:'rsi'},'plot:rsi-one:rsi','rsi-one'])
  {const bad={...content(),indicators:[{...content().indicators[0],inputs:{...content().indicators[0].inputs,source:reference as any}}]};expect(()=>saveIndicatorTemplate(good,'Bad',bad,()=> 'bad')).toThrow();
   const document=JSON.stringify({schemaVersion:1,records:[{...good.records[0],id:'ok2',name:'Ok two'},{...good.records[0],...bad,id:'bad',name:'Bad'}]});expect(()=>importIndicatorTemplates(good,document,()=> 'fresh')).toThrow();}
 expect(good.records.map(row=>row.id)).toEqual(['good']);
});
