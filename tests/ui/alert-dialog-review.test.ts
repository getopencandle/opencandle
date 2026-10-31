import {afterEach,beforeEach,expect,it,vi} from 'vitest';
import {AlertDialog,buildAlertDefinition,type AlertDialogProps,type AlertDraft} from '../../src/ui/AlertDialog';
import {alertObservationContext,createAlertObservationSession} from '../../src/domain/alert-observation';
import {createLocalAlert,editLocalAlert,type LocalAlert} from '../../src/domain/alerts';
import {fixtureDataset} from '../../src/domain/fixtures';

// Independent handler checks. Effects are explicitly flushed; this is not DOM,
// accessibility, rendered appearance, or packaged-executable interaction evidence.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0,effects:[] as Array<()=>void>}));
vi.mock('react',async()=>{
 const actual=await vi.importActual<any>('react');
 return {...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:(effect:()=>void,deps?:any[])=>{const i=hooks.cursor++,prior=hooks.cells[i];if(!prior||!deps||deps.some((value,index)=>!Object.is(value,prior[index]))){hooks.cells[i]=deps;hooks.effects.push(effect);}}};
});
const dataset=fixtureDataset('GME',5),now=1791979200;
const context=(sessionId:string)=>alertObservationContext(createAlertObservationSession(dataset,{version:2,chartId:'chart',sessionId,mode:'ordinary',startedAt:now}),dataset);
const draft:AlertDraft={name:'Reviewed level',message:'Local only',kind:'greater',value:'10',lower:'1',upper:'20',amount:'1',bars:'1',percent:false,frequency:'every-time',expirationEnabled:false,expiresAt:''};
function alert(id='saved',ctx=context('session')):LocalAlert{return createLocalAlert(buildAlertDefinition(draft,{id,instrumentId:ctx.instrumentId,now,mode:ctx.mode,runId:ctx.runId,sourceId:ctx.sourceId,observationBinding:ctx.binding}));}
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,predicate);if(found)return found;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
function setup(overrides:Partial<AlertDialogProps>={}){
 const props:AlertDialogProps={open:true,onClose:vi.fn(),alerts:[],onAlertsChange:vi.fn(),instrument:dataset.instrument,now,context:context('session'),contexts:[],events:[],validateCurrentSource:vi.fn(),...overrides};
 const render=()=>{hooks.cursor=0;return AlertDialog(props);};
 const element=(predicate:(node:any)=>boolean)=>{const node=find(render(),predicate);if(!node)throw new Error('Handler target absent');return node;};
 const button=(name:string)=>element(node=>node.type==='button'&&text(node)===name);
 const click=(name:string)=>button(name).props.onClick();
 const change=(name:string,value:string)=>element(node=>node.props['aria-label']===name).props.onChange({target:{value}});
 const save=()=>element(node=>node.type==='form').props.onSubmit({preventDefault:vi.fn()});
 const flush=()=>{const effects=hooks.effects.splice(0);effects.forEach(effect=>effect());};
 return{props,render,click,change,save,flush,text:()=>text(render())};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;hooks.effects=[];vi.stubGlobal('document',{activeElement:null});});
afterEach(()=>vi.unstubAllGlobals());

it('rejected create or delete retains the draft and never requests an after-save observation',()=>{
 const request=vi.fn(),publish=vi.fn(()=>false),ui=setup({onAlertsChange:publish,onRequestObservation:request});ui.click('Create alert');ui.change('Alert level','10');ui.change('Alert name','Rejected but retained');ui.save();
 expect(publish).toHaveBeenCalledOnce();expect(request).not.toHaveBeenCalled();expect(ui.text()).toContain('change was rejected');expect(ui.text()).not.toContain('Alert saved locally');
 ui.props.alerts=[alert()];ui.click('Alerts (1)');ui.click('Delete');ui.click('Confirm delete');expect(ui.text()).toContain('Delete this alert');expect(request).not.toHaveBeenCalled();expect(ui.props.alerts).toHaveLength(1);
});

it('rejects a changed source capture until the user explicitly recaptures, and consults the live guard',()=>{
 const ui=setup();ui.click('Create alert');ui.change('Alert level','10');ui.props.context=context('replacement');ui.save();
 expect(ui.props.onAlertsChange).not.toHaveBeenCalled();expect(ui.text()).toContain('Use updated source');
 ui.click('Use updated source');ui.props.validateCurrentSource=vi.fn(()=>{throw new Error('Native source changed before save');});ui.save();
 expect(ui.props.onAlertsChange).not.toHaveBeenCalled();expect(ui.text()).toContain('Native source changed');
 ui.props.validateCurrentSource=vi.fn();ui.save();expect(ui.props.onAlertsChange).toHaveBeenCalledOnce();
 const saved=vi.mocked(ui.props.onAlertsChange).mock.calls[0][0][0];expect(saved.definition.observationBinding).toEqual(ui.props.context!.binding);
});

it('edits against latest history but refuses a newer settings revision',()=>{
 const original=alert(),ui=setup({alerts:[original]});ui.click('Edit');ui.change('Alert name','New title');
 const appended={...original,missedDataGaps:7};ui.props.alerts=[appended];ui.save();
 const saved=vi.mocked(ui.props.onAlertsChange).mock.calls[0][0][0];expect(saved.missedDataGaps).toBe(7);expect(saved.definition.name).toBe('New title');expect(saved.revision).toBe(2);
 vi.mocked(ui.props.onAlertsChange).mockClear();ui.props.alerts=[original];ui.click('Edit');ui.props.alerts=[editLocalAlert(original,{name:'Changed elsewhere'},now+1)];ui.save();
 expect(ui.props.onAlertsChange).not.toHaveBeenCalled();expect(ui.text()).toContain('settings changed');
});

it('pins deletion to a settings revision while allowing observation-only changes',()=>{
 const original=alert(),ui=setup({alerts:[original]});ui.click('Delete');ui.props.alerts=[editLocalAlert(original,{name:'Changed elsewhere'},now+1)];ui.click('Confirm delete');
 expect(ui.props.onAlertsChange).not.toHaveBeenCalled();expect(ui.text()).toContain('settings changed');
 ui.click('Cancel');ui.props.alerts=[original];ui.click('Delete');ui.props.alerts=[{...original,missedDataGaps:1}];ui.click('Confirm delete');expect(ui.props.onAlertsChange).toHaveBeenCalledWith([],ui.props.alerts);
});

it('rearms with a new identity and preserves the old definition, unless the live source guard rejects',()=>{
 const original=alert('old',context('retired')),ui=setup({alerts:[original]});ui.props.validateCurrentSource=vi.fn(()=>{throw new Error('Source unavailable');});ui.click('Restart');expect(ui.props.onAlertsChange).not.toHaveBeenCalled();
 ui.props.validateCurrentSource=vi.fn();ui.click('Restart');const saved=vi.mocked(ui.props.onAlertsChange).mock.calls[0][0];
 expect(saved).toHaveLength(2);expect(saved[0].definition).toEqual(original.definition);expect(saved[0].status).toBe('paused');expect(saved[1].definition.id).not.toBe(original.definition.id);expect(saved[1].definition.observationBinding).toEqual(ui.props.context!.binding);expect(original.status).toBe('active');
});

it('advances expiry with the dialog closed and without inventing a price event',()=>{
 const original=alert(),expiring=createLocalAlert({...original.definition,expiresAt:now+1}),ui=setup({open:false,alerts:[expiring],now:now+2,context:null,events:[]});
 expect(ui.render()).toBeNull();ui.flush();const saved=vi.mocked(ui.props.onAlertsChange).mock.calls[0][0][0];expect(saved.status).toBe('expired');expect(saved.history).toEqual([]);expect(saved.lastSequence).toBeNull();
});

it('resumes the current revision with a cleared crossing baseline and requests an explicit observation',()=>{
 const paused={...alert(),status:'paused' as const,lastValue:9,previousClosedValue:8},request=vi.fn(),ui=setup({alerts:[paused],onRequestObservation:request});
 const stale=find(ui.render(),node=>node.type==='button'&&text(node)==='Resume').props.onClick;
 ui.props.alerts=[editLocalAlert(paused,{name:'Changed elsewhere'},now+1)];ui.render();stale();expect(ui.props.onAlertsChange).not.toHaveBeenCalled();expect(request).not.toHaveBeenCalled();
 ui.props.alerts=[paused];ui.click('Resume');const resumed=vi.mocked(ui.props.onAlertsChange).mock.calls[0][0][0];expect(resumed.status).toBe('active');expect(resumed.lastValue).toBeNull();expect(resumed.previousClosedValue).toBeNull();expect(resumed.definition).toEqual(paused.definition);expect(request).toHaveBeenCalledExactlyOnceWith('after-save');expect(ui.text()).toContain('missed observations are not reconstructed');
});
