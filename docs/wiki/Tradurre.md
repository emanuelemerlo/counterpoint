[English](Translating) · **Italiano**

# Tradurre

Contrappunto è in inglese e in italiano, e si può aggiungere qualunque lingua
senza strumenti di compilazione: ogni lingua è un file JavaScript con i testi
dell'interfaccia.

La guida completa è nel repository:
**[TRANSLATING.it.md](https://github.com/emanuelemerlo/counterpoint/blob/main/TRANSLATING.it.md)**.
In breve:

1. Copia `plugin/Contrappunto/i18n/en.js` in `i18n/xx.js` (il codice della tua
   lingua) e traduci i valori, lasciando i `{segnaposto}`.
2. Registrala in `i18n/i18n.js` (due righe).
3. Esegui `node tests/check_i18n.js`: segnala chiavi e segnaposto mancanti.
4. Se vuoi, traduci anche le istruzioni della release (`release/readme/`), le
   note di rilascio (`CHANGELOG.xx.md`) e queste pagine della Wiki
   (`docs/wiki/`, un file per pagina con il nome nella tua lingua, più una
   colonna in `_Sidebar.md` e una riga in `Home.md`).
5. Apri una pull request.

Gli esempi musicali di queste pagine non contengono testo e valgono per tutte
le lingue; le schermate della finestra si fanno per ogni lingua con
`python3 tests/mock/screenshot.py xx variants docs/wiki/images/dialog-xx.png`.

Per i termini musicali, il [Glossario](Glossario) affianca le parole italiane e
inglesi.
