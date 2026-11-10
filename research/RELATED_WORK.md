# Phase V: initial literature review and research framing

Search date: 10 November 2026. This is a targeted primary-source review and a plan for the full review, not a completed systematic review or proof of novelty. Search engines were used to locate original papers, publisher records, ACL/NeurIPS proceedings, NLM records and author-maintained code. Secondary leaderboard/blog claims were excluded from the synthesis. No patient treatment recommendations are derived here.

## Evidence map

| Primary source | Relevant finding or method | Consequence for this project |
| --- | --- | --- |
| Ben Abacha & Demner-Fushman (2019), [A question-entailment approach to question answering](https://doi.org/10.1186/s12859-019-3119-4) | Introduces MedQuAD and question-entailment-based answer retrieval from medical Q/A sources. The published collection has 47,457 pairs; answer availability and reuse restrictions differ across subsets. | Cite the original task and provenance. Our answer-bearing subset is smaller and must not be represented as the complete original benchmark. Same-focus matching is not the original entailment task. |
| Thakur et al. (2021), [BEIR](https://datasets-benchmarks-proceedings.neurips.cc/paper/2021/hash/65b9eea6e1cc6bb9f0cd2a47751a186f-Abstract-round2.html) | Evaluates heterogeneous retrieval tasks with lexical, dense and reranking systems; highlights generalization differences and BM25 as a robust baseline. | Include BM25 and compare on identical frozen queries, corpus and judgments. Their results do not predict which system wins on this MedQuAD protocol. |
| Lewis, Stenetorp & Riedel (2021), [Question and Answer Test-Train Overlap in Open-Domain Question Answering Datasets](https://aclanthology.org/2021.eacl-main.86/) | Separates memorization, repeated questions/answers and novel-question/answer generalization. Aggregate scores can obscure these distinctions. | Report duplicate-answer and disease overlap explicitly. The broad concern about overlap is established prior work, so it is not a novel contribution here. |
| Dror et al. (2018), [The Hitchhiker's Guide to Testing Statistical Significance in NLP](https://aclanthology.org/P18-1128/) | Discusses matching significance-test choices to task, metric and experimental design. | Pair systems on query IDs, define independent sampling units, and predeclare comparison families. Overlapping marginal confidence intervals are not a substitute for paired testing. |
| Cormack, Clarke & Büttcher (2009), [Reciprocal rank fusion outperforms Condorcet and individual rank learning methods](https://doi.org/10.1145/1571941.1572114) | Studies fusion of multiple rankings through reciprocal ranks. | Use an explicit RRF control with fixed constant and retrieval depth. Label lexical fusion separately from BM25+dense hybrid. Do not import the paper's performance claim into our results. |
| [MedCPT: Contrastive Pre-trained Transformers with large-scale PubMed search logs for zero-shot biomedical information retrieval](https://pubmed.ncbi.nlm.nih.gov/37930897/) (2023); [NCBI implementation](https://github.com/ncbi/MedCPT) | Provides a biomedical retriever with separate query/article encoders and a reranker, initialized from PubMedBERT. Official usage uses CLS representations. | Test a retrieval-trained biomedical encoder instead of treating BioBERT/PubMedBERT as an answer generator. Article retrieval training is not evidence of consumer-health question-answering validity. Pin both encoder revisions and document truncation. |
| Gao et al. (2023), [Enabling Large Language Models to Generate Text with Citations](https://aclanthology.org/2023.emnlp-main.398/) | ALCE separates generated-answer correctness, fluency and citation quality, and evaluates citation support. | Exact URL/quote identity is only one layer. Our provenance checks cannot be called a complete hallucination detector. A separate supported-claim evaluation remains necessary. |
| Ben Abacha et al. (2019), [Overview of the MEDIQA 2019 Shared Task](https://aclanthology.org/W19-5039/) | Distinguishes medical natural-language inference, question entailment and question answering tasks. | Evaluate the requested construct directly: answering a question is not equivalent to recognizing its disease entity. Consider external medical QA data only after verifying its task and licensing. |

## Search log and limitations

| Search family | Example search strings | Screening outcome |
| --- | --- | --- |
| Medical QA provenance | `MedQuAD Ben Abacha Demner Fushman 2019 question answering`; `MEDIQA 2019 question entailment` | Original dataset paper and task overview retained |
| Retrieval controls | `BEIR benchmark heterogeneous retrieval BM25`; `Reciprocal rank fusion Cormack Clarke Buettcher 2009` | Original proceedings retained; derivative benchmark summaries excluded |
| Biomedical encoders | `MedCPT contrastive pre trained transformers biomedical retrieval NCBI` | NLM publication record and NCBI code retained; duplicate preprint record not treated as another independent study |
| Leakage and evaluation | `question answer test train overlap evaluation`; `statistical significance tests paired bootstrap information retrieval` | EACL overlap paper and ACL testing paper retained |
| Citation support | `ALCE enabling large language models generate text citations 2023` | Original ACL paper retained |

Publisher/abstract records and the relevant implementation guidance were inspected. This pass does not claim exhaustive full-text extraction, complete forward/backward citation screening, a PRISMA-compliant flow, or independent dual screening. Database searches in PubMed, ACL Anthology, ACM Digital Library and IEEE Xplore should be exported and deduplicated for the full review, with query dates, exact syntax, exclusion reasons and versioned extraction sheets. Include later replication/criticism and non-MedQuAD consumer-health evidence. Do not invent search counts or claim that an unobserved paper does not exist.

## Revised manuscript position

Working title: **When disease-label matching overstates answer retrieval: an evaluation-validity study of provenance-gated medical search**.

The general problems of task proxies, train/test overlap, retrieval generalization and citation support already have substantial prior work. A potentially useful contribution is the *specific, reproducible interaction* of MedQuAD question templates, disease-label metrics, grouped splits and conservative excerpt gates. Whether that combination is novel remains open. The new lexical results illustrate the issue but cannot show superiority over unexecuted dense systems or establish human relevance.

Structure the manuscript around: task/construct definitions; source rights and provenance; split and annotation protocol; identical-query baselines and ablations; coverage-versus-relevance errors; verification false acceptances/rejections; uncertainty and threats to validity. Keep deployment architecture and business plans in implementation appendices. A performance paper requires the pending neural runs and independent judgments; a clinical claim additionally requires appropriate clinical study and governance.
