import {expect,it,vi} from 'vitest';
import {publishDrawingSubscribers,type DrawingSubscriber} from '../../src/chart/drawing-publication';

it('undefined presentation-only observers and true grid acceptance complete normally',()=>{
 const refresh=vi.fn(),capture=vi.fn(()=>true);expect(()=>publishDrawingSubscribers(new Set<DrawingSubscriber>([refresh,capture]))).not.toThrow();expect(refresh).toHaveBeenCalledOnce();expect(capture).toHaveBeenCalledOnce();
});
it('explicit false workspace capture becomes a failure while all current observers run',()=>{
 const rejected=vi.fn(()=>false),following=vi.fn();let error:any;try{publishDrawingSubscribers(new Set<DrawingSubscriber>([rejected,following]));}catch(cause){error=cause;}
 expect(error).toBeInstanceOf(AggregateError);expect(String(error.errors[0])).toContain('rejected by the workspace');expect(following).toHaveBeenCalledOnce();
});
it('observer exceptions remain separate from a concurrent false capture',()=>{
 const original=Error('SYNTHETIC observer failure');let error:any;try{publishDrawingSubscribers(new Set<DrawingSubscriber>([()=>{throw original;},()=>false]));}catch(cause){error=cause;}
 expect(error.errors).toHaveLength(2);expect(error.errors[0]).toBe(original);
});
it('a retired subscriber and one installed during dispatch do not receive the old notification',()=>{
 const removed=vi.fn(),replacement=vi.fn(),subscribers=new Set<DrawingSubscriber>();subscribers.add(()=>{subscribers.delete(removed);subscribers.add(replacement);});subscribers.add(removed);publishDrawingSubscribers(subscribers);expect(removed).not.toHaveBeenCalled();expect(replacement).not.toHaveBeenCalled();publishDrawingSubscribers(subscribers);expect(replacement).toHaveBeenCalledOnce();
});
