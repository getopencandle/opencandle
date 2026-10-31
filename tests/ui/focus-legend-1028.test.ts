import {describe,expect,it,vi} from 'vitest';
import {isChartForwardKey,forwardableFocus} from '../../src/ui/chart-key-forward';
import {backdropCloses} from '../../src/ui/Modal';
import {tooltipParts,tooltipPosition} from '../../src/ui/toolbar-tooltip';
import {isLegendMenuKey,legendRowMenuProps} from '../../src/ui/legend-row-menu';
import {replayStartLabel} from '../../src/ui/ReplayPanel';
import {ChartTradingButtons,createActivationGuard,type ChartTradingButtonsProps} from '../../src/ui/ChartTradingButtons';
import {activeWatchList,addWatchList,createWatchBook,selectWatchList} from '../../src/watchlists/model';
import {watchRowMenu} from '../../src/watchlists/menus';

const key=(k:string,mods:Partial<Record<'ctrlKey'|'altKey'|'shiftKey'|'metaKey',boolean>>={})=>({key:k,ctrlKey:false,altKey:false,shiftKey:false,metaKey:false,...mods});
const focusOn=(tag:string,owning:string[]=[],plain=true)=>({tagName:tag,matches:()=>plain,closest:(selector:string)=>owning.some(part=>selector.includes(part))?{}:null});
describe('chart keys from a plain toolbar button reach the chart',()=>{
 it('forwards arrows, zoom and Home/End, never Space, Enter, Escape or Delete',()=>{
  for(const k of ['ArrowLeft','ArrowRight','+','=','-','_','Home','End'])expect(isChartForwardKey(key(k))).toBe(true);
  expect(isChartForwardKey(key('ArrowLeft',{shiftKey:true}))).toBe(true);expect(isChartForwardKey(key('ArrowUp',{ctrlKey:true}))).toBe(true);
  for(const k of [' ','Enter','Escape','Delete','a','ArrowUp'])expect(isChartForwardKey(key(k))).toBe(false);
  expect(isChartForwardKey(key('+',{ctrlKey:true}))).toBe(false);expect(isChartForwardKey({...key('ArrowLeft'),isComposing:true})).toBe(false);
 });
 it('only from buttons, links and the page body; lists, menus, toolbars, fields and dialogs keep their keys',()=>{
  expect(forwardableFocus(null)).toBe(true);expect(forwardableFocus(focusOn('BODY'))).toBe(true);
  expect(forwardableFocus(focusOn('BUTTON'))).toBe(true);
  expect(forwardableFocus(focusOn('DIV',[],false))).toBe(false);// the watchlist table, a focusable div
  for(const owner of ['input','[role=menu]','[role=toolbar]','[role=listbox]','[role=dialog]','.wl-table','[role=application]'])expect(forwardableFocus(focusOn('BUTTON',[owner]))).toBe(false);
 });
});
describe('dialog backdrop',()=>{
 it('closes only for a primary press that starts and ends on the shade',()=>{
  const shade={} as EventTarget,inner={} as EventTarget;
  expect(backdropCloses(shade,shade,shade,0)).toBe(true);
  expect(backdropCloses(inner,shade,shade,0)).toBe(false);// a drag out of the dialog
  expect(backdropCloses(shade,inner,shade,0)).toBe(false);expect(backdropCloses(shade,shade,shade,2)).toBe(false);expect(backdropCloses(null,shade,shade,0)).toBe(false);
 });
});
describe('toolbar tooltips',()=>{
 it('splits a trailing hotkey, reads aria-keyshortcuts, then the toolbar map',()=>{
  expect(tooltipParts('Undo (Ctrl+Z)',null,'Undo')).toEqual({text:'Undo',hotkey:'Ctrl + Z'});
  expect(tooltipParts('Trend tools: Trendline','Alt+T',null)).toEqual({text:'Trend tools: Trendline',hotkey:'Alt + T'});
  expect(tooltipParts('Indicators',null,'Indicators')).toEqual({text:'Indicators',hotkey:'/'});
  expect(tooltipParts('Compare or add symbol',null,'Compare')).toEqual({text:'Compare or add symbol',hotkey:null});
  expect(tooltipParts('Favorite (Right arrow from the tool)',null,null).hotkey).toBeNull();
 });
 it('sits below a top toolbar button and right of a drawing tool, inside the viewport',()=>{
  const anchor={left:100,top:10,right:140,bottom:40,width:40,height:30},tip={width:80,height:24},view={width:1000,height:800};
  expect(tooltipPosition(anchor,tip,view,'below')).toEqual({left:80,top:46});
  expect(tooltipPosition(anchor,tip,view,'right')).toEqual({left:146,top:13});
  expect(tooltipPosition({...anchor,left:990,right:1000},tip,view,'below').left).toBe(916);
 });
});
describe('legend row context menu',()=>{
 it('right-click and ContextMenu / Shift+F10 open the row menu; clicks inside a menu are left alone',()=>{
  const open=vi.fn(),props=legendRowMenuProps(open),event=(target:unknown,extra={})=>({defaultPrevented:false,target,preventDefault:vi.fn(),stopPropagation:vi.fn(),nativeEvent:{isComposing:false},...extra}) as never;
  const plain={closest:()=>null},inMenu={closest:()=>({})};
  props.onContextMenu(event(plain));expect(open).toHaveBeenCalledTimes(1);
  props.onContextMenu(event(inMenu));expect(open).toHaveBeenCalledTimes(1);
  props.onKeyDown(event(plain,{...key('F10',{shiftKey:true})}));expect(open).toHaveBeenCalledTimes(2);
  props.onKeyDown(event(plain,key('F10')));expect(open).toHaveBeenCalledTimes(2);
  expect(isLegendMenuKey(key('ContextMenu'))).toBe(true);
 });
});
describe('replay start label',()=>{
 it('uses the crosshair time label format',()=>{
  const t=Date.UTC(2025,6,8)/1000;
  expect(replayStartLabel(t,'UTC','1D')).toBe("Tue 8 Jul '25");
  expect(replayStartLabel(t+14*3600+30*60,'UTC','60')).toBe("Tue 8 Jul '25 14:30");
 });
});
describe('chart Buy and Sell when refused',()=>{
 const base:ChartTradingButtonsProps={visible:true,legend:'normal',legendBottom:60,quote:{bid:1,ask:2},digits:2,presetName:null,presetTooltip:null,oneClick:false,onBuy:()=>true,onSell:()=>true,guard:createActivationGuard()};
 const find=(tree:any):any[]=>Array.isArray(tree)?tree.flatMap(find):tree?.props?[...(tree.type==='button'?[tree]:[]),...find(tree.props.children)]:[];
 it('reports the reason on click instead of a silent disabled button',()=>{
  const onRefused=vi.fn(),[,buy]=find(ChartTradingButtons({...base,disabledReason:'Wait for the workspace change to finish.',onRefused}));
  expect(buy.props.disabled).toBe(false);expect(buy.props['aria-disabled']).toBe(true);buy.props.onClick();expect(onRefused).toHaveBeenCalledWith('Wait for the workspace change to finish.');
  const [,plain]=find(ChartTradingButtons({...base,disabledReason:'Busy'}));expect(plain.props.disabled).toBe(true);
 });
});
describe('watchlist row menu without another list',()=>{
 it('shows one "No other custom list" row, and both groups once another list exists',()=>{
  const book=createWatchBook(['GME','SPY']),row=activeWatchList(book).rows.find(item=>item.kind==='symbol')!;
  const none=watchRowMenu({book,selected:[row.id],datasets:[],notes:false}).flatMap(group=>group.items).filter(item=>item.label==='No other custom list');
  expect(none).toHaveLength(1);
  const two=selectWatchList(addWatchList(book,'other','Other'),book.activeId),groups=watchRowMenu({book:two,selected:[row.id],datasets:[],notes:false}).map(group=>group.label);
  expect(groups).toContain('Copy to list');expect(groups).toContain('Move to list');
 });
});
