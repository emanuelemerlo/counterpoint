# Contrappunto automatico per MuseScore 4

Plugin che genera una contro-melodia in contrappunto a partire da una melodia
(canto dato) e, se presente, da un basso, e la scrive in un **nuovo rigo** oppure
in una **voce di un rigo esistente** (per esempio la voce 2 della mano sinistra
del pianoforte).

## Installazione

1. Copia la cartella `plugin/Contrappunto` in `Documenti/MuseScore4/Plugins/`
   (oppure scarica lo zip dalla pagina delle release ed estrailo lì).
2. In MuseScore: **Plugin → Gestisci plugin**, attiva *Contrappunto automatico*.
3. Il plugin compare nel menu **Plugin → Composizione/arrangiamento**.
4. Dopo un aggiornamento **riavvia MuseScore**: finché resta aperto usa la
   versione caricata all'avvio. La versione in uso è indicata accanto al
   titolo della finestra del plugin.

La cartella deve contenere entrambi i file: `contrappunto.qml` (interfaccia e
collegamento con lo spartito) e `contrappunto_engine.js` (motore musicale).

## Uso

1. (Facoltativo) seleziona un intervallo di battute; senza selezione il plugin
   lavora su tutto lo spartito. Lavora sempre su battute intere.
2. Avvia il plugin, scegli il rigo della **melodia** e quello del **basso**
   (oppure "nessuno" se hai solo il canto dato). Melodia e basso possono stare
   nello stesso rigo: il plugin prende la nota più acuta come melodia e la più
   grave come basso.
3. Scegli la destinazione: nuovo rigo (con lo strumento) o rigo esistente + voce.
4. Imposta lo stile e premi **Genera**. Ogni generazione è un'unica operazione
   annullabile con Ctrl+Z (le legature di valore sono un secondo passo).
5. Dopo la prima generazione in un nuovo rigo, quel rigo diventa la destinazione:
   cambia il **seme** e premi di nuovo Genera per ottenere varianti al posto della
   precedente.
6. Per confrontare più soluzioni imposta **Quante** (fino a 8): il plugin calcola
   le varianti con semi consecutivi e le ordina per qualità (prima quelle senza
   parallele, poi il punteggio delle regole). La migliore viene scritta nella
   destinazione; clic su un'altra variante dell'elenco per sostituirla (ogni
   sostituzione è annullabile con Ctrl+Z e il suo seme passa nel campo Seme).
   Con **Una variante per rigo nuovo** ogni variante finisce in un rigo a sé,
   con un'etichetta, per ascoltarle a confronto.

La finestra usa i colori del tema di MuseScore (chiaro, scuro, alto contrasto) e,
se non sono disponibili, quelli del sistema.

### Opzioni

| Opzione | Valori |
|---|---|
| Specie / ritmo | Libero (ritmo complementare alla melodia), 1:1, 2:1, 4:1, Ritardi (4ª specie), Fiorito (5ª specie) |
| Posizione | Automatica, sopra la melodia, voce intermedia (sotto la melodia, sopra il basso), come basso (solo senza basso) |
| Registro | Automatico, Soprano, Contralto, Tenore, Basso |
| Regole | Rigorose (accademiche) oppure libere (appoggiature, settime di dominante, dirette tollerate) |
| Modo / Metro | Automatici, oppure forzati (maggiore/minore, semplice/composto) |
| Imitazione | Nelle pause della melodia il contrappunto riprende il suo ultimo motivo |
| Varietà e seme | Quanto il risultato può discostarsi dalla soluzione "più corretta"; stesso seme = stesso risultato |
| Quante / una per rigo | Numero di varianti da calcolare e ordinare; facoltativamente una per rigo nuovo |

## Come funziona il motore

Lo script Python di partenza (in `legacy/`) sceglieva **una nota alla volta**
(scelta "golosa"): non poteva preparare un ritardo, risolvere una dissonanza o
evitare di chiudersi in un vicolo cieco. Il motore nuovo:

- **Cerca l'intera linea** con una *beam search*: tiene aperte le ~50 linee
  migliori e sceglie alla fine quella con il punteggio complessivo più alto.
- **Ritmo**: prima costruisce una griglia (dalle note della melodia per 1:1, 2:1,
  4:1 e ritardi; dai tempi della battuta per libero e fiorito, più fitta dove la
  melodia tiene e più rada dove si muove). La ricerca può poi tenere una nota
  (legatura), che diventa una nota lunga o un ritardo, oppure tacere quando non
  c'è spazio.
- **Armonia**: stima l'accordo di ogni tempo da tutte le note che suonano (anche
  le voci interne dell'accompagnamento), con preferenza per la fondamentale al
  basso; premia le note che completano l'accordo (soprattutto la terza mancante).
- **Regole verticali**: niente quinte e ottave parallele o per moto contrario (scartate,
  verificate a fine calcolo); dirette penalizzate soprattutto tra voci esterne;
  niente incroci; evita unisoni e seconde con le voci interne; sensibile non
  raddoppiata; niente false relazioni.
- **Dissonanze**: ammesse solo come nota di passaggio o di volta sui tempi deboli
  (entrata e uscita per grado), come ritardo preparato che scende di grado, o
  come settima di dominante che scende; appoggiature solo nello stile libero.
- **Linea melodica**: preferenza per i gradi congiunti; salti ampi recuperati
  per moto contrario; vietati seconda eccedente, tritono, settime e salti oltre
  l'ottava; sensibile che sale alla tonica; scala minore melodica (6° e 7° grado
  alzati in salita); un solo culmine possibilmente tra il 35% e l'85% del brano;
  freno alle ripetizioni di figure battuta dopo battuta.
- **Frasi e cadenze**: individua gli arrivi di frase (note lunghe su tempo forte,
  note seguite da pause) e richiede lì note dell'accordo raggiunte per grado; il
  finale cade su una nota dell'accordo di tonica (sulla tonica se il contrappunto
  fa da basso).
- **Qualità di una variante**: il punteggio finale della ricerca diviso per il
  numero di eventi, *senza* il rumore introdotto dalla Varietà; è quindi
  confrontabile tra semi diversi.
- **Moto**: premia il moto contrario rispetto a melodia e basso, penalizza i tre
  moti simili contemporanei e le lunghe catene di terze/seste parallele.

## Collaudo senza MuseScore

```bash
node tests/run_tests.js [seme]                    # casi sintetici, verifica assenza di parallele
python3 tests/musicxml_demo.py in.mxl out.mxl free,florid,2:1,sus,1:1
python3 tests/musicxml_demo.py in.mxl out.mxl free --seed 6304 --variants 5   # 5 varianti in ordine di qualità
python3 tests/mock/run_mock.py                    # esegue il plugin QML con un finto MuseScore (richiede PySide6)
```

`musicxml_demo.py` legge un MusicXML come farebbe il plugin, chiama il motore e
scrive uno spartito con una parte di contrappunto per ogni specie richiesta, da
aprire e ascoltare in MuseScore.

## Limiti noti

- Collaudato con un finto ambiente MuseScore (Qt 6) e su spartiti MusicXML, non
  ancora dentro MuseScore 4: alcune parti dell'API cambiano tra le versioni 4.x
  (lettura dell'indicazione di tempo, comando `tie`). Se le legature non vengono
  create il plugin lo segnala, e le note restano ripetute invece che legate.
- Una sola voce di contrappunto per volta.
- Le terzine e gli altri gruppi irregolari della melodia vengono letti, ma il
  contrappunto usa solo valori binari e puntati.
- Il punto culminante unico è garantito bene su brani brevi; su brani lunghi il
  motore tende a un culmine per sezione.
- Nei passaggi in cui melodia e accompagnamento sono molto vicini (per esempio
  un arpeggio condiviso tra le mani) il contrappunto può fare brevi pause per
  evitare quinte od ottave parallele.

## Release

Il workflow `.github/workflows/release.yml` collauda il motore e il plugin QML
(con un finto MuseScore) a ogni push e pull request, e prepara il pacchetto tra
gli *artifacts* dell'esecuzione. Per pubblicare una versione:

1. aggiorna `version:` in `plugin/Contrappunto/contrappunto.qml`;
2. aggiungi in `CHANGELOG.md` la sezione `## X.Y.Z` con le note di rilascio;
3. crea e invia il tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
   (oppure *Actions → Release → Run workflow* indicando la versione).

La release contiene `Contrappunto-X.Y.Z.zip` (cartella `Contrappunto/` con i
due file del plugin e `README.TXT`) e `README.TXT` a parte, con note di
rilascio, funzionalità, installazione e istruzioni d'uso. Il testo fisso del
README.TXT è in `release/README_TEMPLATE.txt`; per provarlo in locale:
`python3 tools/build_release.py` (scrive in `dist/`).
