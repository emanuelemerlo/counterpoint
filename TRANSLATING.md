# Translating Contrappunto

**English** · [Italiano](TRANSLATING.it.md)

Contrappunto ships in English and Italian. Adding a language needs no build
tools: the interface texts are plain JavaScript files, the documents are
Markdown and text files. You can translate everything at once or one part at a
time – the plugin falls back to English for anything that is missing.

## 1. The interface (the essential part)

1. Copy `plugin/Contrappunto/i18n/en.js` to `plugin/Contrappunto/i18n/xx.js`,
   where `xx` is the [ISO 639-1](https://en.wikipedia.org/wiki/List_of_ISO_639-1_codes)
   code of your language (`de`, `fr`, `es`, ...).
2. In the new file set `code: "xx"` and `name` to the language's own name
   (`"Deutsch"`, `"Français"`), and translate:
   - `notes`: the seven note names from C to B as musicians in your language
     write them (`["C", "D", "E", "F", "G", "A", "H"]` in German, where B♭ is
     written `B`: for names like these add to `LANG` a function
     `noteName(letter, alt)` – letter 0–6 from C, alt −2…+2 – that returns
     the name, e.g. `Cis`, `Es`, `B`);
   - every **value** in `strings`. Do not change the **keys** (the text
     before the colon).
3. Register the language in `plugin/Contrappunto/i18n/i18n.js`: add
   `.import "xx.js" as Xx` next to the other imports and `Xx.LANG` to
   `LANGUAGES`.
4. Run the check: `node tests/check_i18n.js` (Node.js 22 or later). It tells
   you about missing keys, placeholders and plural forms.
5. Try it in MuseScore: copy the `plugin/Contrappunto` folder into your
   plugins folder as `contrappunto`, restart MuseScore, open the plugin and
   choose your language under **Language** (or set MuseScore's interface to
   your language and leave *Automatic*).

### Rules for the values

- **Placeholders** such as `{n}`, `{voice}`, `{from}` are filled in by the
  plugin: keep them exactly as they are (you may move them within the
  sentence).
- **Plural forms**: some values are objects, for instance
  `{ one: "1 error", other: "{n} errors" }`. Keep the same structure. If your
  language has more forms (Polish, Russian, Arabic, ...), add a `plural`
  function to `LANG` that returns `"one"`, `"few"`, `"many"` or `"other"` for
  a number, and add those forms to the objects.
- **Musical terms**: use the words a music student in your language would
  find in a counterpoint textbook (cantus firmus, suspension, cambiata, ...).
  The glossary on the Wiki lists the English and Italian terms side by side.
- Texts such as `rule.parallel5` are read in the analysis list
  (`✖ bar 12: parallel fifths with the melody`): short and specific is best.

## 2. The release files

1. Copy `release/readme/en.txt` to `release/readme/xx.txt` and translate it.
   Leave the `{VERSION}`, `{DATE}`, `{NOTES}`, `{HISTORY}`, `{REPO_URL}` and
   `{WIKI_URL}` placeholders as they are.
2. Add an entry to `release/readme/languages.json` with the file name in the
   zip (for example `LISEZMOI.TXT`), the date format and the installation
   sentence of the release notes.
3. Optional: a `CHANGELOG.xx.md` with the release notes in your language. If
   a version is missing there, the release uses the English notes.

Check with `python3 tools/build_release.py` (it writes to `dist/`).

## 3. The Wiki and the README

- The Wiki's sources are in `docs/wiki/`. Each page exists once per language,
  with a name in that language (`Quick-start.md`, `Primi-passi.md`). Translate
  the English pages into new files with names in your language and add a
  column to `_Sidebar.md` and a line to `Home.md`.
- Music examples (`docs/wiki/images/*.svg`) have no text, so they can be
  shared by all languages; screenshots of the window are per language
  (`dialog-xx.png`).
- `README.xx.md` is welcome too; link it from the language line at the top of
  `README.md`.

## 4. Send it

Open a pull request with your files. The automatic tests run the translation
check; if you are not sure about a musical term, write it in the pull
request and we will look at it together.
