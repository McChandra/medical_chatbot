"""Comparable offline baselines. No training or answer generation here."""
from collections import Counter, defaultdict
import math
import re
from hashlib import sha256
from pathlib import Path
import importlib.metadata
import numpy as np
from scipy.sparse import csr_matrix
from sklearn.feature_extraction.text import TfidfVectorizer
from research.data import normalize, digest


def tokenize(text):
    return re.findall(r"\b\w+\b", normalize(text))


def top_indices(scores, k):
    # Stable order handles ties; only positive lexical scores count as retrieved.
    return [int(i) for i in np.argsort(-np.asarray(scores).ravel(), kind="stable")[:k]
            if scores[i] > 0]


class LexicalIndex:
    def __init__(self, texts, k1=1.2, b=.75):
        counts = [Counter(tokenize(t)) for t in texts]
        vocabulary = sorted({t for c in counts for t in c})
        self.vocabulary = {t: i for i, t in enumerate(vocabulary)}
        df = Counter(t for c in counts for t in c)
        avg = sum(sum(c.values()) for c in counts)/len(counts)
        row, col, values = [], [], []
        for i, counter in enumerate(counts):
            norm = k1*(1-b+b*sum(counter.values())/max(avg, 1))
            for term, tf in counter.items():
                row.append(i); col.append(self.vocabulary[term])
                idf = math.log(1+(len(counts)-df[term]+.5)/(df[term]+.5))
                values.append(idf*tf*(k1+1)/(tf+norm))
        self.bm25 = csr_matrix((values, (row, col)), shape=(len(texts), len(vocabulary)))
        self.vectorizer = TfidfVectorizer(tokenizer=tokenize, token_pattern=None, lowercase=False)
        self.tfidf = self.vectorizer.fit_transform(texts)

    def search(self, query, k=50):
        columns = [self.vocabulary[t] for t in set(tokenize(query)) if t in self.vocabulary]
        bm = np.asarray(self.bm25[:, columns].sum(axis=1)).ravel()
        tf = (self.tfidf @ self.vectorizer.transform([query]).T).toarray().ravel()
        return {"bm25": top_indices(bm, k), "tfidf": top_indices(tf, k)}


def rrf(rankings, k=50, constant=60):
    scores = defaultdict(float)
    for ranking in rankings:
        if len(set(ranking)) != len(ranking):
            raise ValueError("Duplicate result in fusion input")
        for rank, index in enumerate(ranking, 1):
            scores[index] += 1/(constant+rank)
    return sorted(scores, key=lambda i: (-scores[i], i))[:k]


def focus_lookup(query, labels):
    """Diagnostic ceiling/floor control, not a passage retriever; no gold label input."""
    return next((f for f in sorted(set(map(normalize, labels)), key=lambda x: (-len(x), x))
                 if f and f in normalize(query)), None)


def require_revision(revision):
    if not re.fullmatch(r"[0-9a-f]{40}", revision or ""):
        raise ValueError("Pin each model to its full 40-character repository commit")


def cached_vectors(texts, encode, identity, cache_dir=None, batch_size=32):
    """Resumable, content/model-keyed batches; never unpickle a cache file."""
    if not texts:
        raise ValueError('Cannot encode an empty corpus')
    versions = {}
    for package in ('numpy','torch','transformers','sentence-transformers'):
        try: versions[package] = importlib.metadata.version(package)
        except importlib.metadata.PackageNotFoundError: versions[package] = None
    code_hash = sha256(Path(__file__).read_bytes()).hexdigest()
    root = Path(cache_dir)/digest([identity, texts, batch_size, versions, code_hash]) if cache_dir else None
    if root: root.mkdir(parents=True, exist_ok=True)
    vectors = []
    for start in range(0, len(texts), batch_size):
        batch = texts[start:start+batch_size]
        path = root/f'{start}.npy' if root else None
        checksum = root/f'{start}.sha256' if root else None
        array = None
        if path and path.exists() and checksum.exists():
            if sha256(path.read_bytes()).hexdigest() == checksum.read_text().strip():
                try: array = np.load(path, allow_pickle=False)
                except (ValueError, OSError): pass
        if array is not None and (array.ndim != 2 or len(array) != len(batch) or not np.isfinite(array).all()):
            array = None
        if array is None:
            array = np.asarray(encode(batch), dtype=np.float32)
            if array.ndim != 2 or len(array) != len(batch) or not np.isfinite(array).all():
                raise ValueError('Encoder returned malformed or nonfinite vectors')
            if path:
                temporary = path.with_suffix('.tmp')
                with temporary.open('wb') as f: np.save(f, array, allow_pickle=False)
                temporary.replace(path)
                checksum.write_text(sha256(path.read_bytes()).hexdigest())
        vectors.append(array)
        if start % (batch_size*20) == 0:
            print(f'Encoded/cached {min(start+batch_size,len(texts))}/{len(texts)} passages', flush=True)
    return np.concatenate(vectors)


class DenseIndex:
    def __init__(self, texts, model, revision, device="cpu", cache_dir=None):
        require_revision(revision)
        from sentence_transformers import SentenceTransformer
        self.model = SentenceTransformer(model, revision=revision, device=device, trust_remote_code=False)
        self.vectors = cached_vectors(texts, lambda batch: self.model.encode(batch, batch_size=32,
             normalize_embeddings=True, convert_to_numpy=True, show_progress_bar=False),
             [model,revision,'normalized-sentence-transformer',self.model.max_seq_length,device], cache_dir)

    def search(self, query, k=50):
        vector = self.model.encode([query], normalize_embeddings=True, convert_to_numpy=True)[0]
        scores = self.vectors @ vector
        # Dense scores may legitimately be negative.
        return [int(i) for i in np.argsort(-scores, kind="stable")[:k]]


class Reranker:
    def __init__(self, model, revision, device="cpu"):
        require_revision(revision)
        from sentence_transformers import CrossEncoder
        self.model = CrossEncoder(model, revision=revision, device=device, trust_remote_code=False)

    def rank(self, query, indices, texts):
        if not indices:
            return []
        scores = self.model.predict([(query, texts[i]) for i in indices])
        return [indices[int(i)] for i in np.argsort(-np.asarray(scores).reshape(-1), kind="stable")]


class MedCPTIndex:
    """NCBI asymmetric encoders: CLS vectors and inner product, not mean pooling.

    Chunks serve as abstracts, with an empty title (the optional prefix is in the
    chunk). Biomedical article training does not imply consumer-QA validity.
    """
    def __init__(self, texts, query_revision, article_revision, device='cpu', cache_dir=None):
        require_revision(query_revision); require_revision(article_revision)
        import torch
        from transformers import AutoModel, AutoTokenizer
        self.torch, self.device = torch, device
        qname, aname = 'ncbi/MedCPT-Query-Encoder', 'ncbi/MedCPT-Article-Encoder'
        self.query_tokenizer = AutoTokenizer.from_pretrained(qname, revision=query_revision, trust_remote_code=False)
        self.query_model = AutoModel.from_pretrained(qname, revision=query_revision, trust_remote_code=False).to(device).eval()
        atok = AutoTokenizer.from_pretrained(aname, revision=article_revision, trust_remote_code=False)
        amodel = AutoModel.from_pretrained(aname, revision=article_revision, trust_remote_code=False).to(device).eval()
        def encode(text_batch):
            with torch.no_grad():
                batch = atok([['', t] for t in text_batch], truncation=True, padding=True,
                             max_length=512, return_tensors='pt').to(device)
                return amodel(**batch).last_hidden_state[:, 0, :].cpu().numpy()
        self.vectors = cached_vectors(texts, encode, [aname,article_revision,'CLS-inner-product',512,device], cache_dir)
        del amodel

    def search(self, query, k=50):
        with self.torch.no_grad():
            batch = self.query_tokenizer([query], truncation=True, padding=True, max_length=64,
                                         return_tensors='pt').to(self.device)
            vector = self.query_model(**batch).last_hidden_state[0, 0, :].cpu().numpy()
        return [int(i) for i in np.argsort(-(self.vectors @ vector), kind='stable')[:k]]
