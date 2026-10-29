"""Create reproducible question-grouped splits without modifying existing datasets."""
from pathlib import Path
import hashlib
import pandas as pd

ROOT = Path(__file__).resolve().parents[1] / 'data' / 'processed'
SOURCE = ROOT / 'medquad_unified_v2.csv'
OUTPUT = ROOT / 'medquad_unified_v3.csv'
SEED = 'medquad-v3-2026-10'


def normalize(series):
    return (series.fillna('').astype('string').str.lower()
            .str.replace(r'\s+', ' ', regex=True).str.strip())


def score(key):
    digest = hashlib.sha256((SEED + '|' + key).encode('utf-8')).digest()
    return int.from_bytes(digest[:8], 'big') / 2**64


def main():
    df = pd.read_csv(SOURCE, dtype='string', keep_default_na=False)
    if df['record_id'].duplicated().any():
        raise ValueError('Duplicate record IDs')
    key = normalize(df['question'])
    if key.eq('').any():
        raise ValueError('Empty questions found; review before splitting')

    legacy = {}
    for name in ('train', 'validation', 'test'):
        old = pd.read_csv(ROOT / f'{name}.csv', usecols=['question'], dtype='string')
        legacy[name] = set(normalize(old['question'])) - {''}
    for a, b in (('train', 'validation'), ('train', 'test'), ('validation', 'test')):
        if legacy[a] & legacy[b]:
            raise ValueError(f'Legacy splits overlap: {a} and {b}')

    unique_keys = set(key)
    group_splits = {}
    for k in unique_keys:
        if k in legacy['test']:
            split = 'legacy_test'
        elif k in legacy['validation']:
            split = 'legacy_validation'
        elif k in legacy['train']:
            split = 'train'
        else:
            r = score(k)
            split = 'research_test' if r < 0.10 else ('validation' if r < 0.20 else 'train')
        group_splits[k] = split

    df['split'] = key.map(group_splits)
    df['split_method'] = 'normalized_question_group_sha256_v1'
    # Assert every normalized question is assigned to one split only.
    if df.assign(_key=key).groupby('_key')['split'].nunique().max() != 1:
        raise AssertionError('Question leakage across splits')
    for name, target in (('validation', 'legacy_validation'), ('test', 'legacy_test')):
        mask = key.isin(legacy[name])
        if not df.loc[mask, 'split'].eq(target).all():
            raise AssertionError(f'Legacy {name} was not preserved')

    df.to_csv(OUTPUT, index=False)
    print(f'Saved: {OUTPUT}')
    print(f'Total records: {len(df):,}')
    print('\nRecords by split:')
    print(df['split'].value_counts().to_string())
    print('\nUnique questions by split:')
    print(df.assign(_key=key).groupby('split')['_key'].nunique().to_string())
    print('\nCross-split exact-question overlap: 0 (asserted)')
    print('Note: near-duplicate and shared-evidence leakage have not been audited.')


if __name__ == '__main__':
    main()
