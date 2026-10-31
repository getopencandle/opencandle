import React,{createContext,useContext,useMemo} from 'react';
import type {BarDataset} from '../domain/types';
import type {NewsDocument} from '../analysis-news/news';
import type {FilingsDocument,FilingsProfile} from '../analysis-news/filings';
import {newsItemDisplay} from '../analysis-news/news-content';
import {formatUtc} from '../analysis-news/news-view';
import {factDuration,type FactsDocument,type ReportedFact} from './company-facts';
import {linkedDocumentId,type FundamentalsLink,type FundamentalsMarket} from './preferences';
import {demoDataMode} from '../domain/demo-mode';
/** The empty text for a demo-identity symbol. Legacy keeps "Demo symbols have no ..."; example mode says Example data; otherwise plain. */
const demoEmpty=(what:string):string=>demoDataMode()==='legacy'?'Demo symbols have no '+what+'.':demoDataMode()==='example'?'Example data has no '+what+'.':'No '+what+' for this symbol.';
import {loadCikMap,lookupCik} from './cik-map';
import {heatmapResolutionSeconds,type HeatmapMetadata} from '../domain/heatmap';
import {technicalRating} from '../market-views/rating';
import {MONTHS,seasonals} from '../market-views/seasonals';
import {detailCoverage,type DetailCoverageRow} from '../domain/symbol-details-quote';
import type {DetailSnapshot} from '../watchlists/details';
import type {SymbolFundamentalsSummary} from '../ui/symbol-details-fundamentals';

/**
 * Details sections filled only from data already in the workspace: SEC companyfacts
 * and submissions the user loaded (free public SEC data or local imports), supplied heatmap metadata, locally imported news
 * and loaded daily bars. Nothing is fetched here. Anything that needs a licensed or paid source says so instead of a value.
 */
export interface DetailSources {
 datasets:readonly BarDataset[];news:readonly NewsDocument[];filings:readonly FilingsDocument[];facts:readonly FactsDocument[];
 links:readonly FundamentalsLink[];heatmap:readonly HeatmapMetadata[];onOpenNews?:()=>void;
}
const DetailSourcesContext=createContext<DetailSources|null>(null);
export function DetailSourcesProvider({value,children}:{value:DetailSources;children?:React.ReactNode}){return <DetailSourcesContext.Provider value={value}>{children}</DetailSourcesContext.Provider>;}

export const NOT_LOCAL='not available from local sources';
export interface DetailLine {label:string;value:string;note?:string}
export interface DetailSection {id:'profile'|'sector'|'earnings'|'dividends'|'news'|'technical'|'seasonals';title:string;lines:DetailLine[];empty:string|null;footnote:string}

const sameSymbol=(a:string,b:string)=>a.trim().toUpperCase()===b.trim().toUpperCase();
/** Loaded daily bars for this exact market (exchange, symbol, demo flag). */
export function detailDailyDataset(datasets:readonly BarDataset[],market:FundamentalsMarket):BarDataset|null{
 return datasets.find(d=>sameSymbol(d.instrument.symbol,market.symbol)&&d.instrument.exchange===market.exchange&&d.provenance.fixture===market.synthetic&&heatmapResolutionSeconds(d.resolution)===86400&&d.bars.length>0)??null;
}
/** The companyfacts document explicitly linked to this market; a demo market never shows real filings and vice versa. */
export function detailFacts(sources:Pick<DetailSources,'facts'|'links'>,market:FundamentalsMarket):FactsDocument|null{
 const id=linkedDocumentId(sources.links,market),doc=id?sources.facts.find(d=>d.id===id):undefined;
 return doc&&(doc.source.kind==='synthetic')===market.synthetic?doc:null;
}
/** Saved SEC submissions for this company: by reported ticker, then the linked facts CIK, then the imported SEC ticker file. Never for demo symbols. */
export function detailFilings(filings:readonly FilingsDocument[],market:FundamentalsMarket,facts:FactsDocument|null,cikFor:(symbol:string)=>string|null=symbol=>{try{return lookupCik(loadCikMap(),symbol)?.cik??null;}catch{return null;}}):FilingsDocument|null{
 if(market.synthetic)return null;
 const byTicker=filings.find(d=>d.profile?.tickers.some(t=>sameSymbol(t,market.symbol)));if(byTicker)return byTicker;
 const cik=facts?.facts.cik??cikFor(market.symbol),padded=cik?cik.padStart(10,'0'):null;
 return padded?filings.find(d=>d.cik===padded)??null:null;
}

const MONTH_NAMES=['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const fiscalEnd=(mmdd:string)=>{const m=Number(mmdd.slice(0,2)),d=Number(mmdd.slice(2));return m>=1&&m<=12?MONTH_NAMES[m-1]+' '+d:mmdd;};
const numberText=(value:number,digits=2)=>value.toLocaleString('en-US',{minimumFractionDigits:digits,maximumFractionDigits:digits});

export function detailProfile(profile:FilingsProfile|null,filings:FilingsDocument|null,facts:FactsDocument|null,market:FundamentalsMarket):DetailSection{
 const lines:DetailLine[]=[],name=filings?.entityName??facts?.facts.entityName??null,cik=filings?.cik??facts?.facts.cik??null;
 if(name)lines.push({label:'Company',value:name});if(cik)lines.push({label:'SEC CIK',value:cik});
 if(profile){
  if(profile.entityType)lines.push({label:'Entity type',value:profile.entityType});if(profile.category)lines.push({label:'Filer category',value:profile.category});
  if(profile.stateOfIncorporation)lines.push({label:'Incorporated in',value:profile.stateOfIncorporation});if(profile.fiscalYearEnd)lines.push({label:'Fiscal year ends',value:fiscalEnd(profile.fiscalYearEnd)});
  // SIC 6770 is the SEC code for blank check companies (SPACs).
  if(profile.sic)lines.push({label:'Blank check company',value:profile.sic==='6770'?'Yes (SIC 6770)':'No',note:'From the SEC industry code'});
  const place=[profile.businessCity,profile.businessState].filter(Boolean).join(', ');if(place)lines.push({label:'Business address',value:place});
  if(profile.tickers.length)lines.push({label:'Listed as',value:profile.tickers.map((t,i)=>t+(profile.exchanges[i]?' ('+profile.exchanges[i]+')':'')).join(', ')});
 }
 const empty=lines.length?null:market.synthetic?demoEmpty('company profile'):'No company data is loaded for this symbol. Load SEC filings in News or company facts in Fundamentals.';
 return {id:'profile',title:'Company profile',lines,empty,footnote:filings?'From SEC submissions retrieved '+formatUtc(filings.source.retrievedAt)+(profile?'':'. Load the SEC filings again to add the profile fields.'):facts?'From the linked SEC companyfacts. Load SEC filings in News for the full profile.':'Description, employees and officers are '+NOT_LOCAL+'.'};
}

export function detailSector(profile:FilingsProfile|null,supplied:HeatmapMetadata|null):DetailSection{
 const lines:DetailLine[]=[];
 if(profile?.sicDescription||profile?.sic)lines.push({label:'SEC industry (SIC)',value:[profile.sic,profile.sicDescription].filter(Boolean).join(' · ')});
 if(supplied?.sector)lines.push({label:'Sector (supplied)',value:supplied.sector,note:supplied.source});
 return {id:'sector',title:'Sector and industry',lines,empty:lines.length?null:'No classification is loaded. SEC filings give the SIC industry; a heatmap metadata file can supply a sector.',footnote:'SIC codes are the SEC industry codes, not a vendor sector scheme. Vendor sector classifications are '+NOT_LOCAL+'.'};
}

const EPS_TAGS=['EarningsPerShareDiluted','EarningsPerShareBasic'],DIVIDEND_TAGS=['CommonStockDividendsPerShareDeclared','CommonStockDividendsPerShareCashPaid'];
/** Latest filed value per period end, for reported per-share facts of about one quarter (80-100 days) or one year (350-380 days). */
export function perShareHistory(facts:FactsDocument|null,tags:readonly string[],limit=8):{tag:string;rows:ReportedFact[];span:'quarter'|'year'}|null{
 if(!facts)return null;
 for(const tag of tags){const concept=facts.facts.concepts.find(c=>c.tag===tag&&c.namespace==='us-gaap');if(!concept)continue;
  for(const span of ['quarter','year'] as const){const [lo,hi]=span==='quarter'?[80,100]:[350,380],byEnd=new Map<string,ReportedFact>();
   for(const row of concept.observations){const days=factDuration(row);if(days===null||days<lo||days>hi||!/\/shares$/.test(row.unit))continue;const old=byEnd.get(row.end);if(!old||(row.filed??'')>(old.filed??''))byEnd.set(row.end,row);}
   const rows=[...byEnd.values()].sort((a,b)=>b.end.localeCompare(a.end)).slice(0,limit);if(rows.length)return {tag,rows,span};}}
 return null;
}
export function detailEarnings(facts:FactsDocument|null,filings:FilingsDocument|null,market:FundamentalsMarket):DetailSection{
 const history=perShareHistory(facts,EPS_TAGS),lines:DetailLine[]=[];
 if(history)for(const row of history.rows)lines.push({label:(history.tag==='EarningsPerShareDiluted'?'Diluted EPS':'Basic EPS')+' · '+(history.span==='quarter'?'quarter':'year')+' to '+row.end,value:numberText(row.value)+' '+row.unit.replace('/shares',''),note:[row.form,row.filed?'filed '+row.filed:null].filter(Boolean).join(' ')});
 const reports=(filings?.rows??[]).filter(r=>r.form==='10-Q'||r.form==='10-K').sort((a,b)=>b.filed.localeCompare(a.filed)).slice(0,4);
 for(const r of reports)lines.push({label:r.form+' filed',value:r.filed,note:r.reportDate?'period '+r.reportDate:undefined});
 const empty=lines.length?null:market.synthetic?demoEmpty('reported earnings'):'No reported earnings are loaded. Link SEC company facts in Fundamentals or load SEC filings in News.';
 return {id:'earnings',title:'Earnings',lines,empty,footnote:'Reported values from SEC filings only. Estimates, surprises and the next report date are '+NOT_LOCAL+'.'};
}
export function detailDividends(facts:FactsDocument|null,market:FundamentalsMarket):DetailSection{
 const history=perShareHistory(facts,DIVIDEND_TAGS),lines:DetailLine[]=[];
 if(history)for(const row of history.rows)lines.push({label:(history.tag==='CommonStockDividendsPerShareDeclared'?'Declared':'Paid')+' per share · '+(history.span==='quarter'?'quarter':'year')+' to '+row.end,value:numberText(row.value,4)+' '+row.unit.replace('/shares',''),note:[row.form,row.filed?'filed '+row.filed:null].filter(Boolean).join(' ')});
 const empty=lines.length?null:facts?'The linked company facts report no dividends per share.':market.synthetic?demoEmpty('dividend history'):'No dividend data is loaded. Link SEC company facts in Fundamentals.';
 return {id:'dividends',title:'Dividends',lines,empty,footnote:'Per-share amounts as reported in SEC filings. Ex-dividend and payment dates and yield are '+NOT_LOCAL+'.'};
}
export function detailNews(documents:readonly NewsDocument[],symbol:string,limit=5):DetailSection{
 const rows:{title:string;provider:string;publishedAt:string;synthetic:boolean}[]=[];
 for(const d of documents)for(const item of d.items)if(item.instruments?.some(s=>sameSymbol(s,symbol)))rows.push({title:newsItemDisplay(item).title,provider:item.provider,publishedAt:item.publishedAt,synthetic:d.kind==='synthetic'});
 rows.sort((a,b)=>b.publishedAt.localeCompare(a.publishedAt));
 return {id:'news',title:'News',lines:rows.slice(0,limit).map(r=>({label:formatUtc(r.publishedAt)+' · '+r.provider+(r.synthetic?' · Demo':''),value:r.title})),empty:rows.length?null:'No imported news mentions '+symbol.trim()+'.',footnote:rows.length>limit?'Latest '+limit+' of '+rows.length+' imported stories.':'Imported news only. OpenCandle does not fetch news.'};
}
export function detailTechnical(dataset:BarDataset|null):DetailSection{
 if(!dataset)return {id:'technical',title:'Technical rating',lines:[],empty:'Load daily bars for this symbol to compute a rating.',footnote:'OpenCandle rating from loaded daily bars.'};
 const r=technicalRating(dataset.bars);
 const lines:DetailLine[]=r.score===null?[]:[{label:'Summary',value:r.label+' ('+numberText(r.score)+')'},{label:'Votes',value:r.buy+' buy · '+r.neutral+' neutral · '+r.sell+' sell'},...(r.groups.average===null?[]:[{label:'Moving averages',value:numberText(r.groups.average)}]),...(r.groups.oscillator===null?[]:[{label:'Oscillators',value:numberText(r.groups.oscillator)}])];
 return {id:'technical',title:'Technical rating',lines,empty:r.score===null?'Needs at least '+r.needed+' daily bars (loaded '+r.have+').':null,footnote:'OpenCandle rating from '+r.have+' loaded daily bars: moving averages vote on the last close, oscillators on common thresholds; score runs from -1 to 1. Not a reference rating.'};
}
export function detailSeasonals(dataset:BarDataset|null):DetailSection{
 if(!dataset)return {id:'seasonals',title:'Seasonals',lines:[],empty:'Load daily bars for this symbol to see seasonals.',footnote:'Average monthly change from loaded daily bars.'};
 const s=seasonals(dataset),lines=s.note?[]:MONTHS.map((m,i)=>({label:m,value:s.monthlyAverage[i]===null?'n/a':(s.monthlyAverage[i]!>0?'+':'')+numberText(s.monthlyAverage[i]!)+'%'}));
 return {id:'seasonals',title:'Seasonals',lines,empty:s.note||null,footnote:s.note?'Average monthly change from loaded daily bars.':'Average month-end to month-end change over '+s.years.length+' loaded years (UTC months).'};
}

/** Every section for one market, in display order. */
export function detailSections(sources:DetailSources,market:FundamentalsMarket):DetailSection[]{
 const facts=detailFacts(sources,market),filings=detailFilings(sources.filings,market,facts),profile=filings?.profile??null,dataset=detailDailyDataset(sources.datasets,market);
 const supplied=sources.heatmap.find(row=>sources.datasets.some(d=>d.instrument.id===row.instrumentId&&sameSymbol(d.instrument.symbol,market.symbol)&&d.instrument.exchange===market.exchange))??null;
 return [detailProfile(profile,filings,facts,market),detailSector(profile,supplied),detailEarnings(facts,filings,market),detailDividends(facts,market),detailNews(sources.news,market.symbol),detailTechnical(dataset),detailSeasonals(dataset)];
}
const REPLACED=new Set(['profile','sector','earnings','dividends','technical','seasonals','news']);
/** Coverage rows still shown beside the sections (exchange, identifiers, ETF data, bonds, options). */
export function remainingCoverage(rows:readonly DetailCoverageRow[]):DetailCoverageRow[]{return rows.filter(row=>!REPLACED.has(row.id));}

/**
 * Renders the sections when the app supplies sources; otherwise renders `children` (the plain coverage list) unchanged.
 * Hooks live here, not in SymbolDetails, so the parent keeps its hook order.
 */
export function DetailSourceSections({market,snapshot,summary,assetClass,children}:{market:FundamentalsMarket;snapshot:DetailSnapshot;summary:SymbolFundamentalsSummary|null;assetClass:string|null;children?:React.ReactNode}){
 const sources=useContext(DetailSourcesContext);
 const sections=useMemo(()=>sources?detailSections(sources,market):null,[sources,market.exchange,market.symbol,market.synthetic]);
 if(!sources||!sections)return <>{children}</>;
 const rest=remainingCoverage(detailCoverage(snapshot,summary,assetClass));
 return <>{sections.map(section=><section key={section.id} className="detail-block detail-source" data-detail-section={section.id} aria-label={section.title}><h4>{section.title}</h4>
  {section.empty&&<p className="detail-unavailable">{section.empty}</p>}
  {section.lines.length>0&&<dl>{section.lines.map((line,i)=><div key={i} title={line.note}><dt>{line.label}</dt><dd>{line.value}</dd></div>)}</dl>}
  <p className="detail-source-diagnostic">{section.footnote}</p>
  {section.id==='news'&&sources.onOpenNews&&<div className="button-row"><button type="button" onClick={sources.onOpenNews}>Open News</button></div>}
 </section>)}
 <section className="detail-block detail-coverage" aria-label="More details"><h4>More details</h4><dl>{rest.map(row=><div key={row.id} data-coverage={row.id} title={row.reason??undefined}><dt>{row.label}</dt><dd className={row.value===null?'detail-unavailable':undefined}>{row.value??'Not available: '+row.reason}</dd></div>)}</dl></section></>;
}
