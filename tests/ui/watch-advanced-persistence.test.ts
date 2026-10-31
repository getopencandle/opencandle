import {expect,it} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {restoreWorkspace} from '../../src/ui/workspace-validation';
import {prepareWorkspaceJSON} from '../../src/ui/workspace-json';
it('retains Advanced View settings through actual workspace export and recovery',()=>{
 const initial=createInitialWorkspace(),candidate=structuredClone(initial);candidate.watchAdvanced!.settings={...candidate.watchAdvanced!.settings,tab:'dividends',mode:'risk',group:'exchange',summary:'median',currency:'USD',dividendBasis:'pay-date',timezone:'America/Phoenix'};
 const recovered=restoreWorkspace(JSON.parse(JSON.stringify(prepareWorkspaceJSON(candidate))),initial);
 expect(recovered.watchAdvanced!.settings).toMatchObject({tab:'dividends',mode:'risk',group:'exchange',summary:'median',currency:'USD',dividendBasis:'pay-date',timezone:'America/Phoenix'});expect(recovered.watchAdvanced!.data).toEqual({schemaVersion:1,observations:[],associations:[],fx:[]});
});
it('migrates absent legacy Advanced View only and rejects malformed present state atomically',()=>{
 const initial=createInitialWorkspace(),legacy=structuredClone(initial);delete legacy.watchAdvanced;expect(restoreWorkspace(legacy,initial).watchAdvanced).toEqual(initial.watchAdvanced);
 const before=JSON.stringify(initial);for(const watchAdvanced of [null,undefined,{},false,{...initial.watchAdvanced,schemaVersion:2},{...initial.watchAdvanced,settings:{...initial.watchAdvanced!.settings,summary:'sum'}},{...initial.watchAdvanced,data:{schemaVersion:1,observations:[],associations:[],fx:[],hidden:1}}])expect(()=>restoreWorkspace({...initial,watchAdvanced},initial)).toThrow();expect(JSON.stringify(initial)).toBe(before);
});
