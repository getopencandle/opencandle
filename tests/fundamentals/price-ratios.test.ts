import {describe,it,expect} from 'vitest';
import {normalizeCompanyFacts} from '../../src/fundamentals/company-facts';
import {computePriceRatios,formatRatio,type PriceInput} from '../../src/fundamentals/price-ratios';
import {syntheticStatementFacts} from './fixtures/synthetic-statements';
// SYNTHETIC inputs only. Expected numbers are worked by hand:
//   revenue TTM to 2024-10-31 = 1020 (FY2023 10-K/A) + 900 (9M FY24) - 740 (9M FY23) = 1180
//   diluted EPS, reported twelve months ending 2024-01-31 = 1.25 ; equity 400 ; shares 200 ; close 10
//   market cap = 10*200 = 2000 ; P/E = 10/1.25 = 8 ; P/S = 2000/1180 ; P/B = 2000/400 = 5 ; EPS yield = 1.25/10*100 = 12.5
const facts=(mutate?:(raw:any)=>void)=>{
 const raw=syntheticStatementFacts() as any;
 raw.facts['us-gaap'].StockholdersEquity={units:{USD:[{end:'2024-01-31',val:400,filed:'2024-03-20',form:'10-K',accn:'0000009999-24-000001'}]}};
 raw.facts.dei={EntityCommonStockSharesOutstanding:{units:{shares:[{end:'2024-11-29',val:200,filed:'2024-12-05',form:'10-Q',accn:'0000009999-24-000005'}]}}};
 mutate?.(raw);return normalizeCompanyFacts(raw);
};
const price:PriceInput={close:10,date:'2024-12-20',currency:'USD',symbol:'SYNTH',source:'SYNTHETIC DEMO dataset'};
const run=(f=facts(),p:PriceInput|null=price,extra:Partial<{asOf:string|null;today:string}>={})=>computePriceRatios({facts:f,currency:'USD',asOf:'2024-12-31',price:p,today:'2024-12-24',...extra});
const by=(rows:ReturnType<typeof run>,id:string)=>rows.find(r=>r.id===id)!;
describe('price-based ratios',()=>{
 it('computes market cap, P/E, P/S, P/B and EPS yield from the loaded close',()=>{
  const rows=run();
  expect(by(rows,'market_cap').value).toBe(2000);
  expect(by(rows,'price_earnings').value).toBe(8);
  expect(by(rows,'price_sales').value).toBeCloseTo(2000/1180,10);
  expect(by(rows,'price_book').value).toBe(5);
  expect(by(rows,'eps_yield').value).toBe(12.5);
  expect(by(rows,'price_earnings').inputs.map(i=>i.label)).toEqual(['Last loaded close','Twelve-month diluted EPS']);
  expect(by(rows,'price_earnings').inputs[0].detail).toContain('SYNTH on 2024-12-20');
  expect(by(rows,'price_sales').inputs.find(i=>i.label==='TTM total revenue')!.detail).toContain('2024-10-31');
  expect(by(rows,'market_cap').catalogId).toBe('AN.FUND.METRIC.43000597015');
  expect(formatRatio(by(rows,'market_cap'))).toBe('2,000 USD');
  expect(formatRatio(by(rows,'price_earnings'))).toBe('8x');
 });
 it('is unavailable with a reason when there is no price',()=>{
  for(const r of run(facts(),null)){expect(r.value).toBeNull();expect(r.reason).toMatch(/No loaded price/);expect(formatRatio(r)).toBe('Not available');}
 });
 it('refuses a stale, future, currency-mismatched or currency-less price',()=>{
  expect(by(run(facts(),{...price,date:'2024-12-10'}),'price_earnings')).toMatchObject({value:null,reason:expect.stringMatching(/14 days before 2024-12-24/)});
  expect(by(run(facts(),{...price,date:'2024-12-24'}),'market_cap').value).toBe(2000);
  expect(by(run(facts(),{...price,date:'2024-12-31'}),'market_cap').reason).toMatch(/future-dated/);
  expect(by(run(facts(),{...price,currency:'EUR'}),'market_cap').reason).toMatch(/does not convert currencies/);
  expect(by(run(facts(),{...price,currency:null}),'market_cap').reason).toMatch(/never guesses a currency/);
  expect(by(run(facts(),{...price,close:0}),'market_cap').reason).toMatch(/positive/);
 });
 it('needs the filing inputs it uses and says which are missing',()=>{
  const noShares=run(facts(raw=>{delete raw.facts.dei;}));
  expect(by(noShares,'market_cap').reason).toMatch(/shares outstanding/);expect(by(noShares,'price_sales').reason).toMatch(/market capitalization/);
  expect(by(noShares,'price_earnings').value).toBe(8);
  const noEquity=run(facts(raw=>{delete raw.facts['us-gaap'].StockholdersEquity;}));
  expect(by(noEquity,'price_book').reason).toMatch(/equity/);expect(by(noEquity,'price_sales').value).not.toBeNull();
 });
 it('rejects negative EPS and negative equity instead of printing a meaningless ratio',()=>{
  const loss=run(facts(raw=>{raw.facts['us-gaap'].EarningsPerShareDiluted.units['USD/shares'][0].val=-0.5;}));
  expect(by(loss,'price_earnings')).toMatchObject({value:null,reason:expect.stringMatching(/zero or negative/)});expect(by(loss,'eps_yield').value).toBeNull();
  const neg=run(facts(raw=>{raw.facts['us-gaap'].StockholdersEquity.units.USD[0].val=-50;}));
  expect(by(neg,'price_book').reason).toMatch(/zero or negative/);
 });
 it('honours the filing cutoff for shares: a count filed after it is not used',()=>{
  expect(by(run(facts(),price,{asOf:'2024-12-04'}),'market_cap').reason).toMatch(/shares outstanding/);
 });
});
