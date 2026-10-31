import {expect,it,vi} from 'vitest';
import {beginChartTreeSuspension} from '../../src/chart/tree-suspension';
// Actual suspension owner protocol on controlled script/queue/notification
// ports. No native hold, DOM, chart input, worker or staged-tree readiness.
function fixture(){const events:string[]=[],port={assert:vi.fn(),reserve:()=>({isCurrent:()=>true,release:vi.fn(()=>events.push('owner release'))}),hold:()=>({release:vi.fn(()=>events.push('notification release'))}),script:{changed:false,stage:vi.fn(),pauseAndCapture:vi.fn(()=>events.push('pause')),rollback:vi.fn(()=>events.push('rollback')),resume:vi.fn(()=>events.push('resume')),abandon:vi.fn(()=>events.push('abandon'))},pending:vi.fn((value:boolean)=>events.push('pending '+value)),broken:vi.fn(),dispose:vi.fn(()=>events.push('native dispose'))};return{port,events};}
it('throwing failure notification cannot skip hold, pending or queue release after a resume fault',()=>{
 const s=fixture(),lease=beginChartTreeSuspension(s.port);s.port.script.rollback.mockImplementation(()=>{throw Error('Synthetic rollback failure');});s.port.broken.mockImplementation(()=>{throw Error('Synthetic unavailable observer failure');});expect(()=>lease.resume()).toThrow();expect(s.events).toContain('notification release');expect(s.events).toContain('pending false');expect(s.events).toContain('owner release');expect(lease.isCurrent()).toBe(false);
});
it('setup failure aggregates cleanup/notification failures and still releases every acquired resource',()=>{
 const s=fixture();s.port.script.pauseAndCapture.mockImplementation(()=>{throw Error('Synthetic pause failure');});s.port.script.abandon.mockImplementation(()=>{throw Error('Synthetic abandonment failure');});s.port.broken.mockImplementation(()=>{throw Error('Synthetic unavailable observer failure');});let error:any;try{beginChartTreeSuspension(s.port);}catch(failure){error=failure;}expect(error).toBeInstanceOf(AggregateError);expect(s.events).toContain('notification release');expect(s.events).toContain('pending false');expect(s.events).toContain('owner release');expect(error.errors.map((row:Error)=>row.message).join(' ')).toContain('Synthetic pause failure');expect(error.errors.map((row:Error)=>row.message).join(' ')).toContain('Synthetic unavailable observer failure');
});
it('standalone disposal retires the active hold and attempts native disposal without relying on method this',()=>{
 const s=fixture(),lease=beginChartTreeSuspension(s.port),dispose=lease.dispose;expect(()=>dispose()).not.toThrow();expect(s.events).toEqual(['pending true','pause','abandon','notification release','pending false','owner release','native dispose']);expect(lease.isCurrent()).toBe(false);
});
it('retirement still releases every hold and disposal runs after a throwing script abandonment',()=>{
 const s=fixture(),lease=beginChartTreeSuspension(s.port);s.port.script.abandon.mockImplementation(()=>{throw Error('Synthetic abandonment failure');});expect(()=>lease.dispose()).toThrow();expect(s.events).toContain('notification release');expect(s.events).toContain('pending false');expect(s.events).toContain('owner release');expect(s.port.dispose).toHaveBeenCalledOnce();expect(lease.isCurrent()).toBe(false);
});
