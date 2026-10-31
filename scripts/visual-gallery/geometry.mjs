// Visual gallery: anchor placements per drawing type, as fractions of the main price pane's plot area
// (x: 0 = left edge, 1 = price-scale edge; y: 0 = top, 1 = bottom). Chosen so each tool lands on the visible bars in a
// shape a trader would draw (swing low to swing high for fibs, an A-B-C swing for pitchforks, zigzags for wave and
// harmonic patterns). Unknown types fall back to a zigzag of the schema's minimum anchor count.

const zigzag=(n,{x0=0.3,x1=0.75,hi=0.3,lo=0.7,startLow=true}={})=>Array.from({length:n},(_,i)=>[n===1?(x0+x1)/2:x0+(x1-x0)*i/(n-1),(i%2===0)===startLow?lo:hi]);

export const ANCHORS={
 trendline:[[0.42,0.68],[0.72,0.38]],ray:[[0.42,0.68],[0.62,0.48]],infoline:[[0.42,0.68],[0.72,0.38]],extendedline:[[0.45,0.62],[0.62,0.45]],trendangle:[[0.45,0.62],[0.7,0.42]],
 hline:[[0.6,0.45]],hray:[[0.45,0.45]],vline:[[0.6,0.5]],crossline:[[0.6,0.45]],
 parallelchannel:[[0.35,0.68],[0.7,0.45],[0.5,0.35]],regressionchannel:[[0.3,0.5],[0.78,0.5]],flattopbottom:[[0.35,0.65],[0.7,0.45],[0.5,0.3]],disjointchannel:[[0.35,0.6],[0.7,0.4],[0.7,0.65],[0.35,0.75]],
 pitchfork:[[0.32,0.68],[0.47,0.3],[0.6,0.6]],schiffpitchfork:[[0.32,0.68],[0.47,0.3],[0.6,0.6]],modifiedschiffpitchfork:[[0.32,0.68],[0.47,0.3],[0.6,0.6]],insidepitchfork:[[0.32,0.68],[0.47,0.3],[0.6,0.6]],
 fibretracement:[[0.4,0.75],[0.7,0.3]],fibextensiontrend:[[0.35,0.75],[0.5,0.35],[0.62,0.6]],fibchannel:[[0.35,0.7],[0.65,0.45],[0.45,0.4]],fibtimezones:[[0.3,0.5],[0.36,0.5]],
 fibspeedfan:[[0.4,0.75],[0.6,0.35]],trendfibtime:[[0.3,0.7],[0.4,0.35],[0.47,0.6]],fibcircles:[[0.5,0.55],[0.58,0.4]],fibspiral:[[0.55,0.5],[0.62,0.4]],fibarcs:[[0.4,0.75],[0.6,0.35]],fibwedge:[[0.4,0.5],[0.7,0.3],[0.7,0.7]],lvpitchfan:[[0.32,0.68],[0.47,0.3],[0.6,0.6]],
 gannbox:[[0.4,0.72],[0.7,0.32]],lvgannsquarefixed:[[0.4,0.72],[0.6,0.42]],gannsquare:[[0.4,0.72],[0.6,0.42]],gannfan:[[0.4,0.75],[0.55,0.45]],
 xabcd:[[0.3,0.75],[0.4,0.3],[0.5,0.58],[0.6,0.4],[0.72,0.7]],cypher:[[0.3,0.75],[0.4,0.35],[0.5,0.55],[0.6,0.25],[0.72,0.62]],
 headshoulders:[[0.25,0.7],[0.32,0.45],[0.4,0.62],[0.5,0.25],[0.6,0.62],[0.67,0.45],[0.75,0.7]],abcd:[[0.35,0.72],[0.47,0.38],[0.57,0.56],[0.71,0.22]],
 lvtrianglepattern:[[0.35,0.3],[0.45,0.7],[0.56,0.4],[0.66,0.6]],lvthreedrives:[[0.28,0.75],[0.37,0.5],[0.46,0.62],[0.56,0.38],[0.65,0.5],[0.74,0.25]],
 elliottimpulse:[[0.3,0.72],[0.4,0.5],[0.48,0.6],[0.6,0.28],[0.68,0.42],[0.78,0.2]],elliottcorrection:[[0.4,0.3],[0.52,0.6],[0.6,0.45],[0.72,0.75]],
 lvelliotttriangle:[[0.3,0.3],[0.4,0.7],[0.5,0.38],[0.6,0.62],[0.68,0.45],[0.75,0.55]],lvelliottdoublecombo:[[0.35,0.3],[0.48,0.6],[0.58,0.45],[0.72,0.72]],lvelliotttriplecombo:[[0.3,0.3],[0.4,0.55],[0.5,0.42],[0.6,0.65],[0.68,0.5],[0.78,0.75]],
 lvcycliclines:[[0.3,0.5],[0.37,0.5]],lvtimecycles:[[0.3,0.6],[0.4,0.6]],lvsineline:[[0.4,0.5],[0.47,0.35]],
 position:[[0.6,0.55],[0.78,0.35]],lvshortposition:[[0.6,0.45],[0.78,0.65]],lvpositionforecast:[[0.62,0.55],[0.8,0.35]],lvbarspattern:[[0.3,0.5],[0.45,0.5]],lvghostfeed:[[0.75,0.5],[0.82,0.35],[0.88,0.55]],lvsector:[[0.5,0.55],[0.7,0.35],[0.7,0.7]],
 anchoredvwap:[[0.3,0.5]],fixedrangevp:[[0.3,0.3],[0.7,0.7]],lvanchoredvp:[[0.35,0.5]],
 lvpricerange:[[0.62,0.7],[0.66,0.35]],lvdaterange:[[0.45,0.55],[0.7,0.55]],datepricerange:[[0.45,0.7],[0.7,0.35]],
 lvarrowmarker:[[0.5,0.3],[0.6,0.5]],arrow:[[0.45,0.65],[0.65,0.4]],arrowmarkup:[[0.6,0.7]],arrowmarkdown:[[0.6,0.3]],
 box:[[0.4,0.35],[0.65,0.65]],rotatedrect:[[0.4,0.6],[0.65,0.4],[0.6,0.3]],path:[[0.35,0.65],[0.45,0.4],[0.58,0.55],[0.7,0.3]],circle:[[0.55,0.5],[0.62,0.4]],ellipse:[[0.45,0.35],[0.65,0.6]],
 polyline:[[0.35,0.65],[0.45,0.4],[0.58,0.55],[0.7,0.3]],triangle:[[0.4,0.7],[0.52,0.35],[0.65,0.65]],arc:[[0.4,0.6],[0.55,0.35],[0.7,0.6]],curve:[[0.4,0.6],[0.7,0.6],[0.55,0.3]],lvdoublecurve:[[0.35,0.55],[0.5,0.35],[0.6,0.7],[0.75,0.5]],
 text:[[0.55,0.3]],lvanchoredtext:[[0.55,0.3]],note:[[0.55,0.3]],pricenote:[[0.5,0.55],[0.62,0.35]],lvpin:[[0.55,0.4]],lvtable:[[0.45,0.25]],callout:[[0.5,0.55],[0.62,0.3]],comment:[[0.5,0.55],[0.62,0.3]],
 pricelabel:[[0.6,0.45]],signpost:[[0.6,0.45],[0.6,0.3]],flagmark:[[0.6,0.4]],lvimage:[[0.55,0.35]],lvemoji:[[0.6,0.35]],lvsticker:[[0.55,0.3],[0.65,0.45]],iconstamp:[[0.6,0.35]],
};
/** Freehand tools: a sine-shaped stroke. */
export const FREEHAND_PATH=Array.from({length:24},(_,i)=>[0.38+0.34*i/23,0.5-0.15*Math.sin(i/23*Math.PI*2)]);

export function anchorsFor(drawing){
 const preset=ANCHORS[drawing.type];
 const min=drawing.schema?.min??2,max=drawing.schema?.max??min;
 let points=preset?preset.slice():zigzag(min);
 if(points.length<min)points=zigzag(min);
 if(points.length>max)points=points.slice(0,max);
 return points;
}
