import {describe,it,expect} from 'vitest';
import {scriptOrdersToSignals} from '../../src/ui/strategy-input';
describe('script to strategy information boundary',()=>{
 const bars=[{time:10,open:4,high:6,low:3,close:5,volume:100}],ids=['dataset:0'];
 it('maps the exact available event',()=>{expect(scriptOrdersToSignals([{virtual:true,sequence:1,side:'buy',quantity:2,event:{id:'dataset:0',revision:1,time:10}}],bars,ids)).toEqual([{barIndex:0,sourceEventId:'dataset:0',sourceRevision:1,orders:[{id:'script-1',action:'buy',quantity:2,type:'market'}]}]);});
 it('rejects future and foreign event identities without partial acceptance',()=>{expect(()=>scriptOrdersToSignals([{virtual:true,side:'buy',quantity:1,event:{id:'other:0',revision:1,time:10}}],bars,ids)).toThrow('does not belong');});
 it('rejects corrected timestamps and nonvirtual proposals',()=>{expect(()=>scriptOrdersToSignals([{virtual:true,side:'buy',quantity:1,event:{id:'dataset:0',revision:1,time:11}}],bars,ids)).toThrow('Invalid');expect(()=>scriptOrdersToSignals([{virtual:false,event:{id:'dataset:0'}}],bars,ids)).toThrow();});
 it('rejects duplicate sequence IDs atomically',()=>{const order={virtual:true,sequence:1,side:'buy',quantity:1,event:{id:'dataset:0',revision:1,time:10}};expect(()=>scriptOrdersToSignals([order,order],bars,ids)).toThrow('sequence');});
});
