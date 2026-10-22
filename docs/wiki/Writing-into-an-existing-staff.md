**English** · [Italiano](Scrivere-in-un-rigo-esistente)

# Writing into an existing staff

Instead of a new staff, the counterpoint can go into a **voice** of a staff you
already have – typically voice 2 of the piano's left hand, or the empty staff
of an instrument you have already set up.

## How to

1. Under **Destination** choose **Existing staff**, then the staff and the
   **voice** (Voice 1 to 4).
2. Generate as usual.

MuseScore shows each voice in its own colour while you edit (voice 2 in green
by default) and the stems of the two voices point in opposite directions.

## Rules

- **Voice 1 of a staff that holds the melody or the bass is not allowed**: it
  would overwrite them. Choose voice 2, 3 or 4, or another staff.
- The destination voice is **emptied** in the chosen bars before writing, so
  nothing is left over from earlier attempts.
- The counterpoint stays within the range of the **instrument of that staff**.
  If the planned register does not fit (an inner voice given to a flute, say),
  the voice first changes position (above or below the melody), then octave,
  and the line is recomputed for its new position.

## Piano: melody and bass on the same staves

A typical piano piece has the melody in the right hand and the bass in the left
hand. Choose:

- **Melody**: the right-hand staff;
- **Bass**: the left-hand staff;
- **Destination**: Existing staff → left-hand staff → **Voice 2**;
- **Position**: Below the melody, above the bass.

If melody and bass are on the same staff, choose the same staff for both: the
plugin takes the highest note as the melody and the lowest as the bass.

## After a new staff

After the first generation on a **new** staff, that staff automatically becomes
the destination (Existing staff, voice 1): pressing Generate again replaces the
counterpoint instead of adding another staff.
