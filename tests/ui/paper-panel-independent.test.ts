import {beforeEach,expect,it,vi} from 'vitest';
import {PaperPanel,type PaperPanelProps} from '../../src/ui/PaperPanel';
import {createPaperAccount,processPaperQuote,submitPaperOrder,modifyPaperOrder,closePaperPosition,type PaperAccount,type PaperResult} from '../../src/domain/paper';
import type {Instrument} from '../../src/domain/types';
// Actual component handlers with controlled hooks, not DOM, native focus or
// packaged input delivery. Effects are not silently counted as exercised.
const hooks=vi.hoisted(()=>({cells:[] as any[],cursor:0}));
vi.mock('react',async()=>{const actual=await vi.importActual<any>('react');return{...actual,useState:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]=typeof initial==='function'?initial():initial;return[hooks.cells[i],(next:any)=>{hooks.cells[i]=typeof next==='function'?next(hooks.cells[i]):next;}];},useRef:(initial:any)=>{const i=hooks.cursor++;if(!(i in hooks.cells))hooks.cells[i]={current:initial};return hooks.cells[i];},useEffect:()=>{hooks.cursor++;}};});
const instrument:Instrument={id:'REVIEW:PANEL',symbol:'PANEL',name:'Synthetic paper panel review',exchange:'SYNTHETIC',currency:'USD',assetClass:'stock',timezone:'UTC',tickSize:.01,lotSize:1};
const accepted=(value:PaperResult)=>{expect(value.ok,value.diagnostics.map(row=>row.message).join(';')).toBe(true);return value.account;};
const start=()=>accepted(processPaperQuote(createPaperAccount(),{instrumentId:instrument.id,bid:9.98,ask:10.02,eventTime:1,receivedAt:1,availableAt:1,sequence:1,fixture:true,session:'unknown'},1,'ordinary',instrument));
const entry=(account:PaperAccount,quantity=10)=>accepted(submitPaperOrder(account,{instrument,type:'market',side:'buy',quantity},1));
function text(node:any):string{return typeof node==='string'||typeof node==='number'?String(node):Array.isArray(node)?node.map(text).join(''):node?.props?text(node.props.children):'';}
function find(tree:any,predicate:(node:any)=>boolean):any{if(Array.isArray(tree)){for(const child of tree){const found=find(child,predicate);if(found)return found;}}else if(tree?.props){if(predicate(tree))return tree;return find(tree.props.children,predicate);}return null;}
function setup(account:PaperAccount){
 const change=vi.fn((next:PaperAccount,expected?:PaperAccount)=>{if(expected!==props.account)return false;props.account=next;return true;});
 const props:PaperPanelProps={account,instrument,quote:account.quotes[instrument.id],quoteSource:{key:'independent-synthetic-source',state:'ready'},now:1,onAccountChange:change};
 const render=()=>{hooks.cursor=0;return PaperPanel(props);},button=(name:string)=>{const node=find(render(),node=>node.type==='button'&&text(node)===name);if(!node)throw new Error('Missing button '+name);return node;};
 return{props,change,render,click:(name:string)=>button(name).props.onClick(),editor:()=>find(render(),node=>typeof node.type==='function'&&node.props.value?.apply),message:()=>text(find(render(),node=>node.type==='output'))};
}
beforeEach(()=>{hooks.cells=[];hooks.cursor=0;});
it('cancel confirmation cannot cancel a materially changed order',()=>{
 let account=accepted(submitPaperOrder(start(),{instrument,side:'buy',type:'limit',quantity:10,limitPrice:8},1));const ui=setup(account);ui.click('Cancel order');
 account=accepted(modifyPaperOrder(account,account.orders[0].id,{quantity:20},1));ui.props.account=account;ui.render();ui.click('Confirm');
 expect(ui.change).not.toHaveBeenCalled();expect(ui.props.account.orders[0].status).toBe('working');expect(ui.message()).toMatch(/changed|review/i);
});
it('position close confirmation cannot close a later same-direction position after flat',()=>{
 const account=entry(start()),ui=setup(account);ui.click('Positions');ui.click('Close position');
 const flat=accepted(closePaperPosition(account,instrument.id,1));ui.props.account=entry(flat);ui.render();ui.click('Confirm');
 expect(ui.change).not.toHaveBeenCalled();expect(ui.props.account.positions[instrument.id].quantity).toBe(10);expect(ui.message()).toMatch(/changed|review/i);
});
it('rejected exit publication retains the editor and reports the rejection',()=>{
 const account=accepted(submitPaperOrder(start(),{instrument,side:'buy',type:'market',quantity:10,exits:{schemaVersion:1,mode:'single',levels:[{quantity:10,takeProfit:12,stopLoss:9}]}},1)),ui=setup(account);ui.change.mockReturnValue(false);ui.click('Edit level');
 const editor=ui.editor();expect(editor.props.value.apply({schemaVersion:1,mode:'single',levels:[{quantity:7,takeProfit:13,stopLoss:8}]})).toBe(false);
 expect(ui.change).toHaveBeenCalledOnce();expect(ui.change.mock.calls[0][1]).toBe(account);expect(ui.props.account).toBe(account);expect(ui.editor()).not.toBeNull();expect(ui.message()).toContain('rejected');
});
it('stale underlying ticket changes cannot apply an earlier exit draft',()=>{
 const ui=setup(start());ui.click('Add take profit / stop loss');const editor=ui.editor();find(ui.render(),node=>node.props['aria-label']==='Order quantity').props.onChange({target:{value:'2'}});ui.render();
 expect(editor.props.value.apply({schemaVersion:1,mode:'single',levels:[{quantity:1,takeProfit:12,stopLoss:9}]})).toBe(false);expect(ui.change).not.toHaveBeenCalled();expect(ui.message()).toMatch(/ticket.*changed/);
});
