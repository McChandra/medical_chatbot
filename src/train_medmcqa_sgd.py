"""Train a reproducible MedMCQA academic-subject baseline.
Run from medical_chatbot root: python src/train_medmcqa_sgd.py
"""
from pathlib import Path
import json
import joblib
import pandas as pd
from sklearn.pipeline import Pipeline
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import SGDClassifier
from sklearn.metrics import accuracy_score, f1_score, classification_report

ROOT = Path('data/processed')
OUT = Path('models/medmcqa_sgd')
OUT.mkdir(parents=True, exist_ok=True)

df = pd.read_csv(ROOT / 'medquad_unified_v3.csv',
                 usecols=['source_dataset', 'domain_method', 'split', 'question', 'domain'],
                 dtype='string', keep_default_na=False)
df = df.loc[(df.source_dataset == 'MedMCQA') &
            (df.domain_method == 'source_label') &
            (df.split.isin(['train', 'validation']))].copy()
assert df['question'].str.strip().ne('').all(), 'Empty question detected'
assert df['domain'].str.strip().ne('').all(), 'Empty domain detected'
train = df[df.split == 'train']
val = df[df.split == 'validation']
assert len(train) == 143839 and len(val) == 17938, 'Unexpected split sizes; stop and inspect'
assert set(val.domain).issubset(set(train.domain)), 'Unknown validation labels'

model = Pipeline([
    ('tfidf', TfidfVectorizer(ngram_range=(1, 2), max_features=50000,
                              min_df=2, sublinear_tf=True, dtype='float32')),
    ('sgd', SGDClassifier(loss='log_loss', alpha=1e-4, max_iter=1000,
                          tol=1e-3, random_state=42, n_jobs=-1)),
])
print('Training on', len(train), 'records; validating on', len(val), 'records', flush=True)
model.fit(train.question.astype(str), train.domain.astype(str))
pred = model.predict(val.question.astype(str))
metrics = {'train_rows': len(train), 'validation_rows': len(val),
           'accuracy': float(accuracy_score(val.domain, pred)),
           'macro_f1': float(f1_score(val.domain, pred, average='macro')),
           'weighted_f1': float(f1_score(val.domain, pred, average='weighted'))}
print('\nVALIDATION METRICS')
print(json.dumps(metrics, indent=2))
print('\nPER-SUBJECT REPORT')
report = classification_report(val.domain, pred, zero_division=0)
print(report)
joblib.dump(model, OUT / 'tfidf_sgd.joblib')
(OUT / 'validation_metrics.json').write_text(json.dumps(metrics, indent=2), encoding='utf-8')
(OUT / 'validation_report.txt').write_text(report, encoding='utf-8')
print('\nSaved model and validation metrics to', OUT)
print('Research test was NOT loaded or evaluated.')
