import {afterEach,expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke} from '../helpers/alert-dialog-harness';
import {ScriptSettingsDialog} from '../../src/ui/ScriptSettingsDialog';
import {applyScriptSettings} from '../../src/ui/script-settings-model';
import {restoreScriptBindings,type ScriptBinding} from '../../src/ui/script-library';
import {defaultPlotStyle} from '../../src/chart/indicator-port';

// SYNTHETIC callback/hook interaction model; no browser checkbox/focus claim.
type Props=Parameters<typeof ScriptSettingsDialog>[0];
const first='lvplot:private-first',second='lvplot:private-second';
const styles=()=>({[first]:{...defaultPlotStyle('sma',first,0),color:'#123456',priceScale:false,legend:true,dataWindow:false},[second]:{...defaultPlotStyle('sma',second,1),color:'#abcdef',priceScale:true,legend:false,dataWindow:true}});
const binding=():ScriptBinding=>({id:'synthetic-display-study',documentId:'synthetic-display-document',version:1,name:'Synthetic display study',source:'({onBar(){}})',pane:'price',visible:true,plots:styles()});
const mounted:Array<{dispose():void}>=[];afterEach(()=>{for(const ui of mounted.splice(0).reverse())ui.dispose();vi.restoreAllMocks();});
function mount(extra:Partial<Props>={}){
 let saved=extra.binding??binding();const close=vi.fn(),apply=vi.fn((change:Parameters<Props['onApply']>[0])=>{saved=applyScriptSettings([saved],saved.id,change)[0];return true;});
 const props:Props={binding:saved,entry:null,renderedPlots:styles(),plotTitles:{[first]:'Same label',[second]:'Same label'},onApply:apply,onClose:close,...extra};
 const ui=mountControlledComponent(()=>ScriptSettingsDialog(props));mounted.push(ui);ui.settle();
 const click=(label:string)=>{invoke(ui.find(node=>node.type==='button'&&text(node)===label).props.onClick);ui.settle();};click('Style');
 const groups=()=>all(ui.render(),node=>node.type==='fieldset');
 const field=(index:number,label:string)=>{const rows=all(groups()[index],node=>node.type==='input'&&node.props['aria-label']==='Same label '+label);expect(rows).toHaveLength(1);return rows[0];};
 const change=(index:number,label:string,checked:boolean)=>{invoke(field(index,label).props.onChange,{target:{checked}});ui.settle();};
 return{ui,props,close,apply,click,groups,field,change,get saved(){return saved;}};
}

it('exposes two independent supported display switches with current saved values and human labels',()=>{
 const h=mount();expect(h.field(0,'values in the status line').props.checked).toBe(true);expect(h.field(0,'values in the Data Window').props.checked).toBe(false);expect(h.field(1,'values in the status line').props.checked).toBe(false);expect(h.field(1,'values in the Data Window').props.checked).toBe(true);
 expect(text(h.ui.render())).toContain('Values in the status line');expect(text(h.ui.render())).toContain('Values in the Data Window');expect(text(h.ui.render())).not.toContain('Labels on the price scale');
 const labels=all(h.ui.render(),node=>typeof node.props['aria-label']==='string').map(node=>node.props['aria-label']).join(' ');expect(labels).not.toContain(first);expect(labels).not.toContain(second);expect(text(h.ui.render())).not.toContain('lvplot:');
});

it('equal plot labels edit only the fieldset stable plot ID and preserve all other style fields',()=>{
 const h=mount(),before=styles();expect(h.groups().map(node=>(node as unknown as {key:string}).key)).toEqual([first,second]);h.change(0,'values in the status line',false);h.change(1,'values in the Data Window',false);expect(h.apply).not.toHaveBeenCalled();h.click('Apply');
 expect(h.saved.plots).toEqual({[first]:{...before[first],legend:false},[second]:{...before[second],dataWindow:false}});expect(h.close).not.toHaveBeenCalled();expect(restoreScriptBindings([h.saved])[0].plots).toEqual(h.saved.plots);
});

it('Cancel discards unsaved display edits and reopening restores saved choices',()=>{
 const h=mount();h.change(0,'values in the status line',false);h.change(1,'values in the Data Window',false);h.click('Cancel');expect(h.apply).not.toHaveBeenCalled();expect(h.close).toHaveBeenCalledOnce();const reopened=mount({binding:h.saved});expect(reopened.field(0,'values in the status line').props.checked).toBe(true);expect(reopened.field(1,'values in the Data Window').props.checked).toBe(true);
});

it('Apply keeps editing open and restored binding choices survive a fresh Settings instance',()=>{
 const h=mount();h.change(0,'values in the Data Window',true);h.click('Apply');expect(h.apply).toHaveBeenCalledOnce();expect(h.close).not.toHaveBeenCalled();const saved=restoreScriptBindings([h.saved])[0],reopened=mount({binding:saved});expect(reopened.field(0,'values in the Data Window').props.checked).toBe(true);expect(reopened.field(0,'values in the status line').props.checked).toBe(true);expect(saved.plots[first].priceScale).toBe(false);
});

it('Ok saves display choices and closes after the accepted save',()=>{
 const h=mount();h.change(1,'values in the status line',true);invoke(h.ui.find(node=>node.type==='form').props.onSubmit,{preventDefault(){}});expect(h.apply).toHaveBeenCalledOnce();expect(h.saved.plots[second].legend).toBe(true);expect(h.close).toHaveBeenCalledOnce();expect(h.apply.mock.invocationCallOrder[0]).toBeLessThan(h.close.mock.invocationCallOrder[0]);
});

it('Defaults uses actual rendered styles and changes nothing until Apply',()=>{
 const rendered=styles();rendered[first]={...rendered[first],legend:false,dataWindow:true};rendered[second]={...rendered[second],legend:true,dataWindow:false};const h=mount({renderedPlots:rendered});h.click('Defaults');expect(h.apply).not.toHaveBeenCalled();expect(h.field(0,'values in the status line').props.checked).toBe(false);expect(h.field(0,'values in the Data Window').props.checked).toBe(true);h.click('Apply');expect(h.saved.plots).toEqual(rendered);
});

it('owner retirement refuses the newly edited flags before publishing or closing',()=>{
 let current=true;const h=mount({assertOwner:()=>{if(!current)throw Error('Synthetic owner retired.');}});h.change(0,'values in the status line',false);current=false;h.click('Apply');expect(h.apply).not.toHaveBeenCalled();expect(h.close).not.toHaveBeenCalled();expect(text(h.ui.render())).toContain('Synthetic owner retired.');expect(h.saved.plots).toEqual(styles());
});

it('workspace refusal keeps the display draft open without changing the saved binding',()=>{
 const rejected=vi.fn(()=>false),h=mount({onApply:rejected});h.change(1,'values in the Data Window',false);h.click('Apply');expect(rejected).toHaveBeenCalledOnce();expect(h.field(1,'values in the Data Window').props.checked).toBe(false);expect(h.close).not.toHaveBeenCalled();expect(h.saved.plots).toEqual(styles());expect(text(h.ui.render())).toContain('The workspace refused this change.');
});

it('unavailable style authority retains saved flags and offers no editable plot controls',()=>{
 const h=mount({stylesUnavailableReason:'Synthetic styles unavailable.'});expect(h.groups()).toEqual([]);h.click('Defaults');h.click('Apply');expect(h.apply.mock.calls[0][0].plots).toEqual(styles());expect(h.saved.plots).toEqual(styles());
});

it('retained plots without human metadata use a generic title rather than exposing an internal ID',()=>{
 const h=mount({plotTitles:undefined});expect(all(h.ui.render(),node=>node.type==='legend').map(text)).toEqual(['Plot style','Plot style']);expect(text(h.ui.render())).not.toContain('lvplot:');expect(all(h.ui.render(),node=>node.props['aria-label']==='Plot style values in the status line')).toHaveLength(2);
});

it('line and fill visuals do not gain unsupported numeric display switches',()=>{
 const h=mount({binding:{...binding(),plots:{}},renderedPlots:{},renderedVisuals:{'lvhline:Level':styles()[first],'lvfill:Band':styles()[second]},plotTitles:{}});expect(all(h.ui.render(),node=>node.type==='legend').map(text)).toEqual(['Line: Level','Fill: Band']);expect(text(h.ui.render())).not.toContain('Values in the status line');expect(text(h.ui.render())).not.toContain('Values in the Data Window');
});
