import type {Bar} from './types';
import {COINBASE_PRODUCTS} from './coinbase-products';

/**
 * Symbol math (spread and ratio symbols such as GME/SPY, GME-SPY, GME*2, (GME+SPY)/2, GME.WS/GME).
 *
 * A symbol field may take an arithmetic expression of symbols and numbers, and the chart shows the
 * result. Every rule below is our own choice.
 *
 * The parser is a hand-written recursive descent over a fixed token set. Nothing is ever evaluated as code.
 *  - Operators: + - * / and parentheses; unary minus. Usual precedence, left to right.
 *  - Numbers: 2, 0.5, 100 (no exponent).
 *  - Tickers: letters, digits, '.', '_' and '^' (GME.WS, BRK.B, ^VIX). A ticker with a dash is taken whole when it is a
 *    known symbol (the Coinbase products BTC-USD, ETH-USD, SOL-USD, or a symbol the caller knows, for example an
 *    import), otherwise the dash is a minus. Quotes force a whole ticker: "BRK-B"/SPY.
 *  - No EXCHANGE: prefixes (a colon is refused), at most SYMBOL_MATH_MAX_SYMBOLS distinct tickers, at most
 *    SYMBOL_MATH_MAX_LENGTH characters, nesting at most SYMBOL_MATH_MAX_DEPTH.
 */
export const SYMBOL_MATH_MAX_LENGTH=80,SYMBOL_MATH_MAX_SYMBOLS=10,SYMBOL_MATH_MAX_DEPTH=16;
export type SymbolMathNode=
 |{kind:'num';value:number}
 |{kind:'sym';symbol:string}
 |{kind:'neg';operand:SymbolMathNode}
 |{kind:'bin';op:'+'|'-'|'*'|'/';left:SymbolMathNode;right:SymbolMathNode};
export interface SymbolMathExpression {
 /** The tree. */
 ast:SymbolMathNode;
 /** Canonical text: upper case, no spaces, minimal parentheses. It names the series (label, dataset id). */
 canonical:string;
 /** Distinct tickers in first-use order. */
 symbols:string[];
}
export type SymbolMathParse={ok:true;expression:SymbolMathExpression}|{ok:false;error:string};

type Token={kind:'num';value:number;text:string}|{kind:'sym';symbol:string}|{kind:'op';op:'+'|'-'|'*'|'/'|'('|')'};
const TICKER_CHAR=/[A-Z0-9._^]/,NUMBER=/^\d+(?:\.\d+)?$/,TICKER=/^[A-Z0-9._^]+(?:-[A-Z0-9._^]+)*$/;
/** Dash tickers that are always known (the Coinbase products). */
export const SYMBOL_MATH_DASH_SYMBOLS:readonly string[]=Object.freeze([...COINBASE_PRODUCTS]);
const defaultKnown=(symbol:string)=>SYMBOL_MATH_DASH_SYMBOLS.includes(symbol);

function tokenize(source:string,known:(symbol:string)=>boolean):Token[]{
 const text=source.toUpperCase(),tokens:Token[]=[];let i=0;
 const run=(from:number)=>{let end=from;while(end<text.length&&TICKER_CHAR.test(text[end]))end++;return end;};
 while(i<text.length){
  const ch=text[i];
  if(ch===' '||ch==='\t'){i++;continue;}
  if('+-*/()'.includes(ch)){tokens.push({kind:'op',op:ch as '+'});i++;continue;}
  if(ch==='"'||ch==="'"){
   const close=text.indexOf(ch,i+1);if(close<0)throw new Error('A quoted ticker is not closed.');
   const symbol=text.slice(i+1,close).trim();if(!symbol||!TICKER.test(symbol)||symbol.length>24)throw new Error('Enter a ticker inside the quotes, for example "BRK-B".');
   tokens.push({kind:'sym',symbol});i=close+1;continue;
  }
  if(ch===':')throw new Error('Symbol math uses plain tickers. Remove the EXCHANGE: prefix.');
  if(!TICKER_CHAR.test(ch))throw new Error(`"${ch}" cannot be used in symbol math. Use tickers, numbers, + - * / and parentheses.`);
  let end=run(i),word=text.slice(i,end);
  if(NUMBER.test(word)){const value=Number(word);if(!Number.isFinite(value))throw new Error('That number is too large.');tokens.push({kind:'num',value,text:word});i=end;continue;}
  if(/^\d/.test(word)&&/^[\d.]+$/.test(word))throw new Error(`"${word}" is not a number.`);
  // A dash continues the ticker only when the joined ticker is known (BTC-USD); otherwise it is a minus.
  while(text[end]==='-'&&end+1<text.length&&TICKER_CHAR.test(text[end+1])){
   const next=run(end+1),joined=word+'-'+text.slice(end+1,next);
   if(!known(joined)&&!defaultKnown(joined))break;
   word=joined;end=next;
  }
  if(word.length>24)throw new Error(`"${word}" is longer than 24 characters.`);
  tokens.push({kind:'sym',symbol:word});i=end;
 }
 return tokens;
}

/** Parse symbol math. `known` names extra dash tickers (imports such as BRK-B) that are taken whole. */
export function parseSymbolMath(source:string,known:(symbol:string)=>boolean=()=>false):SymbolMathParse{
 const text=String(source??'').trim();
 if(!text)return{ok:false,error:'Type a symbol or an expression such as GME/SPY.'};
 if(text.length>SYMBOL_MATH_MAX_LENGTH)return{ok:false,error:`An expression can be at most ${SYMBOL_MATH_MAX_LENGTH} characters.`};
 let tokens:Token[];try{tokens=tokenize(text,known);}catch(error){return{ok:false,error:error instanceof Error?error.message:String(error)};}
 let at=0;const peek=()=>tokens[at],isOp=(op:string)=>{const t=peek();return !!t&&t.kind==='op'&&t.op===op;};
 const expr=(depth:number):SymbolMathNode=>{
  if(depth>SYMBOL_MATH_MAX_DEPTH)throw new Error('The expression is nested too deeply.');
  let left=term(depth);
  while(isOp('+')||isOp('-')){const op=(tokens[at++] as {op:'+'|'-'}).op;left={kind:'bin',op,left,right:term(depth)};}
  return left;
 };
 const term=(depth:number):SymbolMathNode=>{
  let left=unary(depth);
  while(isOp('*')||isOp('/')){const op=(tokens[at++] as {op:'*'|'/'}).op;left={kind:'bin',op,left,right:unary(depth)};}
  return left;
 };
 const unary=(depth:number):SymbolMathNode=>{
  if(isOp('-')){at++;if(depth>SYMBOL_MATH_MAX_DEPTH)throw new Error('The expression is nested too deeply.');return{kind:'neg',operand:unary(depth+1)};}
  if(isOp('+')){at++;return unary(depth+1);}
  return primary(depth);
 };
 const primary=(depth:number):SymbolMathNode=>{
  const t=peek();
  if(!t)throw new Error('The expression ends too early.');
  if(t.kind==='num'){at++;return{kind:'num',value:t.value};}
  if(t.kind==='sym'){at++;return{kind:'sym',symbol:t.symbol};}
  if(t.op==='('){at++;const inner=expr(depth+1);if(!isOp(')'))throw new Error('A parenthesis is not closed.');at++;return inner;}
  throw new Error(t.op===')'?'There is a closing parenthesis without an opening one.':`An operator "${t.op}" needs a value before it.`);
 };
 let ast:SymbolMathNode;
 try{ast=expr(0);if(at<tokens.length){const t=tokens[at];throw new Error(t.kind==='op'&&t.op===')'?'There is a closing parenthesis without an opening one.':'Put an operator between the values.');}}
 catch(error){return{ok:false,error:error instanceof Error?error.message:String(error)};}
 const symbols:string[]=[];const walk=(node:SymbolMathNode)=>{if(node.kind==='sym'){if(!symbols.includes(node.symbol))symbols.push(node.symbol);}else if(node.kind==='neg')walk(node.operand);else if(node.kind==='bin'){walk(node.left);walk(node.right);}};walk(ast);
 if(!symbols.length)return{ok:false,error:'An expression needs at least one ticker.'};
 if(symbols.length>SYMBOL_MATH_MAX_SYMBOLS)return{ok:false,error:`An expression can use at most ${SYMBOL_MATH_MAX_SYMBOLS} tickers.`};
 return{ok:true,expression:{ast,canonical:printSymbolMath(ast),symbols}};
}

const PRECEDENCE={'+':1,'-':1,'*':2,'/':2} as const;
const printTicker=(symbol:string)=>symbol.includes('-')&&!defaultKnown(symbol)?`"${symbol}"`:symbol;
/** Canonical text with minimal parentheses. Re-parsing it gives the same tree. */
export function printSymbolMath(node:SymbolMathNode):string{
 if(node.kind==='num')return String(node.value);
 if(node.kind==='sym')return printTicker(node.symbol);
 if(node.kind==='neg'){const inner=printSymbolMath(node.operand);return '-'+(node.operand.kind==='bin'?`(${inner})`:inner);}
 const p=PRECEDENCE[node.op],wrap=(child:SymbolMathNode,right:boolean)=>{const text=printSymbolMath(child);if(child.kind!=='bin')return text;const q=PRECEDENCE[child.op];return q<p||right&&q===p?`(${text})`:text;};
 return wrap(node.left,false)+node.op+wrap(node.right,true);
}

/** True when the text is symbol math with an operator (a bare ticker, even in parentheses, is not). */
export function isSymbolMathText(source:string,known?:(symbol:string)=>boolean):boolean{
 const parsed=parseSymbolMath(source,known);return parsed.ok&&parsed.expression.ast.kind!=='sym';
}

/** The value of the tree for one set of component values. Division by zero or a missing or non-finite value gives null. */
export function evaluateSymbolMath(node:SymbolMathNode,value:(symbol:string)=>number|null|undefined):number|null{
 switch(node.kind){
  case 'num':return node.value;
  case 'sym':{const v=value(node.symbol);return typeof v==='number'&&Number.isFinite(v)?v:null;}
  case 'neg':{const v=evaluateSymbolMath(node.operand,value);return v===null?null:-v;}
  default:{
   const a=evaluateSymbolMath(node.left,value);if(a===null)return null;const b=evaluateSymbolMath(node.right,value);if(b===null)return null;
   const out=node.op==='+'?a+b:node.op==='-'?a-b:node.op==='*'?a*b:b===0?null:a/b;
   return out===null||!Number.isFinite(out)?null:out===0?0:out;
  }
 }
}

/**
 * Bars of the expression, bar by bar:
 *  - Alignment: only times present in every component (exact bar start times). Nothing is filled or carried forward.
 *  - Open and close are the expression of the component opens and closes. The expression is also taken of the highs
 *    and of the lows; the bar's high is the largest and its low the smallest of those four values, so the bar always
 *    contains its open and close (a ratio's high is not simply high/high).
 *  - A time where any value is unavailable (a division by zero, a missing field) is left out.
 *  - Volume is not defined for an expression: NaN (shown as unavailable; volume-based indicators refuse it).
 */
export function combineSymbolMathBars(ast:SymbolMathNode,components:ReadonlyMap<string,readonly Bar[]>):Bar[]{
 const symbols=[...components.keys()];if(!symbols.length)return[];
 const maps=new Map<string,Map<number,Bar>>();
 for(const symbol of symbols){const map=new Map<number,Bar>();for(const bar of components.get(symbol)??[])if(bar&&Number.isFinite(bar.time))map.set(bar.time,bar);maps.set(symbol,map);}
 let smallest=symbols[0];for(const symbol of symbols)if(maps.get(symbol)!.size<maps.get(smallest)!.size)smallest=symbol;
 const times=[...maps.get(smallest)!.keys()].filter(time=>symbols.every(symbol=>maps.get(symbol)!.has(time))).sort((a,b)=>a-b);
 const out:Bar[]=[];
 for(const time of times){
  const field=(key:'open'|'high'|'low'|'close')=>evaluateSymbolMath(ast,symbol=>maps.get(symbol)?.get(time)?.[key]);
  const open=field('open'),close=field('close'),high=field('high'),low=field('low');
  if(open===null||close===null||high===null||low===null)continue;
  out.push({time,open,high:Math.max(open,high,low,close),low:Math.min(open,high,low,close),close,volume:NaN});
 }
 return out;
}

/** Where a component comes from, by its ticker shape: a Coinbase product, else an Alpaca US ticker or an import. */
export function symbolMathComponentSource(symbol:string):'coinbase'|'alpaca-or-import'{return SYMBOL_MATH_DASH_SYMBOLS.includes(symbol)?'coinbase':'alpaca-or-import';}

/** A saved symbol math name is exactly its canonical text (no spaces, minimal parentheses). */
export function isCanonicalSymbolMath(value:unknown):value is string{
 if(typeof value!=='string'||!value||value.length>SYMBOL_MATH_MAX_LENGTH||!/^[A-Z0-9.^_"+*/()-]+$/.test(value))return false;
 const parsed=parseSymbolMath(value);return parsed.ok&&parsed.expression.ast.kind!=='sym'&&parsed.expression.canonical===value;
}
/** The derived-symbol exchange (also exported by symbol-math-live as SYMBOL_MATH_EXCHANGE). */
export const DERIVED_EXCHANGE='DERIVED';
const TICKER_TEXT=/^[A-Z0-9.^_-]{1,24}$/;
/** A market symbol a watchlist, note, list alert or recent list may hold: a ticker, or a canonical expression
 * on the DERIVED exchange (pass no exchange where none is stored, for example recent symbols and the plain watchlist). */
export function isMarketSymbol(symbol:unknown,exchange?:unknown):symbol is string{
 return typeof symbol==='string'&&(TICKER_TEXT.test(symbol)||(exchange===undefined||exchange===DERIVED_EXCHANGE)&&isCanonicalSymbolMath(symbol));
}
