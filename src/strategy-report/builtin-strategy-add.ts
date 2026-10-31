import { builtinStrategyDocument, findBuiltinStrategyDocument } from '../domain/builtin-strategies/catalog';
import { addScript, bindScript, restoreScriptBindings, saveScript, type ScriptBinding, type ScriptLibrary } from '../ui/script-library';

/**
 * Adding a built-in strategy from the Indicators dialog's Strategies tab. Its original CandleScript source
 * becomes a saved local strategy document (an existing one with the same name and saved source is reused, so adding it
 * twice binds the same document again) and a new chart instance of it, exactly as Add to chart makes one. Pure: the host
 * commits the returned library and bindings. Throws the library's own reasons (for example the 100 document limit).
 */
export function addBuiltinStrategyBinding(library: ScriptLibrary, bindings: readonly ScriptBinding[], entryId: string, makeId: () => string, now: string): { library: ScriptLibrary; bindings: ScriptBinding[]; binding: ScriptBinding; name: string } {
  const doc = builtinStrategyDocument(entryId);
  let next = library, file = findBuiltinStrategyDocument(next.documents, entryId);
  if (!file) {
    const id = makeId();
    next = saveScript(addScript(next, { id, name: doc.name, source: doc.source, pane: doc.pane }, 'strategy'), id, now);
    file = next.documents.find(row => row.id === id)!;
  }
  const binding = bindScript(file, makeId());
  return { library: next, bindings: restoreScriptBindings([...bindings, binding]), binding, name: doc.name };
}
