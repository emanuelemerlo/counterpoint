#!/usr/bin/env python3
"""
Builds the files of a plugin release.

  python3 tools/build_release.py [--expect-version X.Y.Z] [--out dist]

Writes to dist/:
  Contrappunto-X.Y.Z.zip   folder contrappunto/ (lower case) with the plugin, i18n/
                           and one readme per language (README.TXT, LEGGIMI.TXT, ...)
  README.TXT, LEGGIMI.TXT  the same readmes, to attach separately
  release-notes.md         notes of the version in every language (GitHub release body)

Languages are listed in release/readme/languages.json: for each one a template
(release/readme/<code>.txt), the name of the file in the zip and its changelog.
The version is read from `version:` in contrappunto.qml, the notes from the
`## X.Y.Z` section of each changelog. Stops with an error if the version does not
match --expect-version (the tag) or if the main changelog has no section for it.
"""
import argparse, datetime, glob, json, os, re, sys, textwrap, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PLUGIN_DIR = os.path.join(ROOT, "plugin", "Contrappunto")
PLUGIN_FILES = ["contrappunto.qml", "contrappunto_engine.js"]
# In the release the plugin folder is lower case (in the repository it stays plugin/Contrappunto).
RELEASE_DIR = "contrappunto"
REPO_URL = "https://github.com/emanuelemerlo/counterpoint"
WIKI_URL = REPO_URL + "/wiki"
README_DIR = os.path.join(ROOT, "release", "readme")
WIDTH = 78


def fail(msg):
    sys.stderr.write("ERROR: " + msg + "\n")
    sys.exit(1)


def warn(msg):
    sys.stderr.write("warning: " + msg + "\n")
    if os.environ.get("GITHUB_ACTIONS"):
        print("::warning::" + msg)


def plugin_version():
    src = open(os.path.join(PLUGIN_DIR, "contrappunto.qml"), encoding="utf-8").read()
    m = re.search(r'^\s*version:\s*"([^"]+)"', src, re.M)
    if not m:
        fail("version not found in contrappunto.qml")
    return m.group(1)


def changelog_sections(name):
    path = os.path.join(ROOT, name)
    if not os.path.exists(path):
        return []
    text = open(path, encoding="utf-8").read()
    parts = re.split(r"^## +(\S+)\s*$", text, flags=re.M)
    # parts = [preamble, ver1, body1, ver2, body2, ...]
    return [(parts[i], parts[i + 1].strip()) for i in range(1, len(parts), 2)]


def md_to_text(md, indent=""):
    """Simple Markdown (### headings, '-' lists, paragraphs) -> text at 78 columns."""
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
        line = re.sub(r"\[([^\]]*)\]\([^)]*\)", r"\1", line)
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


def plugin_files():
    """(path on disk, path in the zip) of every file of the plugin, i18n/ included."""
    files = [(os.path.join(PLUGIN_DIR, f), f) for f in PLUGIN_FILES]
    for f in sorted(glob.glob(os.path.join(PLUGIN_DIR, "i18n", "*.js"))):
        files.append((f, "i18n/" + os.path.basename(f)))
    for disk, _ in files:
        if not os.path.exists(disk):
            fail("missing plugin file " + os.path.relpath(disk, ROOT))
    return files


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--expect-version")
    ap.add_argument("--out", default=os.path.join(ROOT, "dist"))
    args = ap.parse_args()

    version = plugin_version()
    expect = (args.expect_version or "").lstrip("v")
    if expect and expect != version:
        fail("the tag says version %s but contrappunto.qml declares %s" % (expect, version))

    langs = json.load(open(os.path.join(README_DIR, "languages.json"), encoding="utf-8"))["languages"]
    main_sections = dict(changelog_sections(langs[0]["changelog"]))
    if version not in main_sections:
        fail("%s has no '## %s' section" % (langs[0]["changelog"], version))

    readmes, notes_md = [], []
    for lg in langs:
        sections = changelog_sections(lg["changelog"])
        notes = dict(sections).get(version)
        if not notes:
            warn("%s has no '## %s' section: using %s" % (lg["changelog"], version, langs[0]["changelog"]))
            notes, sections = main_sections[version], changelog_sections(langs[0]["changelog"])
        history = ["%s %s\n%s\n" % (lg["version_label"], ver, md_to_text(body, "  "))
                   for ver, body in sections if ver != version]
        tpl = open(os.path.join(README_DIR, lg["template"]), encoding="utf-8").read()
        text = (tpl.replace("{VERSION}", version)
                   .replace("{DATE}", datetime.date.today().strftime(lg.get("date_format", "%Y-%m-%d")))
                   .replace("{NOTES}", md_to_text(notes))
                   .replace("{HISTORY}", "\n".join(history) if history else lg["no_history"] + "\n")
                   .replace("{REPO_URL}", REPO_URL)
                   .replace("{WIKI_URL}", WIKI_URL))
        data = ("﻿" + text).replace("\r\n", "\n").replace("\n", "\r\n").encode("utf-8")
        readmes.append((lg["file"], data))
        install = lg["install"].replace("{VERSION}", version).replace("{WIKI_URL}", WIKI_URL)
        notes_md.append((lg, notes, install))

    os.makedirs(args.out, exist_ok=True)
    zip_path = os.path.join(args.out, "Contrappunto-%s.zip" % version)
    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        for disk, rel in plugin_files():
            z.write(disk, RELEASE_DIR + "/" + rel)
        for name, data in readmes:
            z.writestr(RELEASE_DIR + "/" + name, data)
    for name, data in readmes:
        with open(os.path.join(args.out, name), "wb") as f:
            f.write(data)

    # release notes: the main language in full, the others in a collapsible section
    body = []
    for i, (lg, notes, install) in enumerate(notes_md):
        block = notes + "\n\n" + install + "\n"
        if i == 0:
            body.append(block)
        else:
            body.append("<details><summary><b>%s</b></summary>\n\n%s\n</details>\n" % (lg["name"], block))
    with open(os.path.join(args.out, "release-notes.md"), "w", encoding="utf-8") as f:
        f.write("\n---\n\n".join(body))

    print("version", version)
    print("written:", zip_path, ", ".join(n for n, _ in readmes), "release-notes.md")
    if os.environ.get("GITHUB_OUTPUT"):
        with open(os.environ["GITHUB_OUTPUT"], "a") as f:
            f.write("version=%s\nzip=%s\nreadmes=%s\n" % (version, zip_path,
                    " ".join(os.path.join(args.out, n) for n, _ in readmes)))


if __name__ == "__main__":
    main()
