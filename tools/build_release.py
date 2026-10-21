#!/usr/bin/env python3
"""
Prepara i file di una release del plugin.

  python3 tools/build_release.py [--expect-version X.Y.Z] [--out dist]

Crea in dist/:
  Contrappunto-X.Y.Z.zip   cartella Contrappunto/ con i file del plugin e README.TXT
  README.TXT               lo stesso README.TXT, da allegare anche a parte
  release-notes.md         note della versione (corpo della release su GitHub)

La versione è letta da `version:` in contrappunto.qml; le note dalla sezione
`## X.Y.Z` di CHANGELOG.md. Si ferma con errore se la versione non coincide con
--expect-version (il tag) o se il changelog non ha la sezione.
"""
import argparse, datetime, os, re, sys, textwrap, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN_DIR = os.path.join(ROOT, "plugin", "Contrappunto")
PLUGIN_FILES = ["contrappunto.qml", "contrappunto_engine.js"]
REPO_URL = "https://github.com/emanuelemerlo/counterpoint"
WIDTH = 78


def fail(msg):
    sys.stderr.write("ERRORE: " + msg + "\n")
    sys.exit(1)


def plugin_version():
    src = open(os.path.join(PLUGIN_DIR, "contrappunto.qml"), encoding="utf-8").read()
    m = re.search(r'^\s*version:\s*"([^"]+)"', src, re.M)
    if not m:
        fail("version non trovata in contrappunto.qml")
    return m.group(1)


def changelog_sections():
    text = open(os.path.join(ROOT, "CHANGELOG.md"), encoding="utf-8").read()
    parts = re.split(r"^## +(\S+)\s*$", text, flags=re.M)
    # parts = [preambolo, ver1, corpo1, ver2, corpo2, ...]
    return [(parts[i], parts[i + 1].strip()) for i in range(1, len(parts), 2)]


def md_to_text(md, indent=""):
    """Markdown semplice (### titoli, elenchi '-', paragrafi) -> testo a 78 colonne."""
    out, item = [], None

    def flush():
        nonlocal item
        if item is not None:
            out.extend(textwrap.wrap(item, WIDTH - len(indent), initial_indent=" * ",
                                     subsequent_indent="   "))
            item = None

    for raw in md.splitlines():
        line = raw.strip()
        line = re.sub(r"`([^`]*)`", r"\1", line)
        line = re.sub(r"\*\*([^*]*)\*\*", r"\1", line)
        if not line:
            flush()
            continue
        if line.startswith("#"):
            flush()
            title = line.lstrip("#").strip()
            if out and out[-1] != "":
                out.append("")
            out.append(title)
            out.append("-" * len(title))
        elif line.startswith("- "):
            flush()
            item = line[2:]
        elif item is not None:
            item += " " + line
        else:
            out.extend(textwrap.wrap(line, WIDTH - len(indent)))
    flush()
    return "\n".join((indent + l) if l else "" for l in out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect-version")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    args = ap.parse_args()

    version = plugin_version()
    expect = (args.expect_version or "").lstrip("v")
    if expect and expect != version:
        fail("il tag indica la versione %s ma contrappunto.qml dichiara %s" % (expect, version))

    sections = changelog_sections()
    notes = dict(sections).get(version)
    if not notes:
        fail("CHANGELOG.md non ha una sezione '## %s'" % version)

    history = []
    for ver, body in sections:
        if ver == version:
            continue
        history.append("Versione " + ver + "\n" + md_to_text(body, "  ") + "\n")

    tpl = open(os.path.join(ROOT, "release", "README_TEMPLATE.txt"), encoding="utf-8").read()
    readme = (tpl.replace("{VERSION}", version)
                 .replace("{DATE}", datetime.date.today().strftime("%d/%m/%Y"))
                 .replace("{NOTES}", md_to_text(notes))
                 .replace("{HISTORY}", "\n".join(history) if history else "(nessuna versione precedente)\n")
                 .replace("{REPO_URL}", REPO_URL))
    readme_bytes = ("﻿" + readme).replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")

    os.makedirs(args.out, exist_ok=True)
    zip_path = os.path.join(args.out, "Contrappunto-%s.zip" % version)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for f in PLUGIN_FILES:
            z.write(os.path.join(PLUGIN_DIR, f), "Contrappunto/" + f)
        z.writestr("Contrappunto/README.TXT", readme_bytes)
    with open(os.path.join(args.out, "README.TXT"), "wb") as f:
        f.write(readme_bytes)
    with open(os.path.join(args.out, "release-notes.md"), "w", encoding="utf-8") as f:
        f.write(notes + "\n\n---\n**Installazione:** scarica `Contrappunto-%s.zip`, estrai la cartella "
                "`Contrappunto` in `Documenti/MuseScore4/Plugins/` e attiva il plugin da "
                "*Plugin → Gestisci plugin*. Istruzioni complete in `README.TXT`.\n" % version)

    print("versione", version)
    print("scritti:", zip_path, "README.TXT", "release-notes.md")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write("version=%s\nzip=%s\n" % (version, zip_path))


if __name__ == "__main__":
    main()
