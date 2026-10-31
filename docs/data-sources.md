# Data sources

OpenCandle does not sell or bundle market data. It connects to free public sources, has built-in practice data, and uses your own Alpaca key for real-time US stocks. You can also import your own files. Open **Data sources** from the main menu to see the status of each source and its settings.

**First start.** A new install opens on a live BTC-USD daily chart from Coinbase (no account or key). If Coinbase cannot be reached within a few seconds, the chart shows the built-in example data for BTC instead, says so in one line and offers **Try live again**. Alpaca is not set up or mentioned until you open a US stock; that chart then explains how to add a free key. A workspace you already saved, including one copied from LarryVision, opens exactly as you left it.

## What you need

| What you want | Minimum you need | How to get it |
| --- | --- | --- |
| Practice charts | Nothing. Built in. | Choose **Load example data** on an empty chart. Example data covers BTC, ETH, SPY, GME and AAPL. These prices are invented, not real. |
| Real-time US stocks and ETFs | A free Alpaca account and its API key | Sign up at alpaca.markets (a free paper trading account is enough), create an API key in the dashboard (the secret is shown once), and paste the Key ID and Secret in Data sources. Free plan: live prices from the IEX exchange, up to 30 symbols at once. Live prices from all exchanges need a paid Alpaca market data plan. |
| US stock history (daily and intraday) | The same free Alpaca key | All-exchange history with splits and dividends; on the free plan the newest 15 minutes come from IEX. |
| Crypto (BTC-USD, ETH-USD, SOL-USD) | Nothing. No account or key. | Coinbase public market data. On for a new install; turn it on or off in Data sources. |
| Economic data and rates | Nothing. No account or key. | Type `FRED:` and a series id (for example `FRED:DGS10`) or open Markets. Each series downloads from the St. Louis Fed only when you open it. |
| Company fundamentals and SEC filings | Nothing. No account or key. | Open Fundamentals or SEC filings; data comes from the SEC's public EDGAR service when you ask. |
| Your own data (any market) | A CSV or JSON file of bars | Import a file (see below). |
| Options, futures, forex, live news | Not available from a built-in source | Import your own files. |

When OpenCandle runs in a browser with `npm run dev`, every source except practice data says "Needs the desktop app".

## Sources in detail

| Source | What it gives | Account or key | Cost |
| --- | --- | --- | --- |
| Practice data | Invented daily and intraday bars for GME, SPY and other symbols, generated on your computer | None | Free |
| Alpaca, free plan | Live IEX trades and quotes (up to 30 symbols), all-exchange history ending 15 minutes ago plus IEX for the newest 15 minutes, splits and dividends, symbol search | Alpaca account and API key | Free |
| Alpaca, paid plan | Live and undelayed history from all US exchanges | Same key on a paid Alpaca market data plan | Paid (Alpaca) |
| Coinbase public | Live trades and candles for BTC-USD, ETH-USD and SOL-USD | None | Free |
| FRED (St. Louis Fed) | Economic and rates series, one series at a time when you open it, at most a daily refresh, with a 5 MB local cache | None | Free |
| SEC EDGAR | Company facts (fundamentals) and filing lists by company, when you ask | None | Free |
| Your own files | Bars, plus news, calendars and watchlists through their own imports | None | Free |

Notes:
- **Alpaca.** OpenCandle only needs market data access, so a paper trading account works. **Test connection** checks the IEX feed. **Remove key** deletes the saved key.
- **Coinbase.** On for a new install (the first chart is live BTC-USD). A workspace you already saved keeps its own setting. Only the three listed products are supported.
- **FRED.** **Allow FRED downloads** is on by default and can be turned off; the cache can be cleared from Data sources.
- **SEC.** Requests send the company you look up and ordinary network metadata (such as your IP address) to data.sec.gov. The SEC applies fair-access rate limits.

## Importing your own bars

Use **Import data** (or **Import a file...** in Data sources).

- Formats: CSV or JSON.
- Columns: `time` (or `date`), `open`, `high`, `low`, `close`, `volume`.
- Times: numeric times need an explicit seconds or milliseconds choice; dates use `YYYY-MM-DD` or an ISO timestamp with a timezone.
- Limits: 20 MB and 100,000 rows per file.
- The importer rejects missing prices or volume, inconsistent ranges (for example a high below the low) and invalid dates, and tells you how it sorted and handled duplicates.
- Check the instrument's currency, tick size and timezone yourself. Session and adjustment basis are not known unless you supply them.

Synthetic examples you can try are in [`examples/`](../examples/).

### Free historical 1-minute bars (optional)

`tools/iex-hist/` is a small Python tool (standard library only) that builds real 1-minute bars from the free IEX HIST files, which you can then import. See its README. Data provided for free by IEX; by using IEX Historical Data you agree to the [IEX Historical Data Terms of Use](https://www.iex.io/legal/hist-data-terms).

## Where your settings are saved

Keys, data source choices, the workspace and downloaded data are saved only on your computer, in your Windows app data folder: `%APPDATA%\OpenCandle` by default, or the folder given with `--lv-profile=<absolute path>`. Nothing is saved in the program folder, and OpenCandle warns you if the profile is inside it.

Data sources shows the exact folder and has an **Open folder** button.

- **Keys** are encrypted with your Windows sign-in (Electron safeStorage). If Windows encryption is not available, OpenCandle does not save the key at all. A profile copied to another Windows user cannot decrypt the key, and OpenCandle asks you to enter it again.
- **Export settings** and **Import settings** move your data source choices to another computer as a small JSON file that never contains keys.
- **Workspace export and reset** are under Saved on this computer. Reset replaces the active workspace; exported copies are not deleted.

## Your responsibility

You use your own accounts and keys, and each provider's terms apply to the data you connect. Data from Alpaca, Coinbase and FRED is shown for your personal viewing, and OpenCandle does not export it. Imported data keeps whatever rights it came with. OpenCandle is not affiliated with any of these providers, and nothing in OpenCandle is financial advice.
