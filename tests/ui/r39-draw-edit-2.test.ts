// Floating drawing toolbar (Template, text color, Font size, Sync, More rows) and drawing settings dialog fidelity
// (readable title, Text tab for the text tools, date and time coordinates in the chart timezone). Synthetic fixtures only.
import {readFileSync} from 'node:fs';
import {beforeEach,describe,expect,it,vi} from 'vitest';
import {createDrawing,type DrawingTypeKey} from '@luxalgo/vela';
import {DrawingDialog} from '../../src/ui/DrawingDialog';
import {Modal} from '../../src/ui/Modal';
import {DrawingEditBar,MoreSlot,TemplateSlot,SyncSlot,PropertySlot,SYNC_CHANGE_UNAVAILABLE} from '../../src/ui/drawing-edit-bar';
import {editBarButtons,editBarRead,editBarSyncScope,editBarTemplateRows,editBarUsesBulk} from '../../src/ui/drawing-edit-bar-model';
import {drawingDialogTitle,defaultTemplatePatch,coordinateDateTimeText,coordinateDateTimeSeconds,coordinateBarFromDateTime,coordinateTimeHasSeconds} from '../../src/ui/drawing-dialog-model';
import {dialogTabsFor,TEXT_TOOL_TYPES} from '../../src/ui/drawing-dialog-spec';
import {drawingEditor,patchDrawingEdit} from '../../src/chart/drawing-port';
import {fixtureDataset} from '../../src/domain/fixtures';
import {sourceContextForDataset} from '../../src/chart/source-context';

const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{hooks.cursor++;}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
const text=(node:any):string=>typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const result=find(child,predicate);if(result)return result;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const label=(name:string)=>(node:any)=>node.props?.['aria-label']===name;

function dialog(type:DrawingTypeKey,timeZone?:string){
 const dataset=fixtureDataset('GME',4),bars=dataset.bars,source=sourceContextForDataset(dataset);
 const anchors=[{time:bars[0].time*1000,price:100},{time:bars[2].time*1000,price:120}];
 let record=createDrawing(type,{id:'synthetic-draw',paneId:'price',anchors:['hline','vline','hray','text','note','callout','comment','pricelabel','pricenote','flagmark'].includes(type)?anchors.slice(0,1):anchors})!.serialize();
 const update=vi.fn((_id:string,patch:any,coordinates:any,offset:any)=>{record=patchDrawingEdit(record,bars,patch,coordinates,offset);return{accepted:true};});
 const chart={getDrawingEditor:()=>({...drawingEditor(record,bars),recordFingerprint:JSON.stringify(record),sourceResolution:dataset.resolution}),getSourceBars:()=>bars,getSourceContext:()=>source,updateDrawingEdit:update,drawingManager:{state:()=>({templates:[]})}};
 const props:any={chart,id:'synthetic-draw',ownerToken:{},isCurrent:()=>true,onClose:vi.fn(),onChange:vi.fn(),assertOwner:vi.fn(),timeZone};
 const render=()=>{hooks.cursor=0;return DrawingDialog(props);};
 const button=(name:string)=>find(render(),node=>node.type==='button'&&text(node)===name);
 return{render,button,update,bars,record:()=>record,submit:()=>find(render(),node=>node.type==='form').props.onSubmit({preventDefault(){},nativeEvent:{isComposing:false}})};
}

describe('drawing settings dialog title',()=>{
 it('names the tool as the toolbar does, never the renderer type id',()=>{
  expect(drawingDialogTitle('lvtable')).toBe('Table');expect(drawingDialogTitle('trendline')).toBe('Trendline');expect(drawingDialogTitle('box')).toBe('Rectangle');
  expect(drawingDialogTitle('lvshortposition')).toBe('Short position');expect(drawingDialogTitle('no-such-type')).toBe('Drawing settings');
  const ui=dialog('trendline'),modal=find(ui.render(),node=>node.type===Modal);
  expect(modal.props.title).toBe('Trendline');expect(modal.props.title).not.toMatch(/settings$/);
 });
});

describe('Text tab for the text tools',()=>{
 it('the recorded-dialog-less text tools get Style, Text, Coordinates, Visibility',()=>{
  for(const type of ['callout','note','pricenote','comment','pricelabel','flagmark'])expect(TEXT_TOOL_TYPES.has(type),type).toBe(true);
  expect(dialogTabsFor('callout')).toEqual(['Style','Text','Coordinates','Visibility']);
  expect(dialogTabsFor('hline')).toBeNull();
 });
 it('Callout text settings move to the Text tab in the reference common order',()=>{
  const ui=dialog('callout'),field=(path:string)=>find(ui.render(),node=>node.props['data-property']===path);
  expect(ui.button('Text')).not.toBeNull();expect(field('text.value')).toBeNull();expect(field('style.lineColor')).not.toBeNull();
  ui.button('Text').props.onClick();expect(field('style.lineColor')).toBeNull();
  const order=findAll(ui.render(),node=>typeof node.props?.['data-property']==='string'&&String(node.props['data-property']).startsWith('text.')).map(node=>node.props['data-property']);
  expect(order).toEqual(['text.color','text.size','text.bold','text.italic','text.value']);
  field('text.value').props.onChange({target:{value:'SYNTHETIC callout'}});ui.submit();expect(ui.record().text?.value).toBe('SYNTHETIC callout');
 });
 it('Price label (no text area) still gets its text styling on the Text tab',()=>{
  const ui=dialog('pricelabel');ui.button('Text').props.onClick();expect(find(ui.render(),node=>node.props['data-property']==='text.color')).not.toBeNull();
 });
});

describe('Coordinates take a date and a time in the chart timezone',()=>{
 it('formats and parses wall times in a named timezone, across a daylight-saving change',()=>{
  const summer=Date.UTC(2024,6,1,13,30)/1000,winter=Date.UTC(2024,0,2,14,30)/1000;
  expect(coordinateDateTimeText(summer,'America/New_York')).toEqual({date:'2024-07-01',time:'09:30'});
  expect(coordinateDateTimeText(winter,'America/New_York')).toEqual({date:'2024-01-02',time:'09:30'});
  expect(coordinateDateTimeText(winter,'Not/AZone')).toEqual({date:'2024-01-02',time:'14:30'});
  expect(coordinateDateTimeText(winter+15,'UTC',true).time).toBe('14:30:15');
  expect(coordinateDateTimeSeconds('2024-07-01','09:30','America/New_York')).toBe(summer);
  expect(coordinateDateTimeSeconds('2024-01-02','09:30','America/New_York')).toBe(winter);
  expect(coordinateDateTimeSeconds('2024-02-30','09:30','UTC')).toBeNaN();expect(coordinateDateTimeSeconds('','09:30','UTC')).toBeNaN();expect(coordinateDateTimeSeconds('2024-01-02','25:00','UTC')).toBeNaN();
 });
 it('a typed date and time lands on the nearest bar, projected past the loaded bars',()=>{
  const bars=fixtureDataset('GME',4).bars;
  expect(coordinateBarFromDateTime(bars,'2024-01-04','00:00','UTC')).toBe(2);
  expect(coordinateBarFromDateTime(bars,'2024-01-04','13:00','UTC')).toBe(3);
  expect(coordinateBarFromDateTime(bars,'2024-01-08','00:00','UTC')).toBe(6);
  expect(coordinateBarFromDateTime(bars,'bad','00:00','UTC')).toBeNaN();expect(coordinateBarFromDateTime([],'2024-01-04','00:00','UTC')).toBeNaN();
  expect(coordinateTimeHasSeconds(bars)).toBe(false);expect(coordinateTimeHasSeconds([{time:0},{time:5}] as never)).toBe(true);
 });
 it('the dialog shows date and time fields instead of a bar number and Apply moves the anchor',()=>{
  const ui=dialog('trendline','America/New_York');ui.button('Coordinates').props.onClick();
  const tree=ui.render();
  expect(find(tree,label('Anchor 1 bar number'))).toBeNull();
  expect(find(tree,label('Anchor 1 date')).props.type).toBe('date');expect(find(tree,label('Anchor 1 time')).props.type).toBe('time');
  // Bar 0 is 2024-01-02 00:00 UTC, which is 2024-01-01 19:00 in New York.
  expect(find(tree,label('Anchor 1 date')).props.value).toBe('2024-01-01');expect(find(tree,label('Anchor 1 time')).props.value).toBe('19:00');
  expect(findAll(tree,node=>node.type==='legend').map(text)).toEqual(['#1 (price, time)','#2 (price, time)']);
  find(ui.render(),label('Anchor 2 date')).props.onChange({target:{value:'2024-01-04'}});
  expect(find(ui.render(),label('Anchor 2 date')).props.value).toBe('2024-01-04');expect(find(ui.render(),label('Anchor 2 time')).props.value).toBe('19:00');
  ui.submit();expect(ui.update).toHaveBeenCalledTimes(1);expect(ui.update.mock.calls[0][2][1]).toEqual({barNumber:3});expect(ui.record().anchors[1].time).toBe(ui.bars[3].time*1000);
 });
 it('an emptied date leaves the draft invalid and Apply reports it without writing',()=>{
  const ui=dialog('trendline');ui.button('Coordinates').props.onClick();find(ui.render(),label('Anchor 1 date')).props.onChange({target:{value:''}});
  expect(text(ui.render())).toContain('Enter a valid date and time.');ui.submit();expect(ui.update).not.toHaveBeenCalled();
 });
});

describe('floating toolbar model',()=>{
 const fields=[{path:'text.color',kind:'color'},{path:'text.size',kind:'select',options:[{value:'small'},{value:'normal'},{value:'large'},{value:'huge'}]}];
 it('adds Font size for the text tools and text color when the shared bar left it out',()=>{
  const bulk=[{id:'lineColor',path:'style.lineColor',title:'Line tool colors'},{id:'lineWidth',path:'style.lineWidth',title:'Line tool widths',options:[1,2,3,4]}] as const;
  const out=editBarButtons(bulk as never,fields,'callout');
  expect(out.map(button=>button.id)).toEqual(['lineColor','textColor','lineWidth','fontSize']);
  expect(out.at(-1)).toMatchObject({path:'text.size',title:'Font size',options:['small','normal','large','huge']});
  expect(editBarButtons(bulk as never,fields,'trendline').map(button=>button.id)).toEqual(['lineColor','textColor','lineWidth']);
  expect(editBarButtons([],fields,'image')).toEqual([]);
 });
 it('routes the five shared paths to the property batch and the rest to the drawing settings edit',()=>{
  for(const path of ['style.lineColor','style.fillColor','text.color','style.lineWidth','style.lineStyle'])expect(editBarUsesBulk(path)).toBe(true);
  expect(editBarUsesBulk('text.size')).toBe(false);
  expect(editBarRead({text:{size:'large'}},{'text.size':'normal'},'text.size')).toBe('large');expect(editBarRead({},{'text.size':'normal'},'text.size')).toBe('normal');
 });
 it('reads the sync stamp and the tool templates',()=>{
  expect(editBarSyncScope({lvSyncScope:'layout'})).toBe('layout');expect(editBarSyncScope({lvSyncScope:'global'})).toBe('global');expect(editBarSyncScope({})).toBeNull();expect(editBarSyncScope({lvSyncScope:'bogus'})).toBeNull();
  expect(editBarTemplateRows([{id:'a',name:'Mine',type:'box',properties:{}},{id:'b',name:'Other',type:'trendline',properties:{}}],'box')).toEqual([{id:'a',name:'Mine'}]);
 });
 it('Apply default drawing template patches only the settings that differ from the factory values',()=>{
  const record=createDrawing('trendline',{id:'synthetic-default',paneId:'price'})!.serialize(),editor=drawingEditor(record,[]);
  expect(defaultTemplatePatch(editor)).toEqual({});
  const changed=drawingEditor({...record,style:{...record.style,lineColor:'#123456',lineWidth:4}},[]);
  expect(defaultTemplatePatch(changed)).toMatchObject({'style.lineColor':record.style.lineColor,'style.lineWidth':record.style.lineWidth});
  expect(Object.keys(defaultTemplatePatch(changed)!)).not.toContain('text.value');
 });
});

describe('floating toolbar slots',()=>{
 it('Template menu saves, applies the default, saves as default, applies and removes a template',()=>{
  const templates={list:[{id:'t1',name:'SYNTHETIC wide'}],onApply:vi.fn(),onSave:vi.fn(),onApplyDefault:vi.fn(),onSaveDefault:vi.fn(),onRemove:vi.fn()};
  const render=()=>{hooks.cursor=0;return TemplateSlot({templates});};
  find(render(),label('Template')).props.onClick();
  expect(findAll(render(),node=>node.props?.role==='menuitem').map(node=>node.props['aria-label'])).toEqual(['Save drawing template as','Apply default drawing template','Save as default','Apply template SYNTHETIC wide']);
  find(render(),label('Apply template SYNTHETIC wide')).props.onClick();expect(templates.onApply).toHaveBeenCalledWith('t1');
  find(render(),label('Template')).props.onClick();find(render(),label('Remove template SYNTHETIC wide')).props.onClick();expect(templates.onRemove).toHaveBeenCalledWith('t1');
  find(render(),label('Template')).props.onClick();find(render(),label('Apply default drawing template')).props.onClick();expect(templates.onApplyDefault).toHaveBeenCalledTimes(1);
  find(render(),label('Template')).props.onClick();find(render(),label('Save as default')).props.onClick();expect(templates.onSaveDefault).toHaveBeenCalledTimes(1);
  find(render(),label('Template')).props.onClick();find(render(),label('Save drawing template as')).props.onClick();
  const save=()=>find(render(),node=>node.type==='button'&&text(node)==='Save');expect(save().props.disabled).toBe(true);
  find(render(),label('Template name')).props.onChange({target:{value:'  SYNTHETIC narrow '}});save().props.onClick();expect(templates.onSave).toHaveBeenCalledWith('SYNTHETIC narrow');
  expect(find(render(),node=>node.props?.role==='menu')).toBeNull();
 });
 it('Sync shows the drawing scope; without a change route the rows are disabled with the reason',()=>{
  const render=(sync:any)=>{hooks.cursor=0;return SyncSlot({sync});};
  const shown=render({scope:'layout'});expect(find(shown,label('Sync')).props['aria-pressed']).toBe(true);expect(find(shown,label('Sync')).props.title).toMatch(/^Synced in layout/);
  find(shown,label('Sync')).props.onClick();const open=render({scope:'layout'});
  expect(findAll(open,node=>node.props?.role==='menuitemradio').map(node=>[node.props['aria-label'],node.props['aria-checked'],node.props.disabled])).toEqual([['Not synced',false,true],['Sync in layout',true,true],['Sync globally',false,true]]);
  expect(text(open)).toContain(SYNC_CHANGE_UNAVAILABLE);
  hooks.cells=[];const onChange=vi.fn();render({scope:null,onChange});find(render({scope:null,onChange}),label('Sync')).props.onClick();find(render({scope:null,onChange}),label('Sync globally')).props.onClick();expect(onChange).toHaveBeenCalledWith('global');
 });
 it('More menu rows follow the reference order and carry the order limits',()=>{
  const handlers={onDuplicate:vi.fn(),onCopy:vi.fn(),onFront:vi.fn(),onForward:vi.fn(),onBackward:vi.fn(),onBack:vi.fn(),onVisibility:vi.fn(),onHide:vi.fn(),onObjectTree:vi.fn()};
  const render=()=>{hooks.cursor=0;return MoreSlot({...handlers,orderDisabled:{front:true,forward:true,backward:false,back:false}});};
  find(render(),label('More')).props.onClick();
  // Visual order is a submenu row; its four steps show once it opens.
  expect(findAll(render(),node=>node.props?.role==='menuitem').map(text)).toEqual(['Clone','Copy','Visual order›','Visibility on intervals…','Hide','Object tree…']);
  expect(find(render(),label('Visual order')).props['aria-haspopup']).toBe('menu');
  find(render(),label('Visual order')).props.onClick();
  const sub=find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Visual order'),rows=findAll(sub,node=>node.props?.role==='menuitem');
  expect(rows.map(text)).toEqual(['Bring to front','Bring forward','Send backward','Send to back']);
  expect(rows.filter(node=>node.props.disabled).map(text)).toEqual(['Bring to front','Bring forward']);
  find(render(),label('Copy')).props.onClick();expect(handlers.onCopy).toHaveBeenCalledTimes(1);
  find(render(),label('More')).props.onClick();find(render(),label('Visibility on intervals')).props.onClick();expect(handlers.onVisibility).toHaveBeenCalledTimes(1);
  find(render(),label('More')).props.onClick();find(render(),label('Object tree')).props.onClick();expect(handlers.onObjectTree).toHaveBeenCalledTimes(1);
 });
 it('Font size lists the renderer sizes and writes the picked one',()=>{
  const apply=vi.fn(),properties={buttons:[{id:'fontSize',path:'text.size',title:'Font size',options:['small','normal','large','huge']}] as never,read:()=>'normal',apply};
  const render=()=>{hooks.cursor=0;return PropertySlot({property:{id:'fontSize',path:'text.size',title:'Font size',options:['small','normal','large','huge']},properties});};
  expect(find(render(),label('Font size')).props.title).toBe('Font size');find(render(),label('Font size')).props.onClick();
  const rows=findAll(render(),node=>node.props?.role==='menuitem');expect(rows.map(text)).toEqual(['Small','Normal','Large','Huge']);expect(rows[1].props['aria-checked']).toBe(true);
  rows[2].props.onClick();expect(apply).toHaveBeenCalledWith('text.size','large');
 });
 it('the bar places Template first and Sync after the property buttons',()=>{
  const noop=()=>{};hooks.cursor=0;
  const bar=DrawingEditBar({onSettings:noop,onLock:noop,onDuplicate:noop,onDelete:noop,templates:{list:[],onApply:noop,onSave:noop},sync:{scope:null},properties:{buttons:[{id:'lineColor',path:'style.lineColor',title:'x'}],read:()=>'#ff0000',apply:noop}}) as any;
  const kinds=(bar.props.children as any[]).flat().filter(Boolean).map((child:any)=>child.type?.name??child.props?.['aria-label']);
  expect(kinds.slice(0,4)).toEqual(['BarHandle','TemplateSlot','PropertySlot','SyncSlot']);
 });
});

describe('App wiring (ROOT)',()=>{
 const app=readFileSync('src/ui/App.tsx','utf8');
 it('passes the new toolbar rows and routes non-shared paths through the drawing settings edit',()=>{
  for(const piece of ['templates={selectedDrawingTemplates}','sync={{scope:editBarSyncScope(','orderDisabled={selectedDrawingOrder}','onCopy={','onForward={','onBackward={','onVisibility={','onObjectTree={','chart.updateDrawingProperties(selectedDrawing,{[path]:value})','editBarButtons(buttons,editor?.fields,String(row.type))'])expect(app).toContain(piece);
  expect(app).toContain("routeDrawingDialogTab(dialogAuthority.current,'Visibility')");
 });
});
