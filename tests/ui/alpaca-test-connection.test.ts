import {expect,it,vi} from 'vitest';
import {mountControlledComponent,all,text,invoke,type ModelElement} from '../helpers/alert-dialog-harness';
import {AlpacaSourceSettings,type AlpacaSettingsBridge} from '../../src/ui/LiveDataSettings';

// Owner report (0.8.1): Data sources > Alpaca "Test connection" showed no result. The real component's click handler runs
// against a mocked desktop bridge (no network, no key), and the assertions read the visible status line the user sees:
// a pending line while the test runs, then the success or failure text, right under the buttons (before the symbol list).
const flush=async()=>{for(let index=0;index<6;index++)await Promise.resolve();};
function bridge(answer:()=>Promise<unknown>):AlpacaSettingsBridge{
 return {
  alpacaKeyStatus:vi.fn(async()=>({ok:true as const,value:{configured:true,keyIdHint:'****ABCD',encryption:true}})),
  saveAlpacaKey:vi.fn(),clearAlpacaKey:vi.fn(),
  testAlpacaConnection:vi.fn(answer) as unknown as AlpacaSettingsBridge['testAlpacaConnection'],
 } as AlpacaSettingsBridge;
}
async function mount(answer:()=>Promise<unknown>){
 const lv=bridge(answer);
 const ui=mountControlledComponent(()=>AlpacaSourceSettings({alpacaSymbols:[],onAlpacaSymbolsChange:vi.fn(),bridge:lv,alpacaPlan:'free'}));
 ui.settle();await flush();ui.settle();
 const tree=()=>ui.settle();
 const result=()=>all(tree(),node=>node.type==='p'&&node.props.className==='lv-live-message')[0] as ModelElement|undefined;
 const button=()=>all(tree(),node=>node.type==='button'&&text(node.props.children)==='Test connection')[0]!;
 /** Visible text of the action result line, or null when it is hidden or absent. */
 const shown=()=>{const line=result();return line&&line.props.hidden!==true?text(line.props.children):null;};
 return {ui,lv,tree,result,button,shown};
}
/** The result line sits right after the key form (the buttons), ahead of the plan, symbol list and the details. */
function placedUnderButtons(tree:unknown){
 const top=(Array.isArray(tree)?tree:[(tree as ModelElement).props.children]).flat(3).filter(Boolean) as ModelElement[];
 const form=top.findIndex(node=>typeof node.props?.className==='string'&&(node.props.className as string).includes('lv-live-key-form'));
 const line=top.findIndex(node=>node.props?.className==='lv-live-message');
 const about=top.findIndex(node=>node.props?.className==='lv-live-about');
 return form>=0&&line===form+1&&line<about;
}

it('Test connection success: a pending line while it runs, then "Connected" right under the buttons',async()=>{
 let resolve!:(value:unknown)=>void;
 const view=await mount(()=>new Promise(done=>{resolve=done;}));
 expect(view.button().props.disabled).toBe(false);
 expect(view.shown()).toBeNull();
 invoke(view.button().props.onClick);await flush();
 expect(view.lv.testAlpacaConnection).toHaveBeenCalledOnce();
 expect(view.shown()).toBe('Testing the connection with Alpaca...');
 expect(view.result()!.props.role).toBe('status');
 resolve({ok:true,value:{connected:true,feed:'iex',checkedAt:'2026-10-30T15:00:00.000Z'}});await flush();
 expect(view.shown()).toMatch(/^Connected: Alpaca accepted the key \(IEX feed\)\./);
 expect(view.result()!.props['data-lv-action-result']).toBe('ok');
 expect(placedUnderButtons(view.tree())).toBe(true);
 expect(view.button().props.disabled).toBe(false);
 expect(view.shown()).not.toMatch(/—/);
});
it('Test connection failure shows the reason from the desktop process, marked as an error',async()=>{
 const view=await mount(async()=>({ok:false,error:{code:'ALPACA_KEY_REJECTED',message:'Alpaca rejected the key.'}}));
 invoke(view.button().props.onClick);await flush();
 expect(view.shown()).toBe('Connection test failed: Alpaca rejected the key.');
 expect(view.result()!.props['data-lv-action-result']).toBe('error');
 expect(placedUnderButtons(view.tree())).toBe(true);
});
it('a rejected IPC call or an answer with no error body still shows a failure line, never nothing',async()=>{
 const thrown=await mount(async()=>{throw Error('Local operation failed.');});
 invoke(thrown.button().props.onClick);await flush();
 expect(thrown.shown()).toBe('Local operation failed.');
 thrown.ui.dispose();
 const empty=await mount(async()=>({ok:false}));
 invoke(empty.button().props.onClick);await flush();
 expect(empty.shown()).toBe('Connection test failed: the desktop app gave no answer.');
});
