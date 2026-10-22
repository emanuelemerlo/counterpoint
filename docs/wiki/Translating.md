**English** · [Italiano](Tradurre)

# Translating

Contrappunto is in English and Italian, and any language can be added without
build tools: each language is one JavaScript file with the interface texts.

The full guide is in the repository: **[TRANSLATING.md](https://github.com/emanuelemerlo/counterpoint/blob/main/TRANSLATING.md)**.
In short:

1. Copy `plugin/Contrappunto/i18n/en.js` to `i18n/xx.js` (your language code)
   and translate the values, keeping the `{placeholders}`.
2. Register it in `i18n/i18n.js` (two lines).
3. Run `node tests/check_i18n.js`: it reports missing keys and placeholders.
4. Optionally translate the readme of the release (`release/readme/`), the
   release notes (`CHANGELOG.xx.md`) and these Wiki pages (`docs/wiki/`, one
   file per page with a name in your language, plus a column in `_Sidebar.md`
   and a line in `Home.md`).
5. Open a pull request.

The music examples on these pages contain no text and are shared by all
languages; screenshots of the window can be made per language with
`python3 tests/mock/screenshot.py xx variants docs/wiki/images/dialog-xx.png`.

For musical terms, the [Glossary](Glossary) lists the English and Italian
words side by side.
