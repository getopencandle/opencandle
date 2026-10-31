import type {NumericSeries} from '../types';
import type {CatalogContext,CatalogDefinition,CatalogInput} from '../indicator-catalog';
import {autoAnchorStart,buildVolumeProfile,developingProfile,hdRowHeight,profilePeriods,sessionProfilePeriods,visibleProfileSpan,withFinerBars,AUTO_ANCHORS,PROFILE_MAX_ROWS,PROFILE_PERIODS,PROFILE_PLACEMENTS,PROFILE_ROWS_LAYOUTS,PROFILE_SESSIONS,PROFILE_VOLUME_MODES,VOLUME_PROFILE_POLICIES,type AutoAnchor,type LowerTimeframeBars,type ProfileOptions,type ProfilePeriod,type ProfileRowsLayout,type ProfileSession,type VolumeProfile} from '../volume-profile';

/**
 * Visible range volume profile and Periodic volume profile, in the indicator dialog's
 * Profiles tab. The shared
 * inputs and graphics defaults match the fixed-range volume profile drawing; every other value is our own choice and listed in `unknownDefaults`.
 * The histogram rows are emitted as native boxes by src/chart/vp-visible-range-presentation.ts; POC, VAH and VAL are
 * ordinary plots (one horizontal segment per profile), so their colors, widths and visibility use the Style tab.
 */
/** Also Session volume profile (svp), Session volume profile HD (svphd) and Auto anchored volume profile (aavp). */
export const VP_INDICATOR_IDS=['vrvp','pvp','svp','svphd','aavp'] as const;
export type VpIndicatorId=typeof VP_INDICATOR_IDS[number];
/** The profile kinds an alert can recalculate (they do not follow the visible range). */
/** The kinds whose chart shows a notice when some profile bars had no finer bars (profileDetailNotice). */
export const VP_DETAIL_NOTICE_IDS:readonly VpIndicatorId[]=Object.freeze(['svp','svphd','aavp']);
export const VP_ALERTABLE_IDS:readonly VpIndicatorId[]=Object.freeze(['pvp','svp','aavp']);
export const VP_FACT='drawing-defaults:fixed-range-volume-profile';
const NAMES='indicator-list:profiles';

/** Shared inputs. Titles and defaults of the first four are the fact's (rowsLayout, rows, volume, vaVolume). */
const ROWS_LAYOUT:CatalogInput={key:'rowsLayout',title:'Rows Layout',type:'string',defval:'Number Of Rows',options:PROFILE_ROWS_LAYOUTS};
const ROW_SIZE:CatalogInput={key:'rowSize',title:'Row Size',type:'int',defval:24,min:1,max:1000000,step:1};
const VOLUME:CatalogInput={key:'volume',title:'Volume',type:'string',defval:'Up/Down',options:PROFILE_VOLUME_MODES};
const VALUE_AREA:CatalogInput={key:'valueAreaVolume',title:'Value Area Volume',type:'int',defval:70,min:0,max:100,step:1};
/** graphics.volumeProfile.percentWidth 30 is the fact; the title and the 1-100 bounds are our own choice. */
const WIDTH:CatalogInput={key:'widthPct',title:'Width (% of the box)',type:'int',defval:30,min:1,max:100,step:1};
const placement=(defval:'Left'|'Right'):CatalogInput=>({key:'placement',title:'Placement',type:'string',defval,options:PROFILE_PLACEMENTS});
/** Session profile inputs (our own titles, keys and defaults). */
const SESSION:CatalogInput={key:'session',title:'Session',type:'string',defval:'Extended',options:PROFILE_SESSIONS};
const ANCHOR:CatalogInput={key:'anchor',title:'Anchor',type:'string',defval:'Auto',options:AUTO_ANCHORS};
const LENGTH:CatalogInput={key:'length',title:'Length',type:'int',defval:20,min:1,max:5000,step:1};
const PERIOD:CatalogInput={key:'period',title:'Period',type:'string',defval:'Day',options:PROFILE_PERIODS};
/** The extras. Titles, keys and the defaults (all off) are our own choice; no capture of these options exists. */
const DEVELOPING_POC:CatalogInput={key:'developingPoc',title:'Developing POC',type:'bool',defval:false};
const DEVELOPING_VA:CatalogInput={key:'developingVa',title:'Developing VA',type:'bool',defval:false};
const EXTEND_POC:CatalogInput={key:'extendPocRight',title:'Extend POC right',type:'bool',defval:false};
const ROW_VALUES:CatalogInput={key:'rowValues',title:'Row volume labels',type:'bool',defval:false};
const EXTRAS=[DEVELOPING_POC,DEVELOPING_VA,EXTEND_POC,ROW_VALUES];

/** graphics POC visible width 2, VAH and VAL hidden width 2 (the fact). Colors: the fact's metaInfo values (#f44336 POC,
 *  #2962ff value-area lines); the client registry blanks them, so they are unverified. */
const PLOTS=[
 {id:'poc',label:'POC',color:'#f44336',width:2,visible:true},
 {id:'vah',label:'VAH',color:'#2962ff',width:2,visible:false},
 {id:'val',label:'VAL',color:'#2962ff',width:2,visible:false},
 // Developing levels (our own colors and widths). They carry values only while their input is on.
 {id:'devPoc',label:'Developing POC',color:'#ff9800',width:1},
 {id:'devVah',label:'Developing VAH',color:'#2962ff',width:1},
 {id:'devVal',label:'Developing VAL',color:'#2962ff',width:1},
] as const;
/** The developing plots are continuous lines inside a profile; the presentation breaks them only where a profile starts. */
const CONTINUOUS=['devPoc','devVah','devVal'] as const;
type VpLevels=Record<'poc'|'vah'|'val'|'devPoc'|'devVah'|'devVal',NumericSeries>;

const UNKNOWN_SHARED='Inputs Rows Layout, Row Size 24, Volume Up/Down and Value Area Volume 70, histogram width 30%, POC shown and VAH/VAL hidden at width 2 are quoted from the fixed-range study fact ('+VP_FACT+'); no capture exists for this study, so their equality here is unverified. Colors (#2962ff up, #fbc02d down, 75% / 30% transparency outside / inside the value area, #f44336 POC, #2962ff VAH/VAL) are the fact\'s metaInfo values, which the client registry blanks: unverified.';

function options(ctx:CatalogContext){
 return {rowsLayout:ctx.str('rowsLayout') as ProfileRowsLayout,rowSize:ctx.num('rowSize'),valueAreaPct:ctx.num('valueAreaVolume'),tickSize:ctx.chart?.tickSize??null,lowerTimeframe:ctx.chart?.lowerTimeframe??null,resolution:ctx.chart?.resolution??null};
}
/** causal: the per-bar POC, VAH and VAL are the levels developed through that bar (no look-ahead into later bars of the
 *  period); the drawn histogram keeps the whole period. Otherwise every bar of a profile carries its final levels. */
function levels(ctx:CatalogContext,profiles:readonly VolumeProfile[],grid?:ProfileOptions,causal=false):VpLevels{
 const n=ctx.bars.length,line=():NumericSeries=>Array(n).fill(null);
 const poc=line(),vah=line(),val=line(),devPoc=line(),devVah=line(),devVal=line();
 if(!causal)for(const p of profiles)for(let i=p.from;i<=p.to;i++){poc[i]=p.pocPrice;vah[i]=p.vah;val[i]=p.val;}
 // Developing levels over the same bars as each profile.
 const wantPoc=ctx.bool('developingPoc'),wantVa=ctx.bool('developingVa');
 if(wantPoc||wantVa||causal)for(const p of profiles){
  const dev=developingProfile(ctx.bars,p.from,p.to,grid??options(ctx));
  for(let i=p.from;i<=p.to;i++){const k=i-p.from;if(causal){poc[i]=dev.poc[k];vah[i]=dev.vah[k];val[i]=dev.val[k];}if(wantPoc)devPoc[i]=dev.poc[k];if(wantVa){devVah[i]=dev.vah[k];devVal[i]=dev.val[k];}}
 }
 return {poc,vah,val,devPoc,devVah,devVal};
}
/** Every kind builds its profiles through withFinerBars, so a profile whose rows need finer bars
 *  than the chart has asks the chart for them once; the developing levels use the same finer bars. */
type Built={profiles:VolumeProfile[];grid?:ProfileOptions};
function profileKind(ctx:CatalogContext,build:(opts:ProfileOptions)=>Built,causal=false):VpLevels{
 const opts=options(ctx),out=withFinerBars(lower=>build({...opts,lowerTimeframe:lower}),opts.lowerTimeframe,ctx.chart?.finerBars,opts.resolution);
 const lower:LowerTimeframeBars|null=out.lowerTimeframe;
 ctx.profiles?.(out.profiles);return levels(ctx,out.profiles,{...(out.grid??opts),lowerTimeframe:lower},causal);
}
function visibleRange(ctx:CatalogContext){
 const span=visibleProfileSpan(ctx.bars,ctx.chart?.visibleRange??null,ctx.chart?.resolution??null);
 return profileKind(ctx,opts=>{const profile=span?buildVolumeProfile(ctx.bars,span.from,span.to,opts,{left:span.left,right:span.right}):null;return {profiles:profile?[profile]:[]};});
}
const runsProfiles=(ctx:CatalogContext,runs:readonly {from:number;to:number}[],opts:ProfileOptions):VolumeProfile[]=>{
 const profiles:VolumeProfile[]=[];for(const run of runs){const profile=buildVolumeProfile(ctx.bars,run.from,run.to,opts);if(profile)profiles.push(profile);}return profiles;
};
function periodic(ctx:CatalogContext){
 const runs=profilePeriods(ctx.bars,ctx.str('period') as ProfilePeriod,{resolution:ctx.chart?.resolution??null,calendar:ctx.chart?.calendar??null});
 return profileKind(ctx,opts=>({profiles:runsProfiles(ctx,runs,opts)}),true);
}
/** One profile per session. */
function session(ctx:CatalogContext){
 const runs=sessionProfilePeriods(ctx.bars,ctx.str('session') as ProfileSession,{resolution:ctx.chart?.resolution??null,calendar:ctx.chart?.calendar??null});
 return profileKind(ctx,opts=>({profiles:runsProfiles(ctx,runs,opts)}),true);
}
/** Session volume profile HD. Number Of Rows rows share one height from the visible price range;
 *  Ticks Per Row is the Session volume profile's rule. */
function sessionHd(ctx:CatalogContext){
 const runs=sessionProfilePeriods(ctx.bars,ctx.str('session') as ProfileSession,{resolution:ctx.chart?.resolution??null,calendar:ctx.chart?.calendar??null});
 let height:number|null=null;
 if(ctx.str('rowsLayout')==='Number Of Rows'){const span=visibleProfileSpan(ctx.bars,ctx.chart?.visibleRange??null,ctx.chart?.resolution??null);height=span?hdRowHeight(ctx.bars,span,ctx.num('rowSize'),runs):null;}
 return profileKind(ctx,opts=>{
  // One shared height is a grid of fixed-height rows aligned to its multiples: the Ticks Per Row rule with one "tick" of that height.
  const grid:ProfileOptions=height!==null?{...opts,rowsLayout:'Ticks Per Row',rowSize:1,tickSize:height}:opts;
  return {profiles:runsProfiles(ctx,runs,grid),grid};
 });
}
/** One profile from the auto anchor through the last bar. */
function autoAnchored(ctx:CatalogContext){
 const start=autoAnchorStart(ctx.bars,ctx.str('anchor') as AutoAnchor,ctx.num('length'),{resolution:ctx.chart?.resolution??null,calendar:ctx.chart?.calendar??null});
 return profileKind(ctx,opts=>{const profile=start===null?null:buildVolumeProfile(ctx.bars,start,ctx.bars.length-1,opts);return {profiles:profile?[profile]:[]};});
}
/** Row work per bar: the row count for Number Of Rows (each bar can touch every row), else an LV estimate of 64.
 *  Developing levels add one row pass per bar plus an LV estimate of 8 grid rebuilds per bar. */
/** Periodic and Session profiles always run the developing pass (their per-bar levels are causal). */
const causalWork=(count:number,value:(key:string)=>number)=>{const layout=value('rowsLayout') as unknown,rows=layout==='Ticks Per Row'?64:Math.min(value('rowSize'),PROFILE_MAX_ROWS);return work(count,value)+count*rows*10;};
const CAUSAL_POLICY='OpenCandle-defined causal levels: on each bar the POC, VAH and VAL plots (and their alerts) are the levels of the period developed through that bar, so earlier bars never show later volume; the drawn histogram and its POC line cover the whole period.';
const work=(count:number,value:(key:string)=>number)=>{const layout=value('rowsLayout') as unknown,rows=layout==='Ticks Per Row'?64:Math.min(value('rowSize'),PROFILE_MAX_ROWS),developing=(value('developingPoc') as unknown)===true||(value('developingVa') as unknown)===true;return count*rows*2+count*16+(developing?count*rows*10:0);};
/** Extra volume profile policies. */
export const VP_EXTRA_POLICIES=Object.freeze([
 'OpenCandle-defined developing levels: Developing POC, VAH and VAL at a bar are the levels of the profile of the bars from the profile start through that bar, with the same rows rule. They start again at each profile and are drawn only while their input is on.',
 'OpenCandle-defined Extend POC right: the Visible range POC line continues to the right edge of the chart. A Periodic POC continues to the right until the first later bar whose high-low range reaches it, or to the right edge when no later bar does.',
 'OpenCandle-defined row volume labels: each histogram row shows its volume at the outer end of the row (Up/Down and Total: the row total; Delta: the signed difference), abbreviated with K, M and B.',
 'OpenCandle-defined histogram colors: the Up volume, Down volume, Value area up and Value area down backgrounds of the Style tab color the rows; Total uses the up colors, Delta the up or down color of the larger side. Hiding a background leaves its rows undrawn.',
]);
const UNKNOWN_SESSION='Session Extended (choices Regular and Extended) and its title are OpenCandle-defined. Extended follows the bars the chart loaded, the way the reference follows the chart\'s extended-hours setting; that reference behavior is not captured.';
/** Session volume profile and finer-bar policies. */
export const R38_POLICIES=Object.freeze([
 'OpenCandle-defined need: a profile needs finer bars when, at its row size and price range, a chart bar with volume and no finer bars crosses a row boundary, so its volume would be spread evenly over more than one row. A profile whose every bar fits inside one row asks for nothing.',
 'OpenCandle-defined finer interval: 1W and longer charts ask for 1D bars, 1D up to 1W for 30m, 1h up to 1D for 5m, and 2m up to 1h for 1m. 1m and shorter charts, and event or range bars, ask for nothing.',
 'OpenCandle-defined on demand: the finer bars come from the chart data the app holds (the exact interval, or one finer source of the same provider aggregated by the interval menu rule) and, on a live chart, from the history loader that opens the chart symbol at that interval. While they load, the profile is drawn from the chart bars, says so on the chart, and recalculates when they arrive. Finer bars that would spread more bars than the loaded ones are not used. Alerts never wait for them (R37-VP-4).',
]);
export const R37_POLICIES=Object.freeze([
 'OpenCandle-defined sessions: a session is a New York trading date for US equities and a UTC day for 24/7 feeds. Regular keeps only regular-session intraday bars of the date; Extended keeps every loaded bar of it, so it follows the session data the chart loaded. On daily and longer bars, and on UTC feeds, Regular equals Extended: one profile per bar date.',
 'OpenCandle-defined alerts: POC, VAH and VAL of the Session, Auto anchored and Periodic volume profiles are alertable. The alert recalculates the profile on the observed bars, each over its own high-low range. Finer bars are a chart view and are not used, so where the chart draws from finer bars the drawn level can differ from the alerted one (the Session and Auto anchored profiles show a notice on the chart whenever bars lack finer data). Ticks Per Row needs the instrument tick size, which alerts do not have, so such an alert is refused.',
]);
const R37_HD_POLICY='OpenCandle-defined Session volume profile HD: with Number Of Rows, Row Size counts the rows over the visible price range and every session uses that one row height, aligned to its multiples, so zooming in shows finer rows. The height is raised when a session would need more than '+PROFILE_MAX_ROWS+' rows. It recalculates after each pan or zoom; without a visible range it uses every loaded bar. It depends on the visible range, so it cannot be alerted on.';
const R37_AUTO_POLICY='OpenCandle-defined anchors: one profile from the anchor bar through the last bar, recalculated as bars arrive, so its levels move with the anchor. Auto anchors at the Session on intraday charts, the Month from 1D, the Quarter from 1W and the Year from 1M. Session, Week, Month, Quarter and Year start at the first bar of that period holding the last bar. Highest High, Lowest Low and Highest Volume anchor at the extreme bar of the last Length bars, the latest one on a tie.';
const PROVENANCE=[{url:NAMES,facts:'Indicator names "Visible range volume profile", "Periodic volume profile", "Session volume profile", "Session volume profile HD" and "Auto anchored volume profile" (Profiles tab list).'},{url:VP_FACT,facts:'Shared inputs Rows Layout (Number Of Rows, Ticks Per Row), Row Size 24 (1 to 1000000), Volume (Up/Down, Total, Delta), Value Area Volume 70 (0 to 100); graphics percentWidth 30, POC visible width 2, VAH and VAL hidden width 2; metaInfo colors (blanked by the client registry).'}];

export const VP_INDICATORS:readonly CatalogDefinition[]=Object.freeze([
 {id:'vrvp',name:'Visible range volume profile',acronym:'VRVP',overlay:true,requiresVolume:true,viewport:true,segmented:true,profile:true,
  inputs:[ROWS_LAYOUT,ROW_SIZE,VOLUME,VALUE_AREA,placement('Right'),WIDTH,...EXTRAS],plots:PLOTS,continuousPlots:CONTINUOUS,
  provenance:PROVENANCE,
  unknownDefaults:[UNKNOWN_SHARED,'Placement Right, the Placement and Width titles and the acronym VRVP are OpenCandle-defined. The profile spans the bars visible in the pane and its histogram is measured from the pane edge, as a percentage of the pane width.'],
  policies:[...VOLUME_PROFILE_POLICIES,...VP_EXTRA_POLICIES,...R38_POLICIES,'OpenCandle-defined visible range: the profile covers every bar whose slot overlaps the pane, and recalculates after each pan or zoom. Without a visible range (alerts, screener) it covers every loaded bar.'],
  calculate:visibleRange,warmup:()=>1,work},
 {id:'pvp',name:'Periodic volume profile',acronym:'PVP',overlay:true,requiresVolume:true,segmented:true,profile:true,
  inputs:[ROWS_LAYOUT,ROW_SIZE,VOLUME,VALUE_AREA,PERIOD,placement('Left'),WIDTH,...EXTRAS],plots:PLOTS,continuousPlots:CONTINUOUS,
  provenance:PROVENANCE,
  unknownDefaults:[UNKNOWN_SHARED,'Period Day (choices Session, Day, Week, Month), Placement Left, the Period, Placement and Width titles and the acronym PVP are OpenCandle-defined. Each histogram is measured from its period\'s first or last bar edge, as a percentage of the period width.'],
  policies:[...VOLUME_PROFILE_POLICIES,...VP_EXTRA_POLICIES,...R38_POLICIES,'OpenCandle-defined periods: US equities use New York trading dates, Monday weeks and months (the R23 pivot calendar); Session keeps only regular-session bars of each trading date, Day includes pre-market and after-hours bars. Daily bars and UTC feeds: Session equals Day.',R37_POLICIES[1],CAUSAL_POLICY],
  calculate:periodic,warmup:()=>1,work:causalWork},
 {id:'svp',name:'Session volume profile',acronym:'SVP',overlay:true,requiresVolume:true,segmented:true,profile:true,
  inputs:[ROWS_LAYOUT,ROW_SIZE,VOLUME,VALUE_AREA,SESSION,placement('Left'),WIDTH,...EXTRAS],plots:PLOTS,continuousPlots:CONTINUOUS,
  provenance:PROVENANCE,
  unknownDefaults:[UNKNOWN_SHARED,UNKNOWN_SESSION,'Placement Left, the Placement and Width titles and the acronym SVP are OpenCandle-defined. Each histogram is measured from its session\'s first or last bar edge, as a percentage of the session width.'],
  policies:[...VOLUME_PROFILE_POLICIES,...VP_EXTRA_POLICIES,...R38_POLICIES,...R37_POLICIES,CAUSAL_POLICY],
  calculate:session,warmup:()=>1,work:causalWork},
 {id:'svphd',name:'Session volume profile HD',acronym:'SVP HD',overlay:true,requiresVolume:true,viewport:true,segmented:true,profile:true,
  inputs:[ROWS_LAYOUT,{...ROW_SIZE,defval:100},VOLUME,VALUE_AREA,SESSION,placement('Left'),WIDTH,...EXTRAS],plots:PLOTS,continuousPlots:CONTINUOUS,
  provenance:PROVENANCE,
  unknownDefaults:[UNKNOWN_SHARED.replace('Row Size 24, ',''),UNKNOWN_SESSION,'Row Size 100 (rows over the visible price range), Placement Left, the Placement and Width titles and the acronym SVP HD are OpenCandle-defined; no capture of this study exists.'],
  policies:[...VOLUME_PROFILE_POLICIES,...VP_EXTRA_POLICIES,...R38_POLICIES,R37_POLICIES[0],R37_HD_POLICY],
  calculate:sessionHd,warmup:()=>1,work},
 {id:'aavp',name:'Auto anchored volume profile',acronym:'AAVP',overlay:true,requiresVolume:true,segmented:true,profile:true,
  inputs:[ANCHOR,LENGTH,ROWS_LAYOUT,ROW_SIZE,VOLUME,VALUE_AREA,placement('Left'),WIDTH,...EXTRAS],plots:PLOTS,continuousPlots:CONTINUOUS,
  provenance:PROVENANCE,
  unknownDefaults:[UNKNOWN_SHARED,'Anchor Auto with the choices '+AUTO_ANCHORS.join(', ')+', Length 20 (1 to 5000), Placement Left, their titles and the acronym AAVP are OpenCandle-defined: no capture lists the anchor choices of this study. Earnings, Dividends and Splits anchors are not offered.'],
  policies:[...VOLUME_PROFILE_POLICIES,...VP_EXTRA_POLICIES,...R38_POLICIES,...R37_POLICIES,R37_AUTO_POLICY],
  calculate:autoAnchored,warmup:()=>1,work},
] as CatalogDefinition[]);
