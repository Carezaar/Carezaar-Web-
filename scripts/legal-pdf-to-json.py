"""Regenerate public/legal/*.json when the client sends a new Terms of Use or Privacy Policy:

    pdftohtml -xml -i -q -stdout "TERMS OF USE.pdf" > terms.xml && pdftotext "TERMS OF USE.pdf" terms.txt
    python3 scripts/legal-pdf-to-json.py terms.xml terms.txt public/legal/terms-of-use.json "Terms of Use"

and copy the PDF to public/legal/terms-of-use.pdf (same for privacy-policy).

`pdftohtml -xml -i` output -> {"title", "blocks": [{"t": "h"|"p"|"li", "r": [[text, bold], ...]}]}
for the in-app reader. Paragraph breaks come from vertical gaps; headings are lines that are
entirely bold (or centred and short); bold runs inside paragraphs are kept. The word sequence is
checked against `pdftotext` so nothing is dropped, added or reordered."""
import html, json, re, sys, xml.etree.ElementTree as ET
xml_path, txt_path, out, title = sys.argv[1:5]
ZW = "​﻿"
def clean(s): return re.sub(r"\s+", " ", "".join(c for c in s if c not in ZW))
tree = ET.parse(xml_path)
lines = []
for page in tree.getroot().iter("page"):
    pw = float(page.get("width"))
    for t in page.iter("text"):
        runs = []
        if t.text: runs.append([t.text, False])
        for child in t:
            runs.append(["".join(child.itertext()), child.tag == "b" or bool(child.findall(".//b"))])
            if child.tail: runs.append([child.tail, False])
        text = clean("".join(r[0] for r in runs)).strip()
        if not text: continue
        top, left, w, h = (float(t.get(k)) for k in ("top", "left", "width", "height"))
        lines.append({"page": int(page.get("number")), "top": top, "left": left, "w": w, "h": h, "pw": pw,
                      "runs": [[clean(r[0]), r[1]] for r in runs if clean(r[0])], "text": text})
END = (".", ":", ";", "?", "!", "”", '"', ")")
blocks = []
def new(kind, line):
    blocks.append({"t": kind, "r": [list(r) for r in line["runs"]]})
def add(line):
    b = blocks[-1]
    if b["r"] and not b["r"][-1][0].endswith(" "): b["r"][-1][0] += " "
    b["r"].extend(list(r) for r in line["runs"])
prev = None
for ln in lines:
    all_bold = all(r[1] for r in ln["runs"] if r[0].strip())
    centred = abs((ln["left"] + ln["w"] / 2) - ln["pw"] / 2) < 25 and ln["w"] < ln["pw"] * 0.6
    bullet = ln["text"][:1] in "•●◦▪"
    heading = (all_bold or centred) and len(ln["text"]) < 120 and not bullet
    gap = None if prev is None or prev["page"] != ln["page"] else ln["top"] - (prev["top"] + prev["h"])
    newpara = prev is None or bullet or heading or (gap is not None and gap > 0.6 * ln["h"])
    if prev is not None and prev["page"] != ln["page"]:
        # Page break: continue the paragraph unless it had ended.
        last = blocks[-1]
        newpara = bullet or heading or last["t"] == "h" or "".join(r[0] for r in last["r"]).rstrip().endswith(END)
    if not newpara and blocks and blocks[-1]["t"] == "h" and not heading:
        newpara = True
    if heading and blocks and blocks[-1]["t"] == "h" and prev is not None and gap is not None and gap <= 0.6 * ln["h"]:
        add(ln)            # a heading wrapped onto two lines
    elif newpara:
        new("h" if heading else "li" if bullet else "p", ln)
    else:
        add(ln)
    prev = ln
for b in blocks:
    b["r"] = [[r[0], r[1]] for r in b["r"]]
    if b["t"] == "li":
        b["r"][0][0] = b["r"][0][0].lstrip("•●◦▪ ")
    # merge neighbouring runs of the same weight; trim
    merged = []
    for r in b["r"]:
        if merged and merged[-1][1] == r[1]: merged[-1][0] += r[0]
        else: merged.append(r)
    for r in merged: r[0] = re.sub(r"\s+", " ", r[0])
    merged[0][0] = merged[0][0].lstrip(); merged[-1][0] = merged[-1][0].rstrip()
    b["r"] = [r for r in merged if r[0]]
words = lambda s: [w for w in re.findall(r"\S+", "".join(c for c in s if c not in ZW)) if w not in "•●◦▪"]
pdf_words = words(open(txt_path, encoding="utf-8").read())
out_words = words(" ".join(r[0] for b in blocks for r in b["r"]))
pdf_chars, out_chars = "".join(pdf_words), "".join(out_words)
if pdf_chars != out_chars:
    i = next(i for i, (a, b) in enumerate(zip(pdf_words, out_words)) if a != b) if any(a != b for a, b in zip(pdf_words, out_words)) else min(len(pdf_words), len(out_words))
    sys.exit(f"word mismatch at {i}: pdf {pdf_words[i-5:i+5]} vs out {out_words[i-5:i+5]} ({len(pdf_words)} vs {len(out_words)})")
json.dump({"title": title, "blocks": blocks}, open(out, "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print(out, len(blocks), "blocks;", len(out_chars), "characters identical to the PDF (whitespace aside);",
      sum(b["t"] == "h" for b in blocks), "headings,", sum(b["t"] == "li" for b in blocks), "list items")
