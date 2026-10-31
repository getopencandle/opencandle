import {expect,it} from 'vitest';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {createInitialWorkspace} from '../../src/ui/workspace-state';

// (ROOT section): the optional Heikin Ashi "Show real last price" appearance field survives startup recovery, an
// earlier workspace without it loads unchanged, and a non-boolean value is refused. SYNTHETIC workspace.
it('restores haShowRealLastPrice when boolean, leaves it absent when absent, and refuses another type',()=>{
 const defaults=createInitialWorkspace(),json=(appearance:Record<string,unknown>)=>JSON.parse(JSON.stringify({...defaults,appearance:{...defaults.appearance,...appearance}}));
 expect(restoreWorkspace(json({haShowRealLastPrice:true}),createInitialWorkspace()).appearance.haShowRealLastPrice).toBe(true);
 expect(Object.hasOwn(restoreWorkspace(json({}),createInitialWorkspace()).appearance,'haShowRealLastPrice')).toBe(false);
 expect(()=>restoreWorkspace(json({haShowRealLastPrice:'on'}),createInitialWorkspace())).toThrow(/Invalid appearance field haShowRealLastPrice/);
});
