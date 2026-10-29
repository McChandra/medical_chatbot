
from pathlib import Path
import pandas as pd
import json

ROOT = Path(__file__).resolve().parents[1]
RAW = ROOT.parent / "data_collection"
PROCESSED = ROOT / "data" / "processed"

COLUMNS = [
    "record_id", "question", "answer", "long_answer",
    "domain", "topic", "context", "options", "answer_label",
    "source_dataset", "source_id", "source_reference",
    "task_type", "evidence_status", "split"
]

records = []

def clean(value):
    if pd.isna(value):
        return ""
    return str(value).strip()

def add_record(**kwargs):
    record = {col: "" for col in COLUMNS}
    record.update(kwargs)
    record["record_id"] = f"MQ-{len(records) + 1:07d}"
    record["evidence_status"] = "unreviewed"
    records.append(record)

# 1. MedQuAD: use existing cleaned collection
df = pd.read_csv(PROCESSED / "medquad_cleaned.csv")
for row in df.itertuples(index=False):
    add_record(
        question=clean(row.question),
        answer=clean(row.answer),
        long_answer=clean(row.answer),
        domain="Unclassified",
        topic=clean(row.focus_area),
        source_dataset="MedQuAD",
        source_reference=clean(row.source),
        task_type="patient_qa",
        split="unassigned"
    )

# 2. PubMedQA: preserve each original subset
pubmed_files = [
    "pubmedqa_train.csv",
    "pubmedqa_2_train.csv",
    "pubmedqa_3_train.csv"
]

for filename in pubmed_files:
    df = pd.read_csv(RAW / filename)

    for _, row in df.iterrows():
        decision = clean(row.get("final_decision", ""))
        add_record(
            question=clean(row["question"]),
            answer=decision,
            long_answer=clean(row["long_answer"]),
            context=clean(row["context"]),
            domain="Unclassified",
            source_dataset=filename.replace("_train.csv", ""),
            source_id=clean(row["pubid"]),
            task_type="research_qa",
            split="unassigned"
        )

# 3. MedQA USMLE
df = pd.read_csv(RAW / "medqa_usmle_4_options_train.csv")

for _, row in df.iterrows():
    add_record(
        question=clean(row["question"]),
        answer=clean(row["answer"]),
        options=clean(row["options"]),
        answer_label=clean(row["answer_idx"]),
        domain="Unclassified",
        topic=clean(row["meta_info"]),
        source_dataset="MedQA_USMLE",
        task_type="clinical_mcq",
        split="unassigned"
    )

# 4. MedMCQA
df = pd.read_csv(RAW / "medmcqa_aiims_neet_pg_train.csv")

option_cols = ["opa", "opb", "opc", "opd"]
labels = ["A", "B", "C", "D"]

for _, row in df.iterrows():
    options = [clean(row[c]) for c in option_cols]
    index = int(row["cop"])

    add_record(
        question=clean(row["question"]),
        answer=options[index],
        long_answer=clean(row["exp"]),
        domain=clean(row["subject_name"]) or "Unclassified",
        topic=clean(row["topic_name"]),
        options=json.dumps(dict(zip(labels, options))),
        answer_label=labels[index],
        source_dataset="MedMCQA",
        source_id=clean(row["id"]),
        task_type="medical_mcq",
        split="unassigned"
    )

# Save without modifying original files
unified = pd.DataFrame(records, columns=COLUMNS)

output = PROCESSED / "medquad_unified_v1.csv"
unified.to_csv(output, index=False)

print("Unified dataset saved:", output)
print("Total records:", len(unified))
print("\nRecords by source:")
print(unified["source_dataset"].value_counts())
print("\nDomain distribution:")
print(unified["domain"].value_counts().head(20))
