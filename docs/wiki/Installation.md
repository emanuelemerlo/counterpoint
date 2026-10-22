**English** · [Italiano](Installazione)

# Installation

Contrappunto works with **MuseScore 4** (MuseScore Studio 4.x).

## Install

1. Download `Contrappunto-X.Y.Z.zip` from the
   [releases page](https://github.com/emanuelemerlo/counterpoint/releases).
2. Unzip it: it contains a folder called `contrappunto` (lower case).
3. Copy the **whole** `contrappunto` folder into MuseScore's plugin folder:

   | System | Folder |
   |---|---|
   | Windows | `Documents\MuseScore4\Plugins\` |
   | macOS | `~/Documents/MuseScore4/Plugins/` |
   | Linux | `~/Documents/MuseScore4/Plugins/` |

   The exact folder is shown in MuseScore under
   **Preferences → Folders → Plugins**.
4. Start (or restart) MuseScore, open **Plugins → Manage plugins** and enable
   **Contrappunto**.
5. The plugin is now in the menu **Plugins → Composing/arranging tools →
   Contrappunto**.

The folder must contain:

```
contrappunto/
├── contrappunto.qml          interface and connection to the score
├── contrappunto_engine.js    musical engine
├── i18n/                     interface texts, one file per language
├── README.TXT                instructions in English
└── LEGGIMI.TXT               instructions in Italian
```

## Update

1. **Delete the old folder first** – even if it is called `Contrappunto` with
   a capital C, as in versions up to 2.6. On Linux (and on some macOS disks)
   `Contrappunto` and `contrappunto` are two different folders, and the plugin
   would appear twice.
2. Copy the new `contrappunto` folder as above.
3. **Restart MuseScore**: while it stays open it keeps using the version loaded
   at start-up. The version in use is shown next to the title in the plugin's
   window.
4. Up to version 2.6 the plugin was called «Contrappunto automatico»: after
   updating, check in **Plugins → Manage plugins** that **Contrappunto** is
   enabled.

Your settings (species, options, language...) are kept.

## Language

The window follows MuseScore's interface language (English if there is no
translation for it). You can choose another one in the window, top right,
under **Language**.

## Problems?

See [Troubleshooting](Troubleshooting).
