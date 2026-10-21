# Note di rilascio

Ogni sezione `## X.Y.Z` diventa le note della release con lo stesso numero
(tag `vX.Y.Z`) e la prima parte del file README.TXT incluso nello zip.
Il numero deve coincidere con `version:` in `plugin/Contrappunto/contrappunto.qml`.

## 2.5.0

### Correzioni
- Il contrappunto tiene conto delle note alterate della melodia e del basso.
  Prima l'analisi armonica conosceva solo gli accordi della tonalità e il
  contrappunto poteva usare solo note della scala: in un passaggio in Sol minore
  dentro un brano in La minore (Sol–Sib–Re) il flauto teneva un Mi, a un tritono
  dal Sib e a una seconda dal Re. Ora:
  - l'analisi riconosce anche gli accordi fuori tonalità (prestiti, dominanti
    secondarie, napoletana) quando le note che suonano li indicano;
  - le note alterate sentite nell'ultima battuta, in qualunque voce, diventano
    disponibili per il contrappunto (con la stessa grafia) e la stessa nota
    naturale è sconsigliata, come un'alterazione che vale per la battuta;
  - il tritono tra voci superiori conta come dissonanza, salvo quando le due
    note appartengono all'accordo (settima di dominante, accordo diminuito).
- Sul brano di prova con il flauto le dissonanze sul tempo sopra note alterate
  scendono da 52 a 13 (in 5 semi), senza false relazioni e senza parallele.

## 2.4.0

### Correzioni
- Niente più battute di pausa quando la melodia suona ma esce dal registro
  del contrappunto. Prima, se la melodia saliva (o scendeva) tanto da non
  lasciare spazio, la voce taceva. Ora in quelle battute passa dall'altra
  parte della melodia (scambio delle parti), dentro l'estensione dello
  strumento, e torna al suo posto appena c'è spazio. Sul brano di prova con il
  flauto le pause sotto la melodia scendono dal 19% al 2% del brano, senza
  parallele.

### Miglioramenti
- Il culmine viene posto nella frase della parte centrale in cui la voce può
  davvero salire più in alto, tenendo conto dello scambio delle parti. Le
  linee che non lo raggiungono scendono in classifica.
- La finestra indica in quante battute la voce ha cambiato lato.

## 2.3.0

### Novità
- Culmine unico anche nei brani lunghi: il motore riserva la zona più acuta
  del registro a una frase intorno al 60% del brano. Le altre frasi hanno
  picchi locali più bassi. Sul brano di prova (71 battute) si passa da 3–6
  culmini, quasi sempre nel primo quarto, a uno solo al 55–60% nello stile
  libero e nel 2:1.
- Con «Quante» maggiore di 1 si attiva da sola l'opzione «Una variante per rigo
  nuovo» (si può comunque disattivare).
- L'elenco delle varianti mostra dove cade il culmine (in % del brano).
- Anche con una variante per rigo la finestra indica l'estensione dello
  strumento usata e l'eventuale cambio di ruolo della voce.

### Nota
- Il punteggio include ora la regola del culmine: i valori non sono
  confrontabili con quelli delle versioni precedenti.

## 2.2.1

### Miglioramenti
- Il numero di versione è visibile nell'intestazione della finestra, per
  controllare quale versione sta usando MuseScore.
- Istruzioni: dopo aver aggiornato il plugin va riavviato MuseScore, che
  altrimenti continua a usare la versione caricata all'avvio.

## 2.2.0

### Novità
- Il contrappunto rispetta l'estensione dello strumento che lo suona: quello
  scelto per il nuovo rigo oppure quello del rigo esistente di destinazione.
  Nessuna nota esce dall'estensione.
- Se il registro previsto non ci sta (per esempio una voce intermedia
  affidata al flauto), il plugin prima cambia ruolo alla voce, portandola
  sopra o sotto la melodia, poi, se serve, la sposta di ottava. In entrambi i
  casi ricalcola la linea con le regole della nuova posizione, invece di
  trasporre semplicemente le note: nei rivolti una quinta diventerebbe una
  quarta.
- La finestra indica l'estensione usata e l'eventuale cambio di ruolo o di
  ottava.

## 2.1.1

### Correzioni
- Scegliendo un'altra variante, o rigenerando sullo stesso rigo, le note della
  variante precedente restavano nel rigo: invisibili ma udibili, sovrapposte
  alla nuova. Ora la voce di destinazione viene svuotata prima di scrivere.
- Dopo ogni scrittura il plugin rilegge il rigo e avvisa se non corrisponde
  esattamente alla variante scelta.

## 2.1.0

### Novità
- Confronto di più varianti: il campo «Quante» (1–8) calcola altrettante
  varianti con semi consecutivi e le elenca in ordine di qualità (prima quelle
  senza quinte o ottave parallele, poi il punteggio delle regole), con
  percentuale di gradi congiunti, di moto contrario e numero di culmini.
- La variante migliore viene scritta subito; un clic su un'altra variante
  dell'elenco la sostituisce (annullabile con Ctrl+Z) e ne copia il seme nel
  campo Seme.
- Opzione «Una variante per rigo nuovo»: ogni variante in un rigo a sé, con
  un'etichetta, per ascoltarle a confronto.
- Il calcolo procede una variante alla volta, con indicatore di avanzamento:
  la finestra non si blocca.

### Miglioramenti
- La finestra segue il tema di MuseScore (chiaro, scuro, alto contrasto) o, in
  mancanza, quello del sistema: niente più scritte bianche su fondo chiaro.
- Nuova disposizione su due colonne che entra in una schermata, senza
  scorrimento.
- Il punteggio di qualità esclude il rumore della «Varietà», quindi è
  confrontabile tra semi diversi. A parità di impostazioni e seme il risultato
  resta identico alla versione 2.0.0.

## 2.0.0

- Prima versione del plugin per MuseScore 4, riscritta dallo script Python.
- Ricerca dell'intera linea (beam search) invece della scelta nota per nota.
- Specie: libero, 1:1, 2:1, 4:1, ritardi, fiorito; posizione sopra, intermedia
  o al basso; regole rigorose o libere.
- Niente quinte e ottave parallele; dissonanze solo come note di passaggio, di
  volta, ritardi preparati o settime di dominante; un solo culmine.
- Scrittura in un nuovo rigo o in una voce di un rigo esistente, con
  legature di valore e ortografia corretta delle alterazioni.
