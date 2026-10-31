// Static markup of the Emojis picker through react-dom/server (no DOM events, no GUI; not interface evidence).
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {afterEach,describe,expect,it} from 'vitest';
import {EmojiPicker} from '../../src/ui/EmojiPicker';
import {EMOJI_GROUPS,EMOJI_RECENTS_MAX,emojiOf,pickEmoji,resetEmojiPicker} from '../../src/chart/lv-types/emoji-set';

const markup=(props:Partial<React.ComponentProps<typeof EmojiPicker>>={})=>renderToStaticMarkup(React.createElement(EmojiPicker,{onPick(){},...props}));
const count=(html:string,needle:RegExp)=>(html.match(needle)??[]).length;

afterEach(()=>resetEmojiPicker());

describe(' Emojis picker markup',()=>{
 it('8 category buttons 38x38, the first pressed; rows of 9 cells 37x38; menu max height 679',()=>{
  const html=markup();
  expect(count(html,/class="lv-emoji-category"/g)).toBe(8);
  expect(count(html,/aria-pressed="true"/g)).toBe(1);
  expect(html.indexOf('aria-pressed="true"')).toBeLessThan(html.indexOf('aria-pressed="false"'));
  expect(html).toContain('width:38px;height:38px');expect(html).toContain('width:37px;height:38px');
  expect(html).toContain('max-height:679px');
  const first=EMOJI_GROUPS[0];
  expect(html).toContain('>'+first.label+'</h3>');
  expect(count(html,/role="gridcell"/g)).toBe(first.codePoints.length);
  expect(count(html,/role="row"/g)).toBe(Math.ceil(first.codePoints.length/9));
  for(const row of html.split('role="row"').slice(1))expect(count(row.split('</div>')[0],/role="gridcell"/g)).toBeLessThanOrEqual(9);
  expect(html).toContain('Segoe UI Emoji');expect(html).not.toMatch(/<img|\.png|\.svg/);
  expect(html).not.toContain('Recently used');
 });
 it('shows the chosen category and a recently used row (most recent first, at most 18)',()=>{
  const objects=EMOJI_GROUPS.find(row=>row.id==='objects')!;
  const html=markup({initialGroup:'objects'});
  expect(html).toContain('>'+objects.label+'</h3>');expect(html).toContain(emojiOf(objects.codePoints[0]));
  const glyphs=EMOJI_GROUPS[0].codePoints.slice(0,20).map(emojiOf);for(const glyph of glyphs)pickEmoji(glyph);
  const withRecents=markup();
  const recent=withRecents.split('Recently used')[1].split('</section>')[0];
  expect(count(recent,/role="gridcell"/g)).toBe(EMOJI_RECENTS_MAX);
  expect(recent.indexOf(glyphs[19])).toBeLessThan(recent.indexOf(glyphs[18]));
  expect(recent).not.toContain('>'+glyphs[0]+'<');
 });
});
