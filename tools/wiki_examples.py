#!/usr/bin/env python3
"""
Regenerates the music examples of the Wiki (docs/wiki/images/*.svg).

  pip install verovio          # once
  python3 tools/wiki_examples.py [--out docs/wiki/images] [--report]

The species examples, the imitative entry and the analysis example are written
by the plugin's own engine (tests/run_on_json.js), so the Wiki always shows what
the plugin really does. The other examples (intervals, motion, figures) are
written here by hand. The images contain no words: captions are in the Markdown
pages, so every language shares the same images. With --report the script also
prints the engine's figures and findings, to write the captions.
"""
import argparse, json, os, subprocess, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
BRIDGE = os.path.join(ROOT, "tests", "run_on_json.js")
NAT = [0, 2, 4, 5, 7, 9, 11]
STEPS = "CDEFGAB"
LET_TPC = {"C": 14, "D": 16, "E": 18, "F": 13, "G": 15, "A": 17, "B": 19}
DUR = {"w": 1920, "h.": 1440, "h": 960, "q.": 720, "q": 480, "e.": 360, "e": 240, "s": 120}
TYPES = {3840: ("breve", 0), 2880: ("breve", 1), 1920: ("whole", 0), 1440: ("half", 1), 960: ("half", 0), 720: ("quarter", 1),
         480: ("quarter", 0), 360: ("eighth", 1), 240: ("eighth", 0), 180: ("16th", 1), 120: ("16th", 0)}
RED, ORANGE = "#D00000", "#E07000"

# Fux's cantus firmus (Gradus ad Parnassum), here in D minor
CF = "D4:w F4:w E4:w D4:w G4:w F4:w A4:w G4:w F4:w E4:w D4:w"
ODE = ("E5:q E5:q F5:q G5:q G5:q F5:q E5:q D5:q C5:q C5:q D5:q E5:q E5:q. D5:e D5:h")


def parse(text, start=0):
    """'C5:q D#4:e r:h' -> events {tick, dur, notes:[{midi, tpc}]}"""
    t, out = start, []
    for tok in text.split():
        p, d = tok.split(":")
        d = DUR[d]
        if p != "r":
            step, rest = p[0], p[1:]
            alt = rest.count("#") - rest.count("b")
            octv = int(rest.replace("#", "").replace("b", ""))
            midi = (octv + 1) * 12 + NAT[STEPS.index(step)] + alt
            out.append({"tick": t, "dur": d, "notes": [{"midi": midi, "tpc": LET_TPC[step] + 7 * alt, "tieBack": False}]})
        else:
            out.append({"tick": t, "dur": d, "rest": True})
        t += d
    return out, t


def measures(end, num, den):
    ln = num * 1920 // den
    return [{"tick": t, "len": ln, "num": num, "den": den, "isFirst": t == 0} for t in range(0, end, ln)]


def engine(payload):
    out = subprocess.run(["node", BRIDGE], input=json.dumps(payload), capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


# ---------------------------------------------------------------- MusicXML writer
def pitch_xml(midi, tpc):
    letter = ((tpc - 14) * 4) % 7
    alt = (tpc + 1) // 7 - 2
    octv = round((midi - alt - NAT[letter]) / 12) - 1
    return STEPS[letter], alt, octv


def key_alters(fifths):
    order_sharp, order_flat = "FCGDAEB", "BEADGCF"
    alters = {s: 0 for s in STEPS}
    if fifths > 0:
        for s in order_sharp[:fifths]: alters[s] = 1
    for s in order_flat[:max(0, -fifths)]: alters[s] = -1
    return alters


def part_xml(pid, notes, mlen, num, den, fifths, clef, end):
    """notes: [{tick, dur, midi|None, tpc, tieNext, tieBack, color}] -> <part>"""
    ka = key_alters(fifths)
    out, cur = [], 0
    nmeas = end // mlen
    by_measure = [[] for _ in range(nmeas)]
    for n in notes:
        by_measure[n["tick"] // mlen].append(n)
    for m in range(nmeas):
        xs = ['<measure number="%d">' % (m + 1)]
        if m == 0:
            c = clef
            xs.append('<attributes><divisions>480</divisions><key><fifths>%d</fifths></key><time><beats>%d</beats><beat-type>%d</beat-type></time>'
                      '<clef><sign>%s</sign><line>%s</line>%s</clef></attributes>'
                      % (fifths, num, den, c[0], c[1], '<clef-octave-change>-1</clef-octave-change>' if len(c) > 2 else ""))
        state, t = {}, m * mlen
        for n in sorted(by_measure[m], key=lambda x: x["tick"]):
            if n["tick"] > t:
                xs.append(rest_xml(n["tick"] - t))
            dur = n["dur"]
            if n.get("midi") is None:
                xs.append(rest_xml(dur))
            else:
                step, alt, octv = pitch_xml(n["midi"], n["tpc"])
                want = state.get((step, octv), ka[step])
                acc = ""
                if alt != want and not n.get("tieBack"):
                    acc = "<accidental>%s</accidental>" % {-2: "flat-flat", -1: "flat", 0: "natural", 1: "sharp", 2: "double-sharp"}[alt]
                state[(step, octv)] = alt
                typ, dots = TYPES[dur]
                color = ' color="%s"' % n["color"] if n.get("color") else ""
                ties = ("<tie type=\"stop\"/>" if n.get("tieBack") else "") + ("<tie type=\"start\"/>" if n.get("tieNext") else "")
                tied = ("<tied type=\"stop\"/>" if n.get("tieBack") else "") + ("<tied type=\"start\"/>" if n.get("tieNext") else "")
                xs.append('<note%s><pitch><step>%s</step>%s<octave>%d</octave></pitch><duration>%d</duration>%s<voice>1</voice><type>%s</type>%s%s%s</note>'
                          % (color, step, "<alter>%d</alter>" % alt if alt else "", octv, dur, ties, typ, "<dot/>" * dots, acc,
                             "<notations>%s</notations>" % tied if tied else ""))
            t = n["tick"] + dur
        if t < (m + 1) * mlen:
            xs.append(rest_xml((m + 1) * mlen - t))
        if m == nmeas - 1:
            xs.append('<barline location="right"><bar-style>light-heavy</bar-style></barline>')
        xs.append("</measure>")
        out.append("".join(xs))
    return '<part id="%s">%s</part>' % (pid, "".join(out))


def rest_xml(d):
    typ, dots = TYPES.get(d, ("quarter", 0))
    return '<note><rest/><duration>%d</duration><voice>1</voice><type>%s</type>%s</note>' % (d, typ, "<dot/>" * dots)


def score_xml(parts, num, den, fifths, end):
    mlen = num * 1920 // den
    head = "".join('<score-part id="P%d"><part-name print-object="no"></part-name></score-part>' % (i + 1) for i in range(len(parts)))
    body = "".join(part_xml("P%d" % (i + 1), p["notes"], mlen, num, den, fifths, p["clef"], end) for i, p in enumerate(parts))
    return ('<?xml version="1.0" encoding="UTF-8"?><score-partwise version="3.1"><part-list>%s</part-list>%s</score-partwise>' % (head, body))


def events_to_notes(evts, color=None):
    out = []
    for e in evts:
        if e.get("rest"):
            continue
        n = e["notes"][0]
        out.append({"tick": e["tick"], "dur": e["dur"], "midi": n["midi"], "tpc": n["tpc"], "color": color})
    return out


def items_to_notes(items):
    out, prev = [], None
    for it in items:
        if it["midi"] is not None:
            out.append({"tick": it["tick"], "dur": it["ticks"], "midi": it["midi"], "tpc": it["tpc"],
                        "tieNext": it["tieNext"], "tieBack": bool(prev and prev["tieNext"] and prev["midi"] == it["midi"])})
        prev = it
    return out


# ---------------------------------------------------------------- rendering
def render(xml, path, width=1600, one_line=False):
    """one_line: short examples on a single system, as wide as they need"""
    import verovio
    tk = verovio.toolkit()
    tk.setOptions({"pageWidth": width, "pageHeight": 60000, "adjustPageHeight": True, "scale": 45,
                   "adjustPageWidth": one_line, "breaks": "none" if one_line else "auto",
                   "header": "none", "footer": "none", "svgViewBox": True,
                   "pageMarginLeft": 60, "pageMarginRight": 60, "pageMarginTop": 40, "pageMarginBottom": 40,
                   "spacingSystem": 12, "barLineWidth": 0.4})
    if not tk.loadData(xml):
        sys.exit("verovio could not read " + path)
    svg = tk.renderToSVG(1)
    # white background: readable in GitHub's dark theme too
    i = svg.index(">", svg.index("<svg")) + 1
    svg = svg[:i] + '<rect x="0" y="0" width="100%" height="100%" fill="#ffffff"/>' + svg[i:]
    with open(path, "w", encoding="utf-8") as f:
        f.write(svg)


def two_staves(top, bottom, end, num=4, den=4, fifths=0, clefs=(("G", "2"), ("G", "2"))):
    return score_xml([{"notes": top, "clef": clefs[0]}, {"notes": bottom, "clef": clefs[1]}], num, den, fifths, end)


def best_seed(base, seeds=range(1, 41), extra=None):
    """seed with no errors and the fewest warnings; extra(report) adds a criterion before the warnings"""
    best = None
    for sd in seeds:
        inp = json.loads(json.dumps(base))
        inp["options"]["seed"] = sd
        res = engine(inp)
        r = res["report"]
        key = (r["parallels"], r.get("errors", 0)) + (extra(r) if extra else ()) + (r.get("warnings", 0), -r["quality"])
        if best is None or key < best[0]:
            best = (key, sd, res)
        if not extra and key[:3] == (0, 0, 0):
            break
    return best[1], best[2]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=os.path.join(ROOT, "docs", "wiki", "images"))
    ap.add_argument("--report", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    out = lambda name: os.path.join(args.out, name)
    report = {}

    # 1. intervals: consonances and dissonances above C4 (harmonic intervals as two staves would be heavy: one staff, chords)
    cons = [("C4", "C4"), ("C4", "E4"), ("C4", "G4"), ("C4", "A4"), ("C4", "C5")]
    diss = [("C4", "D4"), ("C4", "F4"), ("C4", "F#4"), ("C4", "B4"), ("C4", "D5")]
    for name, pairs in (("intervals-consonant.svg", cons), ("intervals-dissonant.svg", diss)):
        top, bot, t = [], [], 0
        for lo, hi in pairs:
            a, _ = parse(hi + ":w", t); b, _ = parse(lo + ":w", t)
            top += events_to_notes(a); bot += events_to_notes(b); t += 1920
        render(two_staves(top, bot, t), out(name), 1400, True)

    # 2. the four kinds of motion, one per bar
    motion = [("G4:h C5:h", "C4:h A3:h"),    # contrary
              ("E4:h G4:h", "C4:h D4:h"),    # similar
              ("E4:h F4:h", "C4:h C4:h"),    # oblique
              ("E4:h F4:h", "C4:h D4:h")]    # parallel (thirds)
    top, bot, t = [], [], 0
    for up, lo in motion:
        a, _ = parse(up, t); b, _ = parse(lo, t)
        top += events_to_notes(a); bot += events_to_notes(b); t += 1920
    render(two_staves(top, bot, t), out("motion.svg"), 1400, True)

    # 3. parallel fifths (bar 1, wrong, in red) and the same passage in contrary motion (bar 2)
    a, _ = parse("G4:h A4:h", 0); b, _ = parse("C4:h D4:h", 0)
    c, _ = parse("G4:h F4:h", 1920); d, _ = parse("C4:h D4:h", 1920)
    top = events_to_notes(a, RED) + events_to_notes(c); bot = events_to_notes(b, RED) + events_to_notes(d)
    render(two_staves(top, bot, 3840), out("parallel-fifths.svg"), 1000, True)

    # 4. dissonance figures over a held note: passing, neighbour, suspension 7-6, cambiata
    figs = [("C5:q D5:q E5:h", "C4:w"),               # passing note: D (9th) between C and E
            ("E5:q F5:q E5:h", "C4:w"),               # neighbour note: F (11th) between two Es
            ("r:h F4:h", "D3:w"),                      # preparation: F over D, a consonant third...
            ("F4:h E4:h", "C3:w"),                     # ...held while the bass moves: 4th over C, resolves down to E (3rd)
            ("C5:q B4:q G4:q A4:q", "C4:w")]          # cambiata 8-7-5-6: B (7th) leaps down a third to G, then steps up
    top, bot, t = [], [], 0
    for up, lo in figs:
        a, _ = parse(up, t); b, _ = parse(lo, t)
        top += events_to_notes(a); bot += events_to_notes(b); t += 1920
    # tie the preparation of the suspension (bar 3 -> bar 4)
    for n in top:
        if n["tick"] == 2 * 1920 + 960: n["tieNext"] = True
        if n["tick"] == 3 * 1920: n["tieBack"] = True
    render(two_staves(top, bot, t, clefs=(("G", "2"), ("F", "4"))), out("figures.svg"), 1600, True)

    # 5. the cantus firmus alone, and the five species written by the engine above it
    cf, end = parse(CF)
    render(score_xml([{"notes": events_to_notes(cf), "clef": ("G", "2")}], 4, 4, -1, end), out("cantus-firmus.svg"), 1600)
    ms = measures(end, 4, 4)
    for sp, name in (("1:1", "species-1-1.svg"), ("2:1", "species-2-1.svg"), ("4:1", "species-4-1.svg"),
                     ("sus", "species-sus.svg"), ("florid", "species-florid.svg")):
        base = {"melody": cf, "bass": [], "measures": ms, "keys": [{"tick": 0, "sharps": -1}], "start": 0, "end": end,
                "options": {"species": sp, "position": "above", "mode": "minor", "strictness": "strict", "variety": 1}}
        seed, res = best_seed(base)
        r = res["report"]
        report[name] = {"seed": seed, "notes": r["notes"], "errors": r.get("errors"), "warnings": r.get("warnings"),
                        "figures": r.get("figures"), "findings": [f["text"] + " @" + str(f["tick"]) for f in r.get("findings", [])],
                        "climaxAt": r.get("climaxAt"), "steps": r["steps"], "leaps": r["leaps"]}
        render(two_staves(items_to_notes(res["items"]), events_to_notes(cf), end, fifths=-1), out(name), 1600)

    # 6. imitative entry: Ode to Joy, two voices, counterpoint below (free rules allow the entry at the fifth)
    mel, end2 = parse(ODE)
    ms2 = measures(end2, 4, 4)
    base = {"melody": mel, "bass": [], "measures": ms2, "keys": [{"tick": 0, "sharps": 0}], "start": 0, "end": end2,
            "options": {"species": "free", "position": "below", "strictness": "free", "entry": True, "variety": 2}}
    # an entry at the octave, fifth or fourth, imitating as many intervals as possible
    seed, res = best_seed(base, range(1, 41), lambda r: (0 if r.get("entry") and r["entry"]["at"] in (1, 4, 5) else 1,
                                                          -(r["entry"]["matched"] if r.get("entry") else 0)))
    report["imitative-entry.svg"] = {"seed": seed, "entry": res["report"].get("entry"), "errors": res["report"].get("errors"),
                                     "warnings": res["report"].get("warnings")}
    lo = min(n["midi"] for n in items_to_notes(res["items"]))
    render(two_staves(events_to_notes(mel), items_to_notes(res["items"]), end2,
                      clefs=(("G", "2"), ("G", "2") if lo >= 55 else ("F", "4"))), out("imitative-entry.svg"), 1400, True)

    # 7. an exercise with mistakes, coloured as the plugin colours them
    cf2, end3 = parse("C4:w D4:w E4:w F4:w E4:w D4:w C4:w")
    bad, _ = parse("G4:w A4:w B4:w D4:w C5:w B4:w C5:w")
    an = engine({"op": "analyze", "melody": cf2, "bass": [], "measures": measures(end3, 4, 4), "keys": [{"tick": 0, "sharps": 0}],
                 "start": 0, "end": end3, "line": bad, "options": {"strictness": "strict"}})
    worst = {}
    for f in an["findings"]:
        if worst.get(f["tick"]) != "error": worst[f["tick"]] = f["level"]
    notes = events_to_notes(bad)
    for n in notes:
        lv = None
        for t, l in worst.items():
            if n["tick"] <= t < n["tick"] + n["dur"]: lv = "error" if "error" in (lv, l) else l
        n["color"] = RED if lv == "error" else (ORANGE if lv else None)
    report["analysis-example.svg"] = [("%d: %s %s – %s" % (f["tick"] // 1920 + 1, f["level"], f["rule"], f["text"])) for f in an["findings"]]
    render(two_staves(notes, events_to_notes(cf2), end3), out("analysis-example.svg"), 1300, True)

    if args.report:
        print(json.dumps(report, indent=1, ensure_ascii=False))
    print("written to", os.path.relpath(args.out, ROOT))


if __name__ == "__main__":
    main()
