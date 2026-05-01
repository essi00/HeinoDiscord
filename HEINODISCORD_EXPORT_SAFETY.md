# HeinoDiscord Export Safety

HeinoDiscord includes local export tooling, but it deliberately does not request
or accept Discord user tokens.

## Why User Tokens Are Not Supported

A Discord user token is effectively an active login key. A tool that asks for it
can accidentally expose it through logs, crash reports, shell history,
screenshots, clipboard managers, malware, cloud backups, or future code changes.

Even if a tool promises to keep a token local, adding token input creates a
dangerous pattern for users and downstream forks. HeinoDiscord avoids that entire
class of risk by design.

## Supported Export Paths

- `LocalChatExporter`: exports messages already loaded in the running client.
  Its `autoload:true` option scroll-loads more visible history without reading
  or accepting a Discord user token.
- `heino:import-data-package`: imports Discord's official account data package
  into local HTML, JSON, and Markdown archives.
- `heino:export-history`: uses a bot token for server channels where the bot has
  permission to read history.

## Consent Model

Export tools should make the user confirm:

- what source is being read,
- what output folder will be written,
- that exported chats may include other people's personal data,
- that exports are local files and should not be uploaded publicly,
- that no Discord user token is requested or stored.

The `exports/` folder is ignored by git so local archives are not committed by
accident.

## Local Files Only

HeinoDiscord export tools write to local paths under `exports/` by default. They
do not upload archives, call analytics endpoints, or include remote scripts in
generated HTML.
