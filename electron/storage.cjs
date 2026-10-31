'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { BoundaryError, jsonData, MAX_JSON_BYTES } = require('./validation.cjs');
const renameDelays=[20,40,80,160,320];
async function renameCommittedFile(temporary,target,rename=fs.rename){
  for(let attempt=0;;attempt++){
    try{return await rename(temporary,target);}
    catch(error){if(process.platform!=='win32'||!['EPERM','EBUSY'].includes(error.code)||attempt>=renameDelays.length)throw error;await new Promise(resolve=>setTimeout(resolve,renameDelays[attempt]));}
  }
}
class WorkspaceStore {
  constructor(directory,{rename=fs.rename}={}) { if(typeof rename!=='function')throw new TypeError('Invalid storage rename adapter.');this.rename=rename;this.directory = directory; this.file = path.join(directory, 'workspace.json'); this.queue = Promise.resolve(); }
  async load() {
    let handle,raw;
    try { handle = await fs.open(this.file, 'r'); }
    catch (e) { if (e.code === 'ENOENT') return { schemaVersion: 1, revision: 0, savedAt: null, data: null, storage: { directory: this.directory, backend: 'json-atomic' } }; throw e; }
    let failed=false;
    try {
      const limit=MAX_JSON_BYTES+1024,stat=await handle.stat();
      if(!stat.isFile())throw new BoundaryError('STORAGE_INVALID','Saved workspace must be a regular file.');
      if(stat.size>limit)throw new BoundaryError('STORAGE_INVALID','Saved workspace exceeds limits.');
      const buffer=Buffer.alloc(64*1024),chunks=[];let bytes=0;
      for(;;){
        // One extra byte detects growth after stat, before retaining that chunk.
        const result=await handle.read(buffer,0,Math.min(buffer.length,limit-bytes+1),null);
        if(result.bytesRead===0)break;
        bytes+=result.bytesRead;
        if(bytes>limit)throw new BoundaryError('STORAGE_INVALID','Saved workspace exceeds limits.');
        chunks.push(Buffer.from(buffer.subarray(0,result.bytesRead)));
      }
      try { raw=new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(Buffer.concat(chunks,bytes)); }
      catch { throw new BoundaryError('STORAGE_INVALID','Saved workspace must contain valid UTF-8.'); }
    } catch(error) { failed=true;throw error; }
    finally { try { await handle.close(); } catch(error) { if(!failed)throw error; } }
    const saved = JSON.parse(raw);
    if (saved.schemaVersion !== 1 || !Number.isSafeInteger(saved.revision) || saved.revision < 1 || typeof saved.savedAt !== 'string') throw new BoundaryError('STORAGE_INVALID', 'Saved workspace format is invalid.');
    return { schemaVersion: 1, revision: saved.revision, savedAt: saved.savedAt, data: saved.data===null?null:jsonData(saved.data), storage: { directory: this.directory, backend: 'json-atomic' } };
  }
  save(input) {
    return this.commit({...input,data:jsonData(input.data)});
  }
  reset(expectedRevision) {
    if(!Number.isSafeInteger(expectedRevision)||expectedRevision<0)throw new BoundaryError('INVALID_ARGUMENT','Invalid reset revision.');
    return this.commit({expectedRevision,data:null});
  }
  commit(input) {
    const operation = this.queue.then(async () => {
      const current = await this.load();
      if (current.revision !== input.expectedRevision) throw new BoundaryError('REVISION_CONFLICT', 'Workspace changed. Reload before saving.');
      if (current.revision >= Number.MAX_SAFE_INTEGER) throw new BoundaryError('REVISION_EXHAUSTED', 'Local workspace revision is exhausted. Existing data has been retained.');
      const saved = { schemaVersion: 1, revision: current.revision + 1, savedAt: new Date().toISOString(), data: input.data===null?null:jsonData(input.data) };
      await fs.mkdir(this.directory, { recursive: true });
      const temporary = this.file + '.tmp-' + require('node:crypto').randomUUID();
      let handle;
      try { handle = await fs.open(temporary, 'wx', 0o600); await handle.writeFile(JSON.stringify(saved), 'utf8'); await handle.sync(); await handle.close(); handle = undefined; await renameCommittedFile(temporary, this.file, this.rename); }
      finally { await handle?.close().catch(() => {}); await fs.unlink(temporary).catch(() => {}); }
      return { revision: saved.revision, savedAt: saved.savedAt };
    });
    this.queue = operation.catch(() => {});
    return operation;
  }
}
module.exports = { WorkspaceStore };
