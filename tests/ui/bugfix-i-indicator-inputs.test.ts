import {readFileSync} from 'node:fs';
import {beforeEach,expect,it,vi} from 'vitest';
import {find,findAll,makeHarness,text} from './indicator-real-port-harness';
import {indicatorOffsetBounds} from '../../src/chart/indicator-settings';

// INDFIX review (IndicatorDialog.tsx step diff, judged required; the
// offset bounds diff) and GH-G1-1 / GH-G1-2 (Actual IndicatorDialog /
// IndicatorSettings handlers on the real indicator port. Native constraint validation is modelled from the HTML rules
// (stepMismatch, rangeUnderflow, rangeOverflow) over the rendered attributes; no DOM, browser validation, GUI or package claim.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return {...actual,
 useState:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]=typeof initial==='function'?initial():initial;return [cells[i],(value:any)=>{cells[i]=typeof value==='function'?value(cells[i]):value;}];},
 useRef:(initial:any)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells))cells[i]={current:initial};return cells[i];},
 useEffect:(effect:()=>void)=>{const cells=hooks.cells,i=hooks.cursor++;if(!(i in cells)){cells[i]=true;effect();}}};});
const {scopes,dialog}=makeHarness(hooks);
beforeEach(()=>{scopes.clear();});

/** HTML number input constraint validation: a form with such a field does not submit (Chromium blocks Apply). */
function nativeValid(props:any,value:string){
 if(value==='')return true;const number=Number(value);if(!Number.isFinite(number))return false;
 if(props.min!==undefined&&number<Number(props.min))return false;
 if(props.max!==undefined&&number>Number(props.max))return false;
 if(props.step==='any')return true;
 const step=props.step===undefined||props.step===null?1:Number(props.step),base=props.min!==undefined?Number(props.min):0;
 const ratio=(number-base)/step;return Math.abs(ratio-Math.round(ratio))<1e-9;
}

it('INDFIX: PSAR Start 0.02 passes native validation and applies; KC Multiplier and ENV Percent accept fractions',()=>{
 const ui=dialog({seed:['psar','kc','env'],initialSelected:0});
 for(const name of ['Start','Increment','Max value'])expect(ui.sField(name).props.step,name).toBe('any');
 ui.sEdit('Start','0.05');ui.sSubmit();expect(ui.port.list()[0].inputs.start).toBe(0.05);
 ui.sEdit('Start','0.02');
 const start=ui.sField('Start');
 expect(nativeValid(start.props,String(start.props.value)),'0.02 is not a step mismatch').toBe(true);
 ui.sSubmit();
 expect(ui.port.list()[0].inputs.start).toBe(0.02);
 expect(ui.sText()).toContain('Indicator settings applied.');
 ui.click('Edit '+ui.labels().get(ui.ids[1]));
 expect(nativeValid(ui.sField('Multiplier').props,'1.5')).toBe(true);
 ui.sEdit('Multiplier','1.5');ui.sSubmit();expect(ui.port.list()[1].inputs.multiplier).toBe(1.5);
 ui.click('Edit '+ui.labels().get(ui.ids[2]));
 expect(nativeValid(ui.sField('Percent').props,'2.5')).toBe(true);
 ui.sEdit('Percent','2.5');ui.sSubmit();expect(ui.port.list()[2].inputs.percent).toBe(2.5);
});

it('INDFIX: integer inputs keep their declared step; the display offset uses the per-kind edit bounds',()=>{
 const ui=dialog({seed:['wma','sma'],initialSelected:0});
 expect(nativeValid(ui.sField('Length').props,'9.5'),'integer length still refuses a fraction').toBe(false);
 const offset=ui.sField('Display offset (bars)');
 expect([offset.props.min,offset.props.max]).toEqual([indicatorOffsetBounds('wma').min,indicatorOffsetBounds('wma').max]);
 expect([offset.props.min,offset.props.max]).toEqual([-500,500]);
 expect(nativeValid(offset.props,'501')).toBe(false);expect(nativeValid(offset.props,'-500')).toBe(true);
 ui.click('Edit '+ui.labels().get(ui.ids[1]));
 const other=ui.sField('Display offset (bars)');
 expect([other.props.min,other.props.max]).toEqual([indicatorOffsetBounds('sma').min,indicatorOffsetBounds('sma').max]);
});

function hosted(options:Parameters<typeof dialog>[0]){
 const ui=dialog(options);
 const write={state:'idle' as 'idle'|'background'|'blocking',waiters:[] as Array<()=>void>};
 const reports:string[]=[];
 // Models App.runDetachedIndicatorChange: applies with its own checks, or reports the thrown reason.
 const runDetached=vi.fn((action:any)=>{try{if(action.kind==='library'){if(ui.props.library!==action.expected)throw new Error('The indicator library changed.');ui.props.onLibraryChange(action.next);}else action.run();reports.push('applied');}catch(error){reports.push('refused: '+String(error));}});
 ui.props.storageWrite={state:()=>write.state,afterWrite:(run:()=>void)=>{write.waiters.push(run);return()=>{const index=write.waiters.indexOf(run);if(index>=0)write.waiters.splice(index,1);};},runDetached};
 const end=()=>{write.state='idle';for(const run of write.waiters.splice(0))run();};
 return Object.assign(ui,{write,end,runDetached,reports});
}

it('GH-G1-1: a queued Apply whose draft changed before the editor closed is refused on the detached route too, with the reason',()=>{
 const ui=hosted({seed:['sma'],initialSelected:0});
 ui.write.state='background';
 ui.sEdit('Length','20');ui.sSubmit();// patch A queued
 ui.sEdit('Length','30');// more typing
 ui.sClick('Cancel');// the editor closes
 expect(ui.selected()).toBeNull();
 ui.end();
 expect(ui.runDetached).toHaveBeenCalledOnce();
 expect(ui.reports[0]).toMatch(/^refused: .*draft changed/);
 expect(ui.port.list()[0].inputs.length,'patch A is not applied').toBe(9);
});

it('GH-G1-1: the same sequence with the editor open refuses the same way (control), and an unchanged draft still applies after close',()=>{
 const open=hosted({seed:['sma'],initialSelected:0});
 open.write.state='background';open.sEdit('Length','20');open.sSubmit();open.sEdit('Length','30');open.end();
 expect(open.runDetached).not.toHaveBeenCalled();expect(open.port.list()[0].inputs.length).toBe(9);
 expect(open.sText()).toContain('The draft changed while the workspace was saving');
 scopes.clear();
 const closed=hosted({seed:['sma'],initialSelected:0});
 closed.write.state='background';closed.sEdit('Length','20');closed.sSubmit();
 find(closed.render(),node=>node.type==='button'&&text(node)==='Close').props.onClick();closed.end();
 expect(closed.reports).toEqual(['applied']);expect(closed.port.list()[0].inputs.length).toBe(20);
});

it('GH-G1-2: the acronym column is bounded and clips instead of running into the name',()=>{
 const ui=dialog();
 const tree=ui.render();
 const css=readFileSync('src/ui/indicator-picker.css','utf8').split('\n');
 const rule=(selector:string)=>css.find(line=>line.startsWith('[data-lv-picker] '+selector+'{'))??'';
 // Arial Bold advance widths (1/1000 em); the acronym is 12px, so the longest short title must fit the CSS max-width cap.
 const advance:Record<string,number>={A:722,B:722,C:722,D:722,E:667,F:611,G:778,H:722,I:278,J:556,K:722,L:611,M:833,N:722,O:778,P:667,Q:778,R:722,S:667,T:611,U:722,V:667,W:944,X:667,Y:667,Z:611};
 const width=(word:string)=>[...word].reduce((sum,ch)=>sum+(advance[ch]??722),0)*12/1000;
 const acronymRule=rule('.indicator-catalog-acronym'),nameRule=rule('.indicator-catalog-name');
 const cap=Number(/max-width:(\d+)px/.exec(acronymRule)?.[1]);
 expect(cap).toBeGreaterThan(0);
 expect(acronymRule).toMatch(/flex:none/);expect(acronymRule).toContain('overflow:hidden');expect(acronymRule).toContain('white-space:nowrap');expect(acronymRule).toContain('text-overflow:ellipsis');
 expect(nameRule).toMatch(/flex:1;min-width:0/);expect(nameRule).toContain('overflow:hidden');expect(nameRule).toContain('text-overflow:ellipsis');
 // The column shows the friendly short title ("Stoch RSI"), not the upper-cased id.
 for(const [kind,name,short] of [['rci','Rank correlation index','RCI'],['stochrsi','Stochastic RSI','Stoch RSI']] as const){
  const add=find(tree,node=>node.type==='button'&&String(node.props['aria-label']).startsWith('Add ')&&findAll(node,item=>item.type==='strong'&&text(item)===short).length>0);
  const acronym=find(add,node=>node.type==='strong'),label=find(add,node=>node.type==='span');
  expect(width(short.toUpperCase()),kind).toBeLessThanOrEqual(cap);
  expect(acronym.props.className).toBe('indicator-catalog-acronym');
  expect(acronym.props.title).toBe(short);
  expect(label.props.className).toBe('indicator-catalog-name');
  expect(text(label).length,name).toBeGreaterThan(0);
 }
 // A short title that only repeats the name (Supertrend, MACD) is not shown twice.
 for(const name of ['Supertrend','MACD']){
  const add=find(tree,node=>node.type==='button'&&node.props['aria-label']==='Add '+name);
  expect(findAll(add,node=>node.type==='strong').length,name).toBe(0);
 }
 const widths=new Set(findAll(tree,node=>node.type==='strong'&&node.props.className==='indicator-catalog-acronym').map(node=>node.props.style));
 expect(widths.size,'no per-row inline widths: every row shares the one CSS column rule').toBe(1);
});
