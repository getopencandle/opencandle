# OpenCandle branding

The OpenCandle logo (a flame with candlestick bars) was supplied by the project owner. **The OpenCandle name and logo are not covered by the software licence** (PolyForm Noncommercial License 1.0.0) that applies to the application code; all rights in them are reserved by the project owner. The notice that ships with the app is `electron/assets/BRANDING-NOTICE.txt`.

Every icon the app uses is generated from one source image, `Logo-clean.png`, by `scripts/generate-opencandle-icons.py` (Python with Pillow). From the source root:

```powershell
python -I scripts/generate-opencandle-icons.py          # write electron/assets/opencandle-*
python -I scripts/generate-opencandle-icons.py --check  # exit 1 if a committed icon is stale
```

| File | Size | Used for |
|---|---|---|
| `opencandle.ico` | 16, 20, 24, 32, 40, 48, 64, 128, 256 | the program file (Explorer, taskbar pins) |
| `opencandle-256.png` | 256 | window and taskbar icon |
| `opencandle-tray-16/20/24/32.png` | one per display scale | notification-area icon |
| `opencandle-logo-512.png` | 512 | About dialog |
| `opencandle-mark-64.png` | 64 | main menu button |
| `opencandle-favicon-32.png` | 32 | page icon |

At 16, 20 and 24 px (and in the small menu mark) the two red candles blur into the red flame, so those sizes use a simplified drawing with only the flame and the green candle. In the artwork the red candles share pixels with the flame's lower edge, so the recipe removes them in three steps: it takes each red candle as a separate shape above the point where it meets the flame, follows each candle column down to where the colour changes to the flame, and redraws the flame's hidden inner curve from the visible part of that curve. The full drawing is used from 32 px up.

The package includes the icons, the notice and the recipe. Its validator checks that the delivered icons match the captured source and that the earlier pre-release artwork is absent.
