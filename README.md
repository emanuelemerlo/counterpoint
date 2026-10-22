# Contrappunto

**Writes, compares and checks counterpoint** – a plugin for MuseScore 4

**English** · [Italiano](README.it.md)

Contrappunto writes a counter-melody in counterpoint for a melody (cantus
firmus) and, if there is one, a bass, and puts it on a **new staff** or in a
**voice of an existing staff** (for example voice 2 of the piano's left hand).
It can also **analyze** a voice written by hand with the same rules and
**regenerate** a variant around the notes you want to keep. The interface is in
English and Italian.

![The plugin's window](docs/wiki/images/dialog-en.png)

**New to counterpoint?** The Wiki has a [short
introduction](https://github.com/emanuelemerlo/counterpoint/wiki/Counterpoint-in-a-nutshell)
and step-by-step guides:
[Quick start](https://github.com/emanuelemerlo/counterpoint/wiki/Quick-start) ·
[Choosing a species and style](https://github.com/emanuelemerlo/counterpoint/wiki/Choosing-a-species-and-style) ·
[Checking an exercise](https://github.com/emanuelemerlo/counterpoint/wiki/Checking-an-exercise) ·
[All pages](https://github.com/emanuelemerlo/counterpoint/wiki/Home)

## Installation

1. Download `Contrappunto-X.Y.Z.zip` from the [releases page](https://github.com/emanuelemerlo/counterpoint/releases)
   and extract the `contrappunto` folder into `Documents/MuseScore4/Plugins/`
   (or copy the repository's `plugin/Contrappunto` folder there, renaming it
   `contrappunto`).
2. In MuseScore: **Plugins → Manage plugins**, enable *Contrappunto*.
3. The plugin appears in the menu **Plugins → Composing/arranging tools**.
4. After an update **restart MuseScore**: while it stays open it keeps using
   the version loaded at start-up. The version in use is shown next to the
   title of the plugin's window. When updating from an earlier version, first
   delete the old folder (even if it is called `Contrappunto` with a capital
   C); up to 2.6 the plugin was called «Contrappunto automatico».

The folder must contain `contrappunto.qml` (interface and connection to the
score), `contrappunto_engine.js` (musical engine) and the `i18n/` folder
(interface texts, one file per language). Details on the Wiki's
[Installation](https://github.com/emanuelemerlo/counterpoint/wiki/Installation) page.

## Usage

1. (Optional) select a range of bars; without a selection the plugin works on
   the whole score. It always works on whole bars.
2. Start the plugin, choose the **melody**'s staff and the **bass**'s staff
   (or "none" if you only have the cantus firmus). Melody and bass can share a
   staff: the plugin takes the highest note as the melody and the lowest as
   the bass.
3. Choose the destination: new staff (with the instrument) or existing staff +
   voice.
4. Set the style and press **Generate**. Every generation is a single
   operation, undoable with Ctrl+Z (ties are a second step).
5. After the first generation on a new staff, that staff becomes the
   destination: change the **seed** and press Generate again to get variants
   in place of the previous one.
6. To compare several solutions set **How many** (up to 8): the plugin
   computes the variants with consecutive seeds and ranks them by quality
   (first those without parallels, then those with fewer errors, then by rule
   score). The best one is written to the destination; click another variant
   in the list to replace it (each replacement can be undone with Ctrl+Z and
   its seed goes into the Seed field). With **One variant per new staff** each
   variant goes to a staff of its own, with a label, to compare them by ear.
   Next to each variant are the errors and warnings found by the analysis
   (see below).

### Analyzing a voice

**Analyze voice** checks the destination voice (*Existing staff* + voice;
after a generation on a new staff it is that staff) against melody and bass,
with the engine's rules: parallel fifths and octaves, hidden fifths and
octaves, unprepared or unresolved dissonances, suspensions that do not resolve
down, forbidden leaps, unrecovered leaps, outlined tritones and sevenths, voice
crossings, doubled or unresolved leading note, cross-relations, repeated
climax, final note. Notes with an error turn red, notes with a warning orange,
and the list with bar numbers appears in the window. A new analysis first
removes the colours of the previous one; Ctrl+Z removes them straight away.
Use it to check an exercise written by hand or to understand why a variant has
warnings.

### Regenerating the rest

If you like a variant only in part, edit the notes you want by hand (or select
them with Ctrl+click) in the destination voice and press **Regenerate the
rest**: the selected notes, or without a selection the ones changed since the
plugin wrote the variant, stay as they are (pitch, spelling and duration) and
everything else is recomputed around them, with the same settings. Kept notes
may even break a rule: the plugin respects them and reports it in the check.
Notes kept the previous time stay kept until you change them.

### Language

Top right, **Language**: *Automatic* uses MuseScore's interface language
(English if there is no file for that language), or choose English or
Italiano. Note names follow the language (C D E / Do Re Mi). Switching
language also translates the message on screen. To add a language see
[TRANSLATING.md](TRANSLATING.md).

### Remembered settings

Language, species, position, register, rules, options, variety, number of
variants, instrument and destination are remembered from one session to the
next. If your version of MuseScore does not offer Qt's `Settings` module, the
plugin works anyway, starting from the defaults each time.

The window uses the colours of MuseScore's theme (light, dark, high contrast)
or, if not available, the system's.

### Options

| Option | Values |
|---|---|
| Species / rhythm | Free (rhythm complementary to the melody), 1:1, 2:1, 4:1, Suspensions (4th species), Florid (5th species) |
| Position | Automatic, above the melody, inner voice (below the melody, above the bass), as the bass (only without a bass) |
| Register | Automatic, Soprano, Alto, Tenor, Bass |
| Rules | Strict (academic) or free (appoggiaturas, dominant sevenths, hidden fifths tolerated) |
| Mode / Meter | Automatic, or forced (major/minor, simple/compound) |
| Imitation | In the melody's rests the counterpoint echoes its last motif |
| Imitative entry | Free and florid only: the counterpoint waits while the melody states its opening (one bar, or two or half if needed), then imitates it at the octave, fifth or fourth (with free rules also at the third or sixth) |
| Variety and seed | How far the result may stray from the "most correct" solution; same seed = same result |
| How many / one per staff | Number of variants to compute and rank; optionally one per new staff |
| Language | Automatic (MuseScore's), English, Italiano |

Every option is explained with examples on the Wiki's
[Options reference](https://github.com/emanuelemerlo/counterpoint/wiki/Options-reference)
page, every analysis finding in
[Analysis rules](https://github.com/emanuelemerlo/counterpoint/wiki/Analysis-rules).

## How the engine works

The original Python script (in `legacy/`) chose **one note at a time** (a
"greedy" choice): it could not prepare a suspension, resolve a dissonance or
avoid painting itself into a corner. The new engine:

- **Searches the whole line** with a *beam search*: it keeps the ~50 best
  lines open and in the end picks the one with the highest overall score.
- **Rhythm**: first it builds a grid (from the melody's notes for 1:1, 2:1, 4:1
  and suspensions; from the beats of the bar for free and florid, denser where
  the melody holds and sparser where it moves). The search can then hold a note
  (tie), which becomes a long note or a suspension, or rest when there is no
  room.
- **Harmony**: it estimates the chord of each beat from all the sounding notes
  (inner voices of the accompaniment included), preferring the root in the
  bass; it rewards notes that complete the chord (above all the missing third).
  It also recognises chords outside the key; altered notes heard in the last
  bar become available to the counterpoint and the same natural note is
  discouraged (no cross-relations).
- **Vertical rules**: no parallel fifths and octaves, nor by contrary motion
  (discarded, and checked again at the end); hidden fifths and octaves
  penalised above all between outer voices; no crossings; avoids unisons and
  seconds with inner voices; leading note not doubled; no cross-relations.
- **Dissonances**: allowed only as passing or neighbour notes on weak beats
  (approached and left by step), as a prepared suspension resolving down by
  step, or as a dominant seventh resolving down; appoggiaturas only in free
  style. In 4:1, florid and free also in the third-species figures:
  **cambiata** (the dissonance steps down, leaps a third in the same direction
  and steps back up; in strict style only downwards) and **double neighbour**
  (the two neighbours of a note, one reached from the other by a third, then
  the return to the note). In the species built on the melody's grid (2:1,
  4:1, suspensions) the subdivisions of a cantus firmus note count as weak
  beats even when they fall on a beat of the bar. In two voices, with the
  counterpoint above the cantus firmus, the fourth and the tritone are
  dissonances.
- **Melodic line**: preference for steps; large leaps recovered by contrary
  motion; augmented second, tritone, sevenths and leaps beyond the octave
  forbidden; leading note rising to the tonic; melodic minor scale (6th and 7th
  degrees raised going up); no **outlined** tritones or sevenths (F–G–A–B: the
  point where the line changes direction must not form those intervals with
  the start of the run); a single climax, planned in a phrase around 60% of the
  piece (the top of the register is reserved for that phrase); a brake on
  figures repeated bar after bar.
- **Beginning and end** (species exercises): with strict rules the
  counterpoint begins on a perfect consonance (octave, fifth or unison; below
  the cantus firmus only octave or unison), and in every species it ends with
  one long note under the melody's last note. Florid mixes quarter notes,
  eighth-note pairs and longer held notes.
- **Phrases and cadences**: it finds the phrase endings (long notes on strong
  beats, notes followed by rests) and asks there for chord notes reached by
  step; the final falls on a note of the tonic chord (on the tonic if the
  counterpoint is the bass). In two voices, if the melody reaches the final by
  step, the counterpoint prefers the classic clausula: major sixth opening to
  the octave (counterpoint above) or minor third closing to the unison
  (counterpoint below), in contrary motion.
- **Imitative entry** (optional): an initial rest, then the rhythm of the
  melody's opening and its intervals, with a reward for each interval
  imitated. The harmonic rules stay stronger: where the harmony does not allow
  it the imitation is partial, and the window says how many intervals were
  imitated.
- **Kept notes**: for «Regenerate the rest» each kept note becomes an event of
  its own with a single possible candidate; the rules count in the score but
  never exclude it, so the rest of the line adapts to it.
- **Check**: every variant is read back with the analysis (`analyze()`, the
  same rules as the «Analyze voice» button): errors and warnings appear in the
  list of variants and decide their order after parallels.
- **Quality of a variant**: the final score of the search divided by the
  number of events, *without* the noise added by Variety; it can therefore be
  compared across seeds.
- **Motion**: rewards contrary motion against melody and bass, penalises three
  voices moving the same way at once and long chains of parallel thirds and
  sixths.
- **Language**: the engine contains no user-facing text. Findings, errors,
  keys and parallels come out as codes and data (notes as *tpc*), and the
  interface translates them with the files in `i18n/`.

## Testing without MuseScore

```bash
node tests/run_tests.js [seed] [species] [lang]   # synthetic cases: no parallels, untreated dissonances,
                                                  # crossings; analysis, kept notes, entry, figures
node tests/check_i18n.js                          # translations: keys, placeholders, untranslated texts
python3 tests/musicxml_demo.py in.mxl out.mxl free,florid,2:1,sus,1:1
python3 tests/musicxml_demo.py in.mxl out.mxl free --seed 6304 --variants 5   # 5 variants in order of quality
python3 tests/mock/run_mock.py                    # runs the QML plugin with a fake MuseScore (needs PySide6):
                                                  # variants, choice, regenerate the rest, analysis, settings,
                                                  # language switch with no missing keys
```

`musicxml_demo.py` reads a MusicXML file as the plugin would, calls the engine
and writes a score with one counterpoint part per requested species, to open
and listen to in MuseScore (`--lang it` for Italian messages).
`tools/wiki_examples.py` regenerates the Wiki's music examples with the engine.

## Known limitations

- Tested with a fake MuseScore environment (Qt 6) and on MusicXML scores, not
  yet inside MuseScore 4: some parts of the API change between 4.x versions
  (reading the time signature, the `tie` command). If the ties are not created
  the plugin says so, and the notes stay repeated instead of tied.
- One counterpoint voice at a time.
- Triplets and other tuplets in the melody are read, but the counterpoint uses
  only binary and dotted values.
- In 1:1, where the rhythm leaves no alternative, the climax may be reached
  two or three times, always in the central phrase.
- The imitative entry works when the melody starts with at least three notes in
  one bar (or two); with a bass already written the harmony often allows only
  part of the intervals to be imitated.
- «Regenerate the rest» uses the selected notes if the plugin can read the
  selection (`curScore.selection.elements`, which differs between 4.x
  versions); otherwise it uses the notes changed by hand since the last
  variant was written.
- The analysis colours notes red and orange and, at the next analysis, turns
  back to black only the notes with those two colours.
- Where melody and accompaniment are very close (for example an arpeggio
  shared between the hands) the counterpoint may rest briefly to avoid
  parallel fifths or octaves.
- Where the melody leaves the voice's register, the voice crosses to the other
  side of the melody (voice exchange) for those bars; with the position "above
  the melody" and no instrument, with some seeds the climax may not fall in the
  central phrase (the ranking of the variants shows it).

## Documentation and languages

| Where | English | Italian |
|---|---|---|
| Interface | `plugin/Contrappunto/i18n/en.js` (reference) | `i18n/it.js` |
| README | README.md | [README.it.md](README.it.md) |
| Release notes | [CHANGELOG.md](CHANGELOG.md) | [CHANGELOG.it.md](CHANGELOG.it.md) |
| In the zip | README.TXT (`release/readme/en.txt`) | LEGGIMI.TXT (`release/readme/it.txt`) |
| Wiki | `docs/wiki/*.md` (English pages) | `docs/wiki/*.md` (Italian pages) |
| How to translate | [TRANSLATING.md](TRANSLATING.md) | [TRANSLATING.it.md](TRANSLATING.it.md) |

The Wiki's sources are in `docs/wiki/`: they are edited with a pull request
like everything else, and the `.github/workflows/wiki.yml` workflow publishes
them to the [GitHub Wiki](https://github.com/emanuelemerlo/counterpoint/wiki)
on every push to `main`.

## Release

The `.github/workflows/release.yml` workflow tests the engine, the
translations and the QML plugin (with a fake MuseScore) on every push and pull
request, and prepares the package among the run's *artifacts*. To publish a
version:

1. update `version:` in `plugin/Contrappunto/contrappunto.qml`;
2. add the `## X.Y.Z` section with the release notes to `CHANGELOG.md`
   (English) and `CHANGELOG.it.md` (Italian);
3. create and push the tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
   (or *Actions → Release → Run workflow* with the version).

The release contains `Contrappunto-X.Y.Z.zip` (folder `contrappunto/`, lower
case, with the plugin, `i18n/`, `README.TXT` and `LEGGIMI.TXT`) and the two
instruction files separately as well; the release notes are in English with the
Italian part in a collapsible section. The release languages are listed in
`release/readme/languages.json`; to try it locally:
`python3 tools/build_release.py` (writes to `dist/`).
