import {beforeEach,describe,expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {ChartContextMenu,chartMenuEntries,indicatorMenuEntries} from '../../src/ui/ChartContextMenu';
import {cursorTimeLock} from '../../src/ui/cursor-time-lock';
import {legendMoreMenu,indicatorOrderState,indicatorOrderAfter,indicatorVisualOrderAvailable,isIndicatorPermutation,visualOrderItems,createIndicatorClipboard,indicatorPasteSettings,indicatorCopiedMessage} from '../../src/chart/legend-model';
import type {ChartContextActions,ChartMenuSnapshot,RootChartMenuAction} from '../../src/chart/context-menu';

// The chart menu on a clicked indicator plot and on the candles, the new
// chart-body rows, and the legend Visual order and Copy model. Controlled React hooks; no DOM, no launch. SYNTHETIC values only.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 const useState=(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]=typeof initial==='function'?initial():initial;return[hooks.cells[index],(value:any)=>{hooks.cells[index]=typeof value==='function'?value(hooks.cells[index]):value;}];};
 const useRef=(initial:any)=>{const index=hooks.cursor++;if(!(index in hooks.cells))hooks.cells[index]={current:initial};return hooks.cells[index];};
 const useMemo=(fn:()=>any,deps:any[])=>{const index=hooks.cursor++,old=hooks.cells[index];if(!old||deps.some((v,i)=>!Object.is(v,old.deps[i])))hooks.cells[index]={deps,value:fn()};return hooks.cells[index].value;};
 const useEffect=()=>{};
 const mocked={useState,useRef,useMemo,useEffect,useCallback:(fn:any,deps:any[])=>useMemo(()=>fn,deps)};
 return{...actual,...mocked,default:{...actual.default,...mocked}};
});
function find(node:any,test:(node:any)=>boolean):any{if(Array.isArray(node)){for(const child of node){const found=find(child,test);if(found)return found;}}else if(node?.props){if(test(node))return node;return find(node.props.children,test);}return null;}
function all(node:any,test:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(node))node.forEach(child=>all(child,test,out));else if(node?.props){if(test(node))out.push(node);all(node.props.children,test,out);}return out;}
function text(node:any):string{return typeof node==='string'?node:Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;cursorTimeLock.clear();vi.stubGlobal('window',{innerWidth:1200,innerHeight:800});vi.stubGlobal('document',{activeElement:null,addEventListener(){},removeEventListener(){}});});

const view=(id:string,kind:string,paneId:string|null,extra:Record<string,unknown>={})=>({id,kind,rendererId:'native-'+id,paneId,visible:true,inputs:{},plots:{},offset:0,...extra});
function snapshot(entity:ChartMenuSnapshot['entity'],rows=[view('rsi','rsi','pane-a'),view('sma','sma','price'),view('ema','ema','price')],over:{price?:number|null;candleVisible?:boolean}={}):ChartMenuSnapshot{
 const price=over.price===undefined?99.5:over.price;
 const panes=[{id:'price',kind:'price',indicators:[{id:'native-sma'},{id:'native-ema'}]},{id:'native-pane-a',kind:'study',indicators:[{id:'native-rsi'}]}];
 return{cellId:'cell-1',entity,point:{price,unit:'price',pane:{kind:'price'},logical:1,barIndex:1,barTime:price===null?null:2},instrument:{symbol:'GME',tickSize:0.01},input:{bars:[{time:1,open:98,high:99,low:97,close:98,volume:1},{time:2,open:98,high:99,low:97,close:98,volume:1}],source:{},style:'candles'},client:{x:10,y:10},
  controller:{contextMenu:{isCurrent:()=>true,handoff:(value:unknown)=>({snapshot:value,isCurrent:()=>true,isOwnerCurrent:()=>true,release(){}})},indicators:{list:()=>rows,scaleChoices:()=>[]},chart:{panes:{list:()=>panes},renderer:{get:(key:string)=>key==='candleVisible'?over.candleVisible??true:undefined}},priceScale:{settings:()=>({mainSide:'right'})},drawingManager:{list:()=>[],orderState:()=>null}}} as unknown as ChartMenuSnapshot;
}
const every=(ids:RootChartMenuAction[]):ChartContextActions=>Object.fromEntries(ids.map(id=>[id,()=>true]));
const INDICATOR_ACTIONS:RootChartMenuAction[]=['indicator-alert','indicator-add-on','indicator-order','indicator-intervals','indicator-move','indicator-pin','indicator-copy','indicator-hide','indicator-remove','objects','indicator-settings'];

describe(' indicator menu on a clicked plot',()=>{
 it('lists the legend More rows in order, grouped by its separators, without favorite or hotkey hints',()=>{
  const rows=chartMenuEntries(snapshot({kind:'indicator',id:'sma',rendererId:'native-sma'}),every(INDICATOR_ACTIONS));
  expect(rows.map(row=>[row.label,row.group])).toEqual([['Add alert on SMA…',0],['Add indicator/strategy on SMA…',0],['Visual order',1],['Visibility on intervals',1],['Move to',1],['Pin to scale (now right)',1],['Copy',2],['Hide',2],['Remove',2],['Object tree',3],['Settings…',4]]);
  expect(rows.every(row=>row.hint===undefined)).toBe(true);
  // Pin to scale lists the placements the renderer can take (left and no scale are not offered by this synthetic renderer).
  expect(rows.find(row=>row.action==='indicator-pin')!.children!.map(child=>[child.id,!!child.checked])).toEqual([['pin-shared',true],['pin-own',false]]);
 });
 it('Visual order offers only the steps that move it on its pane; a lone indicator has no Visual order',()=>{
  const sma=chartMenuEntries(snapshot({kind:'indicator',id:'sma',rendererId:'native-sma'}),every(INDICATOR_ACTIONS)).find(row=>row.action==='indicator-order')!;
  expect(sma.children!.map(child=>child.id)).toEqual(['back','backward']);expect(sma).toMatchObject({submenu:true,submenuLabel:'Visual order'});
  const rsi=chartMenuEntries(snapshot({kind:'indicator',id:'rsi',rendererId:'native-rsi'}),every(INDICATOR_ACTIONS));
  expect(rsi.some(row=>row.action==='indicator-order')).toBe(false);
  expect(rsi.find(row=>row.action==='indicator-move')!.children!.map(child=>child.label)).toEqual(['New pane above','New pane below','Existing pane above']);
 });
 it('leaves out rows without a handler, shows Show for a hidden indicator, and nothing for a gone instance',()=>{
  const hidden=[view('sma','sma','price',{visible:false})];
  expect(chartMenuEntries(snapshot({kind:'indicator',id:'sma',rendererId:'native-sma'},hidden),every(['indicator-hide','indicator-settings'])).map(row=>row.label)).toEqual(['Show','Settings…']);
  expect(indicatorMenuEntries(snapshot({kind:'indicator',id:'sma',rendererId:'native-old'}),every(INDICATOR_ACTIONS))).toEqual([]);
  expect(indicatorMenuEntries(snapshot({kind:'chart'}),every(INDICATOR_ACTIONS))).toEqual([]);
 });
 it('the rendered submenu runs its parent action with the chosen item',async()=>{
  const calls:unknown[]=[];const actions:ChartContextActions={...every(INDICATOR_ACTIONS),'indicator-order':(_s,_l,options)=>{calls.push(options);return true;}};
  const value=snapshot({kind:'indicator',id:'ema',rendererId:'native-ema'});
  const render=()=>{hooks.cursor=0;return ChartContextMenu({snapshot:value,actions,onClose:()=>{},focusTarget:()=>({isConnected:true,focus(){}}) as unknown as HTMLElement});};
  const row=find(render(),node=>node.type==='button'&&text(node).startsWith('Visual order'));
  expect(row.props['aria-haspopup']).toBe('menu');row.props.onClick();
  const sub=find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Visual order');
  const items=all(sub,node=>node.type==='button');expect(items.map(text)).toEqual(['Bring to front','Bring forward']);
  await items[0].props.onClick();expect(calls).toEqual([{item:'front'}]);
 });
 it('hovering another submenu row switches the open submenu (one at a time)',()=>{
  const value=snapshot({kind:'indicator',id:'ema',rendererId:'native-ema'});
  const render=()=>{hooks.cursor=0;return ChartContextMenu({snapshot:value,actions:every(INDICATOR_ACTIONS),onClose:()=>{},focusTarget:()=>({isConnected:true,focus(){}}) as unknown as HTMLElement});};
  find(render(),node=>node.type==='button'&&text(node).startsWith('Visual order')).props.onMouseEnter();
  expect(find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Visual order')).not.toBeNull();
  find(render(),node=>node.type==='button'&&text(node).startsWith('Move to')).props.onMouseEnter();
  expect(find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Visual order')).toBeNull();
  expect(find(render(),node=>node.props?.role==='menu'&&node.props['aria-label']==='Move to')).not.toBeNull();
 });
});

describe(' main series rows and chart-body rows',()=>{
 const BODY:RootChartMenuAction[]=['theme','price-alert','hline','watchlist-add','hide-marks','note','series-pin','series-hide','indicator-paste'];
 it('the candles add Pin to scale and Hide; the body does not',()=>{
  const series=chartMenuEntries(snapshot({kind:'series',owner:'main'}),every(BODY));
  expect(series.slice(-3).map(row=>[row.action,row.label])).toEqual([['series-pin','Pin to scale (now right)'],['series-hide','Hide'],['theme','Settings…']]);
  expect(series.find(row=>row.action==='series-pin')!.children).toEqual([{id:'right',label:'Pinned to right scale',checked:true},{id:'left',label:'Pin to new left scale',checked:false}]);
  expect(chartMenuEntries(snapshot({kind:'series',owner:'main'},undefined,{candleVisible:false}),every(BODY)).find(row=>row.action==='series-hide')!.label).toBe('Show');
  expect(chartMenuEntries(snapshot({kind:'chart'}),every(BODY)).some(row=>row.action==='series-pin'||row.action==='series-hide')).toBe(false);
 });
 it('adds Add GME to watchlist, Draw horizontal line at the clicked price, and Hide or Show marks on bars',()=>{
  const labels=(extras?:Parameters<typeof chartMenuEntries>[5])=>chartMenuEntries(snapshot({kind:'chart'}),every(BODY),null,undefined,cursorTimeLock,extras).map(row=>row.label);
  expect(labels({marksHidden:false,clip:null})).toEqual(['Add alert at 99.50','Draw horizontal line at 99.50','Add GME to watchlist','Instrument note','Hide marks on bars','Settings…']);
  expect(labels({marksHidden:true,clip:null})).toContain('Show marks on bars');
  expect(labels({marksHidden:false,clip:{kind:'rsi',title:'RSI',settings:{inputs:{},plots:{},offset:0}}})).toContain('Paste RSI');
  expect(chartMenuEntries(snapshot({kind:'chart'},undefined,{price:null}),every(BODY)).some(row=>row.action==='hline')).toBe(false);
 });
 it('the menu source has no dash punctuation',()=>{
  for(const file of ['src/ui/ChartContextMenu.tsx','src/chart/context-menu.ts','src/chart/legend-model.ts','src/ui/object-tree-model.ts','src/ui/ObjectTreePanel.tsx','src/ui/keyboard-shortcuts.ts'])expect(readFileSync(file,'utf8'),file).not.toMatch(/[\u2013\u2014]/);
 });
});

describe(' legend Visual order and Copy model',()=>{
 const rows=[{id:'a',paneId:'price'},{id:'r',paneId:'p1'},{id:'b',paneId:'price'},{id:'c',paneId:'price'},{id:'u',paneId:null}];
 it('orders among the indicators of one pane and keeps the other slots',()=>{
  expect(indicatorOrderState(rows,'a')).toEqual({front:true,forward:true,back:false,backward:false});
  expect(indicatorOrderState(rows,'c')).toEqual({front:false,forward:false,back:true,backward:true});
  expect(indicatorOrderState(rows,'r')).toEqual({front:true,forward:true,back:true,backward:true});
  expect(indicatorOrderState(rows,'missing')).toBeNull();
  expect(indicatorOrderAfter(rows,'c','front')).toEqual(['c','r','a','b','u']);
  expect(indicatorOrderAfter(rows,'a','back')).toEqual(['b','r','c','a','u']);
  expect(indicatorOrderAfter(rows,'b','forward')).toEqual(['b','r','a','c','u']);
  expect(indicatorOrderAfter(rows,'b','backward')).toEqual(['a','r','c','b','u']);
  expect(indicatorOrderAfter(rows,'a','front')).toBeNull();expect(indicatorOrderAfter(rows,'u','back')).toBeNull();
  expect(indicatorVisualOrderAvailable(rows,'a')).toBe(true);expect(indicatorVisualOrderAvailable(rows,'r')).toBe(false);expect(indicatorVisualOrderAvailable(rows,'u')).toBe(false);
  expect(visualOrderItems(indicatorOrderState(rows,'a')).map(item=>[item.label,!!item.disabled])).toEqual([['Bring to front',true],['Send to back',false],['Bring forward',true],['Send backward',false]]);
  expect(isIndicatorPermutation(rows,['u','c','b','r','a'])).toBe(true);expect(isIndicatorPermutation(rows,['a','a','b','c','u'])).toBe(false);expect(isIndicatorPermutation(rows,['a'])).toBe(false);
 });
 it('the legend shows Visual order and Copy once the host connects them',()=>{
  const menu=(routes:Record<string,boolean>)=>legendMoreMenu('indicator',{surface:'legend',title:'RSI',value:null,hidden:false,favorite:false,routes}).flatMap(row=>row.kind==='item'?[row.id]:[]);
  expect(menu({})).not.toContain('copy');expect(menu({})).not.toContain('visualOrder');
  expect(menu({copy:true,visualOrder:true})).toEqual(['alert','addIndicator','favorite','visualOrder','intervals','moveTo','pinToScale','copy','hide','remove','objectTree','settings']);
 });
 it('the indicator clipboard copies settings only, and each paste is a fresh shown copy',()=>{
  const board=createIndicatorClipboard(),seen=vi.fn();board.subscribe(seen);
  const source={id:'x1',kind:'rsi' as const,inputs:{length:14},plots:{rsi:{color:'#123456'}},offset:2,visible:false,paneId:'p1'} as any;
  const clip=board.copy(source,'RSI');
  expect(clip).toEqual({kind:'rsi',title:'RSI',settings:{inputs:{length:14},plots:{rsi:{color:'#123456'}},offset:2}});expect(seen).toHaveBeenCalledOnce();
  source.inputs.length=99;expect(board.get()!.settings.inputs).toEqual({length:14});
  const first=indicatorPasteSettings(clip),second=indicatorPasteSettings(clip);
  expect(first).toEqual({inputs:{length:14},plots:{rsi:{color:'#123456'}},offset:2,visible:true});expect(first.inputs).not.toBe(second.inputs);
  expect(Object.keys(first)).not.toContain('id');expect(Object.keys(first)).not.toContain('paneId');
  expect(indicatorCopiedMessage('RSI')).toBe('RSI copied. Right-click a chart and choose Paste RSI to add it.');
  board.clear();expect(board.get()).toBeNull();
 });
});
