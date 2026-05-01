# Security

Vencord userplugins run inside your Discord client. Treat them like browser
extensions with access to what your client can see.

This library follows three rules:

- No plugin is installed unless selected.
- `-Recommended` excludes advanced/privacy-sensitive plugins.
- Installer scripts copy local source only; they do not fetch remote code.

Before installing third-party contributions, review source code for:

- Network requests to unknown domains.
- Token, cookie, localStorage, or credential access.
- Hidden data collection.
- Message scraping or automatic forwarding.
- Obfuscated/minified code.

Report security concerns privately to the maintainer before public disclosure.
