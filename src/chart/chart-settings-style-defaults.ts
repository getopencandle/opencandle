// Per chart type Symbol-tab defaults. Colors, widths, line styles, price sources and
// visibility flags are factory defaults per style.<name> (the dark
// and light values are identical for every entry used here, except the derived-type projection
// colors in DERIVED_FACT_DEFAULTS, whose dark values are in DERIVED_DARK_FACT_DEFAULTS). Fields without a fact are
// OpenCandle settings and are listed in LV_STYLE_FIELDS so tests and reports never
// attribute them to the reference. No imports: the renderer, schema and price painter
// all read this table.

/** Factory values per LV style id, keyed by the LV setting field. */
export const STYLE_FACT_DEFAULTS:Readonly<Record<string,Readonly<Record<string,unknown>>>>=Object.freeze({
 // style.lineStyle: linestyle 0 (solid), linewidth 2, priceSource close, color #2962FF, colorType gradient #D500F9 -> #00BCE5.
 line:Object.freeze({source:'close',color:'#2962FF',width:2,lineStyle:'solid',colorType:'gradient',gradientStartColor:'#D500F9',gradientColor:'#00BCE5'}),
 // style.lineWithMarkersStyle: same values as the line style (linestyle 0 = solid).
 linemarkers:Object.freeze({source:'close',color:'#2962FF',width:2,lineStyle:'solid',colorType:'gradient',gradientStartColor:'#D500F9',gradientColor:'#00BCE5'}),
 // style.steplineStyle: same values as the line style (linestyle 0 = solid).
 step:Object.freeze({source:'close',color:'#2962FF',width:2,lineStyle:'solid',colorType:'gradient',gradientStartColor:'#D500F9',gradientColor:'#00BCE5'}),
 // style.areaStyle: linecolor #2962FF, linewidth 2, priceSource close, color1 rgba(41, 98, 255, 0.28).
 // color2 is #2962FF with transparency 100; LV stores that bottom fill as the fully transparent same hue (inferred).
 area:Object.freeze({source:'close',color:'#2962FF',width:2,highFill:'rgba(41, 98, 255, 0.28)',lowFill:'rgba(41, 98, 255, 0)'}),
 // style.baselineStyle: top/bottom line colors and widths, four fill colors, baseLevelPercentage 50, priceSource close, baselineColor #8C8C8C.
 baseline:Object.freeze({source:'close',baseLevel:50,baselineColor:'#8C8C8C',highColor:'#089981',highWidth:2,lowColor:'#F23645',lowWidth:2,highFill:'rgba(8, 153, 129, 0.28)',highFill2:'rgba(8, 153, 129, 0.05)',lowFill:'rgba(242, 54, 69, 0.05)',lowFill2:'rgba(242, 54, 69, 0.28)'}),
 // style.hlcAreaStyle: high/low/close line colors and widths, high-close and close-low fills.
 // highLineVisible/lowLineVisible true (nonTheme).
 hlcarea:Object.freeze({highLineVisible:true,lowLineVisible:true,highColor:'#00bcd4',highWidth:2,lowColor:'#e91e63',lowWidth:2,closeColor:'#2962FF',closeWidth:2,highFill:'rgba(0, 188, 212, 0.25)',lowFill:'rgba(233, 30, 99, 0.25)'}),
 // style.columnStyle: up/down colors, barColorsOnPrevClose true, priceSource close.
 columns:Object.freeze({source:'close',color:'rgba(8, 153, 129, 0.5)',downColor:'rgba(242, 54, 69, 0.5)',previousClose:true}),
 // style.hiloStyle: color #2962FF, showLabels true, showBorders true, drawBody true, borderColor and labelColor #2962FF.
 highlow:Object.freeze({color:'#2962FF',labelsVisible:true,borderVisible:true,bodyVisible:true,borderColor:'#2962FF',labelColor:'#2962FF'}),
 // style.barStyle: upColor/downColor, barColorsOnPrevClose false, dontDrawOpen false (open tick shown), thinBars true.
 bars:Object.freeze({previousClose:false,openVisible:true,thinBars:true,color:'#089981',downColor:'#F23645'}),
 // HLC bars (separate chart type): color #2962FF, thinBars true.
 hlcbars:Object.freeze({color:'#2962FF',thinBars:true}),
 // style.hollowCandleStyle: drawBody/drawBorder/drawWick true; body, border and wick up/down colors.
 hollow:Object.freeze({bodyVisible:true,color:'#089981',downColor:'#F23645',borderVisible:true,borderUpColor:'#089981',borderDownColor:'#F23645',wickVisible:true,wickUpColor:'#089981',wickDownColor:'#F23645'}),
 // style.volCandlesStyle: as hollow candles plus barColorsOnPrevClose false.
 volumecandles:Object.freeze({previousClose:false,bodyVisible:true,color:'#089981',downColor:'#F23645',borderVisible:true,borderUpColor:'#089981',borderDownColor:'#F23645',wickVisible:true,wickUpColor:'#089981',wickDownColor:'#F23645'}),
 // style.candleStyle (candles share the workspace appearance).
 candles:Object.freeze({previousClose:false,bodyVisible:true,color:'#089981',downColor:'#F23645',borderVisible:true,borderUpColor:'#089981',borderDownColor:'#F23645',wickVisible:true,wickUpColor:'#089981',wickDownColor:'#F23645'}),
 // style.haStyle: Heikin Ashi keeps its own colors; a book without them inherits the candle appearance.
 heikinashi:Object.freeze({previousClose:false,bodyVisible:true,color:'#089981',downColor:'#F23645',borderVisible:true,borderUpColor:'#089981',borderDownColor:'#F23645',wickVisible:true,wickUpColor:'#089981',wickDownColor:'#F23645'}),
});

/** Derived (non-time) chart type defaults, kept apart from STYLE_FACT_DEFAULTS until their settings
 * schema is wired into chart-settings.ts. */
export const DERIVED_FACT_DEFAULTS:Readonly<Record<string,Readonly<Record<string,unknown>>>>=Object.freeze({
 // Derived (non-time) types. Inputs are the nonTheme inputs of each fact; colors are the light theme
 // values of the same fact (projection colors differ in dark: see DERIVED_DARK_FACT_DEFAULTS).
 // Method values: style 'ATR' is the fact; 'Traditional'/'Percentage' are the LV ids for the
 // fixed (boxSize/reversalAmount) and percentageLTP inputs.
 // style.renkoStyle: style ATR, atrLength 14, boxSize 3, percentageLTP 1, source close, wicks true.
 renko:Object.freeze({boxMethod:'ATR',atrLength:14,boxSize:3,percentage:1,source:'close',wicks:true,color:'#089981',downColor:'#F23645',borderUpColor:'#089981',borderDownColor:'#F23645',wickUpColor:'#089981',wickDownColor:'#F23645',upProjectionColor:'#a9dcc3',downProjectionColor:'#f5a6ae',borderUpProjectionColor:'#a9dcc3',borderDownProjectionColor:'#f5a6ae'}),
 // style.kagiStyle: style ATR, atrLength 14, reversalAmount 1, percentageLTP 1.
 kagi:Object.freeze({reversalMethod:'ATR',atrLength:14,reversalAmount:1,percentage:1,source:'close',color:'#089981',downColor:'#F23645',upProjectionColor:'#a9dcc3',downProjectionColor:'#f5a6ae'}),
 // style.pnfStyle: sources Close, reversalAmount 3, boxSize 1, style ATR, atrLength 14, percentageLTP 1, oneStepBackBuilding false.
 pointfigure:Object.freeze({boxMethod:'ATR',atrLength:14,boxSize:1,percentage:1,reversalAmount:3,source:'close',oneStepBackBuilding:false,color:'#089981',downColor:'#F23645',upProjectionColor:'#a9dcc3',downProjectionColor:'#f5a6ae'}),
 // style.pbStyle (Line break): inputs.lb 3.
 linebreak:Object.freeze({lines:3,color:'#089981',downColor:'#F23645',borderUpColor:'#089981',borderDownColor:'#F23645',upProjectionColor:'#a9dcc3',downProjectionColor:'#f5a6ae',borderUpProjectionColor:'#a9dcc3',borderDownProjectionColor:'#f5a6ae'}),
 // style.rangeStyle: inputs.range 10, phantomBars false, barStyle <RangeBarStyle.Bars>, thinBars true; candles colors.
 // The visible Range size default is DERIVED_INTERVAL_DEFAULTS below (100R), applied over this bundle fact.
 range:Object.freeze({range:10,phantomBars:false,rangeStyle:'bars',thinBars:true,color:'#089981',downColor:'#F23645',upProjectionColor:'#a9dcc3',downProjectionColor:'#f5a6ae',candlesUpColor:'#089981',candlesDownColor:'#F23645',candlesBorderUpColor:'#089981',candlesBorderDownColor:'#F23645',candlesWickUpColor:'#089981',candlesWickDownColor:'#F23645'}),
});

/** Defaults that the live dialog shows over the bundle state. The Range size is set through the interval
 * and switching to Range sets 100R; its hidden state inputs.range 10 is not shown. */
export const DERIVED_INTERVAL_DEFAULTS:Readonly<Record<string,Readonly<Record<string,unknown>>>>=Object.freeze({range:Object.freeze({range:100})});
/** High-low previous-close coloring (LV addition): off by default, Down color the LV candle coral. Every other style
 * with these keys has its own fact value, which overrides the LV value. */
export const HIGHLOW_LV_FIELDS:Readonly<Record<string,unknown>>=Object.freeze({previousClose:false,downColor:'#F23645'});
/** LV-only settings and their LV values (no reference fact). */
export const LV_STYLE_FIELDS:Readonly<Record<string,unknown>>=Object.freeze({
 ...HIGHLOW_LV_FIELDS,opacity:1,markersVisible:true,markerRadius:3,highOpacity:1,lowOpacity:1,closeOpacity:1,
 upWidthPercent:70,downWidthPercent:70,upOpacity:1,downOpacity:1,fontSize:11,
});
/** LV-only derived-type settings. Range candles have no Borders and Wicks toggles; they always draw borders and wicks. */
/** Renko Base price (0 = first source price) and One step back building (off) are LV additions. Point & figure
 * reads its own oneStepBackBuilding fact default, which overrides this value. */
export const DERIVED_LV_FIELDS:Readonly<Record<string,unknown>>=Object.freeze({basePrice:0,oneStepBackBuilding:false});

/** Fact source of each LV style id. */
export const STYLE_FACT_IDS:Readonly<Record<string,string>>=Object.freeze({
 line:'style.lineStyle',linemarkers:'style.lineWithMarkersStyle',step:'style.steplineStyle',area:'style.areaStyle',baseline:'style.baselineStyle',
 hlcarea:'style.hlcAreaStyle',columns:'style.columnStyle',highlow:'style.hiloStyle',bars:'style.barStyle',hollow:'style.hollowCandleStyle',
 volumecandles:'style.volCandlesStyle',candles:'style.candleStyle',heikinashi:'style.haStyle',
});
export const DERIVED_FACT_IDS:Readonly<Record<string,string>>=Object.freeze({renko:'style.renkoStyle',kagi:'style.kagiStyle',pointfigure:'style.pnfStyle',linebreak:'style.pbStyle',range:'style.rangeStyle'});

/** Dark theme values of the same facts where they differ from the light values above (projection colors). */
export const DERIVED_DARK_FACT_DEFAULTS:Readonly<Record<string,Readonly<Record<string,unknown>>>>=Object.freeze({
 renko:Object.freeze({upProjectionColor:'#336854',downProjectionColor:'#7f323f',borderUpProjectionColor:'#336854',borderDownProjectionColor:'#7f323f'}),
 kagi:Object.freeze({upProjectionColor:'#336854',downProjectionColor:'#7f323f'}),
 pointfigure:Object.freeze({upProjectionColor:'#336854',downProjectionColor:'#7f323f'}),
 linebreak:Object.freeze({upProjectionColor:'#336854',downProjectionColor:'#7f323f',borderUpProjectionColor:'#336854',borderDownProjectionColor:'#7f323f'}),
 range:Object.freeze({upProjectionColor:'#336854',downProjectionColor:'#7f323f'}),
});
/** Fact defaults for a theme: light values, with the dark overrides applied for dark. */
export function themedStyleFactDefaults(style:string,theme:'light'|'dark'):Record<string,unknown>{return{...(STYLE_FACT_DEFAULTS[style]??DERIVED_FACT_DEFAULTS[style]??{}),...(theme==='dark'?DERIVED_DARK_FACT_DEFAULTS[style]??{}:{})};}

export function styleFactDefaults(style:string):Record<string,unknown>{return{...(STYLE_FACT_DEFAULTS[style]??{})};}
