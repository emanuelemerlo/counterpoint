from music21 import converter, stream, note, interval, duration, meter, key, chord, pitch, analysis
import random
import os
import sys
import argparse
from datetime import datetime
import itertools
from builtins import round

# Set di intervalli (nomi generici e specifici semplici per facilità d'uso)
PERFECT_CONSONANCES = {'P1', 'P5', 'P8'}
IMPERFECT_CONSONANCES = {'m3', 'M3', 'm6', 'M6'}
ALL_CONSONANCES = PERFECT_CONSONANCES | IMPERFECT_CONSONANCES
# P4 è dissonante vs Basso tipicamente, m2/M2/m7/M7 sempre dissonanti, A4/d5 dissonanti
DISSONANCES = {'m2', 'M2', 'P4', 'A4', 'd5', 'm7', 'M7'}

# --- Costanti per Euristica Frasi ---
# Durata minima di una pausa (in quarter lengths) per considerarla fine frase
MIN_PHRASE_REST_DURATION = 1.0 # Es: 1.0 = semiminima, 2.0 = minima

# --- Costanti per Ampiezza Tonale Contrappunto ---
DEFAULT_MIN_CP_PITCH = pitch.Pitch('C2')
DEFAULT_MAX_CP_PITCH = pitch.Pitch('C6')
# Intervallo sotto/sopra la melodia per definire il range del CP
RANGE_EXTENSION_DOWN = interval.Interval('-P4')
RANGE_EXTENSION_UP = interval.Interval('P4')

def normalize_offset(offset, precision=8):
    """Arrotonda un offset a una precisione specificata."""
    return round(float(offset), precision) # Assicura che sia float

def get_motion_type(p1_prev, p1_curr, p2_prev, p2_curr):
    """Determina il tipo di moto tra due voci."""
    if not all([p1_prev, p1_curr, p2_prev, p2_curr]):
        return 'unknown'

    # Assicurati che siano oggetti Pitch, estrai se necessario da note.Note
    p1_prev_p = p1_prev.pitch if hasattr(p1_prev, 'pitch') else p1_prev
    p1_curr_p = p1_curr.pitch if hasattr(p1_curr, 'pitch') else p1_curr
    p2_prev_p = p2_prev.pitch if hasattr(p2_prev, 'pitch') else p2_prev
    p2_curr_p = p2_curr.pitch if hasattr(p2_curr, 'pitch') else p2_curr

    # Controlla che tutti siano Pitch validi
    if not all([isinstance(p, pitch.Pitch) for p in [p1_prev_p, p1_curr_p, p2_prev_p, p2_curr_p]]):
            return 'unknown'

    p1_dir = 0
    if p1_curr_p.ps > p1_prev_p.ps: p1_dir = 1
    elif p1_curr_p.ps < p1_prev_p.ps: p1_dir = -1

    p2_dir = 0
    if p2_curr_p.ps > p2_prev_p.ps: p2_dir = 1
    elif p2_curr_p.ps < p2_prev_p.ps: p2_dir = -1

    if p1_dir == 0 and p2_dir == 0: return 'oblique' # Entrambe ferme non è un moto definito, ma consideriamolo obliquo
    if p1_dir == 0 or p2_dir == 0: return 'oblique'
    if p1_dir == p2_dir: return 'similar' # Era 'parallel', ma 'similar' è più corretto se l'intervallo cambia
    if p1_dir == -p2_dir: return 'contrary'
    return 'unknown'

def check_motion_errors(p_mel_prev, p_mel_curr, p_bass_prev, p_bass_curr,
                        p_cp_prev, p_cp_curr):
    """Controlla errori di moto (parallele P5/P8, dirette P5/P8)"""
    penalty = 0
    # Estrai pitch da note se necessario
    p_mel_prev_p = p_mel_prev.pitch if isinstance(p_mel_prev, note.Note) else None
    p_mel_curr_p = p_mel_curr.pitch if isinstance(p_mel_curr, note.Note) else p_mel_curr
    p_bass_prev_p = p_bass_prev.pitch if isinstance(p_bass_prev, note.Note) else None
    p_bass_curr_p = p_bass_curr.pitch if isinstance(p_bass_curr, note.Note) else p_bass_curr
    p_cp_prev_p = p_cp_prev.pitch if isinstance(p_cp_prev, note.Note) else None
    p_cp_curr_p = p_cp_curr.pitch if isinstance(p_cp_curr, note.Note) else p_cp_curr

    # Non possiamo controllare il moto se manca una delle note precedenti o correnti del contrappunto
    # o se il contrappunto non si muove (moto obliquo per definizione senza errori paralleli)
    if not p_cp_prev_p or not p_cp_curr_p or p_cp_prev_p == p_cp_curr_p:
        return 0

    # --- CP vs Melodia ---
    if all([p_mel_prev_p, p_mel_curr_p]):
        try:
            # Controlla solo se la melodia si muove
            if p_mel_prev_p != p_mel_curr_p:
                int_prev_mel = interval.Interval(p_mel_prev_p, p_cp_prev_p)
                int_curr_mel = interval.Interval(p_mel_curr_p, p_cp_curr_p)
                motion_mel = get_motion_type(p_mel_prev_p, p_mel_curr_p, p_cp_prev_p, p_cp_curr_p)

                # Parallele P5/P8 (o P1/P12 etc.)
                if int_prev_mel.name in PERFECT_CONSONANCES and int_curr_mel.name == int_prev_mel.name and motion_mel != 'oblique':
                    penalty -= 1000 # Penalità molto alta per parallele perfette

                # Dirette P5/P8 (Hidden/Direct) - Moto simile verso consonanza perfetta
                # Penalizza di più se la voce superiore (melodia) salta
                if motion_mel == 'similar' and int_curr_mel.name in PERFECT_CONSONANCES:
                    mel_leap = abs(interval.Interval(p_mel_prev_p, p_mel_curr_p).semitones) > 2 # Salto se > M2
                    # cp_leap = abs(interval.Interval(p_cp_prev_p, p_cp_curr_p).semitones) > 2 # Non necessario controllare salto CP qui
                    if mel_leap:
                        penalty -= 500 # Penalità alta per dirette con salto nella voce superiore
        except Exception as e:
             # print(f"Warning: Motion check error (Melody): {e}") # Debug
             pass # Ignora errori nel calcolo intervalli ecc.

    # --- CP vs Basso ---
    if all([p_bass_prev_p, p_bass_curr_p]):
        try:
             # Controlla solo se il basso si muove
            if p_bass_prev_p != p_bass_curr_p:
                int_prev_bass = interval.Interval(p_bass_prev_p, p_cp_prev_p)
                int_curr_bass = interval.Interval(p_bass_curr_p, p_cp_curr_p)
                motion_bass = get_motion_type(p_bass_prev_p, p_bass_curr_p, p_cp_prev_p, p_cp_curr_p)

                # Parallele P5/P8
                if int_prev_bass.name in PERFECT_CONSONANCES and int_curr_bass.name == int_prev_bass.name and motion_bass != 'oblique':
                    penalty -= 1000

                # Dirette P5/P8
                if motion_bass == 'similar' and int_curr_bass.name in PERFECT_CONSONANCES:
                    # Nelle dirette vs Basso, è spesso il *salto nella voce superiore* (CP in questo caso) ad essere problematico
                    cp_leap = abs(interval.Interval(p_cp_prev_p, p_cp_curr_p).semitones) > 2
                    # bass_leap = abs(interval.Interval(p_bass_prev_p, p_bass_curr_p).semitones) > 2
                    if cp_leap: # Penalizza se il CP (voce superiore rispetto al basso) salta
                       penalty -= 500
        except Exception as e:
            # print(f"Warning: Motion check error (Bass): {e}") # Debug
            pass

    return penalty

def get_sounding_pitches_at_offset(part_stream, offset):
    """Trova le altezze che stanno suonando a un dato offset in uno stream."""
    sounding_elements = part_stream.flatten().getElementsByOffset(
        offset, includeEndBoundary=True, mustFinishInSpan=False,
        mustBeginInSpan=False, classList=(note.Note, chord.Chord))
    pitches = []
    target_offset = normalize_offset(offset)
    tolerance = 1e-6 # Tolleranza per confronti float
    for el in sounding_elements:
        start_offset = normalize_offset(el.offset)
        # Calcola end offset correttamente anche per elementi a offset 0
        el_duration_ql = el.duration.quarterLength if el.duration else 0
        end_offset = normalize_offset(start_offset + el_duration_ql)

        # Controlla se l'offset target cade *strettamente* all'interno dell'elemento
        # (start <= target < end) usando la tolleranza
        if start_offset <= target_offset + tolerance and target_offset < end_offset - tolerance:
            if isinstance(el, note.Note):
                pitches.append(el.pitch)
            elif isinstance(el, chord.Chord):
                pitches.extend([p for p in el.pitches]) # Aggiunge tutte le note dell'accordo

    # Rimuovi duplicati mantenendo l'ordine (anche se l'ordine non è critico qui)
    unique_pitches = []
    seen_ps = set()
    for p in pitches:
        if p.ps not in seen_ps:
            unique_pitches.append(p)
            seen_ps.add(p.ps)
    return unique_pitches

# --- Funzioni Analisi Armonica (basata su input Melodia/Basso) ---
def analyze_harmony(melody_part, bass_part, key_signature):
    """
    Analisi armonica di base basata su melodia e basso di input.
    Calcola l'accordo implicito e il grado della fondamentale per ogni offset.
    """
    harmony_data = {}
    # Considera gli offset dove inizia una nota/accordo/pausa in melodia o basso
    melody_offsets = set(normalize_offset(el.offset) for el in melody_part.flatten().notesAndRests if hasattr(el, 'offset'))
    bass_offsets = set(normalize_offset(el.offset) for el in bass_part.flatten().notesAndRests if hasattr(el, 'offset'))
    all_unique_offsets = sorted(list(melody_offsets | bass_offsets))

    last_known_harmony = None # Per propagare l'armonia durante le pause

    for offset in all_unique_offsets:
        norm_offset = normalize_offset(offset)
        # Trova le note *effettivamente suonanti* a questo offset preciso
        sounding_melody_pitches = get_sounding_pitches_at_offset(melody_part, norm_offset)
        sounding_bass_pitches = get_sounding_pitches_at_offset(bass_part, norm_offset)

        current_chord_pitches = sounding_bass_pitches + sounding_melody_pitches

        if current_chord_pitches:
            try:
                # Crea un accordo dalle note suonanti
                chord_obj = chord.Chord(current_chord_pitches)
                chord_obj.removeRedundantPitches(inPlace=True) # Semplifica l'accordo

                if chord_obj.pitches: # Assicurati che ci siano ancora note dopo la riduzione
                    root = chord_obj.root()
                    # Determina la funzione armonica (grado della scala della fondamentale)
                    key_obj = key_signature.asKey() # Usa la tonalità data
                    scale_degree_info = key_obj.getScaleDegreeAndAccidentalFromPitch(root)

                    # scale_degree_info può essere None se la nota non è nella scala
                    harmonic_function = scale_degree_info[0] if scale_degree_info else None

                    harmony_info = {'chord': chord_obj, 'function': harmonic_function}
                    harmony_data[norm_offset] = harmony_info
                    last_known_harmony = harmony_info # Aggiorna l'ultima armonia conosciuta
                else:
                     # Se l'accordo è vuoto dopo la riduzione, usa l'armonia precedente se disponibile
                     if last_known_harmony:
                         harmony_data[norm_offset] = last_known_harmony

            except Exception as e:
                 # In caso di errore (es. tonalità non trovata), non registrare armonia per questo offset
                 # print(f"Warning: Harmony analysis error at offset {norm_offset}: {e}") # Debug
                 if last_known_harmony: # Tenta di usare l'ultima conosciuta
                    harmony_data[norm_offset] = last_known_harmony
        elif last_known_harmony:
            # Se non ci sono note suonanti (pausa in entrambe le voci),
            # propaga l'ultima armonia conosciuta
             harmony_data[norm_offset] = last_known_harmony

    # print(f"DEBUG: Harmony Data: {harmony_data}") # Utile per debug
    return harmony_data


# --- Classe Modificata con Gestione Frasi e Range Dinamico ---
class CounterpointGenerator:

    def __init__(self,
                 melody_part,
                 bass_part,
                 key_signature,
                 time_signature,
                 phrase_boundaries, # Set di offset di inizio frase
                 num_voices=1):
                 # Rimosse opzioni non usate: invertible, varied_rhythm, style

        self.melody_part = melody_part.flatten().notesAndRests.stream()
        self.bass_part = bass_part.flatten().notesAndRests.stream()
        self.key_signature = key_signature
        self.time_signature = time_signature
        self.num_voices = num_voices # Attualmente supporta solo 1
        # Rimosse self.invertible, self.varied_rhythm

        self.phrase_boundaries = phrase_boundaries # Salva i confini
        # NUOVO: Analisi armonica (basata su input) per guidare la generazione
        self.harmony_data = analyze_harmony(self.melody_part, self.bass_part, self.key_signature)

        # Deriva scala e tonica
        try:
            self.key_obj = key_signature.asKey()
            self.diatonic_scale = self.key_obj.getScale()
            self.tonic_pitch = self.key_obj.tonic
            self.mode = self.key_obj.mode
        except Exception:
            print("Attenzione: Tonalità non riconosciuta o non standard, uso C Maggiore come fallback.")
            fallback_key = key.Key('C')
            self.key_signature = fallback_key.getKeySignature() # Usa l'armatura di Do Mag
            self.key_obj = fallback_key
            self.diatonic_scale = fallback_key.getScale()
            self.tonic_pitch = fallback_key.tonic
            self.mode = fallback_key.mode

        # --- NUOVO: Calcola range della melodia ---
        self.melody_pitch_range = None
        try:
            #melody_part_object = melody_part.parts[0] # Ottieni il Part dal PartStaff
            #melody_notes = melody_part_object.stream().notes  # Converti in stream prima di accedere a notes
            melody_notes = self.melody_part.flatten().notes.stream() # Aggiungi .stream() qui
            if melody_notes:
                self.melody_pitch_range = melody_notes.analyze('ambitus')
                print(f"Range melodia rilevato: {self.melody_pitch_range.noteStart.nameWithOctave} - {self.melody_pitch_range.noteEnd.nameWithOctave}") # Usa noteStart e noteEnd
            else:
                print("Attenzione: Nessuna nota trovata nella melodia per calcolare il range.")
        except Exception as e:
            print(f"Attenzione: Errore nel calcolare il range della melodia: {e}")

        # Determina il range del contrappunto basato sulla melodia
        self.cp_min_pitch, self.cp_max_pitch = self._calculate_counterpoint_range()

        # Stato interno per la generazione
        self.last_melody_element = None
        self.last_bass_element = None
        self.last_cp_notes = [None] * num_voices
        self.counterpoint_parts = [stream.Part(id=f'counterpoint_{i+1}') for i in range(num_voices)]

    def _calculate_counterpoint_range(self):
        """Calcola il range del contrappunto basato sul range della melodia."""
        if self.melody_pitch_range:
            try:
                # Calcola limiti base estendendo il range della melodia
                #base_min = self.melody_pitch_range.noteStart.transpose(RANGE_EXTENSION_DOWN) # Usa noteStart
                #base_max = self.melody_pitch_range.noteEnd.transpose(RANGE_EXTENSION_UP) # Usa noteEnd
                
                # Calcola limiti base estendendo il range della melodia
                base_min = self.melody_pitch_range.noteStart.pitch.transpose(RANGE_EXTENSION_DOWN)
                base_max = self.melody_pitch_range.noteEnd.pitch.transpose(RANGE_EXTENSION_UP)
                
                # Applica i limiti assoluti (clamp)
                final_min = max(base_min, DEFAULT_MIN_CP_PITCH, key=lambda p: p.ps)
                final_max = min(base_max, DEFAULT_MAX_CP_PITCH, key=lambda p: p.ps)

                # Assicurati che min sia minore di max
                if final_min.ps >= final_max.ps:
                    print(f"Attenzione: Range calcolato ({final_min}-{final_max}) non valido, uso default {DEFAULT_MIN_CP_PITCH}-{DEFAULT_MAX_CP_PITCH}")
                    return DEFAULT_MIN_CP_PITCH, DEFAULT_MAX_CP_PITCH
                else:
                    print(f"Range contrappunto calcolato: {final_min.nameWithOctave} - {final_max.nameWithOctave}")
                    return final_min, final_max

            except Exception as e:
                print(f"Attenzione: Errore nel calcolo del range del contrappunto: {e}. Uso default.")
                return DEFAULT_MIN_CP_PITCH, DEFAULT_MAX_CP_PITCH
        else:
            # Se non c'è range melodia, usa il default
            print("Range melodia non disponibile, uso range contrappunto di default.")
            return DEFAULT_MIN_CP_PITCH, DEFAULT_MAX_CP_PITCH

    def get_last_pitches(self, element):
        """Estrae le altezze da nota, accordo o None."""
        if isinstance(element, note.Note):
            return [element.pitch]
        elif isinstance(element, chord.Chord):
            return element.pitches
        return [] # Ritorna lista vuota se è Rest o None

    def update_last_elements(self, melody_elements, bass_elements, cp_element, voice_index=0):
        """Aggiorna lo stato degli elementi precedenti (trova l'ultima *nota* o *accordo*)."""
        # Trova l'ultimo elemento NON Rest nella lista degli elementi correnti della melodia
        last_mel_note_or_chord = next((el for el in reversed(melody_elements) if not isinstance(el, note.Rest)), None)
        if last_mel_note_or_chord:
             self.last_melody_element = last_mel_note_or_chord

        # Fai lo stesso per il basso
        last_bass_note_or_chord = next((el for el in reversed(bass_elements) if not isinstance(el, note.Rest)), None)
        if last_bass_note_or_chord:
             self.last_bass_element = last_bass_note_or_chord

        # Aggiorna l'ultima nota/pausa del contrappunto per la voce specificata
        # Se l'elemento generato è una pausa, viene comunque salvato per sapere che c'era una pausa
        self.last_cp_notes[voice_index] = cp_element


    def generate(self):
        """Genera le parti del contrappunto."""
        for cp_part in self.counterpoint_parts:
            cp_part.append(self.key_signature)
            cp_part.append(self.time_signature)

        # Ottieni tutti gli offset unici dove inizia un evento (nota/accordo/pausa)
        melody_offsets = set(normalize_offset(el.offset) for el in self.melody_part if hasattr(el, 'offset'))
        bass_offsets = set(normalize_offset(el.offset) for el in self.bass_part if hasattr(el, 'offset'))
        all_offsets_set = melody_offsets | bass_offsets
        all_offsets_set.add(0.0) # Assicura che l'inizio sia incluso

        # Determina l'offset finale dello spartito
        highest_time_melody = 0.0
        if self.melody_part and self.melody_part[-1]:
            last_mel_el = self.melody_part[-1]
            highest_time_melody = normalize_offset(last_mel_el.offset + last_mel_el.duration.quarterLength)

        highest_time_bass = 0.0
        if self.bass_part and self.bass_part[-1]:
             last_bass_el = self.bass_part[-1]
             highest_time_bass = normalize_offset(last_bass_el.offset + last_bass_el.duration.quarterLength)

        end_offset = max(highest_time_melody, highest_time_bass)
        # Aggiungi l'offset finale per assicurare che l'ultimo segmento sia processato
        # Ma solo se è maggiore dell'ultimo offset già presente
        if not all_offsets_set or end_offset > max(all_offsets_set):
             all_offsets_set.add(normalize_offset(end_offset))

        # Ordina gli offset unici
        all_offsets = sorted(list(all_offsets_set))

        # --- Ciclo Principale per Segmenti di Offset ---
        for i, start_offset in enumerate(all_offsets):
            # Normalizza l'offset corrente per confronti precisi
            current_norm_offset = normalize_offset(start_offset)

            # Fermati se abbiamo raggiunto o superato l'offset finale calcolato
            if current_norm_offset >= normalize_offset(end_offset):
                 break

            # Determina l'offset del segmento successivo
            # Assicurati che ci sia un elemento successivo nell'array
            if i + 1 >= len(all_offsets):
                 break # Non c'è un segmento successivo
            next_offset_raw = all_offsets[i + 1]
            next_norm_offset = normalize_offset(next_offset_raw)

            # Calcola la durata del segmento corrente
            segment_duration_ql = next_norm_offset - current_norm_offset
            # Salta segmenti di durata trascurabile (dovuti a errori di arrotondamento?)
            if segment_duration_ql <= 1e-6:
                 continue
            segment_duration = duration.Duration(quarterLength=segment_duration_ql)

            # --- Determina se siamo a inizio/fine frase (approssimata) ---
            # Inizio frase se l'offset corrente è in phrase_boundaries
            is_phrase_start = current_norm_offset in self.phrase_boundaries
            # Fine frase se il *prossimo* offset è un inizio frase (e non è lo stesso offset)
            is_phrase_end = (next_norm_offset in self.phrase_boundaries and next_norm_offset != current_norm_offset)

            # Trova le note *effettivamente suonanti* all'inizio di questo segmento
            sounding_melody_pitches = get_sounding_pitches_at_offset(self.melody_part, current_norm_offset)
            sounding_bass_pitches = get_sounding_pitches_at_offset(self.bass_part, current_norm_offset)

            # Trova gli elementi (Note, Accordi, Pause) che *iniziano* esattamente a questo offset
            current_melody_elements = self.melody_part.getElementsByOffset(current_norm_offset, mustBeginInSpan=True, classList=(note.Note, chord.Chord, note.Rest))
            current_bass_elements = self.bass_part.getElementsByOffset(current_norm_offset, mustBeginInSpan=True, classList=(note.Note, chord.Chord, note.Rest))

            # --- Generazione Voce 0 (attualmente l'unica supportata) ---
            voice_index = 0 # Lavoriamo sulla prima (e unica) voce di contrappunto

            # Recupera l'elemento (Nota o Pausa) precedente del contrappunto
            prev_cp_element = self.last_cp_notes[voice_index]

            # Recupera le altezze degli *ultimi* elementi (non Pause) di melodia e basso sentiti
            p_mel_prev_list = self.get_last_pitches(self.last_melody_element)
            p_bass_prev_list = self.get_last_pitches(self.last_bass_element)

            # Scegli un rappresentante per il calcolo del moto (es: più acuto per melodia, più grave per basso)
            # Se non c'erano note prima, saranno None
            p_mel_prev_rep = max(p_mel_prev_list, key=lambda p: p.ps) if p_mel_prev_list else None
            p_bass_prev_rep = min(p_bass_prev_list, key=lambda p: p.ps) if p_bass_prev_list else None

            # Chiama la logica principale per trovare la nota migliore per questo segmento
            generated_element = self.find_best_counterpoint_note_single_voice(
                sounding_melody_pitches, sounding_bass_pitches,
                prev_cp_element,
                p_mel_prev_rep, p_bass_prev_rep, # Note rappresentative precedenti
                segment_duration,
                is_phrase_start, # Passa info sulla posizione nella frase
                is_phrase_end,
                current_norm_offset # Passa l'offset corrente per recuperare l'armonia
            )

            # Inserimento dell'elemento generato (o pausa) e aggiornamento dello stato
            cp_part_to_update = self.counterpoint_parts[voice_index]
            if generated_element:
                cp_part_to_update.insert(current_norm_offset, generated_element)
            else:
                # Se non trova una nota valida, inserisce una pausa
                cp_rest = note.Rest(quarterLength=segment_duration.quarterLength)
                cp_part_to_update.insert(current_norm_offset, cp_rest)
                generated_element = cp_rest # Usa la pausa per aggiornare lo stato

            # Aggiorna gli elementi precedenti per il prossimo ciclo
            # Passa gli elementi che iniziano *ora* e l'elemento appena generato
            self.update_last_elements(current_melody_elements, current_bass_elements, generated_element, voice_index)

            # Gestione (semplificata) per voci multiple (se mai verranno implementate)
            # Attualmente inserisce solo pause nelle voci > 0
            for v_idx in range(1, self.num_voices):
                 cp_rest = note.Rest(quarterLength=segment_duration.quarterLength)
                 self.counterpoint_parts[v_idx].insert(current_norm_offset, cp_rest)
                 # Aggiorna lo stato anche per le altre voci (con pause)
                 self.update_last_elements([], [], cp_rest, v_idx)

        # --- Finalizzazione ---
        final_counterpoint_parts = []
        for cp_part in self.counterpoint_parts:
            # Pulisce legature e crea misure e pause di riempimento
            cp_part.flatten().stripTies(inPlace=True)
            try:
                # Applicare makeMeasures prima di makeRests può aiutare
                cp_part.makeMeasures(inPlace=True)
                cp_part.makeRests(fillGaps=True, inPlace=True)
                # A volte è utile un secondo passaggio di makeMeasures dopo makeRests
                cp_part.makeMeasures(inPlace=True)
            except Exception as e:
                 print(f"Attenzione: Problema durante makeMeasures/makeRests: {e}")
                 # Potrebbe essere necessario un cleanup manuale o diverso in casi complessi
            final_counterpoint_parts.append(cp_part)

        return final_counterpoint_parts


    def find_best_counterpoint_note_single_voice(self,
                                                 sounding_melody_pitches,
                                                 sounding_bass_pitches,
                                                 prev_cp_element,
                                                 p_mel_prev, # Singola pitch rappresentativa precedente
                                                 p_bass_prev, # Singola pitch rappresentativa precedente
                                                 duration_obj,
                                                 is_phrase_start, # NUOVO flag
                                                 is_phrase_end,   # NUOVO flag
                                                 current_offset   # NUOVO: per accedere a harmony_data
                                                 ):
        """
        Trova la nota migliore per il contrappunto in un segmento,
        considerando consonanza, dissonanza, moto, regole melodiche,
        e la posizione nella frase (inizio/fine).
        Utilizza il range di altezza calcolato basato sulla melodia.
        Utilizza l'analisi armonica pre-calcolata (harmony_data).
        """
        best_note = None
        best_score = -float('inf')

        # --- Genera note candidate ---
        # Usa il range calcolato (self.cp_min_pitch, self.cp_max_pitch)
        # e la scala diatonica della tonalità
        candidate_pitches = []
        try:
             # Genera altezze diatoniche nell'intervallo calcolato
             candidate_pitches = list(self.diatonic_scale.getPitches(self.cp_min_pitch, self.cp_max_pitch))
             # Potremmo aggiungere anche le note cromatiche principali se necessario,
             # ma per ora restiamo diatonici per semplicità stilistica.
        except Exception as e:
             print(f"Errore generazione altezze candidate: {e}")
             return None # Non possiamo continuare senza candidate

        if not candidate_pitches:
             # print(f"Warning: Nessuna altezza candidata trovata nel range {self.cp_min_pitch}-{self.cp_max_pitch} per la scala.")
             return None # Nessuna nota possibile trovata

        # --- Preparazione per la valutazione ---
        # Pitch precedente del contrappunto (se esiste ed era una nota)
        prev_cp_pitch = prev_cp_element.pitch if isinstance(prev_cp_element, note.Note) else None

        # Pitch rappresentative *correnti* di melodia e basso (se suonano)
        # Usa max per melodia (voce superiore), min per basso
        rep_mel_curr = max(sounding_melody_pitches, key=lambda p: p.ps) if sounding_melody_pitches else None
        rep_bass_curr = min(sounding_bass_pitches, key=lambda p: p.ps) if sounding_bass_pitches else None

        # --- Recupera info armonica per l'offset corrente ---
        # Cerca l'offset normalizzato più vicino nei dati armonici (potrebbe non esserci corrispondenza esatta)
        norm_current_offset = normalize_offset(current_offset)
        harmony_info = self.harmony_data.get(norm_current_offset)
        current_harmonic_function = harmony_info['function'] if harmony_info else None

        # --- DEBUG Frase ---
        # if is_phrase_start: print(f"DEBUG: *** INIZIO FRASE (Offset: {current_offset:.2f}) ***")
        # if is_phrase_end: print(f"DEBUG: *** FINE FRASE (Offset: {current_offset:.2f}, Dur: {duration_obj.quarterLength:.2f}) ***")

        # --- Ciclo di Valutazione delle Note Candidate ---
        for cand_pitch in candidate_pitches:
            score = 0.0 # Usiamo float per punteggi più fini
            vertical_penalty = 0.0
            vertical_bonus = 0.0
            melodic_bonus = 0.0
            melodic_penalty = 0.0
            motion_penalty = 0.0 # Separato per chiarezza
            phrase_bonus = 0.0
            phrase_penalty = 0.0

            # --- 1. Valutazione Verticale (Intervalli Armonici Istantanei) ---
            try:
                # Vs Melodia (se presente)
                if rep_mel_curr:
                    int_mel = interval.Interval(cand_pitch, rep_mel_curr) # Intervallo CP -> Melodia
                    if int_mel.simpleName in DISSONANCES:
                        vertical_penalty -= 25
                    elif int_mel.simpleName in IMPERFECT_CONSONANCES:
                        vertical_bonus += 10
                    # Evita unisono se non strettamente necessario? Potrebbe essere aggiunto

                # Vs Basso (se presente) - Questo è più critico
                if rep_bass_curr:
                    int_bass = interval.Interval(rep_bass_curr, cand_pitch) # Intervallo Basso -> CP
                    if int_bass.simpleName in DISSONANCES:
                        penalty_val = 70
                        if int_bass.simpleName == 'P4': penalty_val = 50 # P4 vs Basso è una dissonanza comune ma meno aspra
                        vertical_penalty -= penalty_val
                    elif int_bass.simpleName in IMPERFECT_CONSONANCES:
                        vertical_bonus += 18 # Consonanze imperfette sono buone
                    elif int_bass.simpleName in PERFECT_CONSONANCES and int_bass.simpleName != 'P1':
                        vertical_bonus += 8 # Consonanze perfette (non unisono) ok, ma meno preferite delle imperfette
                    elif int_bass.simpleName == 'P1':
                         vertical_penalty -= 15 # Penalizza leggermente l'unisono col basso

            except Exception as e:
                # print(f"Warning: Vertical interval error: {e}") # Debug
                vertical_penalty -= 10 # Penalità generica se il calcolo fallisce

            score += vertical_bonus + vertical_penalty

            # --- 1.5 Bonus/Malus Basati sull'Armonia Pre-Calcolata ---
            if current_harmonic_function and rep_bass_curr:
                 # Favorisci note dell'accordo implicito (radice, terza, quinta)
                 # Questo è un modo semplice; potrebbe essere più sofisticato
                 try:
                    implied_chord = harmony_info['chord'] if harmony_info else None
                    if implied_chord and cand_pitch.name in [p.name for p in implied_chord.pitches]:
                        score += 5 # Piccolo bonus se la nota è nell'accordo implicito
                    # Bonus specifici per funzioni armoniche (come prima)
                    if current_harmonic_function == 1: # Tonica
                        if interval.Interval(rep_bass_curr, cand_pitch).simpleName in {'P1', 'm3', 'M3', 'P5', 'm6', 'M6', 'P8'}: score += 10 # Bonus consonanza su Tonica
                    elif current_harmonic_function == 5: # Dominante
                        if interval.Interval(rep_bass_curr, cand_pitch).simpleName in {'M3', 'P5', 'm7'}: score += 8 # Bonus consonanza/tensione su Dominante
                 except Exception: pass # Ignora errori qui


            # --- 2. Controllo Errori di Moto (Parallele/Dirette) ---
            # Usa le pitch rappresentative precedenti (p_mel_prev, p_bass_prev)
            # e quelle correnti (rep_mel_curr, rep_bass_curr)
            # Usa la pitch precedente del CP (prev_cp_pitch) e la candidata corrente (cand_pitch)
            motion_penalty = check_motion_errors(p_mel_prev, rep_mel_curr,
                                                 p_bass_prev, rep_bass_curr,
                                                 prev_cp_pitch, cand_pitch)
            score += motion_penalty
            # Se c'è una penalità grave per moto (parallele/dirette), scarta subito la candidata
            # Usiamo -499 perché la penalità per dirette è -500, parallele -1000
            if motion_penalty <= -499:
                continue # Passa alla prossima candidata

            # --- 3. Valutazione Melodica (Linea del Contrappunto) ---
            if prev_cp_pitch: # Se non è la prima nota del contrappunto
                try:
                    melodic_int = interval.Interval(prev_cp_pitch, cand_pitch)
                    melodic_semitones = abs(melodic_int.semitones)

                    # Penalità per salti ampi
                    if melodic_semitones > 7: # Salto > P5
                         melodic_penalty -= (melodic_semitones * 5) # Penalità crescente col salto
                    if melodic_semitones > 12: # Salto > P8
                         melodic_penalty -= (melodic_semitones * 8) # Penalità ancora maggiore
                    # Penalità specifica per salti dissonanti (A4/d5) e 7e
                    if melodic_int.simpleName in {'A4', 'd5', 'm7', 'M7'}:
                        melodic_penalty -= 40

                    # Bonus per passi congiunti (<= M2)
                    if melodic_semitones <= 2:
                        melodic_bonus += 12
                    # Bonus minore per salti piccoli (m3/M3)
                    elif melodic_semitones <= 4:
                        melodic_bonus += 6

                    # Bonus per moto contrario/obliquo rispetto a melodia/basso
                    # Controlliamo il moto della linea CP rispetto alle altre linee
                    if rep_mel_curr and p_mel_prev:
                         motion_mel_type = get_motion_type(p_mel_prev, rep_mel_curr, prev_cp_pitch, cand_pitch)
                         if motion_mel_type == 'contrary': melodic_bonus += 15
                         elif motion_mel_type == 'oblique': melodic_bonus += 8
                    if rep_bass_curr and p_bass_prev:
                         motion_bass_type = get_motion_type(p_bass_prev, rep_bass_curr, prev_cp_pitch, cand_pitch)
                         if motion_bass_type == 'contrary': melodic_bonus += 15
                         elif motion_bass_type == 'oblique': melodic_bonus += 8

                except Exception as e:
                    # print(f"Warning: Melodic interval error: {e}") # Debug
                    melodic_penalty -= 5 # Penalità generica
            else: # Prima nota assoluta del contrappunto
                 # Bonus se la prima nota forma una consonanza perfetta col basso (se presente)
                 if rep_bass_curr:
                     try:
                        int_bass_start = interval.Interval(rep_bass_curr, cand_pitch)
                        if int_bass_start.name in PERFECT_CONSONANCES:
                             score += 15 # Buon inizio
                     except Exception: pass


            # --- 4. NUOVO: Bonus/Malus per Posizione nella Frase ---
            if is_phrase_end:
                # Fine frase: favorire fortemente consonanze stabili col Basso
                if rep_bass_curr:
                    try:
                        int_bass_end = interval.Interval(rep_bass_curr, cand_pitch)
                        # Intervalli cadenzali forti/comuni: P8, P5, M3, m3, M6 (meno comune m6)
                        good_cadence_intervals = {'P8', 'P5', 'M3', 'm3', 'M6'}
                        ok_cadence_intervals = {'m6'} # Meno forte ma possibile
                        bad_cadence_intervals = DISSONANCES | {'P4'} # Dissonanze + P4 vs basso

                        if int_bass_end.simpleName in good_cadence_intervals:
                            phrase_bonus += 40 # Bonus significativo per chiusura forte
                        elif int_bass_end.simpleName in ok_cadence_intervals:
                             phrase_bonus += 15 # Bonus minore
                        elif int_bass_end.simpleName in bad_cadence_intervals:
                            phrase_penalty -= 100 # Penalità molto alta per chiusura dissonante/P4
                    except Exception: pass
                else:
                    # Se il basso è in pausa alla fine, difficile valutare la cadenza.
                    # Potremmo favorire la tonica o la modale della tonalità?
                    if cand_pitch.name == self.tonic_pitch.name:
                        phrase_bonus += 10
                    elif cand_pitch.name == self.key_obj.pitchFromDegree(3).name: # Terza della scala
                        phrase_bonus += 5

                # Favorire leggermente il passo congiunto *verso* la nota finale
                if prev_cp_pitch:
                    try:
                        melodic_semitones_end = abs(interval.Interval(prev_cp_pitch, cand_pitch).semitones)
                        if melodic_semitones_end <= 2:
                            phrase_bonus += 8 # Bonus per passo congiunto alla fine
                    except Exception: pass

            if is_phrase_start:
                # Inizio frase (potrebbe essere dopo una pausa):
                # Riduci leggermente la penalità per i salti se la nota precedente era una pausa
                if isinstance(prev_cp_element, note.Rest) and melodic_penalty < 0:
                    melodic_penalty *= 0.6 # Riduci la penalità (es: 60% della penalità originale)

                # Potrebbe favorire intervalli specifici col basso (come la prima nota assoluta)
                if rep_bass_curr:
                     try:
                         int_bass_start = interval.Interval(rep_bass_curr, cand_pitch)
                         # P5/P8 sono inizi comuni e forti
                         if int_bass_start.name in PERFECT_CONSONANCES:
                             phrase_bonus += 10 # Bonus (oltre a quello eventuale per prima nota assoluta)
                     except Exception: pass


            # Applica punteggi melodici e di frase
            score += melodic_bonus + melodic_penalty
            score += phrase_bonus + phrase_penalty


            # --- 5. Selezione Migliore ---
            if score > best_score:
                best_score = score
                # Crea l'oggetto nota solo se diventa il migliore
                best_note = note.Note(cand_pitch)
                best_note.duration = duration_obj
            # Tie-breaking: a parità di punteggio, preferisci passi più piccoli
            elif score == best_score and best_note is not None and prev_cp_pitch:
                 try:
                     current_interval_size = abs(interval.Interval(prev_cp_pitch, cand_pitch).semitones)
                     best_interval_size = abs(interval.Interval(prev_cp_pitch, best_note.pitch).semitones)
                     # Se il passo corrente è più piccolo del migliore attuale, sostituisci
                     if current_interval_size < best_interval_size:
                         best_note = note.Note(cand_pitch)
                         best_note.duration = duration_obj
                 except Exception: pass # Ignora errori nel tie-breaking

        # Alla fine del ciclo, ritorna la nota migliore trovata (o None)
        # if best_note: print(f"Offset: {current_offset:.2f}, Best Note: {best_note.nameWithOctave}, Score: {best_score:.2f}") # Debug
        # else: print(f"Offset: {current_offset:.2f}, No suitable note found.") # Debug
        return best_note


# --- Funzione per trovare confini di frase (Euristica basata su Pause Melodia) ---
def find_phrase_boundaries(melody_stream, min_rest_duration):
    """Identifica offset che seguono pause significative nella melodia."""
    boundaries = {normalize_offset(0.0)} # Inizia sempre una frase a offset 0
    melody_flat = melody_stream.flatten().notesAndRests
    for el in melody_flat:
        if isinstance(el, note.Rest):
            try:
                 # Arrotonda durata e offset per confronto affidabile
                 rest_duration_ql = normalize_offset(el.duration.quarterLength)
                 min_rest_ql = normalize_offset(min_rest_duration)

                 if rest_duration_ql >= min_rest_ql:
                     # Il confine della *nuova* frase è *dopo* la pausa
                     boundary_offset = normalize_offset(el.offset + el.duration.quarterLength)
                     # Aggiungi solo se non è già presente per evitare duplicati da arrotondamento
                     if boundary_offset not in boundaries:
                        boundaries.add(boundary_offset)
            except Exception as e:
                 print(f"Warning: Could not process rest duration/offset: {e}")
                 continue # Ignora elemento problematico

    # Ordina i confini per chiarezza di stampa
    sorted_boundaries = sorted(list(boundaries))
    print(f"Confini di frase (euristica) identificati agli offset: {sorted_boundaries}")
    return boundaries


# --- Funzione Principale di Elaborazione ---
def process_mxml(input_file, output_file, num_voices=1):
                 # Rimosse opzioni non usate: style, varied_rhythm, invertible
    """Carica il file, genera il contrappunto e salva il nuovo spartito."""
    try:
        print(f"Caricamento file: {input_file}")
        score = converter.parse(input_file)
    except Exception as e:
        print(f"Errore CRITICO durante il parsing di {input_file}: {e}")
        sys.exit(1)

    if len(score.parts) < 2:
        print("Errore: Il file di input deve contenere almeno 2 righi (Parti).")
        sys.exit(1)

    # Assumi Melodia = Rigo 0, Basso = Rigo 1
    melody_part = score.parts[0]
    bass_part = score.parts[1]
    print(f"Usando '{melody_part.partName or 'Rigo 0'}' come Melodia e '{bass_part.partName or 'Rigo 1'}' come Basso.")

    # Estrai Metadati Globali (Tonalità, Tempo)
    flat_score = score.flatten() # Appiattisci per cercare elementi globali
    key_signature = flat_score.getElementsByClass(key.KeySignature).first()
    if not key_signature:
        key_signature = key.Key('C').getKeySignature() # Default a C Maggiore se non trovata
        print("Attenzione: Nessuna armatura di chiave trovata, usando Do Maggiore.")

    time_signature = flat_score.getElementsByClass(meter.TimeSignature).first()
    if not time_signature:
        time_signature = meter.TimeSignature('4/4') # Default a 4/4 se non trovato
        print("Attenzione: Nessuna indicazione di tempo trovata, usando 4/4.")

    try:
        key_obj = key_signature.asKey()
        print(f"Tonalità rilevata: {key_obj.tonic.name} {key_obj.mode}")
    except Exception:
        # Potrebbe essere un'armatura non standard o music21 potrebbe non riconoscerla
        print(f"Tonalità: (Armatura: {key_signature.sharps} diesis/bemolli)")

    print(f"Tempo rilevato: {time_signature.ratioString}")

    # --- Trova confini di frase basati su pause nella melodia ---
    phrase_boundaries = find_phrase_boundaries(melody_part, MIN_PHRASE_REST_DURATION)

    # --- Istanzia il generatore con i confini e il range dinamico ---
    print("Inizializzazione generatore di contrappunto...")
    generator = CounterpointGenerator(melody_part, bass_part, key_signature,
                                        time_signature,
                                        phrase_boundaries, # Passa i confini trovati
                                        num_voices=num_voices) # Passa num_voices

    # --- Genera il Contrappunto ---
    print("Generazione contrappunto in corso...")
    counterpoint_parts = generator.generate()
    print("Generazione completata.")

    # --- Crea Nuovo Spartito con tutte le parti ---
    new_score = stream.Score()
    # Aggiungi metadata se presenti nello score originale
    if score.metadata:
        new_score.insert(0, score.metadata)
        new_score.metadata.title = f"{score.metadata.title or 'Composizione'} con Contrappunto"
        new_score.metadata.composer = "Contrappunto generato da Script"

    # Copia le parti originali per non modificarle
    # makeNotation forza la creazione di misure ecc. che potrebbero mancare
    melody_part_copy = melody_part.makeNotation(inPlace=False)
    bass_part_copy = bass_part.makeNotation(inPlace=False)
    melody_part_copy.partName = melody_part.partName or "Melodia"
    bass_part_copy.partName = bass_part.partName or "Basso"

    # Inserisci le parti nel nuovo spartito (ordine tipico: Melodia, CP, Basso)
    new_score.insert(0, melody_part_copy)
    for i, cp_part in enumerate(counterpoint_parts):
        cp_part.partName = f'Contrappunto {i+1}'
        # Applica makeNotation anche alle parti generate per sicurezza
        cp_part_notation = cp_part.makeNotation(inPlace=False)
        new_score.insert(0, cp_part_notation) # Inserisce *prima* della melodia
    # Ora inserisci il basso, che andrà in fondo
    new_score.insert(0, bass_part_copy) # Inserisce *prima* del CP

    # Riordina le parti per avere Melodia, CP, Basso
    # L'ordine di inserimento con insert(0, ...) mette gli elementi all'inizio,
    # quindi l'ordine finale sarà inverso: Basso, CP1, Melodia.
    # Per l'ordine standard, dovremmo usare append o insert a indici specifici.
    # Rifacciamo l'inserimento con append per ordine corretto:
    final_score = stream.Score()
    if score.metadata:
        final_score.insert(0, score.metadata) # Metadata sempre all'inizio
        final_score.metadata.title = f"{score.metadata.title or 'Composizione'} con Contrappunto"
        final_score.metadata.composer = "Contrappunto generato da Script"

    final_score.append(melody_part_copy)
    for cp_part in counterpoint_parts:
        cp_part.partName = cp_part.partName or f'Contrappunto {final_score.index(cp_part)}' # Assicura un nome
        final_score.append(cp_part.makeNotation(inPlace=False)) # Aggiungi alla fine
    final_score.append(bass_part_copy)


    # --- Salva il Nuovo Spartito ---
    try:
        print(f"Salvataggio spartito in: {output_file}")
        # Usa 'musicxml.compressed' (mxl) o 'musicxml' (xml)
        # .mxl è generalmente preferito perché più piccolo
        output_format = 'musicxml.compressed' if output_file.lower().endswith('.mxl') else 'musicxml'
        final_score.write(output_format, fp=output_file)
        print(f"Contrappunto generato e salvato con successo!")
    except Exception as e:
        print(f"Errore CRITICO durante la scrittura del file MusicXML: {e}")
        # Potrebbe essere un problema di permessi o un errore interno di music21
        # Provare a salvare come .xml non compresso a volte aiuta a diagnosticare
        # try:
        #     alt_output = output_file + ".xml"
        #     print(f"Tentativo di salvataggio come .xml non compresso in: {alt_output}")
        #     final_score.write('musicxml', fp=alt_output)
        #     print("Salvataggio .xml riuscito, il problema potrebbe essere la compressione.")
        # except Exception as e2:
        #     print(f"Errore anche nel salvataggio .xml: {e2}")


# --- Funzione per generare nome file output ---
def generate_output_filename(input_file, suffix):
    """Genera un nome file unico per l'output."""
    base_name, _ = os.path.splitext(input_file)
    # Usa un timestamp più breve o solo il suffisso se preferito
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    # Assicurati che il suffisso non sia vuoto
    suffix_part = f"_{suffix}" if suffix else ""
    # Usa .mxl come estensione predefinita
    return f"{base_name}{suffix_part}_{timestamp}.mxl"

# Rimuoviamo process_all_variations perché le opzioni sono state rimosse/fissate

# --- Blocco Main ---
if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Genera un contrappunto (1 voce) per un file MusicXML a 2 righi (Melodia + Basso), "
                    "usando euristica per le frasi e range del contrappunto basato sulla melodia."
    )
    parser.add_argument("input_file", help="Percorso del file MusicXML di input (deve avere almeno 2 righi/Part).")
    # Opzioni rimosse: --style, --varied_rhythm, --invertible, --all
    parser.add_argument(
        "--voices", type=int, default=1, choices=[1],
        help="Numero di voci di contrappunto da generare (attualmente supportato solo 1)."
    )
    # Aggiungiamo opzione per specificare file output
    parser.add_argument(
        "-o", "--output",
        help="Percorso del file MusicXML/MXL di output. Se non specificato, viene generato automaticamente."
    )

    args = parser.parse_args()

    # Determina il nome del file di output
    if args.output:
        output_file = args.output
        # Assicura l'estensione corretta se non presente
        if not output_file.lower().endswith(('.mxl', '.musicxml', '.xml')):
             output_file += ".mxl"
             print(f"Estensione file output non specificata, aggiunto '.mxl'. File output: {output_file}")
    else:
        # Genera nome file automaticamente se non fornito
        output_suffix = f"cp_{args.voices}v" # Suffisso semplice
        output_file = generate_output_filename(args.input_file, output_suffix)

    print(f"\n--- Generazione Contrappunto ({args.voices} voce/i) ---")
    print(f"Input: {args.input_file}")
    print(f"Output: {output_file}")

    # Esegui l'elaborazione principale
    process_mxml(args.input_file, output_file, num_voices=args.voices)