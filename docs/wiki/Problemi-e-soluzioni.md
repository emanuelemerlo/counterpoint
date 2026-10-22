[English](Troubleshooting) · **Italiano**

# Problemi e soluzioni

**Il plugin non compare nel menu Plugin.**
Controlla che la cartella `contrappunto` sia direttamente dentro la cartella dei
plugin di MuseScore (non dentro una seconda cartella creata estraendo lo zip) e
che contenga `contrappunto.qml`, `contrappunto_engine.js` e `i18n/`. Poi apri
**Plugin → Gestisci plugin** e attiva **Contrappunto**.

**Dopo l'aggiornamento vedo ancora la versione vecchia.**
Riavvia MuseScore: tiene la versione caricata all'avvio. La versione in uso è
accanto al titolo della finestra.

**Il plugin compare due volte.**
C'è ancora una vecchia cartella `Contrappunto` (con la maiuscola) accanto alla
nuova `contrappunto`. Elimina la vecchia e riavvia.

**La finestra si apre ma i testi sono come ⟦group.sources⟧.**
Manca la cartella `i18n/` o è incompleta: copia di nuovo l'intera cartella
`contrappunto`.

**La finestra è nella lingua sbagliata.**
Sceglila in **Lingua**, in alto a destra. *Automatica* segue la lingua
dell'interfaccia di MuseScore (Preferenze → Generale → Lingua).

**«La voce 1 del rigo scelto contiene la melodia o il basso».**
Hai scelto come destinazione la voce che contiene la musica per cui scrivi il
contrappunto. Scegli la voce 2, 3 o 4, oppure un altro rigo.

**«La melodia non contiene note nell'intervallo scelto».**
Le battute selezionate del rigo della melodia sono vuote, oppure come Melodia è
scelto il rigo sbagliato. Controlla le Sorgenti e premi **Usa la selezione
corrente**.

**Le note sono ripetute invece che legate.**
Alcune versioni di MuseScore 4 non lasciano creare legature ai plugin; il plugin
lo dice nel messaggio. Legale a mano (seleziona e premi `+`) oppure disattiva
**Lega le note tenute**.

**Il contrappunto fa delle pause in alcune battute.**
Dove melodia e accompagnamento sono molto vicini, una breve pausa può essere
l'unico modo per evitare quinte od ottave parallele. Prova un altro seme,
un'altra posizione o uno strumento con un'estensione più ampia.

**Il contrappunto va sopra la melodia anche se ho chiesto sotto.**
In quelle battute non c'era spazio sotto la melodia dentro l'estensione: la voce
passa dall'altra parte (scambio delle parti) e torna appena può. Il messaggio
dice in quante battute.

**L'entrata in imitazione non c'è stata.**
Servono almeno tre note all'inizio della melodia e un brano abbastanza lungo;
il messaggio lo dice. È disponibile solo in Libero e Fiorito.

**Rigenera il resto dice che non ci sono note da mantenere.**
Modifica o seleziona le note nella voce scelta in **Destinazione → Rigo
esistente**. Se il tuo MuseScore non lascia leggere la selezione ai plugin,
modifica invece le note a mano.

**I colori dell'analisi restano dopo aver corretto una nota.**
Premi di nuovo **Analizza la voce** (prima toglie i suoi colori) oppure Ctrl+Z.
Vengono riportate al nero anche le note che hai colorato tu esattamente con il
rosso o l'arancione del plugin.

**Altro?**
Apri una [segnalazione](https://github.com/emanuelemerlo/counterpoint/issues)
indicando la versione di MuseScore, la versione del plugin e, se puoi, lo
spartito.
