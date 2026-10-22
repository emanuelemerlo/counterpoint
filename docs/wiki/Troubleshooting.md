**English** · [Italiano](Problemi-e-soluzioni)

# Troubleshooting

**The plugin is not in the Plugins menu.**
Check that the `contrappunto` folder is directly inside MuseScore's plugin
folder (not inside a second folder created when unzipping) and that it
contains `contrappunto.qml`, `contrappunto_engine.js` and `i18n/`. Then open
**Plugins → Manage plugins** and enable **Contrappunto**.

**After an update I still see the old version.**
Restart MuseScore: it keeps the version loaded at start-up. The version in use
is next to the title of the window.

**The plugin appears twice.**
An old `Contrappunto` folder (capital C) is still there next to the new
`contrappunto`. Delete the old one and restart.

**The window opens but the texts look like ⟦group.sources⟧.**
The `i18n/` folder is missing or incomplete: copy the whole `contrappunto`
folder again.

**The window is in the wrong language.**
Choose it under **Language**, top right. *Automatic* follows MuseScore's
interface language (Preferences → General → Language).

**"Voice 1 of the chosen staff contains the melody or the bass".**
You chose as destination the voice that holds the music the counterpoint is
written for. Choose voice 2, 3 or 4, or another staff.

**"The melody has no notes in the chosen range".**
The selected bars of the melody's staff are empty, or the wrong staff is chosen
as Melody. Check the Sources and press **Use current selection**.

**The notes are repeated instead of tied.**
Some MuseScore 4 versions don't let plugins create ties; the plugin says so in
the message. Tie them by hand (select and press `+`) or switch off **Tie held
notes**.

**The counterpoint rests in some bars.**
Where melody and accompaniment are very close, a short rest can be the only
way to avoid parallel fifths or octaves. Try another seed, another position or
a wider instrument.

**The counterpoint goes above the melody when I asked for below.**
In those bars there was no room below the melody within the range: the voice
crosses to the other side (voice exchange) and comes back as soon as it can.
The message says in how many bars.

**The imitative entry did not happen.**
It needs at least three notes at the start of the melody and a piece long
enough; the message says so. It is available only in Free and Florid.

**Regenerate the rest says there are no notes to keep.**
Edit or select the notes in the voice chosen under **Destination → Existing
staff**. If your MuseScore does not let plugins read the selection, edit the
notes by hand instead.

**The analysis colours stay after I fix a note.**
Press **Analyze voice** again (it removes its colours first) or Ctrl+Z. Notes
you coloured yourself in red or orange with exactly the plugin's colours are
reset too.

**Something else?**
Open an [issue](https://github.com/emanuelemerlo/counterpoint/issues) with
your MuseScore version, the plugin version and, if possible, the score.
