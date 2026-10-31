import {describe,expect,it,vi} from 'vitest';
import {all,bindRef,dispatchDocument,focusDocument,input,invoke,ModelNode,mountControlledComponent} from '../helpers/alert-dialog-harness';
import {DrawingToolbar,type DrawingToolbarProps} from '../../src/ui/DrawingToolbar';
import {captureDrawingFavoriteRequest,restoreDrawingFavorites} from '../../src/ui/drawing-favorites';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {createInitialWorkspace,type Workspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {patchWorkspace} from '../../src/ui/workspace-grid';
import {changedChartGrid,createWorkspaceHistory,historicalChartWorkspace} from '../../src/ui/workspace-history';
import {prepareWorkspaceData,prepareWorkspaceReplacement} from '../../src/ui/workspace-transfer';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
import {createPaperAccount} from '../../src/domain/paper';

// Independent contract tests against the production helper and actual toolbar
// callbacks. The shared hook/node model is not a browser, native input, canvas,
// IPC write or packaged launch. No assertions are hidden in swallowed callbacks.
type Owner=ReturnType<Parameters<typeof captureDrawingFavoriteRequest>[0]['read']>;
function host(initial:readonly string[]=['trendline']){
 let owner:Owner={workspace:{},favorites:initial,chart:{},gridEpoch:1,ready:true,blocked:false};
 const publish=vi.fn((_next:string[])=>true),catalog=vi.fn(()=>['trendline','ray','hline']);
 const request=captureDrawingFavoriteRequest({read:()=>owner,catalog,publish});
 return{request,publish,catalog,get owner(){return owner;},replace(patch:Partial<Owner>){owner={...owner,...patch};}};
}

describe('independent drawing favorite host ownership',()=>{
 it('accepts one ordered append, returns detached validated data, and does not mutate the current list',()=>{
  const current=['trendline'],proposed=['trendline','ray'],h=host(current);
  expect(h.request(proposed)).toBe(true);expect(h.publish).toHaveBeenCalledExactlyOnceWith(['trendline','ray']);
  expect(h.publish.mock.calls[0][0]).not.toBe(proposed);expect(current).toEqual(['trendline']);expect(proposed).toEqual(['trendline','ray']);
 });
 it('removes only the requested member while preserving other order',()=>{
  const h=host(['ray','trendline','hline']);expect(h.request(['ray','hline'])).toBe(true);
  expect(h.publish).toHaveBeenCalledExactlyOnceWith(['ray','hline']);expect(h.owner.favorites).toEqual(['ray','trendline','hline']);
 });
 it('accepts an exact value no-op without publication',()=>{
  const h=host(['ray','trendline']);expect(h.request(['ray','trendline'])).toBe(true);expect(h.publish).not.toHaveBeenCalled();
 });
 for(const [name,current,next] of [
  ['reorder',['ray','trendline'],['trendline','ray']],
  ['two additions',[],['trendline','ray']],
  ['two removals',['trendline','ray'],[]],
  ['replacement',['trendline'],['ray']],
  ['append plus reorder',['ray','trendline'],['trendline','ray','hline']],
  ['unknown type',['trendline'],['trendline','SYNTHETIC-unsupported-tool']],
 ] as const)it('rejects '+name+' without publishing or changing the original list',()=>{
  const h=host(current);expect(()=>h.request([...next])).toThrow();expect(h.publish).not.toHaveBeenCalled();expect(h.owner.favorites).toEqual(current);
 });
 for(const key of ['workspace','favorites','chart','gridEpoch','ready','blocked'] as const)it('refuses a retained callback after '+key+' changes',()=>{
  const h=host();const patch:Partial<Owner>=key==='workspace'?{workspace:{}}:key==='favorites'?{favorites:['trendline']}:key==='chart'?{chart:{}}:key==='gridEpoch'?{gridEpoch:2}:key==='ready'?{ready:false}:{blocked:true};
  h.replace(patch);expect(h.request(['trendline','ray'])).toBe(false);expect(h.publish).not.toHaveBeenCalled();
 });
 it('retires the old list callback after an actual accepted host replacement',()=>{
  const h=host();h.publish.mockImplementation(next=>{h.replace({workspace:{},favorites:next});return true;});
  expect(h.request(['trendline','ray'])).toBe(true);expect(h.request(['trendline','hline'])).toBe(false);
  expect(h.publish).toHaveBeenCalledTimes(1);expect(h.owner.favorites).toEqual(['trendline','ray']);
 });
 it('does not drop saved favorites that are missing from the active catalog',()=>{
  const h=host(['ray','trendline']);h.catalog.mockReturnValue(['trendline','hline']);
  expect(()=>h.request(['ray','trendline','hline'])).toThrow(/retain|unavailable|catalog/i);
  expect(h.publish).not.toHaveBeenCalled();expect(h.owner.favorites).toEqual(['ray','trendline']);
 });
 it('refuses adding a shipped but currently unavailable tool',()=>{
  const h=host();h.catalog.mockReturnValue(['trendline']);expect(()=>h.request(['trendline','ray'])).toThrow();expect(h.publish).not.toHaveBeenCalled();
 });
 for(const throws of [false,true])it('cannot publish or surface a stale error after the catalog replaces its owner'+(throws?' and throws':''),()=>{
  const h=host();h.catalog.mockImplementation(()=>{h.replace({workspace:{}});if(throws)throw Error('SYNTHETIC retired catalog error');return ['trendline','ray'];});
  expect(h.request(['trendline','ray'])).toBe(false);expect(h.publish).not.toHaveBeenCalled();
 });
 it('rechecks owner after a descriptor trap during proposed-list admission',()=>{
  const h=host(),proposed=new Proxy(['trendline','ray'],{getOwnPropertyDescriptor(target,key){h.replace({workspace:{}});return Reflect.getOwnPropertyDescriptor(target,key);}});
  expect(h.request(proposed)).toBe(false);expect(h.publish).not.toHaveBeenCalled();
 });
 it('a catalog iterator cannot replace the owner and then acknowledge an old no-op',()=>{
  const h=host(),catalog=['trendline','ray'];Object.defineProperty(catalog,Symbol.iterator,{value:function*(){h.replace({workspace:{}});yield 'trendline';yield 'ray';}});
  h.catalog.mockReturnValue(catalog);expect(h.request(['trendline'])).toBe(false);expect(h.publish).not.toHaveBeenCalled();
 });
 for(const initial of ['no chart','not ready','blocked'] as const)it('never admits a request captured while '+initial,()=>{
  const h=host(),owner={...h.owner,...(initial==='no chart'?{chart:null}:initial==='not ready'?{ready:false}:{blocked:true})};
  const request=captureDrawingFavoriteRequest({read:()=>h.owner,catalog:h.catalog,publish:h.publish},owner);
  expect(request(['trendline','ray'])).toBe(false);expect(h.publish).not.toHaveBeenCalled();
 });
 it('a rejected publish leaves the existing controlled value unchanged',()=>{
  const h=host();h.publish.mockReturnValue(false);expect(h.request(['trendline','ray'])).toBe(false);expect(h.owner.favorites).toEqual(['trendline']);
 });
});

function toolbar(initial:readonly string[]=[]){
 let nativeTool:string|null=null,nativeMode:'measure'|'eraser'|null=null;
 const catalog=drawingCatalog(),getTool=vi.fn(()=>nativeTool),getMode=vi.fn(()=>nativeMode);
 const chart={drawingCatalog:()=>catalog,drawings:{getTool,getMode}};
 const publish=vi.fn((_next:string[])=>{}),select=vi.fn((type:string)=>{nativeTool=type;}),cursor=vi.fn(()=>{nativeTool=null;}),mode=vi.fn((next:'measure'|'eraser'|null)=>{nativeMode=next;});
 const props:DrawingToolbarProps={chart,activeTool:null,activeMode:null,onSelect:select,onCursor:cursor,onMode:mode,enabledModes:['measure'],onOpenAll:vi.fn(),favorites:[...initial],onFavoritesChange:publish};
 const view=mountControlledComponent(()=>DrawingToolbar(props));
 const button=(label:string)=>view.find(node=>node.type==='button'&&node.props['aria-label']===label);
 const capture=(label:string)=>{const control=button(label);return{control,node:view.nodeFor(control),click:control.props.onClick};};
 const click=(label:string)=>{const saved=capture(label);saved.node.focus();invoke(saved.click,input(saved.node));view.settle();};
 const open=()=>click('Open Trend tools');
 const menuKey=(key:string)=>{const menu=view.find(node=>node.props.role==='menu'),node=view.nodeFor(menu);invoke(menu.props.onKeyDown,input(node,{key,target:focusDocument.activeElement??node}));view.settle();};
 const strip=()=>all(view.render(),node=>node.type==='button'&&String(node.props['aria-label']).startsWith('Favorite tool: ')).map(node=>node.props['aria-label']);
 const calls=()=>({select:select.mock.calls.length,cursor:cursor.mock.calls.length,mode:mode.mock.calls.length,publish:publish.mock.calls.length});
 view.settle();return{...view,props,chart,publish,select,cursor,mode,getTool,getMode,button,capture,click,open,menuKey,strip,calls,setNative(tool:string|null,nextMode:'measure'|'eraser'|null=null){nativeTool=tool;nativeMode=nextMode;}};
}

describe('independent mounted favorite controls',()=>{
 for(const replayRefs of [false,true])it('StrictMode mount cleanup/setup'+(replayRefs?' with ref detach/reattach':' without ref replay')+' keeps the saved strip live until real unmount',()=>{
  const select=vi.fn(),cursor=vi.fn(),publish=vi.fn(),props:DrawingToolbarProps={chart:{drawingCatalog,drawings:{getTool:()=>null,getMode:()=>null}},activeTool:null,onSelect:select,onCursor:cursor,onOpenAll:vi.fn(),favorites:['ray'],onFavoritesChange:publish};
  const view=mountControlledComponent(()=>DrawingToolbar(props)),tree=view.render(),setups=view.owner.pending.splice(0);
  for(const setup of setups)setup();
  const buttons=all(tree,node=>node.type==='button'&&node.props['aria-label']==='Favorite tool: Ray');expect(buttons).toHaveLength(1);
  const button=buttons[0],node=view.nodeFor(button),refs=all(tree,element=>element.props.ref!==undefined).map(element=>({ref:element.props.ref,node:view.nodeFor(element)}));
  // Replay the actual hook setups and mounted ref callbacks. No second render
  // may replace the captured handler and conceal a dead first-render control.
  if(replayRefs)for(const ref of refs)bindRef(ref.ref,null);
  for(const effect of view.owner.effects.values())effect.cleanup?.();
  if(replayRefs)for(const ref of refs)bindRef(ref.ref,ref.node);
  for(const setup of setups)setup();
  invoke(button.props.onClick,input(node));expect(select).toHaveBeenCalledExactlyOnceWith('ray');expect(cursor).not.toHaveBeenCalled();expect(publish).not.toHaveBeenCalled();
  view.dispose();invoke(button.props.onClick,input(node));expect(select).toHaveBeenCalledTimes(1);expect(cursor).not.toHaveBeenCalled();expect(publish).not.toHaveBeenCalled();
 });
 it('emits literal ordered star changes through controlled props without arming, optimistic updates or closing the flyout',()=>{
  const t=toolbar();t.open();t.click('Favorite: Trendline');expect(t.publish).toHaveBeenCalledExactlyOnceWith(['trendline']);
  expect(t.props.favorites).toEqual([]);expect(t.strip()).toEqual([]);expect(t.button('Favorite: Trendline').props['aria-checked']).toBe(false);
  t.props.favorites=['trendline'];t.settle();t.click('Favorite: Ray');expect(t.publish).toHaveBeenLastCalledWith(['trendline','ray']);
  t.props.favorites=['trendline','ray'];t.settle();t.click('Favorite: Trendline');expect(t.publish).toHaveBeenLastCalledWith(['ray']);
  t.props.favorites=['ray'];t.settle();t.click('Favorite: Trendline');expect(t.publish).toHaveBeenLastCalledWith(['ray','trendline']);
  expect(t.select).not.toHaveBeenCalled();expect(t.cursor).not.toHaveBeenCalled();expect(t.mode).not.toHaveBeenCalled();
  expect(all(t.render(),node=>node.props.role==='menu')).toHaveLength(1);expect(focusDocument.activeElement?.props['aria-label']).toBe('Favorite: Trendline');
 });
 it('keeps strip order/accessibility and unavailable utility leaves honest',()=>{
  const t=toolbar(['ray','trendline']);expect(t.strip()).toEqual(['Favorite tool: Ray','Favorite tool: Trendline']);
  t.click('Open Cursors');expect(all(t.render(),node=>node.props['aria-label']==='Favorite: Eraser')).toHaveLength(0);
  const eraser=t.find(node=>node.props['data-requirement']==='DW.CURSOR.ERASER');expect(eraser.props['aria-disabled']).toBe(true);
 });
 it('ArrowRight/Left moves between the real tool and star; native activation is a separate click callback',()=>{
  const t=toolbar();t.open();t.menuKey('Home');t.menuKey('ArrowRight');expect(focusDocument.activeElement?.props['aria-label']).toBe('Favorite: Trendline');
  t.click('Favorite: Trendline');expect(t.publish).toHaveBeenCalledTimes(1);t.menuKey('ArrowLeft');expect(focusDocument.activeElement?.props['data-requirement']).toBe('DW.TREND.TRENDLINE');
  expect(t.select).not.toHaveBeenCalled();t.menuKey('Escape');expect(all(t.render(),node=>node.props.role==='menu')).toHaveLength(0);expect(t.publish).toHaveBeenCalledTimes(1);
 });
 for(const close of ['Escape','Tab','outside','other group'] as const)it('retires a retained star after '+close+' and same-group reopening',()=>{
  const t=toolbar();t.open();const old=t.capture('Favorite: Trendline');
  if(close==='outside'){dispatchDocument('pointerdown',input(focusDocument.body));t.settle();}
  else if(close==='other group')t.click('Open Gann and Fibonacci tools');else t.menuKey(close);
  t.open();invoke(old.click,input(old.node));t.settle();expect(t.publish).not.toHaveBeenCalled();
  t.click('Favorite: Trendline');expect(t.publish).toHaveBeenCalledExactlyOnceWith(['trendline']);
 });
 for(const changed of ['chart','favorites','publisher','unmount'] as const)it('refuses old star ownership after '+changed,()=>{
  const t=toolbar();t.open();const old=t.capture('Favorite: Trendline');
  if(changed==='chart')t.props.chart={...t.chart};else if(changed==='favorites')t.props.favorites=['ray'];else if(changed==='publisher')t.props.onFavoritesChange=vi.fn();else t.dispose();
  if(changed!=='unmount')t.settle();invoke(old.click,input(old.node));expect(t.publish).not.toHaveBeenCalled();
  if(changed==='publisher')expect(t.props.onFavoritesChange).not.toHaveBeenCalled();
 });
 it('ordinary same-node ref refresh is usable, while a replaced node cannot reuse the old event',()=>{
  const t=toolbar();t.open();const old=t.capture('Favorite: Trendline');t.settle();const current=t.capture('Favorite: Trendline');
  expect(current.node).toBe(old.node);bindRef(old.control.props.ref,null);invoke(current.click,input(current.node));expect(t.publish).toHaveBeenCalledExactlyOnceWith(['trendline']);
  t.publish.mockClear();const replacement=new ModelNode();replacement.tag='button';replacement.props=current.node.props;replacement.parent=current.node.parent;
  bindRef(current.control.props.ref,replacement);invoke(current.click,input(current.node));expect(t.publish).not.toHaveBeenCalled();
 });
 for(const kind of ['star','strip'] as const)it('a retained '+kind+' callback cannot borrow a replacement physical node or revive after node ABA',()=>{
  const t=toolbar(['ray']);if(kind==='star')t.open();const label=kind==='star'?'Favorite: Trendline':'Favorite tool: Ray',old=t.capture(label);
  t.settle();const current=t.capture(label),parent=current.node.parent;if(!parent)throw Error('Expected a mounted favorite parent');
  const index=parent.children.indexOf(current.node);if(index<0)throw Error('Expected the current favorite in its parent');
  const replacement=new ModelNode();replacement.tag='button';replacement.props=current.node.props;replacement.parent=parent;
  parent.children[index]=replacement;current.node.isConnected=false;bindRef(current.control.props.ref,replacement);
  invoke(old.click,input(replacement));expect(t.calls()).toEqual({select:0,cursor:0,mode:0,publish:0});
  parent.children[index]=old.node;old.node.isConnected=true;replacement.isConnected=false;bindRef(current.control.props.ref,old.node);
  invoke(old.click,input(old.node));expect(t.calls()).toEqual({select:0,cursor:0,mode:0,publish:0});
  t.settle();t.click(label);
  if(kind==='star')expect(t.publish).toHaveBeenCalledExactlyOnceWith(['ray','trendline']);else expect(t.select).toHaveBeenCalledExactlyOnceWith('ray');
 });
 for(const blocked of ['prevented','composing','foreign target','hidden','inert','disconnected'] as const)it('does not mutate favorites for a '+blocked+' star event',()=>{
  const t=toolbar();t.open();const s=t.capture('Favorite: Trendline');let event=input(s.node);
  if(blocked==='prevented')event={...event,defaultPrevented:true};else if(blocked==='composing')event={...event,nativeEvent:{isComposing:true}};
  else if(blocked==='foreign target')event={...event,target:focusDocument.body};else if(blocked==='hidden')s.node.props={...s.node.props,hidden:true};else if(blocked==='inert')s.node.props={...s.node.props,inert:true};else s.node.isConnected=false;
  invoke(s.click,event);expect(t.publish).not.toHaveBeenCalled();
 });
 it('dispatches inactive and active strip controls from fresh native state, not stale render flags',()=>{
  const t=toolbar(['trendline']);const inactive=t.capture('Favorite tool: Trendline');t.setNative('trendline');invoke(inactive.click,input(inactive.node));
  expect(t.cursor).toHaveBeenCalledTimes(1);expect(t.select).not.toHaveBeenCalled();t.setNative('trendline');t.settle();const active=t.capture('Favorite tool: Trendline');
  t.setNative(null);invoke(active.click,input(active.node));expect(t.select).toHaveBeenCalledExactlyOnceWith('trendline');expect(t.cursor).toHaveBeenCalledTimes(1);expect(t.publish).not.toHaveBeenCalled();
 });
 it('exits the current native mode once before arming the favorite',()=>{
  const t=toolbar(['ray']);const saved=t.capture('Favorite tool: Ray');t.setNative(null,'measure');invoke(saved.click,input(saved.node));
  expect(t.mode).toHaveBeenCalledExactlyOnceWith(null);expect(t.select).toHaveBeenCalledExactlyOnceWith('ray');expect(t.mode.mock.invocationCallOrder[0]).toBeLessThan(t.select.mock.invocationCallOrder[0]);expect(t.publish).not.toHaveBeenCalled();
 });
 for(const boundary of ['getTool','getMode','onMode'] as const)it('does not run a strip tail after '+boundary+' replaces the owner',()=>{
  const t=toolbar(['ray']);const saved=t.capture('Favorite tool: Ray');t.setNative(null,'measure');let replaced=false;
  const replace=()=>{if(replaced)return;replaced=true;t.props.favorites=[];t.settle();};
  if(boundary==='getTool')t.getTool.mockImplementation(()=>{replace();return null;});
  else if(boundary==='getMode')t.getMode.mockImplementation(()=>{replace();return 'measure';});else t.mode.mockImplementation(()=>{replace();});
  invoke(saved.click,input(saved.node));expect(replaced).toBe(true);expect(t.select).not.toHaveBeenCalled();expect(t.cursor).not.toHaveBeenCalled();
  expect(t.mode).toHaveBeenCalledTimes(boundary==='onMode'?1:0);expect(t.publish).not.toHaveBeenCalled();
 });
 for(const changed of ['removed','chart','unmount'] as const)it('retained '+changed+' strip controls cannot arm or disarm',()=>{
  const t=toolbar(['ray']);const saved=t.capture('Favorite tool: Ray');if(changed==='removed')t.props.favorites=[];else if(changed==='chart')t.props.chart={...t.chart};else t.dispose();
  if(changed!=='unmount')t.settle();invoke(saved.click,input(saved.node));expect(t.calls()).toEqual({select:0,cursor:0,mode:0,publish:0});
 });
});

describe('independent saved favorites and chart history',()=>{
 it('rejects an unknown saved favorite instead of normalizing it away',()=>{
  const source=['ray','SYNTHETIC-unsupported-tool'];expect(()=>restoreDrawingFavorites(source)).toThrow();expect(source).toEqual(['ray','SYNTHETIC-unsupported-tool']);
 });
 it('legacy absence creates a fresh empty list even when caller defaults have favorites',()=>{
  const defaults=createInitialWorkspace();defaults.drawingFavorites=['ray'];const legacy={...defaults};delete (legacy as Partial<Workspace>).drawingFavorites;
  const first=restoreWorkspace(legacy,defaults),second=restoreWorkspace(legacy,defaults);expect(first.drawingFavorites).toEqual([]);expect(second.drawingFavorites).toEqual([]);
  expect(first.drawingFavorites).not.toBe(second.drawingFavorites);expect(defaults.drawingFavorites).toEqual(['ray']);
 });
 it('actual export and replacement preserve literal order and refusal leaves the original prepared payload intact',()=>{
  const workspace=createInitialWorkspace();workspace.drawingFavorites=['ray','trendline'];const data=prepareWorkspaceJSON({...workspace,paper:createPaperAccount(),alerts:[]});
  const encoded=JSON.stringify({schemaVersion:1,data}),restored=prepareWorkspaceReplacement(encoded);
  expect(restored.workspace.drawingFavorites).toEqual(['ray','trendline']);expect(prepareWorkspaceData(restored.data).workspace.drawingFavorites).toEqual(['ray','trendline']);
  const write=vi.fn(),invalid={...data,drawingFavorites:['ray','SYNTHETIC-future-tool']};expect(()=>write(prepareWorkspaceData(invalid).data)).toThrow();expect(write).not.toHaveBeenCalled();
  expect(JSON.stringify({schemaVersion:1,data})).toBe(encoded);expect(data.drawingFavorites).toEqual(['ray','trendline']);expect(createInitialWorkspace().drawingFavorites).toEqual([]);
 });
 it('favorites preserve a real redo branch and remain current through chart Undo and Redo',()=>{
  const base=createInitialWorkspace();base.drawingFavorites=['trendline'];const changed=patchWorkspace(base,{chartOptions:{...base.chartOptions,invert:true}}),history=createWorkspaceHistory<Workspace>();
  expect(changedChartGrid(base,changed)).toBe(true);history.record(base,null);const undo=history.undo(changed,null);expect(undo?.workspace).toBe(base);
  const atBase=historicalChartWorkspace(changed,undo!.workspace),status=history.status(),redo=history.peekRedo(),favoriteEdit=patchWorkspace(atBase,{drawingFavorites:['ray','trendline']});
  expect(changedChartGrid(atBase,favoriteEdit)).toBe(false);expect(favoriteEdit.grid).toEqual(atBase.grid);expect(history.status()).toEqual(status);expect(history.peekRedo()).toBe(redo);
  const redoing=history.redo(favoriteEdit,null);expect(redoing?.workspace).toBe(changed);const reapplied=historicalChartWorkspace(favoriteEdit,redoing!.workspace);
  expect(reapplied.chartOptions.invert).toBe(true);expect(reapplied.drawingFavorites).toEqual(['ray','trendline']);
  const back=history.undo(reapplied,null);expect(back).not.toBeNull();const undone=historicalChartWorkspace(reapplied,back!.workspace);
  expect(undone.chartOptions.invert).toBe(false);expect(undone.drawingFavorites).toEqual(['ray','trendline']);expect(base.drawingFavorites).toEqual(['trendline']);
 });
});
