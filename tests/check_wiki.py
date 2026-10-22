#!/usr/bin/env python3
"""
Checks the Wiki sources in docs/wiki/:  python3 tests/check_wiki.py
- every link to another page points to an existing page, every image exists;
- every page (except Home and the _Sidebar/_Footer) starts with the language line
  and links its counterpart in the other language, which links back;
- every page is listed in _Sidebar.md and Home.md.
"""
import os, re, sys

WIKI = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "docs", "wiki")
SPECIAL = {"Home", "_Sidebar", "_Footer"}
errors = []
pages = {f[:-3] for f in os.listdir(WIKI) if f.endswith(".md")}
link_re = re.compile(r"(!?)\[[^\]]*\]\(([^)\s]+)\)")


def text(p):
    return open(os.path.join(WIKI, p + ".md"), encoding="utf-8").read()


for p in sorted(pages):
    t = text(p)
    for img, target in link_re.findall(t):
        if re.match(r"^[a-z]+:", target) or target.startswith("#"):
            continue
        target = target.split("#")[0]
        if img or target.startswith("images/"):
            if not os.path.exists(os.path.join(WIKI, target)):
                errors.append("%s: missing image %s" % (p, target))
        elif target not in pages:
            errors.append("%s: link to a missing page %s" % (p, target))
    if p in SPECIAL:
        continue
    first = t.splitlines()[0] if t else ""
    others = [x for _, x in link_re.findall(first)]
    if len(others) != 1:
        errors.append("%s: the first line must be the language line with one link to the other language" % p)
        continue
    other = others[0]
    if other not in pages:
        errors.append("%s: counterpart %s does not exist" % (p, other))
    elif p not in [x for _, x in link_re.findall(text(other).splitlines()[0])]:
        errors.append("%s: counterpart %s does not link back" % (p, other))
    for idx in ("_Sidebar", "Home"):
        if "(%s)" % p not in text(idx):
            errors.append("%s: not listed in %s.md" % (p, idx))

for e in errors:
    print("ERROR:", e)
print("%d pages, %d images, %d errors" % (len(pages), len(os.listdir(os.path.join(WIKI, "images"))), len(errors)))
sys.exit(1 if errors else 0)
