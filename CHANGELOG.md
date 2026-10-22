# Release notes

**English** · [Italiano](CHANGELOG.it.md)

Each `## X.Y.Z` section becomes the English part of the release notes with the
same number (tag `vX.Y.Z`) and the first part of the README.TXT file in the zip.
The number must match `version:` in `plugin/Contrappunto/contrappunto.qml`; the
same section must also exist in `CHANGELOG.it.md` (Italian).

## 2.7.0

### New
- The plugin is now called **Contrappunto** (no longer «Contrappunto
  automatico»), with the tagline «Writes, compares and checks counterpoint».
- **Interface in English and Italian.** It follows MuseScore's language; you
  can also choose it in the window («Language») and the choice is remembered.
  Each language is one file in the `i18n/` folder: adding one needs no build
  tools (see `TRANSLATING.md`).
- Note names follow the language (C D E / Do Re Mi), with ♯ and ♭.
- **Documentation in English and Italian:** README, release notes, README.TXT
  and LEGGIMI.TXT in the zip, and a **Wiki** with how-to guides and an
  introduction to counterpoint for people who have never studied it.

### Musical improvements
- Species counterpoint follows the textbook rules at the edges of the
  exercise: with strict rules it **begins on a perfect consonance** (octave,
  fifth or unison; below the cantus firmus only octave or unison) and in every
  species it **ends with one long note** under the melody's last note. Before,
  in 2:1 and 4:1 the last bar was split into halves or quarters and could end
  on the fifth or the third, and 1:1 could begin on a sixth.
- **Florid** counterpoint (5th species) mixes its values: over a cantus firmus
  in long notes it was almost only eighth notes.
- On the test cases (6 pieces, 6 species, 6 seeds) outlined tritones and
  sevenths drop from 52 to 37 and lines with more than one climax from 29 to
  25; in florid and 1:1 there are more «leap not recovered» warnings.

### Improvements
- Analysis messages, key names and the list of parallels are written in the
  chosen language; switching language also translates the message on screen.
- Automatic translation check in the test suite: no missing key or
  placeholder, no text left out of the translation.

### Fixes
- If the automatic check of a variant could not run, the variant was shown
  with «0 errors, 0 warnings»: the window now says that the check failed.
- The plugin test with the fake MuseScore printed «RESULT OK» even after a
  failed check: it now fails as it should.

### Package
- The zip also contains the `contrappunto/i18n/` folder: copy the whole
  `contrappunto` folder, not just the two files.

### Note
- The plugin's name has changed: after updating, check under
  *Plugins → Manage plugins* that «Contrappunto» is enabled.
- With the same settings and seed the result differs from 2.6.0 (beginning,
  ending and florid rhythm).

## 2.6.0

### New
- **Analyze voice**: checks a voice that is already written (by hand or by the
  plugin) against melody and bass with the engine's rules and colours the
  notes: red for errors (parallel fifths and octaves, unprepared or unresolved
  dissonances, suspensions that do not resolve down, forbidden leaps, voice
  crossings), orange for warnings (hidden fifths and octaves, outlined
  tritones and sevenths, unrecovered leaps, leading note, cross-relations,
  repeated climax, final note). The list with bar numbers appears in the
  window; Ctrl+Z removes the colours.
- **Regenerate the rest**: keeps the selected notes of the destination voice,
  or the ones edited by hand since the variant was written, and recomputes all
  the others around them.
- **Imitative entry** (free and florid): the counterpoint waits while the
  melody states its opening, then imitates it at the octave, fifth or fourth.
  The window shows how many intervals were imitated.
- Cambiata and double neighbour in 4:1, florid and free.
- The plugin remembers its settings from one session to the next.
- Every variant is checked with the analysis: errors and warnings appear in
  the list and, with equal parallels, variants with fewer errors come first.

### Musical improvements
- No more tritones or sevenths outlined by runs in one direction: on the test
  cases (6 pieces, 6 species, 6 seeds) they drop from 233 to 52.
- Two-voice final cadence: major sixth → octave (counterpoint above) or minor
  third → unison (below), in contrary motion.
- In the species built on the melody's grid (2:1, 4:1, suspensions) the
  subdivisions of a cantus firmus note count as weak beats even when they fall
  on a beat of the bar: in 4:1 over whole notes, passing notes on beats 2, 3
  and 4 are no longer treated as appoggiaturas.

### Fixes
- In two voices, with the counterpoint above the cantus firmus, the fourth and
  the tritone with the cantus firmus are dissonances (the engine used to treat
  them as consonant, as between two upper voices).

### Package
- In the release the plugin folder is called `contrappunto`, in lower case.
  When updating, first delete the old `Contrappunto` folder.

### Note
- With the same settings and seed the result differs from 2.5.0, and the
  scores cannot be compared.

## 2.5.0

### Fixes
- The counterpoint takes the altered notes of the melody and bass into
  account. The harmonic analysis used to know only the chords of the key, and
  the counterpoint could only use scale notes: in a G minor passage inside a
  piece in A minor (G–B♭–D) the flute held an E, a tritone from the B♭ and a
  second from the D. Now:
  - the analysis also recognises chords outside the key (borrowed chords,
    secondary dominants, Neapolitan) when the sounding notes point to them;
  - altered notes heard in the last bar, in any voice, become available to the
    counterpoint (with the same spelling) and the same natural note is
    discouraged, like an accidental that lasts for the bar;
  - the tritone between upper voices counts as a dissonance, except when both
    notes belong to the chord (dominant seventh, diminished chord).
- On the flute test piece, dissonances on the beat against altered notes drop
  from 52 to 13 (over 5 seeds), with no cross-relations and no parallels.

## 2.4.0

### Fixes
- No more bars of rest when the melody is playing but leaves the
  counterpoint's register. When the melody rose (or fell) so far that there
  was no room, the voice used to fall silent. Now in those bars it crosses to
  the other side of the melody (voice exchange), within the instrument's range,
  and returns to its place as soon as there is room. On the flute test piece,
  rests below the melody drop from 19% to 2% of the piece, with no parallels.

### Improvements
- The climax is placed in the phrase of the central part where the voice can
  really rise highest, taking the voice exchange into account. Lines that do
  not reach it move down the ranking.
- The window shows in how many bars the voice changed side.

## 2.3.0

### New
- A single climax in long pieces too: the engine reserves the top of the
  register for a phrase around 60% of the piece. The other phrases have lower
  local peaks. On the test piece (71 bars) climaxes go from 3–6, almost always
  in the first quarter, to a single one at 55–60% in free style and 2:1.
- With «How many» above 1, «One variant per new staff» switches on by itself
  (it can still be switched off).
- The list of variants shows where the climax falls (as % of the piece).
- With one variant per staff too, the window shows the instrument range used
  and any change of role of the voice.

### Note
- The score now includes the climax rule: values cannot be compared with
  earlier versions.

## 2.2.1

### Improvements
- The version number is shown in the window header, to check which version
  MuseScore is using.
- Instructions: after updating the plugin, restart MuseScore, which otherwise
  keeps using the version loaded at start-up.

## 2.2.0

### New
- The counterpoint respects the range of the instrument that plays it: the one
  chosen for the new staff or the one of the existing destination staff. No
  note leaves the range.
- If the planned register does not fit (for instance an inner voice given to
  the flute), the plugin first changes the voice's role, moving it above or
  below the melody, then, if needed, moves it by an octave. In both cases it
  recomputes the line with the rules of the new position instead of simply
  transposing the notes: when voices are inverted a fifth would become a
  fourth.
- The window shows the range used and any change of role or octave.

## 2.1.1

### Fixes
- When choosing another variant, or regenerating on the same staff, the notes
  of the previous variant stayed on the staff: invisible but audible, on top
  of the new one. The destination voice is now emptied before writing.
- After every write the plugin reads the staff back and warns if it does not
  match the chosen variant exactly.

## 2.1.0

### New
- Comparing variants: the «How many» field (1–8) computes as many variants
  with consecutive seeds and lists them in order of quality (first those
  without parallel fifths or octaves, then by rule score), with the
  percentage of stepwise motion, of contrary motion and the number of
  climaxes.
- The best variant is written straight away; clicking another variant in the
  list replaces it (undoable with Ctrl+Z) and copies its seed into the Seed
  field.
- «One variant per new staff» option: each variant on a staff of its own,
  with a label, to compare them by ear.
- Variants are computed one at a time, with a progress indicator: the window
  does not freeze.

### Improvements
- The window follows MuseScore's theme (light, dark, high contrast) or, if not
  available, the system's: no more white text on a light background.
- New two-column layout that fits on one screen, without scrolling.
- The quality score leaves out the noise added by «Variety», so it can be
  compared across seeds. With the same settings and seed the result is
  identical to version 2.0.0.

## 2.0.0

- First version of the plugin for MuseScore 4, rewritten from the Python
  script.
- Searches the whole line (beam search) instead of choosing note by note.
- Species: free, 1:1, 2:1, 4:1, suspensions, florid; position above, inner or
  as the bass; strict or free rules.
- No parallel fifths or octaves; dissonances only as passing or neighbour
  notes, prepared suspensions or dominant sevenths; a single climax.
- Writes to a new staff or to a voice of an existing staff, with ties and
  correct spelling of accidentals.
