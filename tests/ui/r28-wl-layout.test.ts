import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {SymbolDetails,type SymbolDetailsProps} from '../../src/ui/SymbolDetails';
import {defaultDetailPreferences,type DetailSnapshot} from '../../src/watchlists/details';
import {DETAIL_PANE_LIMITS,clampDetailPaneHeight,dragDetailPaneHeight,keyDetailPaneHeight,restoreDetailPane,type DetailPane} from '../../src/watchlists/detail-pane';
import {createWatchBook,restoreWatchBook} from '../../src/watchlists/model';
// Reference facts: the recorded fact files
// sidebar.page.base (widgets: watchlist, then detail) and visual-layout-spec.json
// widgetPanel.details ("below" the list), widgetPanel.watchlist (28px header, 30px rows).
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>unknown>}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(value:any)=>{hooks.cells[i]=typeof value==='function'?value(hooks.cells[i]):value;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>unknown)=>{hooks.cursor++;hooks.effects.push(effect);}};});
function find(node:any,predicate:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,predicate);if(found)return found;}}else if(node?.props){if(predicate(node))return node;return find(node.props.children,predicate);}return null;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
const cls=(node:any,name:string)=>typeof node?.props?.className==='string'&&node.props.className.split(' ').includes(name);
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];});
function harness(pane?:DetailPane,accept=true){
 const snapshot:DetailSnapshot={symbol:'GME',exchange:'SYNTHETIC',synthetic:true,description:'Synthetic instrument',blocks:{summary:[{label:'Last supplied close',value:1}],daily:[{label:'Daily volume',value:null}],identity:[{label:'Currency',value:'USD'}],source:[{label:'Provider',value:'Synthetic'}]},diagnostic:'diag',disclaimer:'SYNTHETIC'};
 const saved:DetailPane[]=[];let props:SymbolDetailsProps={snapshot,identity:'a',ownerToken:{},preferences:defaultDetailPreferences(),notes:[],assertOwner(){},onBegin(){},onPreferences(){return true;},pane,onPane(next){saved.push(next);if(!accept)return false;props={...props,pane:next};return true;}};
 const render=()=>{hooks.cursor=0;return SymbolDetails(props);};
 return{render,saved,unpaned(){props={...props,onPane:undefined,pane:undefined};}};
}
/** A fake laid-out panel: list of `list` px above a details section of `details` px whose header ends `header` px below its top. */
function laidOut(list:number,details:number,header:number){
 const table={getBoundingClientRect:()=>({height:list})};
 const head={getBoundingClientRect:()=>({bottom:500+header})};
 const section:any={style:{height:details+'px'},getBoundingClientRect:()=>({top:500,height:details}),parentElement:{querySelector:(q:string)=>q==='.wl-table'?table:null},querySelector:(q:string)=>q==='.symbol-details-content>header'?head:null};
 return{section,event:(key:string)=>{const e={key,defaultPrevented:false,stopped:false,currentTarget:{closest:(q:string)=>q==='.symbol-details'?section:null},preventDefault(){e.defaultPrevented=true;},stopPropagation(){e.stopped=true;}};return e;}};
}
function rule(css:string,selector:string){const match=new RegExp('(?:^|[}`\\s])'+selector.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'\\{([^}]*)\\}').exec(css);return match?match[1]:null;}

describe('split sizing (pure)',()=>{
 it('keeps the list at least 120px (column header + three 30px rows) and the details at least the header',()=>{
  expect(DETAIL_PANE_LIMITS.listMin).toBeGreaterThanOrEqual(28+3*30);
  expect(clampDetailPaneHeight(1319,813)).toBe(813-120);
  expect(clampDetailPaneHeight(10,813,110)).toBe(110);
  expect(clampDetailPaneHeight(300,813,110)).toBe(300);
  // Not enough room for both: the details keep their header, the list takes the rest.
  expect(clampDetailPaneHeight(300,150,110)).toBe(110);
  expect(clampDetailPaneHeight(Number.NaN,null)).toBe(DETAIL_PANE_LIMITS.defaultHeight);
  expect(clampDetailPaneHeight(9e9,null)).toBe(DETAIL_PANE_LIMITS.max);
 });
 it('drag up grows the details, drag down shrinks them, both clamped',()=>{
  expect(dragDetailPaneHeight(300,400,350,813,100)).toBe(350);
  expect(dragDetailPaneHeight(300,400,700,813,100)).toBe(100);
  expect(dragDetailPaneHeight(300,400,-900,813,100)).toBe(693);
 });
 it('separator keys step, page and jump to the bounds; other keys are ignored',()=>{
  expect(keyDetailPaneHeight(300,'ArrowUp',813,100)).toBe(316);
  expect(keyDetailPaneHeight(300,'ArrowDown',813,100)).toBe(284);
  expect(keyDetailPaneHeight(300,'PageUp',813,100)).toBe(364);
  expect(keyDetailPaneHeight(300,'Home',813,100)).toBe(693);
  expect(keyDetailPaneHeight(300,'End',813,100)).toBe(100);
  expect(keyDetailPaneHeight(300,'a',813,100)).toBeNull();
 });
 it('restores exactly {height,collapsed} and persists it with the workspace watch book',()=>{
  expect(restoreDetailPane({height:300,collapsed:true})).toEqual({height:300,collapsed:true});
  for(const bad of [null,[],{height:300},{height:300,collapsed:'no'},{height:30,collapsed:false},{height:300.5,collapsed:false},{height:300,collapsed:false,x:1}])expect(()=>restoreDetailPane(bad)).toThrow();
  const book=createWatchBook();expect(restoreWatchBook(book).detailPane).toBeUndefined();
  const withPane=restoreWatchBook(JSON.parse(JSON.stringify({...book,detailPane:{height:260,collapsed:false}})));
  expect(withPane.detailPane).toEqual({height:260,collapsed:false});
  expect(()=>restoreWatchBook({...book,detailPane:{height:'tall',collapsed:false}})).toThrow();
 });
});

describe('layout CSS',()=>{
 const details=readFileSync('src/ui/symbol-details.css','utf8'),panel=readFileSync('src/ui/WatchlistPanel.tsx','utf8');
const wlCss=readFileSync('src/ui/watchlist.css','utf8');
 it('the panel fills its column and the list flexes with a 120px floor instead of a 45vh cap',()=>{
  const host=rule(wlCss,'.watchlist-panel-v2')!,table=rule(wlCss,'.watchlist-panel-v2 .wl-table')!;
  expect(host).toMatch(/flex:1 1 0/);expect(host).toMatch(/min-height:0/);expect(host).toMatch(/flex-direction:column/);
  expect(table).toMatch(/flex:1 1 0/);expect(table).toMatch(/min-height:120px/);expect(table).toMatch(/overflow:auto/);expect(table).not.toMatch(/max-height/);
 });
 it('the details pane is a bounded flex column whose content scrolls in its own area',()=>{
  const section=rule(details,'.symbol-details')!;
  expect(section).toMatch(/display:flex/);expect(section).toMatch(/flex-direction:column/);expect(section).toMatch(/flex:0 1 auto/);expect(section).not.toMatch(/padding/);
  expect(rule(details,'.symbol-details-scroll')).toMatch(/overflow:auto/);
  expect(rule(details,'.symbol-details-scroll')).toMatch(/flex:1 1 0/);
  // Size containment: the blocks never set the pane's minimum, so it cannot outgrow the panel.
  expect(rule(details,'.symbol-details-docked .symbol-details-scroll')).toMatch(/contain:size/);
  expect(rule(details,'.symbol-details-docked .symbol-details-scroll')).toMatch(/min-height:0/);
  expect(rule(details,'.symbol-details-content>header')).toMatch(/flex:none/);
  expect(rule(details,'.symbol-details-collapsed')).toMatch(/flex:none/);
  const divider=rule(details,'.symbol-details-divider')!;expect(divider).toMatch(/cursor:row-resize/);expect(divider).toMatch(/flex:none/);expect(divider).toMatch(/touch-action:none/);
  expect(rule(details,'.symbol-details:not(.symbol-details-docked)')).toMatch(/overflow:auto/);
 });
 it('the watchlist panel docks the details below the list and persists the split in the watch book',()=>{
  expect(panel.indexOf('aria-label="Watchlist symbols"')).toBeGreaterThan(0);
  expect(panel.indexOf('<SymbolDetails')).toBeGreaterThan(panel.indexOf('aria-label="Watchlist symbols"'));
  expect(panel).toMatch(/<SymbolDetails pane=\{props\.book\.detailPane\} onPane=\{pane=>\{try\{change\(restoreWatchBook\(\{\.\.\.latest\.current\.book,detailPane:pane\}\)\);return true;\}catch\{return false;\}\}\}/);
 });
});

describe('SymbolDetails split structure',()=>{
 it('docked: sized section, divider first, header outside the scrolling blocks',()=>{
  const h=harness({height:280,collapsed:false}),root=h.render();
  expect(cls(root,'symbol-details-docked')).toBe(true);expect(root.props.style).toEqual({height:280});
  const [divider,content]=root.props.children;
  expect(divider.props.role).toBe('separator');expect(divider.props['aria-orientation']).toBe('horizontal');expect(divider.props.tabIndex).toBe(0);expect(divider.props['aria-valuenow']).toBe(280);
  expect(cls(content,'symbol-details-content')).toBe(true);
  const header=find(content,node=>node.type==='header'),scroll=find(content,node=>cls(node,'symbol-details-scroll'));
  expect(find(header,node=>cls(node,'symbol-details-scroll'))).toBeNull();
  expect(text(scroll)).toContain('Last supplied close');expect(text(header)).not.toContain('Last supplied close');
  expect(find(header,node=>node.type==='button'&&text(node)==='Expand details')).toBeTruthy();
 });
 it('collapsing gives the list the full height: no fixed height, no divider, no blocks; showing restores it',()=>{
  const h=harness({height:280,collapsed:false});
  find(h.render(),node=>node.props?.['aria-label']==='Collapse details pane').props.onClick();
  expect(h.saved).toEqual([{height:280,collapsed:true}]);
  const root=h.render();expect(cls(root,'symbol-details-collapsed')).toBe(true);expect(root.props.style).toBeUndefined();
  expect(find(root,node=>node.props?.role==='separator')).toBeNull();expect(find(root,node=>cls(node,'symbol-details-scroll'))).toBeNull();
  expect(text(root)).toContain('GME');expect(text(root)).not.toContain('Last supplied close');
  const show=find(root,node=>node.props?.['aria-label']==='Show details pane');expect(show.props['aria-expanded']).toBe(false);show.props.onClick();
  expect(h.saved[1]).toEqual({height:280,collapsed:false});expect(h.render().props.style).toEqual({height:280});
 });
 it('separator keys resize within the measured panel and do not reach the list handlers',()=>{
  const h=harness({height:300,collapsed:false}),divider=()=>find(h.render(),node=>node.props?.role==='separator');
  const panel=laidOut(400,300,90),up=panel.event('ArrowUp');divider().props.onKeyDown(up);
  expect(h.saved.at(-1)).toEqual({height:316,collapsed:false});expect(up.stopped).toBe(true);expect(up.defaultPrevented).toBe(true);
  divider().props.onKeyDown(laidOut(400,300,90).event('Home'));expect(h.saved.at(-1)).toEqual({height:700-120,collapsed:false});
  divider().props.onKeyDown(laidOut(400,300,90).event('End'));expect(h.saved.at(-1)!.height).toBe(90+DETAIL_PANE_LIMITS.divider);
  const other=laidOut(400,300,90).event('x');const count=h.saved.length;divider().props.onKeyDown(other);expect(h.saved).toHaveLength(count);expect(other.stopped).toBe(false);
  const enter=laidOut(400,300,90).event('Enter');divider().props.onKeyDown(enter);expect(h.saved.at(-1)!.collapsed).toBe(true);expect(enter.stopped).toBe(true);
 });
 it('a rejected layout save reports it and keeps the previous split',()=>{
  const h=harness({height:300,collapsed:false},false);
  find(h.render(),node=>node.props?.['aria-label']==='Collapse details pane').props.onClick();
  const root=h.render();expect(root.props.style).toEqual({height:300});expect(text(find(root,node=>node.props?.role==='alert'))).toBe('The details pane layout was not saved.');
 });
 it('without onPane the details stay undocked (no divider, no toggle)',()=>{
  const h=harness();h.unpaned();const root=h.render();
  expect(cls(root,'symbol-details-docked')).toBe(false);expect(root.props.style).toBeUndefined();
  expect(find(root,node=>node.props?.role==='separator')).toBeNull();expect(find(root,node=>cls(node,'symbol-details-toggle'))).toBeNull();
 });
});
