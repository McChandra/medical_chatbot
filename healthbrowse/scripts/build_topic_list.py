"""Build the outbound term allowlist from MedQuAD focus labels only."""
import json
import re
import sys
from pathlib import Path
from xml.etree import ElementTree

root = Path(sys.argv[1])
names = set()
for path in root.glob("*/*.xml"):
    focus = (ElementTree.parse(path).getroot().findtext("Focus") or "").strip()
    if re.fullmatch(r"[A-Za-z][A-Za-z0-9 '\-]{1,84}", focus):
        names.add(focus)
out = Path(__file__).resolve().parents[1] / "dist" / "topic-list.json"
out.write_text(json.dumps(sorted(names, key=str.casefold), ensure_ascii=False))
