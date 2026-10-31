import {expect,it,vi} from 'vitest';
import {ownedCallbacks} from '../../src/ui/owned-callbacks';

it('blocks retired source, ready, script and preference callbacks immediately on workspace replacement',()=>{
 let epoch=0;const old={capture:vi.fn(),ready:vi.fn(),script:vi.fn(),preferences:vi.fn()},next={capture:vi.fn(),ready:vi.fn(),script:vi.fn(),preferences:vi.fn()};let current=old;
 const previous=ownedCallbacks(()=>current,()=>epoch===0);previous.ready('old controller');expect(old.ready).toHaveBeenCalledOnce();
 epoch=1;current=next;previous.capture({drawings:['discarded']});previous.ready(null);previous.script({result:'discarded'});previous.preferences({magnet:'strong'});
 for(const callback of Object.values(next))expect(callback).not.toHaveBeenCalled();
 const active=ownedCallbacks(()=>current,()=>epoch===1);active.ready('new controller');active.capture({drawings:[]});expect(next.ready).toHaveBeenCalledWith('new controller');expect(next.capture).toHaveBeenCalledWith({drawings:[]});
});

it('keeps a mounted tree callback identity while dispatching to the newest render handlers',()=>{
 const first=vi.fn(),second=vi.fn();let current={capture:first};const callbacks=ownedCallbacks(()=>current,()=>true),stable=callbacks.capture;callbacks.capture(1);current={capture:second};callbacks.capture(2);
 expect(callbacks.capture).toBe(stable);expect(first).toHaveBeenCalledExactlyOnceWith(1);expect(second).toHaveBeenCalledExactlyOnceWith(2);
});
