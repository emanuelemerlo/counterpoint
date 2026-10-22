[English](Options-reference) · **Italiano**

# Opzioni

Tutti i controlli della finestra, dall'alto in basso. Le scelte vengono
ricordate da una volta all'altra.

## Intestazione

| Controllo | Che cosa fa |
|---|---|
| Intervallo («Tutto lo spartito (battute 1–8)») | Le battute su cui lavora il plugin: la selezione al momento dell'apertura, oppure tutto lo spartito. Sempre battute intere. |
| **Usa la selezione corrente** | Rilegge la selezione, se l'hai cambiata con la finestra aperta. |
| **Lingua** | *Automatica* usa la lingua dell'interfaccia di MuseScore (inglese se non è disponibile); oppure scegline una. Cambiando lingua si traduce anche il messaggio mostrato. |

## Sorgenti

| Controllo | Che cosa fa |
|---|---|
| **Melodia (canto dato)** | Il rigo con la melodia. Con più note insieme, la più acuta è la melodia. |
| **Basso** | Il rigo con il basso, oppure **— nessuno —**. Con più note insieme, la più grave è il basso. Le altre note dell'accompagnamento contano come voci interne. |

## Destinazione

| Controllo | Che cosa fa |
|---|---|
| **Nuovo rigo** + strumento | Aggiunge un rigo in fondo con quello strumento. Il contrappunto resta nella sua estensione: Violino Sol3–Mi6, Flauto Do4–La6, Oboe Si♭3–Re6, Viola Do3–La5, Violoncello Do2–Do5, Fagotto Si♭1–Si♭4, voci Soprano Do4–La5, Contralto Fa3–Re5, Tenore Do3–La4, Basso Mi2–Re4, Pianoforte La0–Do8. |
| **Rigo esistente** + voce | Scrive in quella voce di quel rigo, dentro l'estensione del suo strumento. La voce 1 del rigo della melodia o del basso non è ammessa. È anche la voce usata da **Analizza la voce** e **Rigenera il resto**. |

## Varianti

| Controllo | Che cosa fa |
|---|---|
| **Varietà** (0–10) | Quanto il risultato può scostarsi dalla soluzione più corretta. 0 = sempre la stessa. |
| **Seme** / **Nuovo seme** | Identifica una soluzione: stesse impostazioni + stesso seme = stesso contrappunto. |
| **Quante** (1–8) | Calcola più varianti con semi consecutivi e le ordina (vedi [Confrontare le varianti](Confrontare-le-varianti)). |
| **Una variante per rigo nuovo** | Ogni variante in un rigo a sé, con un'etichetta. |

## Stile

| Controllo | Valori |
|---|---|
| **Specie / ritmo** | Libero (ritmo complementare), 1:1, 2:1, 4:1, Ritardi (4ª specie), Fiorito (5ª specie). Vedi [Scegliere specie e stile](Scegliere-specie-e-stile). |
| **Posizione** | Automatica; Sopra la melodia; Sotto la melodia, sopra il basso; Sotto la melodia, come basso. |
| **Registro** | Automatico, Soprano (Do4–La5), Contralto (Fa3–Re5), Tenore (Do3–La4), Basso (Mi2–Re4). |
| **Regole** | Rigorose (accademiche) o Libere (appoggiature, settime, dirette tollerate). Valgono anche per l'analisi. |
| **Modo** | Automatico, Maggiore, Minore. |
| **Metro** | Automatico, Semplice (2/4, 3/4, 4/4…), Composto (6/8, 9/8, 12/8…). |
| **Imita il motivo della melodia nelle sue pause** | Nelle pause della melodia il contrappunto riprende il suo ultimo motivo. |
| **Entrata in imitazione (libero e fiorito)** | Il contrappunto aspetta mentre la melodia espone il suo inizio, poi lo imita. |
| **Lega le note tenute** | Unisce con legature di valore le note tenute (serve ai ritardi). |

## Pulsanti

| Pulsante | Che cosa fa |
|---|---|
| **Analizza la voce** | Controlla la voce di destinazione con le regole: errori in rosso, avvisi in arancione. Vedi [Controllare un esercizio](Controllare-un-esercizio). |
| **Rigenera il resto** | Tiene le note selezionate o modificate a mano della voce di destinazione e riscrive le altre. Vedi [Mantenere note e rigenerare](Mantenere-note-e-rigenerare). |
| **Genera** / **Genera N varianti** | Scrive il contrappunto. È un'unica operazione: Ctrl+Z la annulla. |
| **Chiudi** | Chiude la finestra (le impostazioni vengono salvate). |

## Il riquadro dei messaggi

Dopo ogni generazione descrive il risultato: seme, numero di note, tonalità,
posizione della voce, gradi congiunti e salti, moto contrario e simile,
parallele, il controllo automatico (errori, avvisi, figure come ritardi e
cambiate), l'entrata in imitazione, le note mantenute, l'estensione dello
strumento e gli eventuali cambi di lato o di ottava della voce.
