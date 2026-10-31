import {deserializeDrawing,type SerializedDrawing} from '@luxalgo/vela';
import {measureWorkspaceJSON,prepareWorkspaceJSON} from '../ui/workspace-json';
import {readTrendlineAnnotation} from './trendline-annotation-data';
import {assertFibLevelFormatRegistration,nativeFibTrendLineDefaults} from './fib-level-format-native';
import {retainFibLevelFormatPresence} from './fib-level-format';
import {FIB_TREND_LINE_FIELD,readFibTrendLine,retainFibTrendLineMember,sameFibTrendLineInterpretation,cloneFibTrendLineMember} from './fib-trend-line-data';
import {sameDrawingData} from './drawing-data-equality';
import {FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD,readFibBackground,readFibText,retainFibLevelPresentationMembers,cloneFibPresentationMember} from './fib-level-presentation-data';
import {consumeNativeDrawingProjectionRow,type NativeDrawingProjectionPass} from './drawing-native-projection';

type Row=Record<string,unknown>;
const object=(value:unknown):value is Row=>!!value&&typeof value==='object'&&!Array.isArray(value);
const equal=(a:unknown,b:unknown)=>JSON.stringify(a)===JSON.stringify(b);
function merge(previous:Row,current:Row):Row{const out={...structuredClone(previous),...structuredClone(current)};for(const [key,value]of Object.entries(current))if(object(value)&&object(previous[key]))out[key]=merge(previous[key],value);return out;}
const levelKeys=['ratio','color','enabled','label'];
const fibKeys=['levels','numbersSize','labelsSize','showRatios','showPrices','labelSide','background','reverse','lvFibLevelFormat',FIB_TREND_LINE_FIELD,FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD];
const textKeys=['value','color','size','bold','italic','hAlign','vAlign','place','side','lvAnnotation'];
function knownLevel(value:Row){return Object.fromEntries(levelKeys.filter(key=>value[key]!==undefined&&!(key==='label'&&value[key]==='')).map(key=>[key,value[key]]));}
function plain(value:unknown):Row{const safe=prepareWorkspaceJSON({row:value}).row;if(!object(safe))throw Error('Canonical drawing requires a plain record');return retainFibLevelPresentationMembers(value,retainFibTrendLineMember(value,retainFibLevelFormatPresence(value,safe)));}
function canonicalData(value:unknown):Row{measureWorkspaceJSON({row:value});if(!object(value))throw Error('Canonical drawing requires a plain record');return structuredClone(value);}
function resolved(record:Row):Row{if(record.type==='fibretracement')assertFibLevelFormatRegistration();const drawing=deserializeDrawing(record as unknown as SerializedDrawing);if(!drawing)throw Error('Native drawing model unavailable');return drawing.serialize() as unknown as Row;}

/** Compare only native-interpreted state; opaque canonical members never become authority. */
export function assertNativeDrawingMatchesCanonical(canonical:SerializedDrawing,native:SerializedDrawing):void{
 const expected=resolved(plain(canonical)),actual=resolved(plain(native));
 if(canonical.type==='fibretracement'){
  const defaults=nativeFibTrendLineDefaults(),left=readFibTrendLine(expected.props,defaults),right=readFibTrendLine(actual.props,defaults);
  const leftProps=object(expected.props)?expected.props:{},rightProps=object(actual.props)?actual.props:{};
  const matches=left.state==='unavailable'||right.state==='unavailable'
   ?left.state===right.state&&Object.hasOwn(leftProps,FIB_TREND_LINE_FIELD)===Object.hasOwn(rightProps,FIB_TREND_LINE_FIELD)&&sameDrawingData(leftProps[FIB_TREND_LINE_FIELD],rightProps[FIB_TREND_LINE_FIELD])
   :sameFibTrendLineInterpretation(expected.props,actual.props,defaults);
  if(!matches)throw Error('Native Fibonacci trend-line interpretation differs from its canonical record');
  for(const key of [FIB_BACKGROUND_FIELD,FIB_TEXT_FIELD]){
   if(Object.hasOwn(leftProps,key)!==Object.hasOwn(rightProps,key)||!sameDrawingData(leftProps[key],rightProps[key]))throw Error('Native Fibonacci presentation differs from its canonical record');
  }
 }
 delete expected.createdAt;delete actual.createdAt;
 // Legacy showOn bands are interval visibility, evaluated by LV (drawing-visibility.ts) and stripped from every
 // renderer copy, so a saved Show on choice never matches the renderer row; like drawing-native-projection, compare without it.
 delete expected.showOn;delete actual.showOn;
 // After an owned full native removal only opaque siblings may remain canonical.
 // They are retained data, not native text/flag state or authority for an edit.
 for(const row of [expected,actual])if(row.type==='trendline'&&object(row.text)&&Object.keys(row.text).length>0&&!Object.keys(row.text).some(key=>textKeys.includes(key)))delete row.text;
 if(!equal(expected,actual))throw Error('Native drawing changed or differs from its canonical record');
}

/** Original omission-aware reconciliation of a serialized native row into its exact owner. */
export function projectNativeDrawingRecord(previousInput:Row,currentInput:Row,pass?:NativeDrawingProjectionPass):Row{
 const ownedComplete=pass?consumeNativeDrawingProjectionRow(pass,previousInput,currentInput):false;
 // Native omission means "not represented". Canonical own undefined fields
 // remain data and must survive an unrelated native edit.
 const previous=canonicalData(previousInput),current=plain(currentInput);
 if(previous.id!==undefined&&(previous.id!==current.id||previous.type!==current.type))throw Error('Native drawing projection identity changed');
 if(previous.id===undefined)return current;
 const out=merge(previous,current);
 if(ownedComplete&&previous.type==='trendline'&&readTrendlineAnnotation(previous.text).state==='supported'){
  if(current.text===undefined&&object(out.text)){for(const key of textKeys)delete out.text[key];if(!Object.keys(out.text).length)delete out.text;}
  else if(object(current.text)&&object(out.text)){for(const key of textKeys){if(!Object.hasOwn(current.text,key))delete out.text[key];else out.text[key]=structuredClone(current.text[key]);}}
 }
 if(!Object.hasOwn(previous,'createdAt'))delete out.createdAt;
 if(Array.isArray(previous.anchors)&&Array.isArray(current.anchors)){
  if(previous.anchors.length!==current.anchors.length){
   if(previous.type==='fibretracement'||previous.anchors.some(anchor=>object(anchor)&&Object.keys(anchor).some(key=>!['time','price'].includes(key))))throw Error('Native drawing anchor topology changed');
  }else out.anchors=current.anchors.map((anchor,index)=>object(anchor)&&object((previous.anchors as unknown[])[index])?merge((previous.anchors as Row[])[index],anchor):anchor);
 }
 if(previous.type!=='fibretracement')return out;
 const baseline=resolved(previous),before=object(previous.props)?previous.props:{},expected=object(baseline.props)?baseline.props:{},actual=object(current.props)?current.props:{};
 if(previous.props!==undefined&&!object(previous.props)||current.props!==undefined&&!object(current.props))throw Error('Fib props require a retained plain record');
 const props=merge(before,actual);
 const trendDefaults=nativeFibTrendLineDefaults();
 if(readFibTrendLine(before,trendDefaults).state==='unavailable'&&Object.hasOwn(before,FIB_TREND_LINE_FIELD))props[FIB_TREND_LINE_FIELD]=cloneFibTrendLineMember(before[FIB_TREND_LINE_FIELD]);
 if(readFibBackground(before).state==='unavailable'&&Object.hasOwn(before,FIB_BACKGROUND_FIELD))props[FIB_BACKGROUND_FIELD]=cloneFibPresentationMember(before[FIB_BACKGROUND_FIELD]);
 if(readFibText(before).state==='unavailable'&&Object.hasOwn(before,FIB_TEXT_FIELD))props[FIB_TEXT_FIELD]=cloneFibPresentationMember(before[FIB_TEXT_FIELD]);
 for(const key of fibKeys){
  if(key==='levels')continue;
  if(!Object.hasOwn(before,key)&&(key===FIB_TREND_LINE_FIELD?sameFibTrendLineInterpretation(actual,expected,trendDefaults):key===FIB_BACKGROUND_FIELD||key===FIB_TEXT_FIELD?sameDrawingData(actual[key],expected[key]):equal(actual[key],expected[key])))delete props[key];
 }
 const priorLevels=Array.isArray(before.levels)?before.levels:undefined,expectedLevels=expected.levels,actualLevels=actual.levels;
 if(Array.isArray(expectedLevels)&&Array.isArray(actualLevels)){
  if(expectedLevels.length!==actualLevels.length)throw Error('Fib level topology changed; ordinal metadata cannot be reassigned');
  const expectedKnown=expectedLevels.map(row=>knownLevel(row as Row)),actualKnown=actualLevels.map(row=>knownLevel(row as Row));
  const opaque=priorLevels?.some(row=>object(row)&&Object.keys(row).some(key=>!levelKeys.includes(key)));
  if(opaque&&!equal(expectedKnown,actualKnown)&&equal(expectedKnown.map(value=>JSON.stringify(value)).sort(),actualKnown.map(value=>JSON.stringify(value)).sort()))throw Error('Fib level order changed; opaque ordinal metadata is unavailable');
  const levels=actualLevels.map((value,index)=>{
   if(!object(value))throw Error('Fib level requires a plain record');const old=priorLevels?.[index],prior=object(old)?old:{},base=expectedLevels[index] as Row,result=merge(prior,value);
   for(const key of levelKeys){if(key==='label'&&(value[key]===undefined||value[key]==='')){if(Object.hasOwn(prior,'label')&&prior.label===''&&(base.label===undefined||base.label===''))result.label='';else delete result[key];}else if(priorLevels&&!Object.hasOwn(prior,key)&&equal(value[key],base[key]))delete result[key];}
   return result;
  });
  if(priorLevels||!equal(expectedKnown,actualKnown))props.levels=levels;else delete props.levels;
 }
 if(previous.props===undefined&&Object.keys(props).length){if(!Object.hasOwn(props,'reverse'))props.reverse=false;}
 if(previous.props===undefined&&!Object.keys(props).length)delete out.props;else out.props=props;
 return sameDrawingData(out,previous)?previousInput:out;
}
