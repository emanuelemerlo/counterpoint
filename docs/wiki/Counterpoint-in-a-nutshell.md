**English** · [Italiano](Il-contrappunto-in-breve)

# Counterpoint in a nutshell

You don't need to know counterpoint to use the plugin, but ten minutes with
this page will help you choose the options and understand what the analysis
tells you.

## Two melodies at once

**Counterpoint** is the art of writing two or more melodies that sound at the
same time. Each one must make sense on its own, and together they must sound
good. A round such as *Frère Jacques* is the simplest example; Bach's fugues
are among the most elaborate.

Counterpoint asks you to look at the music in two directions:

- **horizontally**: each voice is a good melody, mostly moving by step, with a
  few leaps that are "recovered", one high point, a clear ending;
- **vertically**: at every moment the two voices form an interval, and some
  intervals sound stable while others create tension that must go somewhere.

Contrappunto writes **one** new voice – a *counter-melody* – for the melody you
give it, and checks both directions.

## Consonant and dissonant intervals

An **interval** is the distance between two notes. Some sound stable
(**consonances**):

![Consonant intervals: unison, third, fifth, sixth, octave](images/intervals-consonant.svg)

*Unison, third, fifth, sixth, octave. Unison, fifth and octave are **perfect**
consonances, so open and stable that they are used to begin and end; thirds
and sixths are **imperfect** consonances, warmer and freely usable.*

Others sound tense (**dissonances**):

![Dissonant intervals: second, fourth, tritone, seventh, ninth](images/intervals-dissonant.svg)

*Second, fourth, tritone (augmented fourth), seventh, ninth. In two-voice
counterpoint the fourth counts as a dissonance against the lowest voice.*

Dissonances are not forbidden: they are what moves the music forward. But in
counterpoint every dissonance must be **prepared or approached by step and
resolved** – see [Dissonance, used well](#dissonance-used-well) below.

## Four kinds of motion

When both voices move, they can move in four ways:

![Contrary, similar, oblique and parallel motion](images/motion.svg)

1. **Contrary**: one goes up, the other down. The most independent.
2. **Similar**: both go the same way, by different intervals.
3. **Oblique**: one moves, the other holds its note.
4. **Parallel**: both move the same way keeping the same interval (here
   thirds).

A good counterpoint uses all four, with a preference for contrary motion,
which keeps the voices independent.

## Why parallel fifths and octaves are avoided

Two voices that move in parallel **fifths** or **octaves** blend so well that
for a moment they stop sounding like two voices and sound like one, thicker
voice. Since counterpoint is about independent voices, this is the most famous
rule of all:

![Parallel fifths (bar 1) and the same passage in contrary motion (bar 2)](images/parallel-fifths.svg)

*Bar 1, in red: C–G moves to D–A, two fifths in a row. Bar 2: the upper voice
moves down instead, and the fifth becomes a third.*

Parallel thirds and sixths are fine – in moderation. A related rule concerns
**hidden** (or direct) fifths and octaves: arriving on a fifth or octave by
similar motion, with a leap in the upper voice, between the outer voices.

## Dissonance, used well

These are the classic ways of using a dissonance, all of which the plugin
writes and recognises:

![Passing note, neighbour note, suspension, cambiata](images/figures.svg)

- **Bar 1 – passing note**: the D fills the gap between C and E by step, on a
  weak beat.
- **Bar 2 – neighbour note**: the F steps away from E and comes back.
- **Bars 3–4 – suspension**: the F is first a consonance (a third over D,
  the *preparation*), is held while the bass moves to C and becomes a fourth
  (the *dissonance*, on the strong beat), then resolves **down by step** to E,
  a third (the *resolution*). Suspensions are the 4th species.
- **Bar 5 – cambiata**: from the octave C the voice steps down to B (a
  seventh), leaps down a third to G and steps back up to A. It is the one
  traditional figure in which a dissonance is left by leap.

## The cantus firmus and the five species

In 1725 Johann Joseph Fux published *Gradus ad Parnassum*, the textbook that
taught counterpoint to Haydn, Mozart and Beethoven. His method starts from a
**cantus firmus** ("fixed song"), a simple melody in long notes, and adds a
voice with more and more rhythmic freedom – the five **species**.

This is Fux's own cantus firmus, here in D minor:

![The cantus firmus](images/cantus-firmus.svg)

Every example below was **written by the plugin** above this cantus firmus,
with strict rules, exactly as you see it.

**1st species – note against note (1:1).** One note for each note of the
cantus firmus, only consonances. It begins and ends on a perfect consonance
and reaches the final octave through the leading note (C♯–D).

![1st species](images/species-1-1.svg)

**2nd species – two notes against one (2:1).** The second half of each bar
may be a dissonance if it is a passing or neighbour note.

![2nd species](images/species-2-1.svg)

**3rd species – four notes against one (4:1).** More passing and neighbour
notes, and the figures of the third species such as the double neighbour.

![3rd species](images/species-4-1.svg)

**4th species – suspensions.** The voice is shifted by half a bar: each note
is tied over the bar line and, if it becomes a dissonance, resolves down by
step.

![4th species](images/species-sus.svg)

**5th species – florid counterpoint.** A mixture of the previous ones, with
varied rhythms. It is the closest to real music.

![5th species](images/species-florid.svg)

All of them begin on a perfect consonance, end on the octave and keep a single
**climax** – one highest note, somewhere past the middle of the phrase.

## Beyond the exercises

Real pieces are not whole notes. For a melody with its own rhythm – a song, a
theme, a piano piece – choose the **Free** species: the plugin writes a
counter-melody with a rhythm that *complements* the melody (moving when the
melody holds, holding when it moves), follows the harmony implied by melody
and bass, and can **imitate** the melody: echo its motif in the rests, or enter
after it repeating its opening.

![Imitative entry: the lower voice imitates the opening of Ode to Joy a fifth below](images/imitative-entry.svg)

*Imitative entry: the lower voice waits for a bar, then repeats the opening of
the melody a fifth below (E E F G → B B C D: the repeated note becomes one long
note).*

## Where to go next

- [Quick start](Quick-start): your first counterpoint in two minutes.
- [Choosing a species and style](Choosing-a-species-and-style): which options
  to use for an exercise, a song or a piano piece.
- [Analysis rules](Analysis-rules): every rule the plugin checks, with what to
  do about it.
- [Glossary](Glossary): the terms on this page, in English and Italian.

**Further reading**: J. J. Fux, *The Study of Counterpoint* (the English
translation of *Gradus ad Parnassum*, by A. Mann); K. Jeppesen,
*Counterpoint*; P. Schubert, *Modal Counterpoint, Renaissance Style*.
