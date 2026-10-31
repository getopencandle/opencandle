import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NewsDocument, NewsItem } from '../../src/analysis-news/news';

// <NewsChartMarkers> through controlled hooks (effects run
// on render, state and refs kept per hook slot). No DOM or executable is exercised. SYNTHETIC news and bars.
const hooks = vi.hoisted(() => ({ cells: [] as any[], cursor: 0 }));
vi.mock('react', async () => {
  const actual = await vi.importActual<any>('react');
  const slot = (make: () => any) => { const i = hooks.cursor++; if (!(i in hooks.cells)) hooks.cells[i] = make(); return i; };
  return {
    ...actual,
    useState: (initial: any) => { const i = slot(() => typeof initial === 'function' ? initial() : initial); return [hooks.cells[i], (next: any) => { hooks.cells[i] = typeof next === 'function' ? next(hooks.cells[i]) : next; }]; },
    useRef: (value: any) => hooks.cells[slot(() => ({ current: value }))],
    useMemo: (make: () => any) => make(),
    useEffect: (run: () => void) => { run(); },
  };
});
(globalThis as any).requestAnimationFrame ??= () => 0;
(globalThis as any).cancelAnimationFrame ??= () => {};
const { NewsChartMarkers } = await import('../../src/ui/NewsChartMarkers');

const at = (iso: string) => Date.parse(iso) / 1000;
const bars = Array.from({ length: 10 }, (_, i) => ({ time: at('2026-06-01T00:00:00Z') + i * 86400 }));
const item = (id: string, publishedAt: string): NewsItem => ({ id, title: 'Synthetic ' + id, summary: '', provider: 'SYNTH', publishedAt, sourceUrl: null, instruments: ['GME'], markets: null, sectors: null, corporateActivity: null, economics: null, countries: null, formats: null });
const doc = (items: NewsItem[]): NewsDocument => ({ id: 'g2-gaps2', schemaVersion: 1, label: 'SYNTHETIC', importedAt: '2026-06-01T00:00:00.000Z', kind: 'synthetic', items });
const projection = () => ({ left: 0, top: 0, width: 1000, height: 400 });
const timeToX = (seconds: number) => (seconds - bars[0].time) / 86400 * 100 + 50;
function render(props: Record<string, unknown>) { hooks.cursor = 0; return NewsChartMarkers({ symbol: 'GME', bars, projection, timeToX, ...props } as never); }
function find(node: any, predicate: (node: any) => boolean): any[] {
  if (Array.isArray(node)) return node.flatMap(child => find(child, predicate));
  if (!node?.props) return [];
  return [...(predicate(node) ? [node] : []), ...find(node.props.children, predicate)];
}

describe('<NewsChartMarkers>', () => {
  beforeEach(() => { hooks.cells = []; hooks.cursor = 0; });
  it('draws one N badge per bar at the bar x, opens News on click, and hides at compressed zoom', () => {
    const onOpen = vi.fn(), documents = [doc([item('a', '2026-06-03T09:00:00Z'), item('b', '2026-06-05T09:00:00Z')])];
    const settings = { latestNews: true, newsNotification: false };
    render({ documents, settings, onOpen });
    const tree = render({ documents, settings, onOpen });
    const badges = find(tree, node => node.props['data-lv-news-marker'] !== undefined);
    expect(badges.map(b => [b.props['data-bar-time'], b.props.style.left])).toEqual([[at('2026-06-03T00:00:00Z'), 250 - 8], [at('2026-06-05T00:00:00Z'), 450 - 8]]);
    badges[0].props.onClick();
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ barTime: at('2026-06-03T00:00:00Z') }));
    hooks.cells = [];
    const squeezed = (seconds: number) => (seconds - bars[0].time) / 86400 + 50;
    render({ documents, settings, timeToX: squeezed });
    const hidden = render({ documents, settings, timeToX: squeezed });
    expect(hidden!.props['data-lv-news-markers-compressed']).toBe('true');
    expect(find(hidden, node => node.props['data-lv-news-marker'] !== undefined)).toEqual([]);
  });
  it('renders nothing with Latest news off but still notifies about news that arrives later, once', () => {
    const onNotify = vi.fn(), settings = { latestNews: false, newsNotification: true };
    expect(render({ documents: [doc([item('a', '2026-06-03T09:00:00Z')])], settings, onNotify })).toBeNull();
    expect(onNotify).not.toHaveBeenCalled();
    const later = [doc([item('a', '2026-06-03T09:00:00Z'), item('b', '2026-06-06T09:00:00Z')])];
    render({ documents: later, settings, onNotify });
    expect(onNotify).toHaveBeenCalledTimes(1);
    expect(onNotify).toHaveBeenCalledWith('SYNTHETIC news for GME: Synthetic b');
    render({ documents: later, settings, onNotify });
    expect(onNotify).toHaveBeenCalledTimes(1);
  });
  it('does not notify with News notification off, and a symbol switch records the new symbol first', () => {
    const onNotify = vi.fn(), documents = [doc([item('a', '2026-06-03T09:00:00Z')])];
    render({ documents, settings: { latestNews: true, newsNotification: false }, onNotify });
    render({ documents: [doc([item('a', '2026-06-03T09:00:00Z'), item('b', '2026-06-06T09:00:00Z')])], settings: { latestNews: true, newsNotification: false }, onNotify });
    expect(onNotify).not.toHaveBeenCalled();
    render({ documents, settings: { latestNews: true, newsNotification: true }, onNotify, symbol: 'GME' });
    render({ documents, settings: { latestNews: true, newsNotification: true }, onNotify, symbol: 'NASDAQ:GME' });
    expect(onNotify).not.toHaveBeenCalled();
  });
});
