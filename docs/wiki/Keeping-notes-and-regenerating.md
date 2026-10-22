**English** · [Italiano](Mantenere-note-e-rigenerare)

# Keeping notes and regenerating

Often a variant is almost right: a beautiful opening, a cadence you like, one
bar that doesn't work. **Regenerate the rest** keeps the notes you choose and
rewrites everything else around them.

## How to

1. Generate a counterpoint (on a new staff or in an existing voice).
2. Mark the notes to keep, in one of two ways:
   - **edit them by hand** in the score: change a pitch, a rhythm, write your
     own phrase. The plugin compares the voice with the variant it wrote and
     keeps whatever you changed;
   - or **select them** with Ctrl+click.
3. Press **Regenerate the rest**.

The kept notes stay exactly as they are – pitch, spelling and duration – and
the rest of the line is recomputed with the same settings to fit them: the
notes before lead to them, the notes after continue from them. The description
says how many notes were kept.

Press it again as often as you like: notes kept the previous time stay kept
until you change them. Change the seed for a different solution around the
same notes.

## Good to know

- Kept notes may even break a rule – it's your choice. The plugin respects
  them and reports the problem in the automatic check, so you know.
- If the plugin says "No notes to keep", it found neither selected nor edited
  notes in the destination voice. Check that **Existing staff** and the
  **voice** under Destination are the ones with the counterpoint.
- With some versions of MuseScore plugins cannot read the selection: then only
  the notes edited by hand count.

## Also useful for

- **Starting from your own idea**: generate a counterpoint, replace its first
  bars with your own opening, then press Regenerate the rest: the plugin
  continues from your idea.
- **Fixing a cadence**: write the cadence you want over the last bars,
  regenerate the rest.
