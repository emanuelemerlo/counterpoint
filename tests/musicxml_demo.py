#!/usr/bin/env python3
"""
Prova il motore su uno spartito reale, senza MuseScore.

  python3 tests/musicxml_demo.py input.mxl output.mxl [specie,...] [--seed N] [--variants N]

Legge il MusicXML come farebbe il plugin (melodia = rigo 1, basso = rigo 2 della
prima parte, oppure prima e seconda parte), chiama il motore JS con node e
scrive uno spartito con una parte di contrappunto in più per ogni specie.
Con --variants N calcola N varianti per specie (semi consecutivi) e le scrive
in ordine di qualità, come il plugin con «Una variante per rigo».
Specie: free, 1:1, 2:1, 4:1, sus, florid.
"""
import json, os, subprocess, sys, zipfile, io, copy
import xml.etree.ElementTree as ET

HERE = os.path.dirname(os.path.abspath(__file__))
STEP = {"C": 0, "D": 2, "E": 4, "F": 5, "G": 7, "A": 9, "B": 11}
LET_TPC = {"C": 14, "D": 16, "E": 18, "F": 13, "G": 15, "A": 17, "B": 19}
LETTERS = "CDEFGAB"
LABEL = {"free": "libero", "1:1": "1:1", "2:1": "2:1", "4:1": "4:1", "sus": "ritardi", "florid": "fiorito"}


def load_xml(path):
    if path.lower().endswith(".mxl"):
        z = zipfile.ZipFile(path)
        cont = ET.fromstring(z.read("META-INF/container.xml"))
        root = cont.find(".//{*}rootfile").get("full-path")
        return ET.ElementTree(ET.fromstring(z.read(root)))
    return ET.parse(path)


def read_score(tree):
    root = tree.getroot()
    parts = root.findall("part")
    staves = {}   # (partIndex, staff) -> eventi
    measures, keys = [], []
    for pi, part in enumerate(parts):
        div, mt, num, den, fifths = 1, 0, 4, 4, 0
        for mi, m in enumerate(part.findall("measure")):
            pos, maxpos, last = 0, 0, {}
            for el in m:
                if el.tag == "attributes":
                    if el.findtext("divisions"): div = int(el.findtext("divisions"))
                    if el.find("key") is not None: fifths = int(el.find("key").findtext("fifths"))
                    if el.find("time") is not None:
                        num, den = int(el.find("time").findtext("beats")), int(el.find("time").findtext("beat-type"))
                elif el.tag == "backup":
                    pos -= int(el.findtext("duration")) * 480 // div
                elif el.tag == "forward":
                    pos += int(el.findtext("duration")) * 480 // div
                    maxpos = max(maxpos, pos)
                elif el.tag == "note":
                    if el.find("grace") is not None or el.find("cue") is not None:
                        continue
                    d = int(el.findtext("duration") or 0) * 480 // div
                    staff = int(el.findtext("staff") or 1)
                    voice = el.findtext("voice") or "1"
                    is_chord = el.find("chord") is not None
                    start = last.get("start", pos) if is_chord else pos
                    p = el.find("pitch")
                    if p is not None:
                        step, alt, octv = p.findtext("step"), int(float(p.findtext("alter") or 0)), int(p.findtext("octave"))
                        midi = (octv + 1) * 12 + STEP[step] + alt
                        note = {"midi": midi, "tpc": LET_TPC[step] + 7 * alt,
                                "tieBack": any(t.get("type") == "stop" for t in el.findall("tie"))}
                        key = (pi, staff)
                        lst = staves.setdefault(key, [])
                        if is_chord and lst and lst[-1]["tick"] == mt + start and lst[-1]["_v"] == voice:
                            lst[-1]["notes"].append(note)
                        else:
                            lst.append({"tick": mt + start, "dur": d, "notes": [note], "_v": voice})
                    last = {"start": start}
                    if not is_chord:
                        pos += d
                        maxpos = max(maxpos, pos)
            if pi == 0:
                nominal = num * 1920 // den
                length = maxpos if 0 < maxpos < nominal and mi == 0 else nominal
                measures.append({"tick": mt, "len": length, "num": num, "den": den, "isFirst": mi == 0, "number": m.get("number")})
                if not keys or keys[-1]["sharps"] != fifths:
                    keys.append({"tick": mt, "sharps": fifths})
                mt += length
            else:
                mt += measures[mi]["len"] if mi < len(measures) else num * 1920 // den
    for lst in staves.values():
        for e in lst: e.pop("_v", None)
    return parts, staves, measures, keys


def pitch_xml(midi, tpc):
    letter = ((tpc - 14) * 4) % 7
    alter = (tpc + 1) // 7 - 2
    step = "CDEFGAB"[letter]
    octave = (midi - STEP[step] - alter) // 12 - 1
    return step, alter, octave


TYPES = {1920: "whole", 960: "half", 480: "quarter", 240: "eighth", 120: "16th", 60: "32nd", 30: "64th", 3840: "breve"}


def type_of(ticks):
    if ticks in TYPES: return TYPES[ticks], 0
    if ticks * 2 // 3 in TYPES and ticks % 3 == 0: return TYPES[ticks * 2 // 3], 1
    return "quarter", 0


def add_part(root, part_id, name, items, measures, keys, clef):
    pl = root.find("part-list")
    sp = ET.SubElement(pl, "score-part", id=part_id)
    ET.SubElement(sp, "part-name").text = name
    part = ET.SubElement(root, "part", id=part_id)
    ki = 0
    for mi, m in enumerate(measures):
        me = ET.SubElement(part, "measure", number=str(m.get("number") or mi + 1))
        if mi == 0 or any(k["tick"] == m["tick"] for k in keys):
            at = ET.SubElement(me, "attributes")
            if mi == 0: ET.SubElement(at, "divisions").text = "480"
            k = [x for x in keys if x["tick"] <= m["tick"]][-1]
            ET.SubElement(ET.SubElement(at, "key"), "fifths").text = str(k["sharps"])
            if mi == 0:
                tm = ET.SubElement(at, "time")
                ET.SubElement(tm, "beats").text = str(m["num"]); ET.SubElement(tm, "beat-type").text = str(m["den"])
                c = ET.SubElement(at, "clef"); ET.SubElement(c, "sign").text = clef[0]; ET.SubElement(c, "line").text = clef[1]
                if clef[0] == "G" and len(clef) > 2:
                    ET.SubElement(c, "clef-octave-change").text = "-1"
        for it in [x for x in items if m["tick"] <= x["tick"] < m["tick"] + m["len"]]:
            n = ET.SubElement(me, "note")
            if it["midi"] is None:
                ET.SubElement(n, "rest")
            else:
                step, alter, octave = pitch_xml(it["midi"], it["tpc"])
                p = ET.SubElement(n, "pitch")
                ET.SubElement(p, "step").text = step
                if alter: ET.SubElement(p, "alter").text = str(alter)
                ET.SubElement(p, "octave").text = str(octave)
            ET.SubElement(n, "duration").text = str(it["ticks"])
            if it.get("tieBack"): ET.SubElement(n, "tie", type="stop")
            if it["tieNext"]: ET.SubElement(n, "tie", type="start")
            ET.SubElement(n, "voice").text = "1"
            t, dots = type_of(it["ticks"])
            ET.SubElement(n, "type").text = t
            for _ in range(dots): ET.SubElement(n, "dot")
            if it.get("tieBack") or it["tieNext"]:
                nt = ET.SubElement(n, "notations")
                if it.get("tieBack"): ET.SubElement(nt, "tied", type="stop")
                if it["tieNext"]: ET.SubElement(nt, "tied", type="start")


def opt_arg(name, default):
    if name in sys.argv:
        return int(sys.argv[sys.argv.index(name) + 1])
    return default


def main():
    seed, nvar = opt_arg("--seed", 7), opt_arg("--variants", 1)
    args, skip = [], False
    for a in sys.argv[1:]:
        if skip: skip = False; continue
        if a in ("--seed", "--variants"): skip = True; continue
        args.append(a)
    src, dst = args[0], args[1]
    species = (args[2] if len(args) > 2 else "free,florid,2:1").split(",")
    tree = load_xml(src)
    parts, staves, measures, keys = read_score(tree)
    keys_sorted = sorted(staves.keys())
    mel_key = keys_sorted[0]
    bass_key = keys_sorted[1] if len(keys_sorted) > 1 else None
    end = measures[-1]["tick"] + measures[-1]["len"]
    root = tree.getroot()
    npart = 0
    for sp in species:
        results = []
        for v in range(nvar):
            inp = {"melody": staves[mel_key], "bass": staves[bass_key] if bass_key else [],
                   "measures": [{k: m[k] for k in ("tick", "len", "num", "den", "isFirst")} for m in measures],
                   "keys": keys, "start": 0, "end": end,
                   "options": {"species": sp, "seed": seed + v, "sameStaff": False}}
            out = subprocess.run(["node", os.path.join(HERE, "run_on_json.js")], input=json.dumps(inp),
                                 capture_output=True, text=True, check=True)
            res = json.loads(out.stdout)
            if not any(r["report"]["signature"] == res["report"]["signature"] for _, r in results):
                results.append((seed + v, res))
        results.sort(key=lambda x: (x[1]["report"]["parallels"], -x[1]["report"]["quality"], x[0]))
        for rank, (sd, res) in enumerate(results, 1):
            items, rep = res["items"], res["report"]
            for a, b in zip(items, items[1:]):
                if a["tieNext"]: b["tieBack"] = True
            lo, hi = rep["range"]
            clef = ("G", "2") if (lo + hi) / 2 >= 60 else (("G", "2", "8") if (lo + hi) / 2 >= 52 else ("F", "4"))
            npart += 1
            name = "Contrappunto (%s)" % LABEL.get(sp, sp) + ((" %d – seme %d" % (rank, sd)) if nvar > 1 else "")
            add_part(root, "PCP%d" % npart, name, items, measures, keys, clef)
            print("%-7s seme %-5d qualità %6.2f  tonalità %s, ruolo %s, %d note, passi/salti %d/%d, contrario/simile %d/%d, parallele %d, culmini %d, %d ms"
                  % (sp, sd, rep["quality"], rep["key"], rep["role"], rep["notes"], rep["steps"], rep["leaps"], rep["contrary"],
                     rep["similar"], rep["parallels"], rep["climaxCount"], rep["ms"]))
            for d in rep["details"]: print("   !", d)
    data = ET.tostring(root, encoding="utf-8", xml_declaration=True)
    with zipfile.ZipFile(dst, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("META-INF/container.xml", '<?xml version="1.0" encoding="UTF-8"?><container><rootfiles>'
                   '<rootfile full-path="score.xml" media-type="application/vnd.recordare.musicxml+xml"/></rootfiles></container>')
        z.writestr("score.xml", data)
    print("scritto", dst)


if __name__ == "__main__":
    main()
