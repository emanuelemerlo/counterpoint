**English** · [Italiano](Confrontare-le-varianti)

# Comparing variants

There is never a single correct counterpoint. The plugin can compute several
solutions and rank them, so you can choose by ear.

## Seed and Variety

Each solution is identified by its **seed**, a number. With the same settings
and the same seed you always get exactly the same counterpoint: write down the
seeds you like.

**Variety** (0–10) decides how far the solutions may stray from the "most
correct" one. With 0 every seed gives the same result; with 3 (the default)
solutions differ in details; with 8–10 they differ a lot, sometimes at the cost
of a warning or two.

## Several variants in the same place

1. Set **How many** to a number from 2 to 8. Next to it you see the seeds that
   will be used ("seeds 4326–4330").
2. Switch off **One variant per new staff**.
3. Press **Generate N variants**.

![Five variants, ranked](images/dialog-en.png)

The list on the left shows the variants **from the best**:

- **first** those without parallel fifths or octaves,
- **then** those with fewer errors found by the automatic check,
- **then** those with the higher rule score.

That is why, in the picture, variant 5 comes last even though its score is the
highest: it has one error. Each line also shows the percentage of stepwise
motion and of contrary motion, where the climax falls and whether there are
parallels; red means errors.

The best one is already written in the score. **Click** another variant to
replace it and hear it; its seed goes into the **Seed** field. Every
replacement can be undone with Ctrl+Z.

## One variant per staff

With **One variant per new staff** switched on (it switches on by itself when
How many is above 1), each variant goes to a new staff labelled «Variant N –
seed S». Play the score, listen to them one at a time (mute the others in the
Mixer), keep the one you like and delete the other staves – or undo everything
with Ctrl+Z.

## Tips

- Identical variants are counted once: if the plugin says "1 variant was
  identical to another", raise Variety.
- The score depends on the settings: compare variants computed with the same
  settings only.
- Found one you almost like? [Keep the good notes and regenerate the
  rest](Keeping-notes-and-regenerating).
