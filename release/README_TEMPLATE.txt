==============================================================================
 CONTRAPPUNTO AUTOMATICO - plugin per MuseScore 4
 Versione {VERSION} - {DATE}
==============================================================================

Genera una contro-melodia in contrappunto a partire da una melodia (canto
dato) e, se presente, da un basso, e la scrive in un nuovo rigo oppure in una
voce di un rigo esistente.


------------------------------------------------------------------------------
 NOTE DI RILASCIO {VERSION}
------------------------------------------------------------------------------

{NOTES}


------------------------------------------------------------------------------
 FUNZIONALITÀ
------------------------------------------------------------------------------

 * Specie di contrappunto: libero (ritmo complementare alla melodia),
   1:1 nota contro nota, 2:1, 4:1, ritardi (4a specie), fiorito (5a specie).
 * Posizione: sopra la melodia, voce intermedia tra melodia e basso, oppure
   come basso (quando il basso manca).
 * Regole rigorose (accademiche) o libere (appoggiature, settime di
   dominante, quinte e ottave dirette tollerate).
 * Correttezza: niente quinte e ottave parallele; dissonanze solo come note
   di passaggio o di volta, ritardi preparati o settime di dominante; niente
   incroci; sensibile non raddoppiata.
 * Linea melodica: prevalenza di gradi congiunti, salti recuperati per moto
   contrario, un solo culmine, preferenza per il moto contrario, cadenze
   raggiunte per grado.
 * Estensione dello strumento: le note restano sempre dentro l'estensione
   dello strumento di destinazione; se serve la voce cambia posizione
   (sopra/sotto la melodia) o ottava, ricalcolando la linea.
 * Riconoscimento automatico di tonalità, modo (maggiore/minore) e metro
   (semplice/composto), anche con cambi di armatura.
 * Imitazione: nelle pause della melodia il contrappunto riprende il suo
   ultimo motivo.
 * Risultato deterministico: stesse impostazioni e stesso seme danno sempre
   lo stesso contrappunto.
 * Confronto di più varianti ordinate per qualità, nella stessa
   destinazione o in righi separati.
 * La finestra segue il tema chiaro/scuro di MuseScore.
 * Ogni generazione è un'unica operazione annullabile con Ctrl+Z.


------------------------------------------------------------------------------
 INSTALLAZIONE
------------------------------------------------------------------------------

 1. Estrai lo zip: contiene la cartella "Contrappunto".
 2. Copia la cartella "Contrappunto" nella cartella dei plugin di MuseScore:
      Windows : Documenti\MuseScore4\Plugins\
      macOS   : ~/Documents/MuseScore4/Plugins/
      Linux   : ~/Documents/MuseScore4/Plugins/
    (la cartella è indicata anche in Preferenze > Cartelle > Plugin).
    Se aggiorni da una versione precedente, sostituisci la vecchia cartella.
 3. In MuseScore: menu Plugin > Gestisci plugin, attiva
    "Contrappunto automatico".
 4. Il plugin compare nel menu Plugin > Composizione/arrangiamento.

La cartella deve contenere entrambi i file:
   contrappunto.qml        interfaccia e collegamento con lo spartito
   contrappunto_engine.js  motore musicale


------------------------------------------------------------------------------
 COME SI USA
------------------------------------------------------------------------------

Generare un contrappunto
 1. (Facoltativo) Seleziona un intervallo di battute. Senza selezione il
    plugin lavora su tutto lo spartito. Lavora sempre su battute intere.
 2. Avvia il plugin. Se cambi selezione con la finestra aperta, premi
    "Usa la selezione corrente".
 3. Sorgenti: scegli il rigo della melodia e quello del basso, oppure
    "nessuno" se hai solo il canto dato. Melodia e basso possono stare nello
    stesso rigo: la nota più acuta è la melodia, la più grave il basso.
 4. Destinazione: "Nuovo rigo" (con lo strumento scelto) oppure
    "Rigo esistente" + voce (per esempio la voce 2 della mano sinistra).
    La voce 1 di un rigo che contiene melodia o basso non è ammessa.
 5. Stile: specie, posizione, registro, regole, modo e metro.
 6. Premi "Genera".

Provare altre soluzioni
 * Dopo la prima generazione in un nuovo rigo, quel rigo diventa la
   destinazione: cambia il seme ("Nuovo seme") e premi di nuovo "Genera" per
   sostituire il risultato con un'alternativa.
 * "Varietà" (0-10) decide quanto le soluzioni possono scostarsi da quella
   più corretta: con 0 ogni seme dà lo stesso risultato.

Confrontare più varianti
 1. Imposta "Quante" a un valore da 2 a 8 e premi "Genera N varianti".
 2. Il plugin calcola le varianti (semi consecutivi, indicati accanto al
    campo) e le elenca dalla migliore. Per ciascuna mostra il punteggio, la
    percentuale di gradi congiunti e di moto contrario, il numero di culmini
    e l'eventuale presenza di parallele.
 3. La migliore è già scritta nella destinazione. Clicca un'altra variante
    per sostituirla e ascoltarla; il suo seme passa nel campo "Seme", così
    puoi ritrovarla in seguito.
 4. In alternativa attiva "Una variante per rigo nuovo": ogni variante va in
    un rigo nuovo con l'etichetta "Variante N - seme S". Ascoltale, tieni
    quella che preferisci ed elimina gli altri righi (oppure Ctrl+Z).

Consigli
 * Per un canto dato breve prova le specie 1:1, 2:1 e ritardi; per un brano
   intero la specie "Libero" dà il risultato più naturale.
 * Annota il seme delle varianti che ti piacciono: con le stesse impostazioni
   il risultato si ripete identico.
 * Se le legature di valore non vengono create, il plugin lo segnala e le
   note restano ripetute invece che legate.


------------------------------------------------------------------------------
 OPZIONI
------------------------------------------------------------------------------

 Specie / ritmo   Libero, 1:1, 2:1, 4:1, Ritardi (4a specie), Fiorito (5a)
 Posizione        Automatica, sopra la melodia, voce intermedia, come basso
 Registro         Automatico, Soprano, Contralto, Tenore, Basso
 Regole           Rigorose (accademiche) o Libere
 Modo / Metro     Automatici, oppure forzati
 Imitazione       Nelle pause della melodia riprende il suo ultimo motivo
 Legature         Unisce con legature di valore le note tenute
 Varietà / Seme   Scostamento dalla soluzione più corretta; stesso seme =
                  stesso risultato
 Quante           Numero di varianti da calcolare e ordinare (1-8)
 Una per rigo     Scrive ogni variante in un rigo nuovo


------------------------------------------------------------------------------
 LIMITI NOTI
------------------------------------------------------------------------------

 * Una sola voce di contrappunto per volta.
 * Terzine e gruppi irregolari della melodia vengono letti, ma il
   contrappunto usa solo valori binari e puntati.
 * Su brani lunghi il motore tende a un culmine per sezione.
 * Dove melodia e accompagnamento sono molto vicini il contrappunto può
   fare brevi pause per evitare quinte od ottave parallele.


------------------------------------------------------------------------------
 STORICO DELLE VERSIONI
------------------------------------------------------------------------------

{HISTORY}

------------------------------------------------------------------------------
 Sorgenti e segnalazioni: {REPO_URL}
------------------------------------------------------------------------------
