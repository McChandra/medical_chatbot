"""MQ-105: conservative, auditable medical-domain classification."""
from pathlib import Path
import re
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data" / "processed" / "medquad_unified_v1.csv"
OUTPUT = ROOT / "data" / "processed" / "medquad_unified_v2.csv"
AUDIT = ROOT / "data" / "processed" / "domain_classification_audit.csv"

# High-precision examples only; expand after human review.
RULES = {
    "Oncology": [r"\b(?:breast|prostate|colorectal|lung|skin) cancer\b", r"\bleukemia\b"],
    "Cardiology": [r"\bheart (?:attack|failure)\b", r"\bhigh blood pressure\b"],
    "Neurology": [r"\bstroke\b", r"\balzheimer'?s disease\b", r"\bparkinson'?s disease\b"],
    "Endocrinology": [r"\bdiabetes\b", r"\bosteoporosis\b"],
    "Pulmonology": [r"\b(?:copd|chronic obstructive pulmonary disease)\b"],
    "Nephrology": [r"\bkidney disease\b"],
    "Dermatology": [r"\bpsoriasis\b"],
    "Ophthalmology": [r"\b(?:cataract|glaucoma|macular degeneration|diabetic retinopathy)\b"],
}
ALIASES = {
    "skin": "Dermatology", "orthopaedics": "Orthopedics",
    "anaesthesia": "Anesthesiology", "ent": "Otolaryngology",
    "gynaecology & obstetrics": "Obstetrics and Gynecology",
    "medicine": "General Medicine",
    "social & preventive medicine": "Preventive Medicine",
}
UNKNOWN = {"", "unknown", "unclassified", "other", "nan"}

def normalize(value):
    label = str(value).strip()
    return ALIASES.get(label.casefold(), label)

def assign(topic):
    text = str(topic).casefold()
    hits = [domain for domain, patterns in RULES.items()
            if any(re.search(pattern, text) for pattern in patterns)]
    return hits[0] if len(hits) == 1 else None

def main():
    if not SOURCE.is_file():
        raise FileNotFoundError(f"Missing input: {SOURCE}")
    df = pd.read_csv(SOURCE, dtype="string", keep_default_na=False)
    required = {"record_id", "question", "domain", "topic", "source_dataset"}
    if missing := required - set(df.columns):
        raise ValueError(f"Missing required columns: {sorted(missing)}")
    if df["record_id"].duplicated().any():
        raise ValueError("Duplicate record_id values: resolve before proceeding.")

    df["domain_original"] = df["domain"]
    df["topic_original"] = df["topic"]
    df["domain_method"] = "unclassified"
    df["domain_confidence"] = ""  # no uncalibrated probabilities
    df["secondary_domain"] = ""

    source_labels = ~df["domain"].str.strip().str.casefold().isin(UNKNOWN)
    df.loc[source_labels, "domain"] = df.loc[source_labels, "domain"].map(normalize)
    df.loc[source_labels, "domain_method"] = "source_label"

    # MedQuAD topic maps only; never infer a specialty from a broad question alone.
    mask = (~source_labels) & df["source_dataset"].eq("MedQuAD")
    for topic, indices in df.loc[mask].groupby("topic", dropna=False).groups.items():
        domain = assign(topic)
        if domain:
            df.loc[indices, "domain"] = domain
            df.loc[indices, "domain_method"] = "topic_rule"

    remaining = df["domain_method"].eq("unclassified")
    df.loc[remaining, "domain"] = "Unclassified"

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(OUTPUT, index=False)
    audit = (df.groupby(["source_dataset", "domain_method", "domain"], dropna=False)
             .size().reset_index(name="records")
             .sort_values("records", ascending=False))
    audit.to_csv(AUDIT, index=False)
    print(f"Saved: {OUTPUT} ({len(df):,} rows)")
    print(f"Audit: {AUDIT}")
    print("\nClassification methods:")
    print(df["domain_method"].value_counts().to_string())
    print("\nUnclassified by source:")
    print(df.loc[remaining, "source_dataset"].value_counts().to_string())

if __name__ == "__main__":
    main()
