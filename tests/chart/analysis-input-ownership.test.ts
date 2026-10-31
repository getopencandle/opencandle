import {readFileSync} from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {expect,it} from 'vitest';
import {fixtureDataset} from '../../src/domain/fixtures';
import {barInputIdentity} from '../../src/chart/bar-input-identity';
import {sameChartSourceBasis,sourceContextForDataset} from '../../src/chart/source-context';

// Execute the actual adapter methods. This is a controller contract test, not GUI evidence.
const lines=readFileSync(new URL('../../src/chart/adapter.ts',import.meta.url),'utf8').split(/\r?\n/);
const methods=['isInputOwned:','isInputCurrent:'].map(name=>{
 const line=lines.find(value=>value.trimStart().startsWith(name));
 if(!line)throw Error('Actual adapter ownership method is missing: '+name);
 return line;
}).join('\n');
const body=stripTypeScriptTypes('const controller={'+methods+'};', {mode:'strip'})+'return controller;';
function fixture(){
 const dataset=fixtureDataset('GME',3),bars=dataset.bars,source=sourceContextForDataset(dataset,bars);
 const state={disposed:false,currentSource:source,requestedStyle:'candles',analysisPending:0,analysisUnavailable:'',pending:false};
 const input={bars,source,style:'candles'};
 type Input=typeof input;
 const controller=()=>new Function('disposed','currentSource','requestedStyle','analysisPending','analysisUnavailable','marketQueue','barInputIdentity','sameChartSourceBasis',body)(state.disposed,state.currentSource,state.requestedStyle,state.analysisPending,state.analysisUnavailable,{isPending:()=>state.pending},barInputIdentity,sameChartSourceBasis) as {isInputOwned:(input:Input)=>boolean;isInputCurrent:(input:Input)=>boolean};
 return{state,input,controller};
}
it.each(['pending','analysisPending','analysisUnavailable'] as const)('%s blocks mutation eligibility without retiring the exact native input owner',key=>{
 const h=fixture();expect(h.controller().isInputOwned(h.input)).toBe(true);expect(h.controller().isInputCurrent(h.input)).toBe(true);
 if(key==='pending')h.state.pending=true;else if(key==='analysisPending')h.state.analysisPending=1;else h.state.analysisUnavailable='Accepted edit publication failed';
 expect(h.controller().isInputOwned(h.input)).toBe(true);expect(h.controller().isInputCurrent(h.input)).toBe(false);
});
it('disposed native controller grants neither ownership nor edit eligibility',()=>{const h=fixture();h.state.disposed=true;expect(h.controller().isInputOwned(h.input)).toBe(false);expect(h.controller().isInputCurrent(h.input)).toBe(false);});
it('a copied bar array cannot borrow the original input token',()=>{const h=fixture(),forged={...h.input,bars:[...h.input.bars],source:{...h.input.source,inputIdentity:barInputIdentity(h.input.bars)}};expect(h.controller().isInputOwned(forged)).toBe(false);expect(h.controller().isInputCurrent(forged)).toBe(false);});
it.each(['datasetId','revision','label','resolution','basisIdentity'] as const)('a changed native %s retires ownership even with identical bar objects',field=>{const h=fixture();h.state.currentSource={...h.state.currentSource,[field]:String(h.state.currentSource[field])+'-changed'};expect(h.controller().isInputOwned(h.input)).toBe(false);expect(h.controller().isInputCurrent(h.input)).toBe(false);});
it('source records may be reconstructed without retiring the exact immutable input',()=>{const h=fixture();h.state.currentSource={...h.state.currentSource};expect(h.controller().isInputOwned({...h.input,source:{...h.input.source}})).toBe(true);});
it('native style changes retire both ownership and eligibility',()=>{const h=fixture();h.state.requestedStyle='heikinashi';expect(h.controller().isInputOwned(h.input)).toBe(false);expect(h.controller().isInputCurrent(h.input)).toBe(false);});
