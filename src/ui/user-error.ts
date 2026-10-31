/** Plain-language rendering of internal failures. The raw text stays available through errorDetails for diagnostics (a tooltip), never as the visible sentence. */
const GENERIC='Something went wrong. Try again.';
const CHART_WAIT='The chart is not settled yet. Wait a moment and try again.';
const CHART_WAIT_PREFIX=/^Chart tree input or configuration is not settled(?::|$)/;
const RULES:readonly (readonly [RegExp,string])[]=[
 [/fingerprint/i,'This item changed while you were working on it. Reopen it and try again.'],
 [/frame (owner|is unavailable)|frame owner|ownership changed|owner(ship)? (changed|is)|no longer (the )?owner/i,'The chart changed while this was open. Reopen the settings and try again.'],
 [/lease|epoch|retired|stale|authority/i,'That change is out of date. Try it again.'],
 [/refus(ed|al)|rejected by|not accepted/i,'That change was not accepted. Review it and try again.'],
 [/retained without|has been retained|metadata is invalid|schema is unavailable/i,'Some saved details could not be read, so they were left as they are.'],
 [/transaction/i,'A change is still finishing. Try again in a moment.'],
 [/opaque unsupported|no available render ordering/i,'This drawing type cannot be reordered.'],
 [/(owner|publication|chart tree|canonical|staged|acknowledgw*|journal|coordinator|disposal)/i,'The chart changed while this was open. Try again.'],
 [/is not a function|is not defined|cannot read propert|undefined|\[object /i,GENERIC],
 [/^\s*(at\s+\S+\s+\(|\{|\[)/,GENERIC]
];
const raw=(cause:unknown):string=>{
 if(cause instanceof Error)return cause.message||cause.name;
 if(typeof cause==='string')return cause;
 try{return String(cause);}catch{return '';}
};
/** A thrown value's own message for a visible alert, toast or status, with every error-class prefix
 * ("Error: ", "TypeError: ") removed, including one after a leading label ("Chart unavailable: Error: ..."). */
export function plainErrorText(cause:unknown):string{return stripErrorPrefix(raw(cause));}
export function stripErrorPrefix(text:string):string{return text.replace(/(^|: |\. )(?:[A-Z][A-Za-z]*)?Error:\s+/g,'$1').trim();}
/** The original text with its error-class prefix, for a tooltip or a diagnostic log. */
export function errorDetails(cause:unknown):string{
 if(CHART_WAIT_PREFIX.test(raw(cause).replace(/^[A-Za-z]*Error:\s*/,'').trim()))return CHART_WAIT;
 if(cause instanceof Error)return (cause.name&&cause.name!=='Error'?cause.name+': ':'')+(cause.message||'');
 return raw(cause);
}
/** One short plain sentence for a thrown value: known internal wording is rewritten, readable messages pass through without the class prefix. */
export function friendlyError(cause:unknown):string{
 const text=raw(cause).replace(/^[A-Za-z]*Error:\s*/,'').trim();
 if(!text)return GENERIC;
 if(CHART_WAIT_PREFIX.test(text))return CHART_WAIT;
 for(const [pattern,sentence] of RULES)if(pattern.test(text))return sentence;
 if(text.length>200||/\n/.test(text))return GENERIC;
 return /[.!?]$/.test(text)?text:text+'.';
}
