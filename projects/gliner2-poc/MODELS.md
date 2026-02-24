# MODELS.md - Model Reference

Detailed reference for every model used in this POC. Use this to understand
the architectural tradeoffs before interpreting experiment results.

---

## GLiNER2 (fastino/gliner2-base-v1)

**Architecture:** Schema-driven unified information extraction. A single DeBERTa-v3
encoder processes the input text and a structured schema (entity types +
classification fields) in one forward pass. The schema is encoded as special
prompt tokens prepended to the text. Output heads for span extraction and
classification share the same contextualized encoder representations.

**Parameters:** 205M  
**Backbone:** DeBERTa-v3-base  
**Task support:** NER + Text Classification (single forward pass for both)  
**Key claim:** Multi-task schema-driven extraction in one pass. NER and classification
are solved jointly with no additional overhead for adding classification to an NER query.  
**Latency profile:** Near O(1) with respect to label count. Labels are encoded as
schema tokens; the number of labels does not significantly change encoder runtime.  
**Context window:** 2048 tokens (inputs truncated to 1800 in this POC)  
**HuggingFace:** https://huggingface.co/fastino/gliner2-base-v1  
**Paper:** https://arxiv.org/abs/2507.18546 (EMNLP 2025 System Demonstrations)  
**Package:** `gliner2` (pip install gliner2>=1.1.0)  
**When to use:** Production zero-shot IE when you need NER + classification together,
or when you need to scale to large label sets without latency growth. CPU-viable.

---

## GLiNER v1 (urchade/gliner_medium-v2.1)

**Architecture:** Uni-encoder span extraction. Input text tokens and entity type
label tokens are concatenated into a single sequence and passed through DeBERTa-v3
jointly. Entity span representations are scored against label representations
extracted from the same forward pass. This is the original EMNLP 2023 GLiNER design.

**Parameters:** 209M  
**Backbone:** DeBERTa-v3-base  
**Task support:** NER only (no classification head)  
**Key characteristic:** The uni-encoder design means that adding more entity type
labels directly increases the input sequence length, which increases runtime.
At 5 labels, latency may be 2-3x lower than at 50 labels on the same text.  
**Latency profile:** O(n_labels). Each additional label adds tokens to the encoder input.  
**Context window:** 512 tokens (original DeBERTa limit for the concatenated sequence)  
**HuggingFace:** https://huggingface.co/urchade/gliner_medium-v2.1  
**Paper:** https://arxiv.org/abs/2311.08526 (NAACL 2024)  
**Package:** `gliner` (pip install gliner>=0.2.19)  
**When to use:** When you want strong zero-shot NER with a well-tested, widely-used
model. Accepts arbitrary entity type names. Not suitable for large label sets (>20)
where latency scaling becomes a problem.

---

## ModernBERT GLiNER Bi-Encoder (knowledgator/modern-gliner-bi-base-v1.0)

**Architecture:** Bi-encoder span extraction. Two separate encoders: one for input
text spans, one for entity type labels. Label representations are computed once
and can be cached, independent of the input text. At inference time, only the
text encoder runs, and entity scores are computed as dot-products between text
span representations and cached label embeddings. This is similar to dense
retrieval (DPR) applied to span extraction.

The text encoder uses ModernBERT, which supports 8192-token context windows
compared to the original DeBERTa-v3's 512-token limit. This makes the model
suitable for long-document NER.

**Parameters:** 194M  
**Backbone:** ModernBERT-base (released December 2024 by Answer.AI and LightOn)  
**Task support:** NER only (no classification head)  
**Key characteristic:** Because entity embeddings are independent of input, adding
more labels does NOT increase the encoder forward pass time. Labels can be
pre-cached for production use. Unlimited label counts without latency penalty.  
**Latency profile:** Near O(1) with respect to label count. First inference with a
new label set triggers label encoding; subsequent calls use cached embeddings.  
**Context window:** 8192 tokens (ModernBERT supports long documents)  
**HuggingFace:** https://huggingface.co/knowledgator/modern-gliner-bi-base-v1.0  
**Package:** `gliner` (pip install gliner>=0.2.19)  
**When to use:** When you need zero-shot NER over long documents (>512 tokens),
or when your label set is large (>20 types) and you want near-constant latency.
Also useful when you want to pre-cache entity type embeddings for repeated inference.

---

## FLAIR (flair/ner-english-fast)

**Architecture:** BiLSTM-CRF sequence labeler with Flair contextual string embeddings.
Flair embeddings are computed by a character-level language model (forward and
backward LSTM) that reads the full text as a character sequence. This captures
local and word-boundary context without attention mechanisms. The BiLSTM-CRF
tagger on top produces BIO tag sequences with Viterbi decoding.

Unlike transformer-based models, Flair does not use self-attention, making it
faster on CPU for short sequences. However, it cannot perform zero-shot NER:
it recognizes only the 4 entity types it was trained on (PER, ORG, LOC, MISC).

**Parameters:** Approx. 80MB (much smaller than transformer baselines)  
**Backbone:** Flair character-level LM + BiLSTM-CRF  
**Training data:** CoNLL-2003 (English newswire, OntoNotes-style)  
**Task support:** NER only, 4 fixed types: PER, ORG, LOC, MISC  
**Key limitation:** Cannot recognize entity types outside its training schema.
In this POC, only PER, ORG, LOC, MISC are mapped to CrossNER AI types.
Many CrossNER AI types (algorithm, task, university, field, metrics, programlang,
product, country, conference) are entirely missed by this model.  
**CrossNER mapping:** PER to researcher, ORG to organisation, LOC to location,
MISC to miscellaneous. Other CrossNER types have no Flair equivalent.  
**Latency profile:** Fast on CPU. BiLSTM is lightweight compared to transformers.
Runtime scales with text length (O(n_tokens)) but not with label count.  
**HuggingFace:** https://huggingface.co/flair/ner-english-fast  
**Package:** `flair` (pip install flair>=0.14.0)  
**When to use:** When you need fast, reliable NER for general-domain text with
only 4 entity types. Not appropriate for zero-shot or domain-specific NER.

---

## spaCy en_core_web_sm

**Architecture:** spaCy pipeline with a tok2vec component for contextual token
embeddings, followed by a transition-based NER tagger. The tok2vec uses a
convolutional architecture (not transformer-based), making it lightweight and
CPU-efficient. The NER component uses a stack-based transition system with
learned features from tok2vec.

**Parameters:** Approx. 12MB (very small)  
**Backbone:** tok2vec (convolutional, not a transformer)  
**Training data:** OntoNotes 5.0 (general English newswire, web, and broadcast)  
**Task support:** NER only, 18 fixed OntoNotes types  
**Key limitation:** Trained on general-domain OntoNotes NER. The OntoNotes entity
taxonomy (PERSON, ORG, GPE, LOC, PRODUCT, etc.) does not map cleanly to AI-domain
CrossNER types. Most CrossNER AI types (algorithm, task, university, field, metrics,
programlang, conference) have no OntoNotes equivalent. Low F1 on CrossNER AI is
expected and is a domain mismatch, not a model failure.  
**CrossNER mapping:** PERSON to researcher, ORG to organisation, GPE to country,
LOC to location, PRODUCT to product, LANGUAGE to programlang, WORK_OF_ART to
algorithm (approximate), EVENT to conference (approximate).  
**Latency profile:** Very fast. tok2vec is the lightest baseline in this POC.
Runtime scales with text length but not label count.  
**Package:** `spacy` (pip install spacy>=3.7.0; then python -m spacy download en_core_web_sm)  
**When to use:** When you need extremely fast NER on general-domain text with no
GPU. Not appropriate for specialized domains without fine-tuning.

---

## DeBERTa NLI (cross-encoder/nli-deberta-v3-small)

**Architecture:** Cross-encoder NLI model. For zero-shot classification, each
candidate label is converted into a hypothesis (e.g., "This text is about {label}.")
and the model scores text-hypothesis entailment. The label with the highest
entailment score is the prediction. Because each label requires a separate
forward pass, total latency scales linearly with the number of candidate labels.

This is the standard zero-shot classification baseline from HuggingFace
zero-shot-classification pipeline. It represents the pre-GLiNER2 state of the
art for lightweight zero-shot classification.

**Parameters:** 184M (DeBERTa-v3-small)  
**Backbone:** DeBERTa-v3-small  
**Training data:** MNLI + SNLI + NLI-augmented data  
**Task support:** Classification only (one label per text; no NER capability)  
**Key limitation:** Latency is O(n_labels). For Banking77 (77 labels), this means
77 separate forward passes per example, making it extremely slow for large label sets.  
**Latency profile:** O(n_labels). Each label adds one full forward pass.  
**HuggingFace:** https://huggingface.co/cross-encoder/nli-deberta-v3-small  
**Package:** `transformers` (included in base dependencies)  
**When to use:** Small label sets (fewer than 20 labels) where accuracy matters more
than speed, and you do not want to set up GLiNER2. For larger label sets, use GLiNER2
or SetFit zero-shot instead.

---

## Modern NLI (MoritzLaurer/deberta-v3-large-zeroshot-v2.0)

**Architecture:** Same NLI cross-encoder framing as DeBERTa NLI, but using the
full DeBERTa-v3-large backbone and trained on an improved v2.0 dataset mixture
that includes a wider variety of NLI datasets with improved multilingual and
domain-diverse examples. The larger model capacity and better training data
produce substantially higher accuracy than nli-deberta-v3-small, especially
on fine-grained classification tasks like Banking77.

This model represents the accuracy ceiling of the NLI zero-shot paradigm as of
2025. If GLiNER2 outperforms this model, it establishes clear value for the
unified extraction approach beyond just latency advantages.

**Parameters:** 435M (DeBERTa-v3-large)  
**Backbone:** DeBERTa-v3-large  
**Training data:** v2.0 NLI mixture (broader domain coverage than v1.0)  
**Task support:** Classification only (same NLI framing, one pass per label)  
**Key limitation:** Same O(n_labels) scaling as DeBERTa NLI small, but 2.4x larger
so each pass is slower. Skipped by default on Banking77 (77 labels).  
**Latency profile:** O(n_labels), with each pass approx. 2.4x slower than the small model.  
**HuggingFace:** https://huggingface.co/MoritzLaurer/deberta-v3-large-zeroshot-v2.0  
**Package:** `transformers` (included in base dependencies)  
**When to use:** When you need the highest accuracy from an NLI zero-shot classifier
and have a small label set (fewer than 15 labels). For production scale or large
label sets, GLiNER2 or SetFit zero-shot will be faster.

---

## SetFit Zero-Shot (sentence-transformers/paraphrase-mpnet-base-v2)

**Architecture:** Sentence-BERT (SBERT) bi-encoder used in zero-shot mode via
cosine similarity matching. The model encodes input text and each label name
into a shared semantic vector space using a siamese fine-tuned MPNet backbone.
Zero-shot classification is performed by finding the label whose embedding is
closest to the text embedding in cosine similarity.

This is NOT the standard SetFit few-shot fine-tuning workflow. It is a purely
zero-shot use of the pre-trained embedding space. No task-specific training data
is required, but accuracy may be lower than NLI-based methods for fine-grained
or ambiguous label names.

Label embeddings are cached after the first call, so inference for repeated
calls with the same label set is nearly O(1) per text.

**Parameters:** 420MB (MPNet-base)  
**Backbone:** MPNet-base, fine-tuned for semantic similarity via contrastive learning  
**Task support:** Classification only (no NER capability)  
**Key characteristic:** Encodes text and labels independently (bi-encoder). Label
embeddings are cached. Inference is faster than NLI for large label sets because
only one text encoding is needed (vs one forward pass per label for NLI).  
**Latency profile:** O(1) per example after first call with a given label set.
First call computes label embeddings; subsequent calls reuse the cache.  
**HuggingFace:** https://huggingface.co/sentence-transformers/paraphrase-mpnet-base-v2  
**Package:** `setfit` (pip install setfit>=1.0.0)  
**When to use:** When you want fast zero-shot classification without NLI overhead,
especially with large label sets. Accuracy depends on how well label names capture
the intended meaning without additional context.

---

## FastText Zero-Shot (cc.en.300.bin)

**Architecture:** Bag-of-words word vector averaging. FastText extends word2vec
with subword character n-gram features: each word is represented as the average
of its character n-gram embeddings, making the model robust to typos and
morphological variations. Zero-shot classification is performed by averaging word
vectors to produce a sentence representation, then finding the closest label name
embedding by cosine similarity.

There is no neural network forward pass at inference time: only vector lookups,
averaging, and dot products. This makes FastText the absolute latency floor for
any NLP classification task.

The critical limitation is the total absence of contextual understanding: the
word vector for "bank" is identical regardless of whether the surrounding context
is a financial article or a nature documentary. This is the defining characteristic
of bag-of-words models and is why accuracy on context-dependent tasks like Banking77
(which has 77 intent labels, many differing by subtle phrasing) is expected to be low.

**Model size:** 4.2GB (cc.en.300.bin, 300-dimensional, 2M vocabulary)  
**Training data:** Common Crawl + Wikipedia (English), trained with subword n-grams  
**Task support:** Classification only (no NER capability)  
**Key characteristic:** No context. Sub-millisecond inference. Absolute latency floor.
Vocabulary coverage via subword n-grams handles out-of-vocabulary words.  
**Latency profile:** Sub-millisecond per example. Dominated by vector lookup and
floating-point averaging, not a neural network forward pass.  
**Package:** `fasttext-wheel` (pip install fasttext-wheel>=0.9.2, Mac-compatible build)  
**Model download:** fasttext.util.download_model('en', if_exists='ignore')  
**When to use:** As a lower bound for any classification task. If a model cannot
beat FastText zero-shot, it is not learning meaningful context. Also useful as a
latency reference point: how much accuracy do you gain per millisecond spent on
larger models?

---

## Summary Table

| Model | Params | Task | Latency vs Labels | Context |
|-------|--------|------|-------------------|---------|
| GLiNER2 | 205M | NER + CLS | O(1) | 2048 tokens |
| GLiNER v1 | 209M | NER | O(n_labels) | 512 tokens |
| ModernBERT GLiNER | 194M | NER | Near O(1) | 8192 tokens |
| Flair fast | ~80MB | NER (4 types) | O(1) | Unlimited (LM) |
| spaCy sm | ~12MB | NER (18 types) | O(1) | Unlimited (CNN) |
| DeBERTa NLI small | 184M | CLS | O(n_labels) | 512 tokens |
| Modern NLI large | 435M | CLS | O(n_labels) | 512 tokens |
| SetFit zero-shot | 420MB | CLS | O(1) cached | 512 tokens |
| FastText | 4.2GB | CLS | O(1) | None (bag-of-words) |
