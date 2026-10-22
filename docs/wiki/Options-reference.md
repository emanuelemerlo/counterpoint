**English** · [Italiano](Opzioni)

# Options reference

Every control of the window, from top to bottom. The choices are remembered
from one session to the next.

## Header

| Control | What it does |
|---|---|
| Range ("Whole score (bars 1–8)") | The bars the plugin works on: the selection when you opened it, or the whole score. Always whole bars. |
| **Use current selection** | Reads the selection again, if you changed it with the window open. |
| **Language** | *Automatic* uses MuseScore's interface language (English if it is not available); or choose one. Switching also translates the message on screen. |

## Sources

| Control | What it does |
|---|---|
| **Melody (cantus firmus)** | The staff with the melody. With several notes at once, the highest is the melody. |
| **Bass** | The staff with the bass, or **— none —**. With several notes at once, the lowest is the bass. Other notes of the accompaniment are taken into account as inner voices. |

## Destination

| Control | What it does |
|---|---|
| **New staff** + instrument | Adds a staff at the bottom with that instrument. The counterpoint stays within its range: Violin G3–E6, Flute C4–A6, Oboe B♭3–D6, Viola C3–A5, Cello C2–C5, Bassoon B♭1–B♭4, voices Soprano C4–A5, Alto F3–D5, Tenor C3–A4, Bass E2–D4, Piano A0–C8. |
| **Existing staff** + voice | Writes into that voice of that staff, within the staff's instrument range. Voice 1 of the melody's or bass's staff is not allowed. Also the voice used by **Analyze voice** and **Regenerate the rest**. |

## Variants

| Control | What it does |
|---|---|
| **Variety** (0–10) | How far the result may stray from the most correct solution. 0 = always the same. |
| **Seed** / **New seed** | Identifies a solution: same settings + same seed = same counterpoint. |
| **How many** (1–8) | Computes several variants with consecutive seeds and ranks them (see [Comparing variants](Comparing-variants)). |
| **One variant per new staff** | Each variant on a staff of its own, with a label. |

## Style

| Control | Values |
|---|---|
| **Species / rhythm** | Free (complementary rhythm), 1:1, 2:1, 4:1, Suspensions (4th species), Florid (5th species). See [Choosing a species and style](Choosing-a-species-and-style). |
| **Position** | Automatic; Above the melody; Below the melody, above the bass; Below the melody, as the bass. |
| **Register** | Automatic, Soprano (C4–A5), Alto (F3–D5), Tenor (C3–A4), Bass (E2–D4). |
| **Rules** | Strict (academic) or Free (appoggiaturas, sevenths, hidden fifths tolerated). Also used by the analysis. |
| **Mode** | Automatic, Major, Minor. |
| **Meter** | Automatic, Simple (2/4, 3/4, 4/4…), Compound (6/8, 9/8, 12/8…). |
| **Imitate the melody's motif in its rests** | In the melody's rests the counterpoint echoes its last motif. |
| **Imitative entry (free and florid)** | The counterpoint waits while the melody states its opening, then imitates it. |
| **Tie held notes** | Joins held notes with ties (needed for suspensions). |

## Buttons

| Button | What it does |
|---|---|
| **Analyze voice** | Checks the destination voice with the rules: errors red, warnings orange. See [Checking an exercise](Checking-an-exercise). |
| **Regenerate the rest** | Keeps the selected or hand-edited notes of the destination voice and rewrites the others. See [Keeping notes and regenerating](Keeping-notes-and-regenerating). |
| **Generate** / **Generate N variants** | Writes the counterpoint. A single operation: Ctrl+Z undoes it. |
| **Close** | Closes the window (the settings are saved). |

## The message box

After each generation it describes the result: seed, number of notes, key,
position of the voice, steps and leaps, contrary and similar motion,
parallels, the automatic check (errors, warnings, figures such as suspensions
and cambiatas), the imitative entry, the kept notes, the instrument range, and
any change of side or octave of the voice.
