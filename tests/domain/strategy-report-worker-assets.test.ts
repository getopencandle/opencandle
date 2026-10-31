import { expect, it } from 'vitest';
import { build } from 'vite';
import { resolve,join } from 'node:path';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';

// Build the actual application configuration in memory. This verifies emitted
// assets, not execution under Electron's private origin or CSP.
it('emits a production worker asset referenced by the actual application bundle', async () => {
  const result = await build({ configFile: resolve('vite.config.ts'), logLevel: 'silent', build: { write: false } });
  const output = (Array.isArray(result) ? result : [result]).flatMap(row => 'output' in row ? row.output : []);
  const workers = output.filter(row => /^assets\/worker-[\w-]+\.js$/.test(row.fileName));
  expect(workers).toHaveLength(2);
  // L5b: the strategy engine worker (chart trade marks, feedback traces) is its own asset.
  const engines=output.filter(row=>/^assets\/engine-worker-[\w-]+\.js$/.test(row.fileName));expect(engines).toHaveLength(1);
  const decoded=workers.map(worker=>({worker,text:worker.type==='chunk'?worker.code:typeof worker.source==='string'?worker.source:new TextDecoder().decode(worker.source)}));
  const reports=decoded.filter(row=>row.text.includes('REPORT_')),vwap=decoded.filter(row=>row.text.includes('VWAP_'));
  expect(reports).toHaveLength(1);expect(vwap).toHaveLength(1);expect(reports[0].worker.fileName).not.toBe(vwap[0].worker.fileName);
  const {worker,text:workerText}=reports[0];
  expect(workerText).toContain('REPORT_');
  expect(workerText).toContain('postMessage');
  const entry = output.find(row => row.type === 'chunk' && row.isEntry);
  expect(entry?.type).toBe('chunk');
  if (entry?.type !== 'chunk') throw new Error('Production entry was not emitted.');
  // Lazy loading (lazy-surfaces.tsx) moved closed-at-boot dialogs into their own chunks, so a worker URL may
  // live in a lazily imported chunk. Each worker must still be referenced, next to a `new Worker(` construction, by a chunk
  // the entry reaches through its static or dynamic imports.
  const chunks=new Map(output.filter(row=>row.type==='chunk').map(row=>[row.fileName,row] as const));
  const reachable=new Set<string>([entry.fileName]),queue=[entry.fileName];
  while(queue.length){const row=chunks.get(queue.shift()!);if(row?.type!=='chunk')continue;for(const next of [...row.imports,...row.dynamicImports])if(!reachable.has(next)){reachable.add(next);queue.push(next);}}
  const referencing=(fileName:string)=>[...reachable].map(name=>chunks.get(name)!).filter(row=>row?.type==='chunk'&&row.code.includes(fileName.slice('assets/'.length))&&/new Worker\(/.test(row.code));
  for(const fileName of [worker.fileName,vwap[0].worker.fileName,engines[0].fileName])expect(referencing(fileName).length,fileName).toBeGreaterThan(0);
  expect(entry.code).toMatch(/new Worker\(/);
  const validation=createRequire(import.meta.url)('../../electron/validation.cjs'),assets=resolve('dist');
  for(const worker of [...decoded.map(row=>row.worker),...engines])expect(validation.assetPath('lv://app/'+worker.fileName,assets)).toBe(join(assets,...worker.fileName.split('/')));
  const main=readFileSync('electron/main.cjs','utf8'),policy=main.match(/const csp = "([^"]+)"/)?.[1];
  expect(policy?.split(';').map(value=>value.trim())).toContain("worker-src 'self' blob:");
  expect(policy?.split(';').map(value=>value.trim())).toContain("connect-src 'none'");
  expect(main).toContain("'.js':'text/javascript; charset=utf-8'");
  // Static routing/MIME/CSP contract only. A real lv:// worker remains unexecuted.
}, 30000);
