"""Generate the OpenCandle icon set from the owner-supplied logo (Logo-clean.png).

Deterministic: reads only Logo-clean.png at the repo root, writes the committed files under electron/assets/.
Run with the workstation Python (Pillow 12): python -I scripts/generate-opencandle-icons.py [--check]
--check regenerates in memory and exits 1 if any committed output differs.

Small sizes (16-24 px) use a simplified variant: the flame plus the green candle. At those sizes the two red candles
merge with the red flame into noise. The red candles are fused with the flame's lower tails in the artwork (they share
opaque pixels), so plain connected-component removal would take the whole flame. The erase instead (1) takes each red
candle's connected component above the fusion rows, where the candle is still an island inside the transparent hole,
(2) continues each candle column downward until the colour jumps from the candle's dark base to the brighter flame tail,
and (3) rebuilds the flame's hidden inner edge under the candle from a quadratic fitted to the visible inner edge just
above, so the flame keeps its own curve instead of a box-shaped bite.
"""
import io
import sys
from collections import deque
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'Logo-clean.png'
ASSETS = ROOT / 'electron' / 'assets'
ALPHA = 8              # opaque threshold for components (includes the anti-aliased fringe)
FUSION_ROW = 1085      # above this row each red candle is an island in the hole
JUMP = 25              # red-channel brightening that marks the candle base -> flame tail boundary
# Seeds inside each red candle body, plus which side of the flame hides its inner edge and the rows used to fit it.
RED_CANDLES = ({'seed': (447, 1000), 'side': 'left', 'fit': (960, 1084)},
               {'seed': (805, 1000), 'side': 'right', 'fit': (960, 1084)})
SQUARE = (11, 12, 1243, 1244)  # square crop around the content box (148,15)-(1106,1241)
FULL_ICO = (32, 40, 48, 64, 128, 256)
SMALL_ICO = (16, 20, 24)


def flood(px, size, seed, limit_row):
    w, _ = size
    seen = set([seed])
    queue = deque([seed])
    while queue:
        x, y = queue.popleft()
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if (nx, ny) in seen or not (0 <= nx < w and 0 <= ny <= limit_row):
                continue
            if px[nx, ny][3] > ALPHA:
                seen.add((nx, ny))
                queue.append((nx, ny))
    return seen


def inner_edge(px, size, side, rows, x_limit):
    """Visible inner edge of the flame hole on one side: the first transparent x next to the flame, per row."""
    w, _ = size
    points = []
    for y in range(rows[0], rows[1] + 1, 4):
        if side == 'left':
            x = 150
            while x < x_limit and px[x, y][3] <= 128:
                x += 1
            while x < x_limit and px[x, y][3] > 128:
                x += 1
            if x < x_limit:
                points.append((y, x))
        else:
            x = w - 150
            while x > x_limit and px[x, y][3] <= 128:
                x -= 1
            while x > x_limit and px[x, y][3] > 128:
                x -= 1
            if x > x_limit:
                points.append((y, x))
    # Least-squares quadratic x = a*y^2 + b*y + c (normal equations, centred for conditioning).
    ym = sum(y for y, _ in points) / len(points)
    s = [sum((y - ym) ** k for y, _ in points) for k in range(5)]
    t = [sum(x * (y - ym) ** k for y, x in points) for k in range(3)]
    m = [[s[4], s[3], s[2], t[2]], [s[3], s[2], s[1], t[1]], [s[2], s[1], s[0], t[0]]]
    for i in range(3):
        p = m[i][i]
        m[i] = [v / p for v in m[i]]
        for j in range(3):
            if j != i:
                f = m[j][i]
                m[j] = [a - f * b for a, b in zip(m[j], m[i])]
    a, b, c = m[0][3], m[1][3], m[2][3]
    return lambda y: a * (y - ym) ** 2 + b * (y - ym) + c


def simplified(full):
    """The flame plus the green candle (red candles removed)."""
    image = full.copy()
    px = image.load()
    size = image.size
    _, h = size
    for candle in RED_CANDLES:
        island = flood(px, size, candle['seed'], FUSION_ROW)
        x0 = min(x for x, _ in island)
        x1 = max(x for x, _ in island)
        edge_limit = x0 if candle['side'] == 'left' else x1
        edge = inner_edge(px, size, candle['side'], candle['fit'], edge_limit)
        for x, y in island:
            px[x, y] = (0, 0, 0, 0)
        step = -1 if candle['side'] == 'left' else 1

        def flame_colour(y):
            # Nearest fully opaque flame pixel outward from the candle in the same row (the flame gradient is vertical).
            x = x0 - 1 if candle['side'] == 'left' else x1 + 1
            for _ in range(60):
                if px[x, y][3] == 255:
                    return px[x, y]
                x += step
            return (207, 1, 18, 255)

        for x in range(x0 - 2, x1 + 4):
            previous = None
            in_candle = x0 <= x <= x1
            for y in range(FUSION_ROW + 1, h):
                pixel = px[x, y]
                if in_candle and pixel[3] > ALPHA and (previous is None or pixel[0] - previous <= JUMP):
                    previous = pixel[0]
                else:
                    in_candle = False  # past the candle base: the flame tail (or the hole) below is original art
                e = edge(y)
                inside_flame = x < e if candle['side'] == 'left' else x > e
                if not inside_flame:
                    px[x, y] = (0, 0, 0, 0)
                elif in_candle:
                    px[x, y] = flame_colour(y)
    return image


def scaled(image, size):
    # Resize in premultiplied alpha so transparent black never bleeds into the edge colours.
    return image.convert('RGBa').resize((size, size), Image.Resampling.LANCZOS).convert('RGBA')


def png_bytes(image):
    out = io.BytesIO()
    image.save(out, format='PNG', optimize=True)
    return out.getvalue()


def ico_bytes(full, small):
    # Owner 2026-10-30: the program icon is the single-candle mark at every size; the full logo stays in About.
    images = [scaled(small, s) for s in SMALL_ICO] + [scaled(small, s) for s in FULL_ICO]
    out = io.BytesIO()
    largest = images[-1]
    largest.save(out, format='ICO', sizes=[(i.width, i.height) for i in images], append_images=images[:-1])
    return out.getvalue()


def outputs():
    source = Image.open(SOURCE).convert('RGBA')
    if source.size != (1254, 1254):
        raise SystemExit('Logo-clean.png must be 1254 x 1254; review the crop and candle seeds for new artwork.')
    small_source = simplified(source)
    full = source.crop(SQUARE)
    small = small_source.crop(SQUARE)
    files = {
        'opencandle.ico': ico_bytes(full, small),
        'opencandle-256.png': png_bytes(scaled(small, 256)),
        'opencandle-logo-512.png': png_bytes(scaled(full, 512)),
        'opencandle-mark-64.png': png_bytes(scaled(small, 64)),
        'opencandle-favicon-32.png': png_bytes(scaled(small, 32)),
        'opencandle-tray-16.png': png_bytes(scaled(small, 16)),
        'opencandle-tray-20.png': png_bytes(scaled(small, 20)),
        'opencandle-tray-24.png': png_bytes(scaled(small, 24)),
        'opencandle-tray-32.png': png_bytes(scaled(small, 32)),
    }
    return files, small_source


def main(argv):
    files, small_source = outputs()
    if '--check' in argv:
        stale = [name for name, data in files.items() if not (ASSETS / name).is_file() or (ASSETS / name).read_bytes() != data]
        if stale:
            print('Stale OpenCandle icons: ' + ', '.join(stale))
            return 1
        print('OpenCandle icons are current.')
        return 0
    for name, data in files.items():
        (ASSETS / name).write_bytes(data)
    if '--preview' in argv:
        small_source.save(argv[argv.index('--preview') + 1])
    print('Wrote ' + ', '.join(sorted(files)))
    return 0


if __name__ == '__main__':
    sys.exit(main(sys.argv[1:]))
