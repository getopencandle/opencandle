import {describe,expect,it} from 'vitest';
import {readFileSync} from 'node:fs';
const css=readFileSync('src/ui/overlay.css','utf8');
describe('overlay primitives CSS',()=>{
 it('styles menus and dialogs with one look and animates on mount',()=>{
  expect(css).toMatch(/\.lv-popup-menu\{/);
  expect(css).toMatch(/\.lv-modal,\.settings-modal\{/);
  expect(css).toMatch(/@starting-style/);
  expect(css).toMatch(/prefers-reduced-motion:reduce/);
  expect(css).toMatch(/--lv-menu-row-h:32px/);
 });
 it('is imported after components.css',()=>{
  const main=readFileSync('src/main.tsx','utf8');
  expect(main.indexOf('overlay.css')).toBeGreaterThan(main.indexOf('components.css'));
 });
});
