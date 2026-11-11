"""Extract public, topic-scoped educational passages. No generation or query persistence."""
import json
import os
import re
from pathlib import Path
from urllib.parse import urlsplit

DECKS = (
    "Clinical definition & nosology", "Epidemiology & etiology",
    "Pathophysiology & molecular biology", "Signs, symptoms & clinical presentation",
    "Diagnostic workup & biomarkers", "Staging, risk stratification & prognosis",
    "Therapeutics, pharmacology & management", "Clinical trials & emerging evidence",
)
TOPICS = (
    "Breast Cancer", "Prostate Cancer", "Stroke", "Skin Cancer", "Alzheimer's Disease",
    "Colorectal Cancer", "Lung Cancer", "High Blood Cholesterol", "Heart Attack",
    "Heart Failure", "High Blood Pressure", "Parkinson's Disease", "Leukemia",
    "Osteoporosis", "Shingles", "Diabetes", "Age-related Macular Degeneration",
    "Hemochromatosis", "Diabetic Retinopathy", "Psoriasis", "Asthma",
)
URGENT = re.compile(
    r"\b(emergency|suicid\w*|kill myself|overdose\w*|chest pain|severe bleeding|"
    r"can(?:not|'t|’t) breathe|difficulty breathing|unconscious|face droop\w*|"
    r"slurred speech|sudden weakness|seizure|not breathing)\b", re.I
)
PRIVATE = re.compile(
    r"@|\d{4,}|\b(?:DOB|MRN|SSN|patient ID|date of birth|name is|address is|"
    r"medical record|phone number|my name|patient named|born on)\b|"
    r"(?:\d[\s().+-]*){7,}|\b\d{1,4}[/.-]\d{1,2}[/.-]\d{1,4}\b", re.I
)
PERSONAL = re.compile(r"\b(i|i'm|my|mine|me|we|our|patient's|this patient|prescribe|dosage|dose|should take)\b", re.I)
WORDS = re.compile(r"[a-z]+")
STOP = set("a an the are is of for in on at to this that and do does what who how which give explain show describe tell about please common from it can may some people adults get why have with typical".split())
GROUPS = (
    ("symptoms", "symptom", "symptoms", "sign", "signs"),
    ("test", "test", "tests", "testing", "investigation", "investigations"),
    ("risk", "risk", "risks", "factor", "factors"),
    ("genetic", "genetic", "genetics", "gene", "genes", "hereditary", "inherited"),
    ("definition", "definition", "define", "overview", "summary"),
    ("treatment", "treatment", "treatments", "treat", "treated", "therapy", "therapies", "therapeutics"),
)
NORMAL = {word: group[0] for group in GROUPS for word in group[1:]}


def tokens(text):
    return {NORMAL.get(word, word) for word in WORDS.findall(text.casefold()) if word not in STOP}


def web_link(value):
    url = urlsplit(value)
    return url.scheme in {"https", "http"} and url.hostname and not url.username and not url.password


def read_passages(topic, deck):
    path = os.environ.get("MEDQUAD_PASSAGES_PATH")
    if not path:
        raise ValueError("Missing passage configuration.")
    rows = json.loads(Path(path).read_text(encoding="utf-8"))[topic]
    passages = []
    for row in rows:
        if row["deck"] != deck:
            continue
        if not all(isinstance(row.get(k), str) and row[k].strip()
                   for k in ("title", "text", "url", "record", "focus")):
            continue
        if web_link(row["url"]) and web_link(row.get("sourceRecord") or row["url"]):
            passages.append(row)
    return passages


def result(status, message, passages=()):
    return {"status": status, "message": message, "passages": [
        {field: row.get(field) for field in ("title", "text", "url", "record", "focus", "deck",
                                            "sourceRecord", "attribution", "license", "vintage")}
        for row in passages
    ]}


def answer(topic, deck, question):
    if URGENT.search(question):
        return result("urgent", "If someone may be in immediate danger, contact local emergency services now.")
    if PRIVATE.search(question):
        return result("privacy", "Remove names, contact details, identifiers and dates before asking an educational question.")
    if topic not in TOPICS or type(deck) is not int or not 1 <= deck <= len(DECKS):
        return result("invalid_context", "Choose a catalog topic and a numbered deck.")
    if PERSONAL.search(question):
        return result("personal", "This reader cannot assess an individual or make treatment decisions. Ask a qualified clinician.")
    if not question.strip() or len(question) > 500:
        return result("unsupported", "Ask a short educational question about the selected topic.")
    # A narrow educational vocabulary prevents arbitrary names or narratives reaching retrieval.
    allowed = tokens(topic + " " + " ".join(DECKS) + " cause causes causes inheritance "
                     "affect affects body identified identify organs prevention diagnosed diagnosis "
                     "risk factors signs tests testing examinations information overview summary "
                     "definition defined classify common type types differences research resources")
    wanted = tokens(question) - tokens(topic)
    if wanted - allowed:
        return result("unsupported", "Use a general question about the selected topic, such as its definition or symptoms.")
    # Do not load or transmit records for another topic or deck to fill a gap.
    try:
        passages = read_passages(topic, deck)
    except KeyError:
        passages = []
    except (OSError, ValueError, TypeError):
        return result("unavailable", "The local passage index is unavailable. Ask the operator to check its configuration.")
    matches = []
    for passage in passages:
        terms = tokens(passage["title"] + " " + passage["text"])
        # A heading is useful only for explicitly generic overview questions.
        if not wanted or wanted == {"definition"}:
            # An empty residual is not evidence: require a definition-like clause
            # naming the source focus in the actual body, not just a deck heading.
            definition = re.search(r"\b" + re.escape(passage['focus']) +
                                   r"\s+(?:is|are|refers to|means)\b", passage['text'], re.I)
            if deck == 1 and definition:
                matches.append(passage)
        elif wanted <= terms:
            matches.append(passage)
    if not matches:
        return result("unsupported", "No excerpt in this topic and deck supports this question.")
    return result("excerpt", "Related source excerpt. Inspect its original context and date before use.", matches[:2])
