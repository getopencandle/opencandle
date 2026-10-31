// Clean-room tokenizer for the common Pine Script v5/v6 indicator subset. Written for OpenCandle from
// general public knowledge of the language (indentation blocks of four spaces or a tab, line wrapping by a deeper
// indent that is not a multiple of four, // comments, #RRGGBB colours). No third-party code is used.

export type TokenType = 'num' | 'str' | 'id' | 'op' | 'color' | 'nl' | 'indent' | 'dedent' | 'eof';
export interface Token { type: TokenType; value: string; line: number; col: number }
export interface LexResult { tokens: Token[]; version: number | null; lines: string[]; errors: { line: number; message: string }[] }

const OPERATORS = [':=', '+=', '-=', '*=', '/=', '%=', '==', '!=', '<=', '>=', '=>', '<', '>', '=', '+', '-', '*', '/', '%', '?', ':', '(', ')', '[', ']', ',', '.'];
/** Tokens that cannot end a complete line: the next line continues the expression. */
const CONTINUES_AFTER = new Set([',', '?', ':', '+', '*', '/', '%', '==', '!=', '<', '>', '<=', '>=', '=', ':=', '+=', '-=', '*=', '/=', '%=', 'and', 'or', 'not']);
/** Tokens that cannot start a statement: a line that starts with one continues the previous line. */
const CONTINUES_BEFORE = new Set(['?', ':', 'and', 'or', '+', '*', '/', '%', '==', '!=', '<=', '>=', ')', ']', ',']);

/** Removes a // comment that is outside a string. */
function stripComment(line: string): string {
  let quote = '';
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (quote) { if (ch === '\\') i++; else if (ch === quote) quote = ''; continue; }
    if (ch === '"' || ch === "'") quote = ch;
    else if (ch === '/' && line[i + 1] === '/') return line.slice(0, i);
  }
  return line;
}

function tokenizeLine(text: string, line: number, startCol: number, out: Token[], errors: LexResult['errors']): void {
  let i = startCol;
  while (i < text.length) {
    const ch = text[i];
    if (ch === ' ' || ch === '\t' || ch === '\r') { i++; continue; }
    const col = i + 1;
    if (/[0-9]/.test(ch) || (ch === '.' && /[0-9]/.test(text[i + 1] ?? ''))) {
      const match = /^(?:[0-9]+\.?[0-9]*|\.[0-9]+)(?:[eE][+-]?[0-9]+)?/.exec(text.slice(i))!;
      out.push({ type: 'num', value: match[0], line, col }); i += match[0].length; continue;
    }
    if (/[A-Za-z_]/.test(ch)) {
      const match = /^[A-Za-z_][A-Za-z0-9_]*/.exec(text.slice(i))!;
      out.push({ type: 'id', value: match[0], line, col }); i += match[0].length; continue;
    }
    if (ch === '"' || ch === "'") {
      let value = '', j = i + 1, closed = false;
      while (j < text.length) {
        const c = text[j];
        if (c === '\\' && j + 1 < text.length) { const n = text[j + 1]; value += n === 'n' ? '\n' : n === 't' ? '\t' : n; j += 2; continue; }
        if (c === ch) { closed = true; j++; break; }
        value += c; j++;
      }
      if (!closed) errors.push({ line, message: 'Unterminated string.' });
      out.push({ type: 'str', value, line, col }); i = j; continue;
    }
    if (ch === '#') {
      const match = /^#(?:[0-9A-Fa-f]{8}|[0-9A-Fa-f]{6})(?![0-9A-Za-z_])/.exec(text.slice(i));
      if (match) { out.push({ type: 'color', value: match[0], line, col }); i += match[0].length; continue; }
    }
    const op = OPERATORS.find(candidate => text.startsWith(candidate, i));
    if (op) { out.push({ type: 'op', value: op, line, col }); i += op.length; continue; }
    errors.push({ line, message: `Unexpected character "${ch}".` }); i++;
  }
}

/** Tokenizes Pine source into logical lines with indent/dedent tokens. */
export function lexPine(source: string): LexResult {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const tokens: Token[] = [], errors: LexResult['errors'] = [];
  let version: number | null = null, depth = 0;
  const indents = [0];
  let started = false;
  for (let index = 0; index < lines.length; index++) {
    const raw = lines[index], line = index + 1;
    const versionMatch = /^\s*\/\/\s*@version\s*=\s*(\d+)/.exec(raw);
    if (versionMatch && version === null) version = Number(versionMatch[1]);
    const text = stripComment(raw);
    if (!text.trim()) continue;
    let width = 0, col = 0;
    for (; col < text.length; col++) { if (text[col] === ' ') width++; else if (text[col] === '\t') width += 4; else break; }
    const lineTokens: Token[] = [];
    tokenizeLine(text, line, col, lineTokens, errors);
    if (!lineTokens.length) continue;
    const last = tokens[tokens.length - 1], first = lineTokens[0];
    const continuation = started && (depth > 0 || width % 4 !== 0 && width > indents[indents.length - 1]
      || (last && (last.type === 'op' || last.type === 'id') && CONTINUES_AFTER.has(last.value))
      || ((first.type === 'op' || first.type === 'id') && CONTINUES_BEFORE.has(first.value)));
    if (!continuation) {
      if (started) tokens.push({ type: 'nl', value: '', line: tokens[tokens.length - 1].line, col: 0 });
      const level = width - width % 4;
      if (level > indents[indents.length - 1]) { indents.push(level); tokens.push({ type: 'indent', value: '', line, col: 1 }); }
      else {
        while (level < indents[indents.length - 1]) { indents.pop(); tokens.push({ type: 'dedent', value: '', line, col: 1 }); }
        if (level !== indents[indents.length - 1]) errors.push({ line, message: 'Inconsistent indentation.' });
      }
    }
    for (const token of lineTokens) {
      if (token.type === 'op' && (token.value === '(' || token.value === '[')) depth++;
      else if (token.type === 'op' && (token.value === ')' || token.value === ']')) depth = Math.max(0, depth - 1);
      tokens.push(token);
    }
    started = true;
  }
  if (started) tokens.push({ type: 'nl', value: '', line: tokens[tokens.length - 1].line, col: 0 });
  while (indents.length > 1) { indents.pop(); tokens.push({ type: 'dedent', value: '', line: lines.length, col: 1 }); }
  tokens.push({ type: 'eof', value: '', line: lines.length, col: 1 });
  return { tokens, version, lines, errors };
}
