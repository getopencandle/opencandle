# Security

## Supported versions

| Version | Supported |
| --- | --- |
| 0.8.x | Yes |

Security fixes go into the latest release.

## Reporting a vulnerability

Please do not open a public issue for a security problem.

Report it privately with GitHub's private vulnerability reporting: open the **Security** tab of https://github.com/getopencandle/opencandle, then choose **Report a vulnerability**. Only the maintainers can see the report.

Please include the OpenCandle version, your Windows version, the steps to reproduce, and what you expected to happen. A small synthetic input file helps. Do not send real API keys, account data, or profiles or workspaces that contain personal information.

We aim to acknowledge reports within a week and will keep you updated until a fix is released. We are happy to credit you in the release notes if you want.

## How OpenCandle handles your data and keys

**No account, no telemetry.** OpenCandle has no login, no cloud sync and no usage tracking. It places no real orders and handles no payments; paper trading uses virtual money.

**Where data is saved.** Your workspace, settings, caches and saved key live in your Windows app data folder (`%APPDATA%\OpenCandle` by default), never in the program folder. **Data sources** shows the exact folder and has an **Open folder** button.

**API keys.**
- Your Alpaca Key ID and Secret are encrypted with Electron safeStorage, which on Windows uses your Windows sign-in (DPAPI). Only your Windows user account on that computer can decrypt them.
- If Windows encryption is not available, OpenCandle refuses to save the key rather than storing it in plain text.
- Keys are never exported. Workspace exports and **Export settings** files never contain them, so you enter the key again on a new computer.
- The user interface only ever sees the key status and the last four characters of the Key ID. The secret never leaves the main process except in the authentication headers sent to Alpaca.
- Keys are never written to logs, URLs or error messages.
- A copied profile opened by another Windows user cannot decrypt the key; OpenCandle then asks you to enter it again.
- **Remove key** in Data sources deletes the saved key file.

**Network.** The user interface cannot connect to the internet directly; its content security policy blocks remote connections. Data requests run in the main process, only to fixed provider addresses (Alpaca, Coinbase, FRED, SEC EDGAR), and only for sources you turn on or open. Requests to the SEC and FRED are anonymous and send only the series or company you look up plus ordinary network metadata such as your IP address.

**App isolation.** The renderer runs with Chromium sandboxing, context isolation, Node integration disabled and web security on. Files, dialogs, storage and network go through a small set of fixed, validated bridge calls. Packaged builds enable Electron security fuses (no RunAsNode, no Node options or inspector, ASAR integrity checks).

**Scripts.** CandleScript runs in a separate QuickJS sandbox with strict limits on time, memory and output. Scripts have no access to files, the network, processes or keys. See [docs/candlescript.md](docs/candlescript.md).

These measures reduce risk; they are not a guarantee. Do not disable the sandbox or change profile permissions to work around a problem; report it instead.

## Keeping your setup safe

- Do not share your profile folder or the key file.
- Use a paper trading Alpaca account for market data if you can; OpenCandle does not need trading permissions.
- Download OpenCandle only from the official GitHub releases or https://getopencandle.com.
