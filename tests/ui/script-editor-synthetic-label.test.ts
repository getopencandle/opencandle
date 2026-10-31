import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {expect,it,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {ScriptLibraryPanel} from '../../src/ui/ScriptLibraryPanel';
import {createScriptLibrary,saveScript,selectedScript,bindScript,restoreScriptBindings} from '../../src/ui/script-library';
import {compileLVScript} from '../../src/ui/script-editor-commands';
import {scriptRequestBase} from '../../src/ui/script-requests';
import {scriptRunCount,scriptTailNote} from '../../src/ui/script-jobs';

// Real component markup. The Run boundary uses the existing source-extraction
// pattern with its actual compiler and a controlled worker transport; it never
// executes source in a worker, mutates provider flags, or connects to a feed.
const code='({ onBar(ctx) { ctx.plot("Close", ctx.bar.close); } })';
const document={id:'SYNTHETIC-editor-label',name:'Synthetic label boundary',source:code,pane:'price' as const};
const library=()=>createScriptLibrary(document);
function markup(flags:{fixture:boolean;live?:boolean;synthetic?:boolean}){
 return renderToStaticMarkup(React.createElement(ScriptLibraryPanel,{open:true,onClose:()=>{},chart:null,bars:[],identity:'SYNTHETIC-editor-label',library:library(),onChange:()=>{},bindings:[],onBindingsChange:()=>{},...flags}));
}
async function actualRun(synthetic:boolean){
 const source=readFileSync(new URL('../../src/ui/ScriptLibraryPanel.tsx',import.meta.url),'utf8'),from=source.indexOf(' async function run('),to=source.indexOf(' async function chooseImport(',from);
 if(from<0||to<from)throw Error('Actual ScriptLibraryPanel Run boundary missing');
 const saved=saveScript(library(),document.id,'2026-10-26T00:00:00.000Z'),bars=[{time:100,open:10,high:12,low:9,close:11,volume:100}],context={chart:{},bars,identity:'SYNTHETIC-alpaca-stub-live',fixture:false,live:true,synthetic,bindings:[]},worker=vi.fn(async(_input:Record<string,unknown>)=>({result:{plots:[],orders:[]},barIds:[]}));
 const errors=vi.fn(),publish=vi.fn(),scope={save:()=>saved,compile:compileLVScript,selectedScript,setStatus:vi.fn(),latest:{current:context},cancel:vi.fn(),generation:{current:0},request:{current:null},setBusy:vi.fn(),mode:'add',selectedBinding:'',executeScriptOnBars:worker,scriptRunCount,scriptTailNote,scriptRequestBase,bindScript,restoreScriptBindings,publishBindings:publish,setSelectedBinding:vi.fn(),setResult:vi.fn(),message:errors,runOutcome:vi.fn()};
 const keys=Object.keys(scope),run=Function('scope',stripTypeScriptTypes('const {'+keys.join(',')+'}=scope;'+source.slice(from,to),{mode:'transform'})+';return run;')(scope) as()=>Promise<void>;
 await run();expect(errors).not.toHaveBeenCalled();expect(worker).toHaveBeenCalledOnce();expect(publish).toHaveBeenCalledOnce();return worker.mock.calls[0][0];
}

it('synthetic live prices are disclosed while the actual Run keeps nonfixture live execution permissions',async()=>{
 expect(markup({fixture:false,live:true,synthetic:true})).toContain('Synthetic data · Live updates');
 const before=await actualRun(false),after=await actualRun(true);
 for(const input of [before,after]){expect(input).toMatchObject({fixture:false,live:true});expect(input).not.toHaveProperty('synthetic');}
});
it('ordinary synthetic fixtures retain their existing disclosure',()=>{
 const html=markup({fixture:true});expect(html).toContain('Example data');expect(html).not.toContain('Synthetic data');expect(html).not.toContain('Live updates');
});
it('real live sources retain their live disclosure',()=>{
 const html=markup({fixture:false,live:true});expect(html).toContain('Live market data');expect(html).not.toContain('Synthetic data');expect(html).not.toContain('Example data');
});
it('nonfixture local imports retain their supplied-data disclosure',()=>{
 const html=markup({fixture:false,live:false});expect(html).toContain('Local data');expect(html).not.toContain('Synthetic data');expect(html).not.toContain('Live market data');
});
