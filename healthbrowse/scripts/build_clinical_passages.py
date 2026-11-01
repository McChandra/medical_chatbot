"""Build the source-excerpt asset without network calls or third-party dependencies.

Reproduce from https://github.com/abachaa/MedQuAD at the commit pinned below:
python scripts/build_clinical_passages.py /path/to/MedQuAD
The selected offsets refer to the XML answer after collapsing whitespace. Selection
is editorial, not clinical validation. Rows are limited to named entities and
descriptive content. Missing sections are intentionally empty. The three subsets
whose answers were removed for copyright reasons are excluded.
"""
import argparse
import json
from pathlib import Path
import subprocess
import xml.etree.ElementTree as ET

COMMIT = "577bd37b96c02d1833b2c9eed2de9f96964e96cb"
REPO = "https://github.com/abachaa/MedQuAD"
ATTRIBUTION = ("MedQuAD, Asma Ben Abacha and Dina Demner-Fushman (2019), "
               "A Question-Entailment Approach to Question Answering, "
               "doi:10.1186/s12859-019-3119-4. Excerpt selected and whitespace normalized.")
TITLES = {
    1: "Nosology and classification", 2: "Epidemiology and etiology",
    3: "Mechanism and pathophysiology", 4: "Symptoms and clinical findings",
    5: "Diagnostic tests", 6: "Risk and prognosis",
    7: "Therapeutic classes", 8: "Trials and evidence",
}

# Topic, section, source document, question ID, expected focus, [start, end).
SELECTION = [
    ('Age-related Macular Degeneration', 1, '7_SeniorHealth_QA/0000001.xml', '0000001-1', 'Age-related Macular Degeneration', 0, 117),
    ('Age-related Macular Degeneration', 2, '3_GHR_QA/0000027.xml', '0000027-4', 'age-related macular degeneration', 0, 155),
    ('Age-related Macular Degeneration', 4, '7_SeniorHealth_QA/0000001.xml', '0000001-18', 'Age-related Macular Degeneration', 0, 63),
    ("Alzheimer's Disease", 1, '6_NINDS_QA/0000017.xml', '0000017-1', "Alzheimer's Disease", 0, 111),
    ("Alzheimer's Disease", 4, '7_SeniorHealth_QA/0000004.xml', '0000004-3', "Alzheimer's Disease", 0, 160),
    ('Asthma', 1, '4_MPlus_Health_Topics_QA/0000065.xml', '0000065-1', 'Asthma', 0, 118),
    ('Asthma', 5, '8_NHLBI_QA_XML/0000010.xml', '0000010-5', 'Asthma', 0, 124),
    ('Asthma', 2, '8_NHLBI_QA_XML/0000010.xml', '0000010-2', 'Asthma', 0, 147),
    ('Asthma', 4, '8_NHLBI_QA_XML/0000010.xml', '0000010-1', 'Asthma', 99, 232),
    ('Breast Cancer', 1, '3_GHR_QA/0000137.xml', '0000137-1', 'breast cancer', 0, 124),
    ('Breast Cancer', 5, '1_CancerGov_QA/0000027_1.xml', '0000027_1-6', 'Breast Cancer', 0, 84),
    ('Breast Cancer', 2, '1_CancerGov_QA/0000027_1.xml', '0000027_1-4', 'Breast Cancer', 0, 72),
    ('Breast Cancer', 4, '1_CancerGov_QA/0000027_1.xml', '0000027_1-5', 'Breast Cancer', 0, 139),
    ('Colorectal Cancer', 1, '4_MPlus_Health_Topics_QA/0000221.xml', '0000221-1', 'Colorectal Cancer', 0, 133),
    ('Colorectal Cancer', 6, '7_SeniorHealth_QA/0000010.xml', '0000010-17', 'Colorectal Cancer', 0, 140),
    ('Diabetes', 1, '4_MPlus_Health_Topics_QA/0000266.xml', '0000266-1', 'Diabetes', 0, 87),
    ('Diabetes', 4, '7_SeniorHealth_QA/0000015.xml', '0000015-15', 'Diabetes', 0, 170),
    ('Diabetic Retinopathy', 1, '7_SeniorHealth_QA/0000016.xml', '0000016-6', 'Diabetic Retinopathy', 85, 209),
    ('Diabetic Retinopathy', 4, '7_SeniorHealth_QA/0000016.xml', '0000016-3', 'Diabetic Retinopathy', 0, 54),
    ('Heart Attack', 1, '8_NHLBI_QA_XML/0000058.xml', '0000058-1', 'Heart Attack', 7, 149),
    ('Heart Attack', 5, '8_NHLBI_QA_XML/0000058.xml', '0000058-6', 'Heart Attack', 0, 127),
    ('Heart Attack', 6, '8_NHLBI_QA_XML/0000058.xml', '0000058-4', 'Heart Attack', 0, 114),
    ('Heart Attack', 4, '8_NHLBI_QA_XML/0000058.xml', '0000058-5', 'Heart Attack', 0, 108),
    ('Heart Failure', 1, '4_MPlus_Health_Topics_QA/0000446.xml', '0000446-1', 'Heart Failure', 0, 182),
    ('Heart Failure', 5, '8_NHLBI_QA_XML/0000061.xml', '0000061-6', 'Heart Failure', 0, 195),
    ('Heart Failure', 4, '7_SeniorHealth_QA/0000034.xml', '0000034-13', 'Heart Failure', 0, 173),
    ('Hemochromatosis', 1, '4_MPlus_Health_Topics_QA/0000454.xml', '0000454-1', 'Hemochromatosis', 0, 125),
    ('Hemochromatosis', 5, '8_NHLBI_QA_XML/0000067.xml', '0000067-6', 'Hemochromatosis', 0, 145),
    ('Hemochromatosis', 4, '8_NHLBI_QA_XML/0000067.xml', '0000067-5', 'Hemochromatosis', 0, 158),
    ('High Blood Cholesterol', 1, '7_SeniorHealth_QA/0000035.xml', '0000035-12', 'High Blood Cholesterol', 0, 68),
    ('High Blood Cholesterol', 5, '8_NHLBI_QA_XML/0000070.xml', '0000070-5', 'High Blood Cholesterol', 0, 175),
    ('High Blood Cholesterol', 6, '7_SeniorHealth_QA/0000035.xml', '0000035-17', 'High Blood Cholesterol', 31, 74),
    ('High Blood Cholesterol', 4, '8_NHLBI_QA_XML/0000070.xml', '0000070-4', 'High Blood Cholesterol', 0, 129),
    ('High Blood Pressure', 1, '7_SeniorHealth_QA/0000036.xml', '0000036-1', 'High Blood Pressure', 0, 126),
    ('High Blood Pressure', 5, '7_SeniorHealth_QA/0000036.xml', '0000036-5', 'High Blood Pressure', 110, 207),
    ('Leukemia', 1, '7_SeniorHealth_QA/0000040.xml', '0000040-9', 'Leukemia', 0, 107),
    ('Leukemia', 5, '7_SeniorHealth_QA/0000040.xml', '0000040-15', 'Leukemia', 62, 233),
    ('Leukemia', 4, '7_SeniorHealth_QA/0000040.xml', '0000040-3', 'Leukemia', 0, 195),
    ('Lung Cancer', 1, '1_CancerGov_QA/0000032_3.xml', '0000032_3-1', 'Lung Cancer', 13, 104),
    ('Lung Cancer', 5, '7_SeniorHealth_QA/0000043.xml', '0000043-30', 'Lung Cancer', 0, 116),
    ('Lung Cancer', 2, '3_GHR_QA/0000608.xml', '0000608-4', 'lung cancer', 0, 166),
    ('Lung Cancer', 4, '7_SeniorHealth_QA/0000043.xml', '0000043-3', 'Lung Cancer', 26, 91),
    ('Osteoporosis', 1, '4_MPlus_Health_Topics_QA/0000669.xml', '0000669-1', 'Osteoporosis', 0, 126),
    ("Parkinson's Disease", 1, '4_MPlus_Health_Topics_QA/0000692.xml', '0000692-1', "Parkinson's Disease", 0, 155),
    ("Parkinson's Disease", 2, '3_GHR_QA/0000773.xml', '0000773-4', 'Parkinson disease', 0, 196),
    ('Prostate Cancer', 1, '1_CancerGov_QA/0000036_1.xml', '0000036_1-1', 'Prostate Cancer', 13, 112),
    ('Prostate Cancer', 5, '1_CancerGov_QA/0000036_1.xml', '0000036_1-3', 'Prostate Cancer', 0, 97),
    ('Prostate Cancer', 2, '3_GHR_QA/0000836.xml', '0000836-4', 'prostate cancer', 0, 174),
    ('Prostate Cancer', 4, '1_CancerGov_QA/0000036_1.xml', '0000036_1-2', 'Prostate Cancer', 0, 168),
    ('Psoriasis', 1, '4_MPlus_Health_Topics_QA/0000753.xml', '0000753-1', 'Psoriasis', 0, 237),
    ('Psoriasis', 5, '7_SeniorHealth_QA/0000059.xml', '0000059-14', 'Psoriasis', 0, 93),
    ('Psoriasis', 4, '7_SeniorHealth_QA/0000059.xml', '0000059-3', 'Psoriasis', 0, 185),
    ('Shingles', 1, '4_MPlus_Health_Topics_QA/0000812.xml', '0000812-1', 'Shingles', 0, 156),
    ('Shingles', 6, '7_SeniorHealth_QA/0000062.xml', '0000062-13', 'Shingles', 0, 75),
    ('Shingles', 4, '7_SeniorHealth_QA/0000062.xml', '0000062-4', 'Shingles', 40, 237),
    ('Skin Cancer', 1, '7_SeniorHealth_QA/0000063.xml', '0000063-12', 'Skin Cancer', 0, 69),
    ('Skin Cancer', 5, '1_CancerGov_QA/0000028_1.xml', '0000028_1-3', 'Skin Cancer', 0, 127),
    ('Skin Cancer', 6, '1_CancerGov_QA/0000028_1.xml', '0000028_1-2', 'Skin Cancer', 0, 112),
    ('Stroke', 1, '6_NINDS_QA/0000261.xml', '0000261-1', 'Stroke', 0, 182),
    ('Stroke', 5, '8_NHLBI_QA_XML/0000124.xml', '0000124-7', 'Stroke', 0, 125),
    ('Stroke', 6, '8_NHLBI_QA_XML/0000124.xml', '0000124-5', 'Stroke', 0, 177),
    ('Stroke', 4, '8_NHLBI_QA_XML/0000124.xml', '0000124-6', 'Stroke', 0, 57),
    ('Age-related Macular Degeneration', 3, '7_SeniorHealth_QA/0000001.xml', '0000001-10', 'Age-related Macular Degeneration', 0, 92),
    ("Alzheimer's Disease", 3, '7_SeniorHealth_QA/0000004.xml', '0000004-1', "Alzheimer's Disease", 4450, 4535),
    ("Alzheimer's Disease", 3, '6_NINDS_QA/0000017.xml', '0000017-1', "Alzheimer's Disease", 1151, 1254),
    ('Asthma', 3, '8_NHLBI_QA_XML/0000010.xml', '0000010-1', 'Asthma', 673, 735),
    ('Asthma', 3, '8_NHLBI_QA_XML/0000010.xml', '0000010-1', 'Asthma', 1045, 1113),
    ('Breast Cancer', 3, '3_GHR_QA/0000137.xml', '0000137-3', 'breast cancer', 404, 485),
    ('Breast Cancer', 6, '3_GHR_QA/0000137.xml', '0000137-3', 'breast cancer', 714, 883),
    ('Colorectal Cancer', 3, '7_SeniorHealth_QA/0000010.xml', '0000010-9', 'Colorectal Cancer', 202, 267),
    ('Diabetes', 3, '4_MPlus_Health_Topics_QA/0000266.xml', '0000266-1', 'Diabetes', 126, 210),
    ('Diabetes', 3, '4_MPlus_Health_Topics_QA/0000266.xml', '0000266-1', 'Diabetes', 355, 411),
    ('Diabetic Retinopathy', 3, '7_SeniorHealth_QA/0000016.xml', '0000016-2', 'Diabetic Retinopathy', 595, 698),
    ('Heart Attack', 2, '7_SeniorHealth_QA/0000033.xml', '0000033-3', 'Heart Attack', 1415, 1545),
    ('Heart Attack', 3, '7_SeniorHealth_QA/0000033.xml', '0000033-1', 'Heart Attack', 311, 391),
    ('Heart Failure', 2, '8_NHLBI_QA_XML/0000061.xml', '0000061-3', 'Heart Failure', 0, 76),
    ('Heart Failure', 3, '7_SeniorHealth_QA/0000034.xml', '0000034-1', 'Heart Failure', 1126, 1265),
    ('Hemochromatosis', 2, '5_NIDDK_QA/0000185.xml', '0000185-2', 'Hemochromatosis', 1197, 1310),
    ('Hemochromatosis', 3, '8_NHLBI_QA_XML/0000067.xml', '0000067-1', 'Hemochromatosis', 241, 359),
    ('Hemochromatosis', 6, '8_NHLBI_QA_XML/0000067.xml', '0000067-1', 'Hemochromatosis', 2083, 2159),
    ('High Blood Cholesterol', 3, '7_SeniorHealth_QA/0000035.xml', '0000035-1', 'High Blood Cholesterol', 1939, 2039),
    ('High Blood Cholesterol', 3, '7_SeniorHealth_QA/0000035.xml', '0000035-1', 'High Blood Cholesterol', 2133, 2206),
    ('High Blood Pressure', 2, '7_SeniorHealth_QA/0000036.xml', '0000036-2', 'High Blood Pressure', 1740, 1841),
    ('High Blood Pressure', 3, '8_NHLBI_QA_XML/0000071.xml', '0000071-1', 'High Blood Pressure', 2145, 2261),
    ('Leukemia', 3, '7_SeniorHealth_QA/0000040.xml', '0000040-9', 'Leukemia', 174, 288),
    ('Lung Cancer', 3, '3_GHR_QA/0000608.xml', '0000608-3', 'lung cancer', 448, 527),
    ("Parkinson's Disease", 3, '3_GHR_QA/0000773.xml', '0000773-3', 'Parkinson disease', 1047, 1159),
    ("Parkinson's Disease", 3, '7_SeniorHealth_QA/0000052.xml', '0000052-2', "Parkinson's Disease", 1707, 1872),
    ('Prostate Cancer', 3, '3_GHR_QA/0000836.xml', '0000836-3', 'prostate cancer', 447, 530),
    ('Prostate Cancer', 6, '3_GHR_QA/0000836.xml', '0000836-3', 'prostate cancer', 762, 933),
    ('Psoriasis', 3, '7_SeniorHealth_QA/0000059.xml', '0000059-1', 'Psoriasis', 282, 399),
    ('Shingles', 6, '7_SeniorHealth_QA/0000062.xml', '0000062-2', 'Shingles', 1114, 1196),
    ('Shingles', 3, '7_SeniorHealth_QA/0000062.xml', '0000062-12', 'Shingles', 642, 729),
    ('Skin Cancer', 2, '7_SeniorHealth_QA/0000063.xml', '0000063-2', 'Skin Cancer', 636, 701),
    ('Skin Cancer', 3, '7_SeniorHealth_QA/0000063.xml', '0000063-1', 'Skin Cancer', 1970, 2135),
    ('Stroke', 3, '7_SeniorHealth_QA/0000066.xml', '0000066-1', 'Stroke', 1986, 2096),
    ('Stroke', 3, '8_NHLBI_QA_XML/0000124.xml', '0000124-1', 'Stroke', 149, 228),
    ('Stroke', 6, '8_NHLBI_QA_XML/0000124.xml', '0000124-1', 'Stroke', 627, 704),
    ('Leukemia', 1, '7_SeniorHealth_QA/0000040.xml', '0000040-10', 'Leukemia', 0, 34),
    ('Leukemia', 1, '7_SeniorHealth_QA/0000040.xml', '0000040-11', 'Leukemia', 0, 161),
    ('Leukemia', 2, '7_SeniorHealth_QA/0000040.xml', '0000040-13', 'Leukemia', 0, 205),
    ('Leukemia', 4, '7_SeniorHealth_QA/0000040.xml', '0000040-14', 'Leukemia', 0, 303),
    ('Leukemia', 7, '7_SeniorHealth_QA/0000040.xml', '0000040-18', 'Leukemia', 0, 210),
    ('Leukemia', 7, '7_SeniorHealth_QA/0000040.xml', '0000040-20', 'Leukemia', 0, 72),
    ('Leukemia', 8, '7_SeniorHealth_QA/0000040.xml', '0000040-6', 'Leukemia', 73, 213),
    ('Leukemia', 8, '7_SeniorHealth_QA/0000040.xml', '0000040-23', 'Leukemia', 232, 348),
    ('Leukemia', 6, '1_CancerGov_QA/0000001_2.xml', '0000001_2-6', 'Adult Acute Myeloid Leukemia', 155, 205),
    ('Leukemia', 2, '1_CancerGov_QA/0000001_2.xml', '0000001_2-2', 'Adult Acute Myeloid Leukemia', 0, 101),
    ('Leukemia', 5, '1_CancerGov_QA/0000001_2.xml', '0000001_2-4', 'Adult Acute Myeloid Leukemia', 1196, 1498),
    ('Leukemia', 5, '1_CancerGov_QA/0000001_2.xml', '0000001_2-4', 'Adult Acute Myeloid Leukemia', 1501, 1744),
]


def build(corpus):
    commit = subprocess.check_output(["git", "-C", str(corpus), "rev-parse", "HEAD"], text=True).strip()
    if commit != COMMIT:
        raise ValueError("MedQuAD revision differs from the reviewed source revision")
    catalog = {}
    for topic, deck, filename, qid, focus, start, end in SELECTION:
        if filename.split("_", 1)[0] not in {str(i) for i in range(1, 10)}:
            raise ValueError("Prohibited source collection")
        # Read the pinned Git object so local edits cannot change the selected passage.
        raw = subprocess.check_output(["git", "-C", str(corpus), "show", f"{COMMIT}:{filename}"])
        document = ET.fromstring(raw)
        if document.findtext("Focus") != focus:
            raise ValueError(f"Unexpected entity in {filename}")
        pair = next(p for p in document.findall(".//QAPair") if p.find("Question").get("qid") == qid)
        answer = " ".join(pair.findtext("Answer").split())
        text = answer[start:end]
        if len(text) != end - start or not text.endswith((".", "!", "?")):
            raise ValueError(f"Incomplete passage {filename}#{qid}")
        catalog.setdefault(topic, []).append({
            "deck": deck, "title": TITLES[deck], "text": text, "url": document.get("url"),
            "record": filename + "#" + qid, "focus": focus,
            "sourceRecord": f"{REPO}/blob/{COMMIT}/{filename}",
            "attribution": ATTRIBUTION,
            "license": "https://creativecommons.org/licenses/by/4.0/",
            "vintage": "Historical MedQuAD excerpt. Repository snapshot 2023-10-17; source publication date unverified.",
        })
    return catalog


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("corpus", type=Path)
    parser.add_argument("--output", type=Path, default=Path(__file__).resolve().parents[1] / "dist/clinical-passages.json")
    args = parser.parse_args()
    args.output.write_text(json.dumps(build(args.corpus), indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
