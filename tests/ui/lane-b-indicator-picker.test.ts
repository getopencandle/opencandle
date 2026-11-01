import {beforeEach,describe,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {IndicatorSettings} from '../../src/ui/IndicatorDialog';
import {catalogKeywords} from '../../src/domain/indicator-catalog';
import {filterIndicatorCatalog,indicatorNames,indicatorAcronyms,highlightSegments,pickerWindow,scrollToRow,stepListActive,PICKER_WINDOW_THRESHOLD,PICKER_ROW_HEIGHT} from '../../src/ui/indicator-dialog-model';

// Picker rebuild: keyboard navigation, search highlight, add without closing, the settings card and the compact
// legend window. Handler-level evidence on the REAL indicator port (no DOM layout or GUI claim); the visual pass is separate.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});
const key=(name:string,extra:Record<string,unknown>={})=>({key:name,preventDefault:vi.fn(),...extra});
const search=(ui:ReturnType<typeof dialog>)=>find(ui.render(),node=>node.props?.['aria-label']==='Search indicators');
const rows=(ui:ReturnType<typeof dialog>)=>findAll(ui.render(),node=>String(node.props?.className??'').includes('indicator-catalog-row'));
const active=(ui:ReturnType<typeof dialog>)=>findAll(ui.render(),node=>node.props?.['data-active']==='true');

describe('picker keyboard navigation',()=>{
 it('Down, Up, Home and End move one highlight; the search box names it; Enter adds it and the picker stays open',()=>{
  const ui=dialog(),list=rows(ui).map(row=>row.key as string);
  expect(list.length).toBeGreaterThan(50);expect(active(ui)).toHaveLength(0);
  search(ui).props.onKeyDown(key('ArrowDown'));expect(active(ui).map(row=>row.key)).toEqual([list[0]]);
  search(ui).props.onKeyDown(key('ArrowDown'));search(ui).props.onKeyDown(key('ArrowDown'));search(ui).props.onKeyDown(key('ArrowUp'));
  expect(active(ui).map(row=>row.key)).toEqual([list[1]]);
  expect(search(ui).props['aria-activedescendant']).toBe('lv-ind-row-'+list[1]);
  search(ui).props.onKeyDown(key('End'));expect(active(ui).map(row=>row.key)).toEqual([list.at(-1)]);
  search(ui).props.onKeyDown(key('Home'));expect(active(ui).map(row=>row.key)).toEqual([list[0]]);
  const enter=key('Enter');search(ui).props.onKeyDown(enter);
  expect(enter.preventDefault).toHaveBeenCalled();expect(ui.port.list().map(row=>row.kind)).toEqual([list[0]]);
  expect(ui.props.onClose).not.toHaveBeenCalled();
  expect(active(ui).map(row=>row.key),'the highlight stays for the next Enter').toEqual([list[0]]);
 });
 it('Home and End with a modifier stay with the text field',()=>{
  const ui=dialog(),event=key('End',{shiftKey:true});search(ui).props.onKeyDown(event);
  expect(event.preventDefault).not.toHaveBeenCalled();expect(active(ui)).toHaveLength(0);
 });
 it('pointer hover moves the same highlight, so the next arrow continues from it',()=>{
  const ui=dialog(),list=rows(ui);
  list[5].props.onMouseMove();expect(active(ui).map(row=>row.key)).toEqual([list[5].key]);
  search(ui).props.onKeyDown(key('ArrowDown'));expect(active(ui).map(row=>row.key)).toEqual([list[6].key]);
 });
 it('catalog rows are not tab stops and a pointer press keeps focus in the search box',()=>{
  const ui=dialog(),add=find(ui.render(),node=>node.props?.['aria-label']==='Add Simple Moving Average'),star=find(ui.render(),node=>node.props?.['aria-label']==='Favorite Simple Moving Average');
  for(const button of [add,star]){expect(button.props.tabIndex).toBe(-1);const press={preventDefault:vi.fn()};button.props.onMouseDown(press);expect(press.preventDefault).toHaveBeenCalled();}
 });
 it('selector entries (Strategies) take the same keys and Enter opens the highlighted entry',()=>{
  const ui=dialog(),open=vi.fn();Object.assign(ui.props,{scripts:[{id:'s-1',name:'Synthetic alpha strategy',kind:'strategy'},{id:'s-2',name:'Synthetic beta strategy',kind:'strategy'}],onOpenScript:open});
  find(ui.render(),node=>node.props?.role==='tab'&&text(node)==='Strategies').props.onClick();
  search(ui).props.onKeyDown(key('ArrowDown'));search(ui).props.onKeyDown(key('ArrowDown'));
  const highlighted=active(ui);expect(highlighted.map(node=>node.props['data-selector-entry'])).toEqual(['s-2']);
  expect(search(ui).props['aria-activedescendant']).toBe(highlighted[0].props.id);
  search(ui).props.onKeyDown(key('Enter'));expect(open).toHaveBeenCalledWith('s-2');
 });
});

describe('picker search',()=>{
 it('filters as you type and marks the matched text in each name',()=>{
  const ui=dialog();search(ui).props.onChange({target:{value:'moving exp'}});
  const names=rows(ui).map(row=>text(find(row,node=>node.props?.className==='indicator-catalog-name')));
  expect(names).toContain('Exponential Moving Average (EMA)');
  const name=find(ui.render(),node=>node.props?.className==='indicator-catalog-name'&&text(node)==='Exponential Moving Average (EMA)');
  expect(findAll(name,node=>node.type==='mark').map(text)).toEqual(['Exp','Moving']);
 });
 it('with a query and no arrow press, the first match is marked as the Enter target',()=>{
  const ui=dialog();search(ui).props.onChange({target:{value:'bollinger'}});
  expect(findAll(ui.render(),node=>node.props?.['data-default']==='true').map(row=>row.key)).toEqual([rows(ui)[0].key]);
  search(ui).props.onKeyDown(key('ArrowDown'));expect(findAll(ui.render(),node=>node.props?.['data-default']==='true')).toHaveLength(0);
 });
 it('shows the empty-search state and a Clear search control that restores the list',()=>{
  const ui=dialog(),all=rows(ui).length;search(ui).props.onChange({target:{value:'zzzz'}});
  expect(rows(ui)).toHaveLength(0);expect(text(find(ui.render(),node=>node.props?.className==='lv-picker-empty'))).toBe('No matching indicators.');
  find(ui.render(),node=>node.props?.['aria-label']==='Clear search').props.onClick();
  expect(search(ui).props.value).toBe('');expect(rows(ui)).toHaveLength(all);
 });
 it('Favorites is a sidebar entry; it lists starred indicators with a filled star',()=>{
  const ui=dialog();const favorites=()=>find(ui.render(),node=>node.type==='button'&&text(node)==='Favorites');
  favorites().props.onClick();expect(favorites().props['aria-pressed']).toBe(true);
  expect(text(ui.render())).toContain('No favorites yet. Star an indicator in Technicals to list it here.');
  expect(find(ui.render(),node=>node.props?.['data-qa']==='indicator-sidebar-item-built-ins').props['aria-pressed']).toBe(false);
  find(ui.render(),node=>node.props?.['data-qa']==='indicator-sidebar-item-built-ins').props.onClick();
  ui.click('Favorite Relative Strength Index');favorites().props.onClick();
  expect(rows(ui).map(row=>row.key)).toEqual(['rsi']);
  const star=find(ui.render(),node=>node.props?.['aria-label']==='Unfavorite Relative Strength Index');
  expect(find(star,node=>node.type==='svg').props.className).toContain('lv-star-filled');
 });
});

describe('add without closing',()=>{
 it('each Add keeps the picker open and replays a transient confirmation',()=>{
  const ui=dialog();
  ui.click('Add Simple Moving Average');
  const status=()=>find(ui.render(),node=>node.props?.role==='status');
  const first=status();expect(first.props.className).toBe('lv-picker-toast');expect(text(first)).toContain('Simple Moving Average added');
  ui.click('Add Simple Moving Average');
  expect(status().key).not.toBe(first.key);expect(text(status())).toContain('Simple Moving Average added (2 on chart)');
  expect(ui.props.onClose).not.toHaveBeenCalled();expect(findAll(ui.render(),node=>node.type===IndicatorSettings)).toHaveLength(0);
  expect(text(find(ui.render(),node=>node.props?.['data-count-remove']==='sma'))).toBe('2 on chart');
 });
});

describe('settings card and compact window',()=>{
 it('Edit on On this chart opens the settings card over an inert picker; Escape and the close control return to the list',()=>{
  const ui=dialog({seed:['sma']}),labelText=ui.labels().get(ui.ids[0])!;
  ui.click('Edit '+labelText);
  const tree=ui.render(),card=find(tree,node=>node.props?.className==='lv-picker-settings');
  expect(card.props['aria-label']).toBe('Settings: '+labelText);
  expect(findAll(card,node=>node.type===IndicatorSettings)).toHaveLength(1);
  expect(find(tree,node=>node.props?.className==='lv-picker-body').props.inert).toBe(true);
  const escape={key:'Escape',stopPropagation:vi.fn(),nativeEvent:{isComposing:false}};
  find(tree,node=>node.props?.className==='lv-picker-settings-shade').props.onKeyDown(escape);
  expect(escape.stopPropagation,'Escape closes only the card, not the picker').toHaveBeenCalled();
  expect(ui.selected()).toBeNull();expect(ui.props.onClose).not.toHaveBeenCalled();
  expect(find(ui.render(),node=>node.props?.className==='lv-picker-body').props.inert).toBeUndefined();
  ui.click('Edit '+labelText);expect(ui.selected()).toBe(ui.ids[0]);
  ui.click('Close settings: '+labelText);expect(ui.selected()).toBeNull();
 });
 it('the legend gear route (compact) is a separate settings window with tabs, Defaults, Cancel and Ok',()=>{
  const ui=dialog({seed:['sma'],initialSelected:0});ui.props.compact=true;
  const tree=ui.render();
  expect(tree.props.title).toBe('Settings: '+ui.labels().get(ui.ids[0]));
  expect(findAll(tree,node=>node.props?.className==='lv-picker-body')).toHaveLength(0);
  expect(find(tree,node=>node.type==='fieldset').props.className).toBe('lv-indicator-compact');
  for(const name of ['Inputs','Style','Visibility','Cancel','OK','Reset settings','Save as default'])expect(ui.sButton(name).type).toBe('button');
  expect(ui.sText()).toContain('Defaults');expect(()=>ui.sButton('Placement'),'the compact window has no Placement tab').toThrow();
 });
 it('instance row controls are icon buttons that keep their names',()=>{
  const ui=dialog({seed:['rsi']}),name=ui.labels().get(ui.ids[0])!;
  for(const label of ['Hide '+name,'Remove '+name]){const button=find(ui.render(),node=>node.props?.['aria-label']===label);expect(text(button)).toBe('');expect(findAll(button,node=>node.type==='svg')).toHaveLength(1);}
  ui.click('Hide '+name);expect(ui.port.list()[0].visible).toBe(false);expect(find(ui.render(),node=>node.props?.['aria-label']==='Show '+name).props['data-hidden']).toBe('true');
 });
});

describe('picker model helpers',()=>{
 it('highlightSegments marks every term, merges overlaps and ignores case',()=>{
  expect(highlightSegments('Simple Moving Average','mov  AVER')).toEqual([{text:'Simple ',match:false},{text:'Mov',match:true},{text:'ing ',match:false},{text:'Aver',match:true},{text:'age',match:false}]);
  expect(highlightSegments('Average','av ave')).toEqual([{text:'Ave',match:true},{text:'rage',match:false}]);
  expect(highlightSegments('RSI','')).toEqual([{text:'RSI',match:false}]);
 });
 it('pickerWindow renders short lists whole and long lists near the viewport with matching spacers',()=>{
  expect(pickerWindow(PICKER_WINDOW_THRESHOLD,5000,320)).toEqual({start:0,end:PICKER_WINDOW_THRESHOLD,before:0,after:0,windowed:false});
  const count=1000,view=pickerWindow(count,100*PICKER_ROW_HEIGHT,320);
  expect(view.windowed).toBe(true);expect(view.start).toBe(92);expect(view.end).toBe(118);
  expect(view.before+(view.end-view.start)*PICKER_ROW_HEIGHT+view.after).toBe(count*PICKER_ROW_HEIGHT);
  expect(pickerWindow(count,10**9,320).end).toBe(count);expect(pickerWindow(count,NaN,320).start).toBe(0);
 });
 it('scrollToRow brings a row fully into view and leaves a visible row alone',()=>{
  expect(scrollToRow(0,64,320)).toBe(0);expect(scrollToRow(20,0,320)).toBe(21*32-320);expect(scrollToRow(5,0,320)).toBe(0);
 });
 it('stepListActive steps over string keys like the catalog step',()=>{
  expect(stepListActive(['a:1','b:2'],null,'ArrowDown')).toBe('a:1');expect(stepListActive(['a:1','b:2'],'a:1','End')).toBe('b:2');
 });
});

describe('search ranking and short-name highlight',()=>{
 const all=Object.keys(indicatorNames) as any[];
 const order=(query:string)=>filterIndicatorCatalog(all,'All',[],query).rows;
 it('exact short name or name first, then prefix, then word start, then substring',()=>{
  const rsi=order('rsi');expect(rsi[0]).toBe('rsi');
  const crsi=rsi.indexOf('connorsrsi' as any);if(crsi>=0)expect(crsi).toBeGreaterThan(0);
  expect(order('relative strength index')[0]).toBe('rsi');
  // Word starts count in the name, short name, id and catalog keywords (the fields the search matches); the newer catalog
  // entries carry keywords whose words start with these queries.
  const rank=(kind:any,q:string)=>{const n=indicatorNames[kind as keyof typeof indicatorNames].toLowerCase(),a=indicatorAcronyms[kind as keyof typeof indicatorAcronyms].toLowerCase(),words=[n,a,String(kind).toLowerCase(),catalogKeywords(kind).toLowerCase()];return a===q||n===q?0:n.startsWith(q)||a.startsWith(q)?1:words.some(field=>field.split(/[^a-z0-9]+/).some((w:string)=>w.startsWith(q)))?2:3;};
  for(const q of ['rsi','ma','vol','bb']){const ranks=order(q).map(kind=>rank(kind,q));expect(ranks).toEqual([...ranks].sort((a,b)=>a-b));}
 });
 it('highlights matches in the short name as well as the name',()=>{
  const ui=dialog();search(ui).props.onChange({target:{value:'rsi'}});
  const strong=findAll(ui.render(),node=>String(node.props?.className??'')==='indicator-catalog-acronym');
  expect(strong.length).toBeGreaterThan(0);expect(findAll(strong[0],node=>node.type==='mark')).toHaveLength(1);
  // Relative Strength Index carries "(RSI)" in its name, which is marked, and has no separate short-title column.
  const rsi=find(ui.render(),node=>node.type==='button'&&node.props?.['aria-label']==='Add Relative Strength Index');
  expect(findAll(rsi,node=>node.type==='strong')).toEqual([]);
  expect(findAll(rsi,node=>node.type==='mark').map(text)).toEqual(['RSI']);
 });
 it('the On this chart help sentence is a tooltip on the section header, also described by hidden text',()=>{
  const ui=dialog({seed:['atr']});const head=find(ui.render(),node=>node.type==='h3'&&node.props?.children==='On this chart');
  expect(head.props.title).toBe('Show, Hide and Remove apply immediately. Cancel does not undo them.');
  const note=find(ui.render(),node=>node.props?.id===head.props['aria-describedby']);expect(text(note)).toBe(head.props.title);
 });
});
