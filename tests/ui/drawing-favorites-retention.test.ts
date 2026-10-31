import {beforeEach,describe,expect,it,vi} from 'vitest';
import {captureDrawingFavoriteRequest,restoreDrawingFavorites} from '../../src/ui/drawing-favorites';
import {buildDrawingToolGroups,favoriteLabel,removeFavorite,savedFavoriteList,toggleFavorite} from '../../src/ui/drawing-toolbar-model';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {drawingCatalog} from '../../src/chart/drawing-port';
import {DrawingToolbar} from '../../src/ui/DrawingToolbar';
import {DrawingTools} from '../../src/ui/DrawingTools';

// Saved favorites whose OpenCandle tool type is not registered in this build (a pinned renderer change, or a
// newer OpenCandle build) are retained, inert and removable; renderer-only tools stay star/unstar-able.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];},useRef:(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];},useEffect:()=>{hooks.cursor++;}};});
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
function findAll(node:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))for(const child of node)findAll(child,predicate,out);else if(node?.props){if(predicate(node))out.push(node);findAll(node.props.children,predicate,out);}return out;}
const find=(node:any,predicate:(node:any)=>boolean)=>findAll(node,predicate)[0]??null;
const catalog=drawingCatalog(),UNREGISTERED='lvfuturetool';

function toolbar(favorites:string[]){
 const props:any={chart:{drawingCatalog:()=>catalog},activeTool:null,activeMode:null,onSelect:vi.fn(),onCursor:vi.fn(),onOpenAll:vi.fn(),favorites,onFavoritesChange:vi.fn()};
 const render=()=>{hooks.cursor=0;return DrawingToolbar(props);};
 // Controlled mounted-node model (as tests/ui/drawing-toolbar.test.ts clickFavorite): register the strip button
 // through its public ref inside the toolbar root, then deliver one event to it.
 const fire=(label:string,handler:'onClick'|'onContextMenu'|'onKeyDown',extra:Record<string,unknown>={})=>{
  const tree=render(),control=find(tree,node=>node.type==='button'&&node.props['aria-label']===label);
  const rootNode={contains:(target:unknown):boolean=>target===mounted},mounted={isConnected:true,offsetParent:rootNode,closest:()=>null};
  tree.props.ref.current=rootNode;control.props.ref(mounted);
  const event={target:mounted,currentTarget:mounted,defaultPrevented:false,nativeEvent:{isComposing:false},preventDefault:vi.fn(),...extra};
  control.props[handler](event);return event;
 };
 const strip=()=>findAll(find(render(),node=>node.props.role==='toolbar'),node=>node.type==='button').map(node=>({label:node.props['aria-label'],inert:node.props['aria-disabled']===true}));
 return{props,render,fire,strip};
}

describe('saved favorites of unregistered OpenCandle tool types',()=>{
 it('restore retains OpenCandle-owned ids opaquely and still refuses other unknown ids',()=>{
  expect(restoreDrawingFavorites(['trendline',UNREGISTERED,'lvshortposition'])).toEqual(['trendline',UNREGISTERED,'lvshortposition']);
  for(const value of [['future-synthetic-tool'],['short'],['cursor'],['LVFUTURE'],['lv'],[UNREGISTERED,UNREGISTERED]])expect(()=>restoreDrawingFavorites(value),JSON.stringify(value)).toThrow(/favorite/i);
  expect(restoreDrawingFavorites(Array.from({length:16},(_,index)=>'lvfuture'+index))).toHaveLength(16);
  expect(()=>restoreDrawingFavorites(Array.from({length:17},(_,index)=>'lvfuture'+index))).toThrow(/favorite/i);
 });
 it('workspace restore keeps them instead of failing (fail closed: retained, not rendered as tools)',()=>{
  const defaults=createInitialWorkspace(),input={...defaults,drawingFavorites:['ray',UNREGISTERED]};
  expect(restoreWorkspace(input,defaults).drawingFavorites).toEqual(['ray',UNREGISTERED]);
 });
 it('the favorite request lets an inert entry be removed, keeps it through other removals, and refuses additions until it is resolved',()=>{
  let owner={workspace:{},favorites:['trendline',UNREGISTERED,'ray'] as readonly string[],chart:{},gridEpoch:0,ready:true,blocked:false};
  const publish=vi.fn((next:string[])=>{owner={...owner,favorites:next};return true;}),host={read:()=>owner,catalog:()=>['trendline','ray','hline'],publish};
  expect(captureDrawingFavoriteRequest(host)(['trendline','ray'])).toBe(true);expect(publish).toHaveBeenLastCalledWith(['trendline','ray']);
  owner={...owner,favorites:['trendline',UNREGISTERED,'ray']};
  expect(captureDrawingFavoriteRequest(host)([UNREGISTERED,'ray'])).toBe(true);expect(publish).toHaveBeenLastCalledWith([UNREGISTERED,'ray']);
  expect(()=>captureDrawingFavoriteRequest(host)([UNREGISTERED,'ray','hline'])).toThrow(/Remove them before adding/);
  expect(()=>captureDrawingFavoriteRequest(host)(['hline'])).toThrow(/one favorite at a time/);
  expect(publish).toHaveBeenCalledTimes(2);
 });
 it('model helpers keep inert entries in order and label them without exposing the raw id',()=>{
  const groups=buildDrawingToolGroups(catalog);
  expect(savedFavoriteList(groups,['ray',UNREGISTERED,'bogus',7,'ray'])).toEqual(['ray',UNREGISTERED]);
  expect(toggleFavorite(groups,[UNREGISTERED,'ray'],'ray')).toEqual([UNREGISTERED]);expect(toggleFavorite(groups,[UNREGISTERED],'hline')).toEqual([UNREGISTERED,'hline']);
  expect(removeFavorite(groups,['ray',UNREGISTERED],UNREGISTERED)).toEqual(['ray']);
  expect(favoriteLabel(groups,UNREGISTERED)).toBe('Unavailable drawing tool');
  const withoutShort=buildDrawingToolGroups(catalog.filter(row=>String(row.type)!=='lvshortposition'));expect(favoriteLabel(withoutShort,'lvshortposition')).toBe('Short position');
 });
 it('the strip shows an inert entry, never arms it, and removes it with Delete; other favorites stay',()=>{
  const t=toolbar(['ray',UNREGISTERED]);
  expect(t.strip()).toEqual([{label:'Favorite tool: Ray',inert:false},{label:'Favorite tool: Unavailable drawing tool',inert:true}]);
  t.fire('Favorite tool: Unavailable drawing tool','onClick');expect(t.props.onSelect).not.toHaveBeenCalled();expect(t.props.onFavoritesChange).not.toHaveBeenCalled();
  const event=t.fire('Favorite tool: Unavailable drawing tool','onKeyDown',{key:'Delete'});expect(event.preventDefault).toHaveBeenCalled();
  expect(t.props.onFavoritesChange).toHaveBeenCalledExactlyOnceWith(['ray']);
  t.fire('Favorite tool: Ray','onKeyDown',{key:'a'});expect(t.props.onFavoritesChange).toHaveBeenCalledTimes(1);
 });
 it('a flyout star change keeps the inert entry (one change at a time)',()=>{
  const t=toolbar([UNREGISTERED,'ray']);find(t.render(),node=>node.type==='button'&&node.props['aria-label']==='Open Trend tools').props.onClick();
  t.fire('Favorite: Ray','onClick');expect(t.props.onFavoritesChange).toHaveBeenCalledExactlyOnceWith([UNREGISTERED]);
 });
});

describe('renderer-only tools stay favoritable after leaving the toolbar groups',()=>{
 it('a saved renderer-only favorite is shown in the strip, arms, and is removable from the strip (context menu)',()=>{
  const t=toolbar(['gartley','ray']);expect(t.strip()).toEqual([{label:'Favorite tool: Gartley',inert:false},{label:'Favorite tool: Ray',inert:false}]);
  t.fire('Favorite tool: Gartley','onClick');expect(t.props.onSelect).toHaveBeenCalledWith('gartley');
  const event=t.fire('Favorite tool: Gartley','onContextMenu');expect(event.preventDefault).toHaveBeenCalled();expect(t.props.onFavoritesChange).toHaveBeenCalledExactlyOnceWith(['ray']);
 });
 it('the All drawing tools dialog stars and unstars every available tool, including renderer-only ones',()=>{
  const props:any={chart:{drawingCatalog:()=>catalog},onSelect:vi.fn(),onClose:vi.fn(),favorites:['gartley'],onFavoritesChange:vi.fn()};
  const render=()=>{hooks.cursor=0;return DrawingTools(props);};
  const star=(label:string)=>find(render(),node=>node.type==='button'&&node.props['aria-label']==='Favorite: '+label);
  expect(star('Gartley').props['aria-pressed']).toBe(true);expect(star('Bat').props['aria-pressed']).toBe(false);expect(star('Short position').props['aria-pressed']).toBe(false);
  star('Gartley').props.onClick();expect(props.onFavoritesChange).toHaveBeenLastCalledWith([]);
  star('Bat').props.onClick();expect(props.onFavoritesChange).toHaveBeenLastCalledWith(['gartley','bat']);
  expect(star('Post')).toBeNull();expect(star('Stickers')).not.toBeNull();expect(star('Sine line')).not.toBeNull();// Stickers is a tool, Post stands in
 expect(props.onSelect).not.toHaveBeenCalled();// Sine line is a tool now
  const stars=findAll(render(),node=>node.type==='button'&&String(node.props['aria-label']??'').startsWith('Favorite: '));expect(stars).toHaveLength(catalog.length);
  hooks.cells=[];const plain:any={chart:{drawingCatalog:()=>catalog},onSelect:vi.fn(),onClose:vi.fn()};hooks.cursor=0;expect(findAll(DrawingTools(plain),node=>String(node.props['aria-label']??'').startsWith('Favorite: '))).toHaveLength(0);
 });
});
