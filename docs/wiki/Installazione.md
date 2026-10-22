[English](Installation) · **Italiano**

# Installazione

Contrappunto funziona con **MuseScore 4** (MuseScore Studio 4.x).

## Installare

1. Scarica `Contrappunto-X.Y.Z.zip` dalla
   [pagina delle release](https://github.com/emanuelemerlo/counterpoint/releases).
2. Estrai lo zip: contiene una cartella chiamata `contrappunto` (in minuscolo).
3. Copia **l'intera** cartella `contrappunto` nella cartella dei plugin di
   MuseScore:

   | Sistema | Cartella |
   |---|---|
   | Windows | `Documenti\MuseScore4\Plugins\` |
   | macOS | `~/Documents/MuseScore4/Plugins/` |
   | Linux | `~/Documents/MuseScore4/Plugins/` |

   La cartella esatta è indicata in MuseScore in
   **Preferenze → Cartelle → Plugin**.
4. Avvia (o riavvia) MuseScore, apri **Plugin → Gestisci plugin** e attiva
   **Contrappunto**.
5. Il plugin si trova ora nel menu **Plugin → Composizione/arrangiamento →
   Contrappunto**.

La cartella deve contenere:

```
contrappunto/
├── contrappunto.qml          interfaccia e collegamento con lo spartito
├── contrappunto_engine.js    motore musicale
├── i18n/                     testi dell'interfaccia, un file per lingua
├── README.TXT                istruzioni in inglese
└── LEGGIMI.TXT               istruzioni in italiano
```

## Aggiornare

1. **Elimina prima la vecchia cartella**, anche se si chiama `Contrappunto` con
   la maiuscola, come fino alla versione 2.6. Su Linux (e su alcuni dischi
   macOS) `Contrappunto` e `contrappunto` sono due cartelle diverse, e il plugin
   comparirebbe due volte.
2. Copia la nuova cartella `contrappunto` come sopra.
3. **Riavvia MuseScore**: finché resta aperto continua a usare la versione
   caricata all'avvio. La versione in uso è indicata accanto al titolo nella
   finestra del plugin.
4. Fino alla versione 2.6 il plugin si chiamava «Contrappunto automatico»: dopo
   l'aggiornamento controlla in **Plugin → Gestisci plugin** che
   **Contrappunto** sia attivo.

Le impostazioni (specie, opzioni, lingua...) restano.

## Lingua

La finestra segue la lingua dell'interfaccia di MuseScore (inglese se non c'è
una traduzione per quella lingua). Puoi sceglierne un'altra nella finestra, in
alto a destra, in **Lingua**.

## Problemi?

Vedi [Problemi e soluzioni](Problemi-e-soluzioni).
