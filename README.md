# Contrappunto automatico per MuseScore 4

Plugin che genera una contro-melodia in contrappunto a partire da una melodia
(canto dato) e, se presente, da un basso, e la scrive in un **nuovo rigo** oppure
in una **voce di un rigo esistente** (per esempio la voce 2 della mano sinistra
del pianoforte). Può anche **analizzare** una voce scritta a mano con le stesse
regole e **rigenerare** una variante mantenendo le note che hai scelto.

## Installazione

1. Scarica lo zip dalla pagina delle release ed estrai la cartella
   `contrappunto` in `Documenti/MuseScore4/Plugins/` (oppure copia lì la
   cartella `plugin/Contrappunto` del repository, rinominandola `contrappunto`).
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
   parallele, poi quelle con meno errori, poi il punteggio delle regole). La migliore viene scritta nella
   destinazione; clic su un'altra variante dell'elenco per sostituirla (ogni
   sostituzione è annullabile con Ctrl+Z e il suo seme passa nel campo Seme).
   Con **Una variante per rigo nuovo** ogni variante finisce in un rigo a sé,
   con un'etichetta, per ascoltarle a confronto. Accanto a ogni variante ci sono
   gli errori e gli avvisi trovati dall'analisi (vedi sotto).

### Analizzare una voce

**Analizza la voce** controlla la voce di destinazione (*Rigo esistente* + voce;
dopo una generazione in un nuovo rigo è quel rigo) rispetto a melodia e basso,
con le regole del motore: quinte e ottave parallele, dirette, dissonanze non
preparate o non risolte, ritardi che non scendono, salti non ammessi, salti non
recuperati, tritoni e settime delineati, incroci, sensibile raddoppiata o non
risolta, false relazioni, culmine ripetuto, finale. Le note con un errore
diventano rosse, quelle con un avviso arancioni, e l'elenco con i numeri di
battuta compare nella finestra. Una nuova analisi toglie prima i colori della
precedente; Ctrl+Z li toglie subito. Serve per controllare un esercizio scritto
a mano o per capire perché una variante ha degli avvisi.

### Rigenerare il resto

Se una variante ti piace solo in parte, cambia a mano le note che vuoi (oppure
selezionale con Ctrl+clic) nella voce di destinazione e premi **Rigenera il
resto**: le note selezionate, o in mancanza di selezione quelle cambiate rispetto
alla variante scritta dal plugin, restano com'erano (altezza, grafia e durata) e
tutto il resto viene ricalcolato intorno a loro, con le stesse impostazioni. Le
note mantenute possono anche violare una regola: il plugin le rispetta e lo
segnala nel controllo. Le note mantenute la volta precedente restano mantenute
finché non le cambi.

### Impostazioni ricordate

Specie, posizione, registro, regole, opzioni, varietà, numero di varianti,
strumento e destinazione vengono ricordati da una volta all'altra. Se la
versione di MuseScore non offre il modulo `Settings` di Qt, il plugin funziona
lo stesso, ripartendo ogni volta dai valori predefiniti.

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
| Entrata in imitazione | Solo libero e fiorito: il contrappunto tace mentre la melodia espone il suo inizio (una battuta, o due o mezza se serve), poi lo riprende all'ottava, alla quinta o alla quarta (nelle regole libere anche alla terza o alla sesta) |
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
  Riconosce anche gli accordi fuori tonalità; le note alterate sentite
  nell'ultima battuta diventano disponibili per il contrappunto e la stessa nota
  naturale è sconsigliata (niente false relazioni).
- **Regole verticali**: niente quinte e ottave parallele o per moto contrario (scartate,
  verificate a fine calcolo); dirette penalizzate soprattutto tra voci esterne;
  niente incroci; evita unisoni e seconde con le voci interne; sensibile non
  raddoppiata; niente false relazioni.
- **Dissonanze**: ammesse solo come nota di passaggio o di volta sui tempi deboli
  (entrata e uscita per grado), come ritardo preparato che scende di grado, o
  come settima di dominante che scende; appoggiature solo nello stile libero.
  Nel 4:1, nel fiorito e nel libero anche nelle figure della 3ª specie:
  **cambiata** (la dissonanza scende di grado, salta di terza nella stessa
  direzione e risale di grado; nel rigoroso solo in discesa) e **doppia volta**
  (le due note vicine di una nota, raggiunte una dall'altra per terza, poi il
  ritorno alla nota). Nelle specie con la griglia sulla melodia (2:1, 4:1,
  ritardi) le suddivisioni di una nota del canto dato contano come tempi deboli
  anche se cadono su un tempo della battuta. A due voci, con il contrappunto
  sopra il canto dato, la quarta e il tritono sono dissonanze.
- **Linea melodica**: preferenza per i gradi congiunti; salti ampi recuperati
  per moto contrario; vietati seconda eccedente, tritono, settime e salti oltre
  l'ottava; sensibile che sale alla tonica; scala minore melodica (6° e 7° grado
  alzati in salita); niente tritoni o settime **delineati** (Fa–Sol–La–Si: il
  punto in cui la linea cambia direzione non deve formare quegli intervalli con
  il punto di partenza del tratto); un solo culmine, pianificato in una frase
  intorno al 60% del brano (la zona più acuta del registro è riservata a quella
  frase); freno alle ripetizioni di figure battuta dopo battuta.
- **Frasi e cadenze**: individua gli arrivi di frase (note lunghe su tempo forte,
  note seguite da pause) e richiede lì note dell'accordo raggiunte per grado; il
  finale cade su una nota dell'accordo di tonica (sulla tonica se il contrappunto
  fa da basso). A due voci, se la melodia arriva al finale per grado, il
  contrappunto preferisce la clausola classica: sesta maggiore che si apre
  all'ottava (contrappunto sopra) o terza minore che si chiude all'unisono
  (contrappunto sotto), per moto contrario.
- **Entrata in imitazione** (facoltativa): una pausa iniziale, poi il ritmo
  dell'inizio della melodia e i suoi intervalli, con un premio per ogni
  intervallo ripreso. Le regole armoniche restano più forti: dove l'armonia non
  lo consente l'imitazione è parziale, e la finestra dice quanti intervalli sono
  stati ripresi.
- **Note mantenute**: per «Rigenera il resto» ogni nota mantenuta diventa un
  evento a sé, con un solo candidato possibile; le regole contano come punteggio
  ma non la escludono mai, così il resto della linea si adatta a lei.
- **Controllo**: ogni variante viene riletta con l'analisi (`analyze()`, le stesse
  regole del pulsante «Analizza la voce»): errori e avvisi compaiono
  nell'elenco delle varianti e ne decidono l'ordine dopo le parallele.
- **Qualità di una variante**: il punteggio finale della ricerca diviso per il
  numero di eventi, *senza* il rumore introdotto dalla Varietà; è quindi
  confrontabile tra semi diversi.
- **Moto**: premia il moto contrario rispetto a melodia e basso, penalizza i tre
  moti simili contemporanei e le lunghe catene di terze/seste parallele.

## Collaudo senza MuseScore

```bash
node tests/run_tests.js [seme]                    # casi sintetici: niente parallele, dissonanze non trattate,
                                                  # incroci; analisi, note mantenute, entrata, figure
python3 tests/musicxml_demo.py in.mxl out.mxl free,florid,2:1,sus,1:1
python3 tests/musicxml_demo.py in.mxl out.mxl free --seed 6304 --variants 5   # 5 varianti in ordine di qualità
python3 tests/mock/run_mock.py                    # esegue il plugin QML con un finto MuseScore (richiede PySide6):
                                                  # varianti, scelta, rigenera il resto, analisi, impostazioni
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
- Nella specie 1:1, dove il ritmo non lascia alternative, il culmine può essere
  toccato due o tre volte, sempre nella frase centrale.
- L'entrata in imitazione funziona quando la melodia comincia con almeno tre
  note in una battuta (o in due); con un basso già scritto l'armonia spesso
  consente di riprendere solo una parte degli intervalli.
- «Rigenera il resto» usa le note selezionate se il plugin riesce a leggere la
  selezione (`curScore.selection.elements`, diverso tra le versioni 4.x);
  altrimenti usa le note cambiate a mano rispetto all'ultima variante scritta.
- L'analisi colora le note con rosso e arancione e, all'analisi successiva,
  riporta al nero solo le note con quei due colori.
- Nei passaggi in cui melodia e accompagnamento sono molto vicini (per esempio
  un arpeggio condiviso tra le mani) il contrappunto può fare brevi pause per
  evitare quinte od ottave parallele.
- Dove la melodia esce dal registro della voce, la voce passa dall'altra parte
  della melodia (scambio delle parti) per quelle battute; con la posizione
  "sopra la melodia" senza strumento, in qualche seme il culmine può non cadere
  nella frase centrale (la classifica delle varianti lo mostra).

## Release

Il workflow `.github/workflows/release.yml` collauda il motore e il plugin QML
(con un finto MuseScore) a ogni push e pull request, e prepara il pacchetto tra
gli *artifacts* dell'esecuzione. Per pubblicare una versione:

1. aggiorna `version:` in `plugin/Contrappunto/contrappunto.qml`;
2. aggiungi in `CHANGELOG.md` la sezione `## X.Y.Z` con le note di rilascio;
3. crea e invia il tag: `git tag vX.Y.Z && git push origin vX.Y.Z`
   (oppure *Actions → Release → Run workflow* indicando la versione).

La release contiene `Contrappunto-X.Y.Z.zip` (cartella `contrappunto/`, in minuscolo, con i
due file del plugin e `README.TXT`) e `README.TXT` a parte, con note di
rilascio, funzionalità, installazione e istruzioni d'uso. Il testo fisso del
README.TXT è in `release/README_TEMPLATE.txt`; per provarlo in locale:
`python3 tools/build_release.py` (scrive in `dist/`).
