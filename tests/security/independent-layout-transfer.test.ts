import {expect,it} from 'vitest';
import {createInitialWorkspace} from '../../src/ui/workspace-state';
import {exportLayoutText,previewLayoutText} from '../../src/ui/layout-transfer';
it('exports durable source metadata without process-local bar-array authority or global collections',()=>{
 const workspace=createInitialWorkspace(),file=JSON.parse(exportLayoutText(workspace));
 expect(Object.keys(file).sort()).toEqual(['grid','kind','name','schemaVersion','sources']);expect(file.kind).toBe('lv-layout');expect(file.sources).toHaveLength(1);
 expect(Object.hasOwn(file.sources[0],'inputIdentity')).toBe(false);expect(file.sources[0].bars).toBeUndefined();expect(file.paper).toBeUndefined();expect(file.alerts).toBeUndefined();expect(file.watchBook).toBeUndefined();
});
it('accepts an own-export with unchanged durable provenance after runtime bar-array tokens are retired',()=>{
 const workspace=createInitialWorkspace(),file=JSON.parse(exportLayoutText(workspace));
 // A prior session token is an implementation detail, never a portable source identity.
 for(const source of file.sources)delete source.inputIdentity;
 const preview=previewLayoutText(JSON.stringify(file),workspace);expect(preview.file.grid).toEqual(workspace.grid);expect(preview.file.grid).not.toBe(workspace.grid);
 const changed=structuredClone(file);changed.sources[0].revision='another-source-revision';expect(()=>previewLayoutText(JSON.stringify(changed),workspace)).toThrow();
});
