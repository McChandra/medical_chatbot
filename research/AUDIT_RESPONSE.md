# Phase IV audit response

Input: **Phase IV Experimental Audit.docx**, supplied 10 November 2026. Its reported findings are distinguished from results executed for this revision. Implementation is isolated from the existing HealthBrowse UI pull request; no deployment, model activation or claim of clinical certification is made.

| Audit item | Change in this revision | Remaining evidence needed |
| --- | --- | --- |
| Missing experiment identity | Pinned Git-object loader; source/record/passage/code hashes; exact query IDs, offsets and split assignments; recorded configurations and package versions | Recover original notebook artifacts if exact historical replication is required |
| 16,359 versus 15,864 | Original four-column cleaning reproduces 16,359; new known-focus protocol has 16,345; notebook prominently marked historical/unverified | Explain or withdraw the 15,864 figure; no invented reconciliation |
| Topic Match@k presented as retrieval quality | Separate focus diagnostic, gold-record Hit/MRR and human-graded P/nDCG/pooled recall; string lookup control | Complete blinded relevance grading before relevance claims |
| Question-only splitting | Training helper defaults to connected disease/question/answer groups; explicit opt-in legacy protocol; transitive duplicates remain together | Ontology-aware synonyms, near-duplicates, external-source splits and pretraining exposure analysis |
| Missing lexical/hybrid/domain controls | Executable TF-IDF, BM25, lexical RRF, generic dense, MedCPT, sparse+dense RRF and cross-encoder adapters | Real-weight adapter smoke check passed; complete full-corpus neural comparisons and lock their runtime environment |
| Ablations | Run disease-prefix, vocabulary-size and provenance on/off controls; configure candidate depths 20/50/100 for reranking | Neural depth ablations and independently reviewed semantic verification study |
| Weak uncertainty | Cluster bootstrap, paired cluster sign randomization, Holm correction; reject mismatched query/corpus comparisons | Power planning and reviewer-agreement uncertainty for the final human study |
| Biased one-reviewer assessment | Blinded randomized two-reviewer CSV pool; strict grade validation, descriptive weighted kappa and disagreement export; adjudication instructions | Two independent reviewers and clinical-support review; no fabricated grades |
| Copilot empty-residual shortcut | Legacy engine now requires a definition-like clause in source text; treatment plurals and risk-question words normalized; before/after coverage report | Broader intent/semantic validation; current hosted six-deck system evaluated separately |
| Verification claims | Synthetic integrity controls explicitly distinguished from hallucination detection and clinical accuracy | Natural unsupported-claim labels and false-acceptance/rejection analysis |
| Research framing | README/notebook warnings, revised protocol, primary-source literature map and manuscript outline | Full systematic literature screening and novelty assessment |

Historical MQ-017/MQ-018 numbers are retained with explicit warnings, not replaced by the new experiment as though it were the same run. The new data split, chunking and denominator differ from the audit's replication and notebook. The old 61-test count is a historical audit observation, not a current blanket validation claim.

The supplied audit's confidence-interval overlap is not itself a valid significance test. Its central caution is retained, while the implementation uses paired comparisons with dependency clusters. Gold-record recovery is stricter than label matching but is still not human relevance: a chunk from the correct long answer can fail to contain the requested information.

See [measured results and limits](results/README.md), [execution instructions](README.md), and [study protocol](PROTOCOL.md). Independent annotation, model-access-dependent runs and clinical review are intentionally reported as pending.
