# Tradurre Contrappunto

[English](TRANSLATING.md) · **Italiano**

Contrappunto è disponibile in inglese e in italiano. Per aggiungere una lingua
non servono strumenti di compilazione: i testi dell'interfaccia sono file
JavaScript semplici, i documenti sono file Markdown e di testo. Puoi tradurre
tutto insieme o una parte alla volta: per quello che manca il plugin usa
l'inglese.

## 1. L'interfaccia (la parte essenziale)

1. Copia `plugin/Contrappunto/i18n/en.js` in `plugin/Contrappunto/i18n/xx.js`,
   dove `xx` è il codice [ISO 639-1](https://it.wikipedia.org/wiki/ISO_639-1)
   della lingua (`de`, `fr`, `es`, ...).
2. Nel nuovo file imposta `code: "xx"` e `name` con il nome della lingua nella
   lingua stessa (`"Deutsch"`, `"Français"`), e traduci:
   - `notes`: i sette nomi delle note da Do a Si come li scrivono i musicisti
     in quella lingua (`["C", "D", "E", "F", "G", "A", "H"]` in tedesco, dove il
     Si♭ si scrive `B`: per nomi come questi aggiungi a `LANG` una funzione
     `noteName(letter, alt)` – letter 0–6 a partire da Do, alt −2…+2 – che
     restituisce il nome, per esempio `Cis`, `Es`, `B`);
   - tutti i **valori** in `strings`. Non cambiare le **chiavi** (il testo
     prima dei due punti).
3. Registra la lingua in `plugin/Contrappunto/i18n/i18n.js`: aggiungi
   `.import "xx.js" as Xx` accanto agli altri import e `Xx.LANG` in
   `LANGUAGES`.
4. Esegui il controllo: `node tests/check_i18n.js` (Node.js 22 o successivo).
   Ti segnala chiavi, segnaposto e forme plurali mancanti.
5. Provala in MuseScore: copia la cartella `plugin/Contrappunto` nella cartella
   dei plugin come `contrappunto`, riavvia MuseScore, apri il plugin e scegli
   la lingua in **Lingua** (oppure imposta MuseScore in quella lingua e lascia
   *Automatica*).

### Regole per i valori

- I **segnaposto** come `{n}`, `{voice}`, `{from}` li riempie il plugin:
  lasciali esattamente come sono (puoi spostarli nella frase).
- **Forme plurali**: alcuni valori sono oggetti, per esempio
  `{ one: "1 errore", other: "{n} errori" }`. Mantieni la stessa struttura. Se
  la lingua ha più forme (polacco, russo, arabo, ...), aggiungi a `LANG` una
  funzione `plural` che per un numero restituisce `"one"`, `"few"`, `"many"` o
  `"other"`, e aggiungi quelle forme agli oggetti.
- **Termini musicali**: usa le parole che uno studente di musica troverebbe in
  un manuale di contrappunto nella sua lingua (canto dato, ritardo, cambiata,
  ...). Il glossario della Wiki affianca i termini inglesi e italiani.
- Testi come `rule.parallel5` si leggono nell'elenco dell'analisi
  (`✖ batt. 12: quinte parallele con la melodia`): meglio brevi e precisi.

## 2. I file della release

1. Copia `release/readme/en.txt` in `release/readme/xx.txt` e traducilo.
   Lascia come sono i segnaposto `{VERSION}`, `{DATE}`, `{NOTES}`, `{HISTORY}`,
   `{REPO_URL}` e `{WIKI_URL}`.
2. Aggiungi una voce in `release/readme/languages.json` con il nome del file
   nello zip (per esempio `LISEZMOI.TXT`), il formato della data e la frase di
   installazione delle note di rilascio.
3. Facoltativo: un `CHANGELOG.xx.md` con le note di rilascio nella tua lingua.
   Se lì manca una versione, la release usa le note inglesi.

Controlla con `python3 tools/build_release.py` (scrive in `dist/`).

## 3. La Wiki e il README

- I sorgenti della Wiki sono in `docs/wiki/`. Ogni pagina esiste una volta per
  lingua, con un nome in quella lingua (`Quick-start.md`, `Primi-passi.md`).
  Traduci le pagine inglesi in file nuovi con il nome nella tua lingua e
  aggiungi una colonna in `_Sidebar.md` e una riga in `Home.md`.
- Gli esempi musicali (`docs/wiki/images/*.svg`) non contengono testo, quindi
  valgono per tutte le lingue; le schermate della finestra sono una per lingua
  (`dialog-xx.png`).
- Anche un `README.xx.md` è benvenuto; collegalo dalla riga delle lingue in
  cima a `README.md`.

## 4. Invia

Apri una pull request con i tuoi file. I test automatici eseguono il controllo
delle traduzioni; se hai un dubbio su un termine musicale, scrivilo nella pull
request e lo guardiamo insieme.
