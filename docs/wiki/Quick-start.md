**English** · [Italiano](Primi-passi)

# Quick start

Your first counterpoint in two minutes. You need a score with a melody – for
example a simple song on one staff, with or without a bass on a second staff.

![The plugin's window](images/dialog-en.png)

## 1. Choose the bars (optional)

Select a range of bars in the score if you want the counterpoint only there.
Without a selection the plugin works on the whole score. It always works on
whole bars.

## 2. Open the plugin

**Plugins → Composing/arranging tools → Contrappunto.** The header shows the
range it will work on ("Whole score (bars 1–8)"). If you change the selection
while the window is open, press **Use current selection**.

## 3. Sources: where are melody and bass?

- **Melody (cantus firmus)**: the staff with the melody.
- **Bass**: the staff with the bass, or **— none —** if you only have the
  melody.

Melody and bass can be on the same staff (a piano right hand, for instance):
the plugin takes the highest note as the melody and the lowest as the bass.

## 4. Destination: where does the new voice go?

- **New staff** adds a staff at the bottom of the score with the instrument
  you choose. The counterpoint stays within that instrument's range.
- **Existing staff** + voice writes into a voice of a staff you already have,
  for example voice 2 of the piano's left hand (see
  [Writing into an existing staff](Writing-into-an-existing-staff)).

## 5. Style

Leave **Free (complementary rhythm)** and **Automatic** everywhere for a first
try. For a classroom exercise on a cantus firmus in long notes choose a species
(1:1, 2:1, 4:1, suspensions, florid). [Choosing a species and
style](Choosing-a-species-and-style) explains each option.

## 6. Generate

Press **Generate**. The counterpoint appears in the score and the box at the
bottom right describes it: key, position of the voice, steps and leaps,
contrary motion, and the result of the automatic check ("0 errors, 0
warnings").

Don't like it? Everything is a single operation: **Ctrl+Z** removes it. Or:

- press **New seed** and **Generate** again for a different solution in the
  same place;
- set **How many** to 5 and compare five solutions ([Comparing
  variants](Comparing-variants));
- keep the notes you like and let the plugin rewrite the others ([Keeping
  notes and regenerating](Keeping-notes-and-regenerating)).

## Next

- Wrote a counterpoint yourself? Check it with **Analyze voice**:
  [Checking an exercise](Checking-an-exercise).
- All the options: [Options reference](Options-reference).
