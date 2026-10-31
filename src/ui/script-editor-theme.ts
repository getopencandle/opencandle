// OpenCandle's own syntax palette for the script editors. basicSetup ships CodeMirror's light
// default highlight style as a fallback (dark red strings, dark blue keywords), which nearly vanishes on LV's dark surfaces.
// This style is not a fallback, so it wins; colors are LV tokens (--lv-code-*, script-editor-extras.css) with literal
// fallbacks so the editor stays readable before the stylesheet loads.
import {HighlightStyle,syntaxHighlighting} from '@codemirror/language';
import {tags as t} from '@lezer/highlight';
import type {Extension} from '@codemirror/state';
import './script-editor-extras.css';

const v=(name:string,fallback:string)=>`var(--lv-code-${name}, ${fallback})`;
export const LV_SCRIPT_HIGHLIGHT=HighlightStyle.define([
 {tag:[t.keyword,t.controlKeyword,t.moduleKeyword,t.operatorKeyword,t.definitionKeyword],color:v('keyword','#b99cf0')},
 {tag:[t.string,t.special(t.string),t.regexp,t.escape],color:v('string','#9fd39a')},
 {tag:[t.number,t.integer,t.float],color:v('number','#e9c27a')},
 {tag:[t.bool,t.null,t.atom,t.self],color:v('constant','#f2996e')},
 {tag:[t.comment,t.lineComment,t.blockComment,t.docComment],color:v('comment','#7f889b'),fontStyle:'italic'},
 {tag:[t.function(t.variableName),t.function(t.propertyName),t.definition(t.function(t.variableName))],color:v('function','#7bd9e4')},
 {tag:[t.propertyName,t.definition(t.propertyName)],color:v('property','#a9c7f5')},
 {tag:[t.variableName,t.definition(t.variableName)],color:v('variable','#e3e6ee')},
 {tag:[t.typeName,t.className,t.namespace],color:v('type','#e9c27a')},
 {tag:[t.operator,t.punctuation,t.bracket,t.separator],color:v('punctuation','#a0a7b8')},
 {tag:t.invalid,color:v('invalid','#f2736c')},
]);
/** The LV syntax colors for an EditorView (add after basicSetup). */
export function lvScriptHighlighting():Extension{return syntaxHighlighting(LV_SCRIPT_HIGHLIGHT);}
