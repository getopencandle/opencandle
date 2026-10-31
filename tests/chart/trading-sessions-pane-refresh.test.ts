import {expect,it} from 'vitest';
import {createTradingSessionPaneRefresh,type TradingSessionPaneTarget} from '../../src/chart/adapter';
function fixture(){
 let epoch={},instance={},incarnation={},nativeId='SYNTHETIC-native',paneId='price',inverted=false,visible=true,mounted=true,busy=false;
 const queue:Array<()=>void>=[],updates:Array<{paneId:string;inverted:boolean}>=[],errors:unknown[]=[];let onRefresh=()=>{};
 const target=():TradingSessionPaneTarget|null=>{if(!mounted||!visible)return null;const saved={epoch,instance,incarnation,nativeId,paneId,inverted};return{id:'SYNTHETIC-study',instanceOwner:instance,nativeId,nativeIncarnation:incarnation,paneId,inverted,assertCurrent(){if(epoch!==saved.epoch||instance!==saved.instance||incarnation!==saved.incarnation||nativeId!==saved.nativeId||paneId!==saved.paneId||inverted!==saved.inverted)throw Error('SYNTHETIC owner changed');}};};
 const refresh=createTradingSessionPaneRefresh({captureOwner(){const captured=epoch;return{isCurrent:()=>epoch===captured};},busy:()=>busy,targets:()=>{const value=target();return value?[value]:[];},target:()=>target(),refresh(){updates.push({paneId,inverted});incarnation={};const emission=target();onRefresh();return emission;},defer:callback=>queue.push(callback),report:error=>errors.push(error)});
 return{refresh,updates,errors,queue,flush(){let work=0;while(queue.length){if(++work>20)throw Error('Unbounded refresh loop');queue.shift()!();}},invert(value:boolean){inverted=value;},move(value:string,flip:boolean){paneId=value;inverted=flip;},show(value:boolean){visible=value;},mount(value:boolean){mounted=value;},busy(value:boolean){busy=value;},source(){epoch={};},restore(){instance={};nativeId+='-restored';},onRefresh(callback:()=>void){onRefresh=callback;}};
}
it('coalesces stationary flips and ignores repeated unchanged configuration or renderer option notifications',()=>{
 const f=fixture();f.refresh.request();f.flush();expect(f.updates).toHaveLength(1);f.invert(true);f.refresh.request();f.refresh.request();f.refresh.request();expect(f.queue).toHaveLength(1);f.flush();expect(f.updates).toEqual([{paneId:'price',inverted:false},{paneId:'price',inverted:true}]);f.refresh.request();f.flush();expect(f.updates).toHaveLength(2);
});
it('undo redo and a fresh restored instance each accept their own actual pane orientation',()=>{
 const f=fixture();for(const inverted of [false,true,false,true]){f.invert(inverted);f.refresh.request();f.flush();}f.restore();f.refresh.request();f.flush();expect(f.updates.map(value=>value.inverted)).toEqual([false,true,false,true,true]);
});
it('a moved study ignores main-only changes and follows its own inversion before moving back',()=>{
 const f=fixture();f.move('SYNTHETIC-study-pane',false);f.refresh.request();f.flush();f.refresh.request();f.flush();expect(f.updates).toHaveLength(1);f.invert(true);f.refresh.request();f.flush();f.move('price',false);f.refresh.request();f.flush();expect(f.updates).toEqual([{paneId:'SYNTHETIC-study-pane',inverted:false},{paneId:'SYNTHETIC-study-pane',inverted:true},{paneId:'price',inverted:false}]);
});
it('first mount and unknown pane do not declare an orientation accepted before the native model is ready',()=>{
 const f=fixture();f.mount(false);f.refresh.request();f.flush();expect(f.updates).toEqual([]);f.mount(true);f.refresh.request();f.flush();expect(f.updates).toHaveLength(1);
});
it('hidden studies wait for Show and use the current orientation',()=>{
 const f=fixture();f.refresh.request();f.flush();f.show(false);f.invert(true);f.refresh.request();f.flush();expect(f.updates).toHaveLength(1);f.show(true);f.refresh.request();f.flush();expect(f.updates.at(-1)?.inverted).toBe(true);
});
it('busy work retains dirty state without retrying and the owned completion notification resumes it',()=>{
 const f=fixture();f.busy(true);f.refresh.request();f.flush();expect(f.updates).toEqual([]);expect(f.queue).toEqual([]);f.busy(false);f.refresh.request();f.flush();expect(f.updates).toHaveLength(1);
});
it('a failed refresh is not marked accepted and a later real notification can recover',()=>{
 const f=fixture();f.onRefresh(()=>{throw Error('SYNTHETIC native refusal');});f.refresh.request();f.flush();expect(f.errors).toHaveLength(1);f.onRefresh(()=>{});f.refresh.request();f.flush();expect(f.updates).toHaveLength(2);
});
it('reentrant changed orientation preserves the newer ticket and never cleans the stale key',()=>{
 const f=fixture();let first=true;f.onRefresh(()=>{if(first){first=false;f.invert(true);f.refresh.request();}});f.refresh.request();f.flush();expect(f.updates.map(value=>value.inverted)).toEqual([false,true]);f.refresh.request();f.flush();expect(f.updates).toHaveLength(2);
});
it('reentrant same-key notifications do not cause a refresh loop or erase pending work',()=>{
 const f=fixture();f.onRefresh(()=>f.refresh.request());f.refresh.request();f.flush();expect(f.updates).toHaveLength(1);expect(f.errors).toEqual([]);
});
it('queued old source controller and disposed owners cannot mutate replacement studies',()=>{
 const f=fixture();f.refresh.request();f.source();f.flush();expect(f.updates).toEqual([]);f.refresh.retire();f.refresh.request();f.flush();expect(f.updates).toHaveLength(1);f.invert(true);f.refresh.request();f.refresh.dispose();f.flush();expect(f.updates).toHaveLength(1);
});
