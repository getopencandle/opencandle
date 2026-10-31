/**
 * Keeps tests/fixtures/reference/coverage.json in step with the catalog: every built-in has exactly one row, every
 * listed case exists in expected.json, every expected case is listed, and an untested row says why. A new indicator
 * therefore fails here until it is classified (and, ideally, given a reference case in scripts/reference/).
 */
import {describe,expect,it} from 'vitest';
import {ALL_IDS,EXPECTED,loadCoverage} from './harness';

describe('reference coverage table',()=>{
 const {rows}=loadCoverage();
 it('has exactly one row per built-in',()=>{expect(rows.map(row=>row.id).sort()).toEqual([...ALL_IDS].sort());});
 it('lists every expected case and only existing ones',()=>{
  const known=new Set([...EXPECTED.cases.map(c=>c.id),...EXPECTED.vwap.map(c=>c.id)]),listed=new Set(rows.flatMap(row=>row.cases));
  for(const id of listed)expect(known.has(id),id).toBe(true);
  for(const id of known)expect(listed.has(id),id+' is not listed in coverage.json').toBe(true);
 });
 it('statuses are consistent and untested rows give a reason',()=>{
  for(const row of rows){
   if(row.status==='untested'){expect(row.cases,row.id).toEqual([]);expect(row.reason,row.id).toMatch(/\w{8,}/);}
   else expect(row.cases.length+(row.status==='hand-tested'?1:0),row.id).toBeGreaterThan(0);
  }
 });
});
