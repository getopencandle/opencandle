import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {IntervalMenu} from '../../src/ui/IntervalMenu';
import {fixtureDataset} from '../../src/domain/fixtures';
import {createIntervalMenuState} from '../../src/domain/intervals';
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
// Controlled handler tests. These do not exercise DOM rendering or native input.
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,startTransition:(fn:()=>void)=>fn() /* App commits range picks as transitions */,useDeferredValue:(value:any)=>value /* App defers the range-button inputs; the hook-cell mock has no React dispatcher */,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;},useMemo:(fn:()=>any)=>{hooks.cursor++;return fn();}};});
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function all(tree:any,predicate:(node:any)=>boolean,out:any[]=[]):any[]{if(Array.isArray(tree))tree.forEach(child=>all(child,predicate,out));else if(tree?.props){if(predicate(tree))out.push(tree);all(tree.props.children,predicate,out);}return out;}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});afterEach(()=>vi.unstubAllGlobals());
const setup=(over:Record<string,unknown>={})=>{
 const data=fixtureDataset('GME',5),props={datasets:[data],current:data,state:createIntervalMenuState(),onApply:vi.fn((..._a:unknown[])=>true),onEditMenu:vi.fn((..._a:unknown[])=>true),onAdvanced:vi.fn(),onClose:vi.fn(),...over};
 const render=()=>{hooks.cursor=0;return IntervalMenu(props as any);};
 return{data,props,render,radios:()=>all(render(),n=>n.props.role==='menuitemradio')};
};
it('is a role=menu with grouped sections and friendly labels',()=>{
 const {render,radios}=setup(),tree=render(),menu=all(tree,n=>n.props.role==='menu')[0];
 expect(menu.props['aria-label']).toBe('Chart intervals');
 const labels=radios().map(n=>text(n).replace('✓',''));
 expect(labels).toEqual(expect.arrayContaining(['1 minute','5 minutes','1 hour','2 hours','4 hours','1 day','1 week']));
 const headings=all(tree,n=>n.props.role==='presentation'||n.props['data-interval-group']!==undefined).map(text).join('|');
 // Weeks and Months are separate groups now (was one 'Weeks and months' group).
 for(const name of ['Minutes','Hours','Days','Weeks','Months'])expect(headings).toContain(name);
 expect(text(tree)).not.toMatch(/UTC|anchor|\u2014/);
});
it('checks only the current interval',()=>{
 const {radios,data}=setup(),checked=radios().filter(n=>n.props['aria-checked']===true);
 expect(checked.length).toBe(1);expect(text(checked[0])).toContain('1 day');
});
it('clicking a row switches immediately through onApply and closes',()=>{
 const {radios,props,data}=setup(),row=radios().find(n=>text(n)==='1 week')!;
 row.props.onClick();
 expect(props.onApply).toHaveBeenCalledOnce();expect((props.onApply.mock.calls[0][0] as any).resolution).toBe('1W');expect(data.resolution).toBe('1D');expect(props.onClose).toHaveBeenCalled();
});
it('refusal shows the reason inline, keeps the menu open and never applies',()=>{
 const {radios,props,render}=setup(),row=radios().find(n=>text(n)==='1 minute')!;
 row.props.onClick();
 expect(props.onApply).not.toHaveBeenCalled();expect(props.onClose).not.toHaveBeenCalled();
 expect(all(render(),n=>n.props.role==='alert').map(text).join('').length).toBeGreaterThan(5);
});
it('a rejected apply stays open with a message',()=>{
 const {radios,props,render}=setup({onApply:vi.fn(()=>false)});
 radios().find(n=>text(n)==='1 week')!.props.onClick();
 expect(props.onClose).not.toHaveBeenCalled();expect(all(render(),n=>n.props.role==='alert').map(text).join('')).toContain('rejected');
});
it('star toggles favorite through onEditMenu',()=>{
 const {props,render}=setup(),star=all(render(),n=>n.props.role==='menuitemcheckbox'&&n.props['aria-label']==='Favorite 5 minutes')[0];
 star.props.onClick();expect(props.onEditMenu).toHaveBeenCalledWith({type:'favorite',interval:'5m'});
});
it('custom input adds and applies; bad text shows the parser message',()=>{
 const {props,render}=setup();
 const input=()=>all(render(),n=>n.type==='input'&&n.props['aria-label']==='Custom interval')[0];
 input().props.onChange({target:{value:'abc'}});
 all(render(),n=>n.type==='form')[0].props.onSubmit({preventDefault(){}});
 expect(props.onApply).not.toHaveBeenCalled();expect(all(render(),n=>n.props.role==='alert').map(text).join('')).toContain('Unknown interval unit');
});
it('Advanced item opens the full dialog',()=>{
 const {props,render}=setup(),item=all(render(),n=>n.props.role==='menuitem'&&text(n).startsWith('Advanced interval settings'))[0];
 item.props.onClick();expect(props.onAdvanced).toHaveBeenCalledOnce();
});
it('Escape closes with focus return; outside backdrop closes without',()=>{
 const {props,render}=setup(),menu=all(render(),n=>n.props.role==='menu')[0];
 menu.props.onKeyDown({key:'Escape',preventDefault(){},stopPropagation(){},nativeEvent:{},target:{},currentTarget:{querySelectorAll:()=>[]}});
 expect(props.onClose).toHaveBeenCalledWith(true);
 all(render(),n=>n.props['data-interval-backdrop']!==undefined)[0].props.onPointerDown({});
 expect(props.onClose).toHaveBeenLastCalledWith(false);
});
it('the badge keeps its name and opens the menu; the dialog stays the advanced path',async()=>{
 const {readFileSync}=await vi.importActual<typeof import('node:fs')>('node:fs'),app=readFileSync('src/ui/App.tsx','utf8');
 // The badge (now the dropdown after the fixed favorites) lives in interval-toolbar.tsx; App renders it inline.
 const strip=readFileSync('src/ui/interval-toolbar.tsx','utf8');
 expect(strip).toContain('className="interval-badge" id="lv-interval-badge" aria-label="Chart intervals" aria-haspopup="menu"');expect(app).toContain('intervalToolbar({');
 expect(app).toContain('<IntervalMenu ');expect(app).toContain("dialog==='intervals'&&<IntervalDialog");
 expect(app).toContain('onInterval:()=>toggleIntervalMenu()');
});
