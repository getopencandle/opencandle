/** Scalar Fib custom-label policy; no native/canonical/publication authority.
 *
 * The official 2024-05-23 announcement documents one line and 50 characters
 * including spaces. UTF-16 counting and the complete separator set below are
 * explicit LV choices; the reference does not define those details.
 * Old admitted data has a separate retained limit. Never use the new-edit
 * validator as a blanket import, restore, Duplicate or rendering validator.
 */
export const FIB_LEVEL_TEXT_MAX_UNITS=50;
export const FIB_LEVEL_TEXT_RETAINED_MAX_UNITS=20000;
export type FibLevelLabelChange='unchanged'|'changed';

const TYPE_ERROR='Fibonacci level text must be a string.';
const LENGTH_ERROR='Fibonacci level text must use 50 characters or fewer; some Unicode symbols count as two.';

/** New changed labels only. At most 50 own string code units are inspected.
 * Primitive type checks do not coerce, enumerate or inspect object inputs.
 */
export function assertNewFibLevelLabel(value:unknown):asserts value is string{
 if(typeof value!=='string')throw Error(TYPE_ERROR);
 if(value.length>FIB_LEVEL_TEXT_MAX_UNITS)throw Error(LENGTH_ERROR);
 for(let index=0;index<value.length;index++){
  // Own primitive-string indexing avoids caller conversion/method callbacks.
  switch(value[index]){
   case '\r':case '\n':case '\u000b':case '\u000c':case '\u0085':case '\u2028':case '\u2029':
    throw Error('Fibonacci level text must fit on one line.');
  }
 }
}

/** Existing retained-data type/length gate only; absence includes own undefined.
 * Presence and exact copying remain the caller's responsibility.
 */
export function assertRetainedFibLevelLabel(value:unknown):asserts value is string|undefined{
 if(value===undefined)return;
 if(typeof value!=='string')throw Error('Retained Fibonacci level text must be a string or absent.');
 if(value.length>FIB_LEVEL_TEXT_RETAINED_MAX_UNITS)throw Error('Retained Fibonacci level text exceeds the existing 20000-character limit.');
}

/** The caller must obtain previous from its genuine current target/ordinal.
 * This comparison neither authenticates that value nor preserves record presence
 * for the caller. New template capture must use assertNewFibLevelLabel directly.
 */
export function validateFibLevelLabelChange(previous:unknown,next:unknown):FibLevelLabelChange{
 assertRetainedFibLevelLabel(previous);
 if(typeof next!=='string')throw Error(TYPE_ERROR);
 // Avoid comparing an unbounded incoming value with the retained scalar. An
 // exact grandfathered no-op cannot exceed the separately admitted 20k limit.
 if(next.length>FIB_LEVEL_TEXT_RETAINED_MAX_UNITS)throw Error(LENGTH_ERROR);
 if(previous===next||previous===undefined&&next==='')return'unchanged';
 assertNewFibLevelLabel(next);
 return'changed';
}
