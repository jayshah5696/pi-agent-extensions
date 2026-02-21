# plan_viz.py
#
# PLAN Architecture: Permutation-Invariance Visualizer
# =====================================================
# For Jay starting at 6sense on Monday.
#
# CORE IDEA:
# A B2B account's intent signals are a SET, not a sequence.
# "Pricing page visit -> CTO engaged -> LinkedIn ad click"
# should score the SAME as
# "CTO engaged -> LinkedIn ad click -> Pricing page visit"
#
# This is permutation-invariance: the model output must not depend
# on the arbitrary order in which signals arrive or are stored.
#
# PLAN (Phrase-Localized Attention Network) achieves this by:
#   1. Embedding each signal independently (no positional encoding)
#   2. Aggregating embeddings with a symmetric function (sum or attention-weighted sum)
#   3. Using phrase-localized attention to upweight high-signal events
#
# This script demonstrates the math in three panels:
#   Panel 1: Order-sensitive model (naive dot-product attention on sequence)
#   Panel 2: Permutation-invariant model (DeepSets-style mean pooling)
#   Panel 3: PLAN phrase-localized attention (softmax over importance scores)

import numpy as np
import matplotlib.pyplot as plt
import matplotlib.gridspec as gridspec

np.random.seed(42)

# ---------------------------------------------------------------
# FAKE ACCOUNT SIGNALS
# Each signal is a 4-dim embedding vector (in practice, hundreds of dims)
# ---------------------------------------------------------------
signal_names = [
    "Pricing page visit",
    "CTO engaged",
    "LinkedIn ad click",
    "Competitor comparison",
    "Demo request",
]

# Simulate pre-trained embeddings for each signal
embeddings = np.array([
    [0.9,  0.2,  0.5,  0.1],   # Pricing page visit  -- high intent
    [0.8,  0.7,  0.3,  0.4],   # CTO engaged         -- high intent
    [0.3,  0.4,  0.6,  0.2],   # LinkedIn ad click   -- medium intent
    [0.7,  0.5,  0.8,  0.6],   # Competitor compare  -- high intent
    [0.2,  0.1,  0.3,  0.05],  # Demo request        -- medium/low
])

# Importance scores: how "hot" each signal is for B2B intent
# (In PLAN these come from a learned scorer, here we hand-define them)
importance_scores = np.array([0.85, 0.90, 0.40, 0.75, 0.50])

# Two orderings of the same signal set
original_order  = [0, 1, 2, 3, 4]
shuffled_order  = [2, 4, 0, 3, 1]   # same signals, different order

# ---------------------------------------------------------------
# PANEL 1: ORDER-SENSITIVE MODEL (naive sequential dot-product attention)
#
# A positional dot-product attention multiplies each embedding
# by its position index before aggregating. This means the same
# signal in position 0 vs position 3 contributes differently.
# Shuffle the signals -> different output -> BAD for set-valued data.
# ---------------------------------------------------------------

def positional_weights(n):
    """Return position-based weights: position 0 gets lowest weight."""
    # Simple linear positional weighting (index+1 normalized)
    w = np.array([i + 1 for i in range(n)], dtype=float)
    return w / w.sum()

def order_sensitive_aggregate(order):
    """Weighted sum where weights depend on position (not signal content)."""
    embs = embeddings[order]          # shape: (n_signals, embed_dim)
    pos_w = positional_weights(len(order))  # shape: (n_signals,)
    # Weighted sum: later signals get more weight just because of position
    return pos_w @ embs               # shape: (embed_dim,)

out_original = order_sensitive_aggregate(original_order)
out_shuffled = order_sensitive_aggregate(shuffled_order)

# ---------------------------------------------------------------
# PANEL 2: PERMUTATION-INVARIANT MODEL (DeepSets mean pooling)
#
# Sum (or mean) is symmetric: sum(a,b,c) == sum(c,a,b).
# The output is identical regardless of signal order.
# This is the foundation of the DeepSets framework (Zaheer et al. 2017),
# which PLAN builds on.
# ---------------------------------------------------------------

def permutation_invariant_aggregate(order):
    """Mean pool: symmetric, order-independent."""
    embs = embeddings[order]
    return embs.mean(axis=0)   # shape: (embed_dim,)

inv_original = permutation_invariant_aggregate(original_order)
inv_shuffled = permutation_invariant_aggregate(shuffled_order)

# ---------------------------------------------------------------
# PANEL 3: PLAN PHRASE-LOCALIZED ATTENTION
#
# PLAN goes beyond simple mean pooling: it learns to upweight
# HIGH-SIGNAL events using a content-based attention score.
#
# Mechanism:
#   score_i  = importance(signal_i)    -- learned scorer in PLAN
#   alpha_i  = softmax(scores)_i       -- normalized attention weight
#   output   = sum_i( alpha_i * embed_i )
#
# Because softmax is applied over CONTENT scores (not positions),
# this is still permutation-invariant. AND it lets the model
# pay more attention to "CTO engaged" than "LinkedIn ad click".
# ---------------------------------------------------------------

def plan_attention_aggregate(order):
    """Softmax attention over importance scores, then weighted sum."""
    embs   = embeddings[order]
    scores = importance_scores[order]
    # Softmax to get normalized attention weights
    exp_s  = np.exp(scores - scores.max())   # numerically stable
    alphas = exp_s / exp_s.sum()
    return alphas, embs.mean(axis=0), (alphas[:, None] * embs).sum(axis=0)

alphas_orig, mean_orig, plan_orig = plan_attention_aggregate(original_order)
alphas_shuf, mean_shuf, plan_shuf = plan_attention_aggregate(shuffled_order)

# ---------------------------------------------------------------
# FIGURE SETUP
# ---------------------------------------------------------------
fig = plt.figure(figsize=(18, 12))
fig.suptitle(
    "PLAN Architecture: Permutation-Invariance in B2B Intent Scoring\n"
    "(6sense -- understanding for Jay's first standup)",
    fontsize=14, fontweight="bold", y=0.98
)

gs = gridspec.GridSpec(2, 3, figure=fig, hspace=0.55, wspace=0.4)

embed_dim = embeddings.shape[1]
dims = [f"dim {i}" for i in range(embed_dim)]
bar_width = 0.35
x = np.arange(embed_dim)

colors = {
    "original": "#4C72B0",
    "shuffled": "#DD8452",
    "match":    "#2ca02c",
    "attn":     "#9467bd",
}

# ---------------------------------------------------------------
# Panel 1a: Order-sensitive outputs (bar chart, original vs shuffled)
# ---------------------------------------------------------------
ax1 = fig.add_subplot(gs[0, 0])
ax1.bar(x - bar_width/2, out_original, bar_width, label="Original order", color=colors["original"], alpha=0.85)
ax1.bar(x + bar_width/2, out_shuffled, bar_width, label="Shuffled order", color=colors["original"], alpha=0.4, hatch="//")
ax1.set_title("Panel 1: Order-Sensitive Model\n(Positional dot-product attention)", fontsize=10, fontweight="bold")
ax1.set_xlabel("Embedding dimension")
ax1.set_ylabel("Aggregated value")
ax1.set_xticks(x)
ax1.set_xticklabels(dims)
ax1.legend(fontsize=8)
ax1.set_ylim(0, 1.1)
# Annotate that the outputs differ
diff = np.linalg.norm(out_original - out_shuffled)
ax1.text(0.5, 0.92, f"L2 diff = {diff:.3f}  (NOT zero!)", transform=ax1.transAxes,
         ha="center", fontsize=9, color="red", fontweight="bold")

# ---------------------------------------------------------------
# Panel 1b: Show position weights for original vs shuffled
# ---------------------------------------------------------------
ax1b = fig.add_subplot(gs[1, 0])
pos_w_orig = positional_weights(len(original_order))
# For shuffled, the signals land in different positions
# so a "Pricing page visit" (pos 0 originally) ends up at pos 2
labels_orig = [signal_names[i][:12] for i in original_order]
labels_shuf = [signal_names[i][:12] for i in shuffled_order]
x_s = np.arange(len(original_order))
ax1b.bar(x_s, pos_w_orig, color=colors["original"], alpha=0.8)
ax1b.set_xticks(x_s)
ax1b.set_xticklabels(labels_orig, rotation=25, ha="right", fontsize=7)
ax1b.set_title("Position weights (original order)\nShuffle changes who gets high weight", fontsize=9)
ax1b.set_ylabel("Weight")
ax1b.set_ylim(0, 0.45)
ax1b.axhline(1/len(original_order), color="gray", linestyle="--", linewidth=0.8, label="uniform")
ax1b.legend(fontsize=7)

# ---------------------------------------------------------------
# Panel 2a: Permutation-invariant outputs (should be identical)
# ---------------------------------------------------------------
ax2 = fig.add_subplot(gs[0, 1])
ax2.bar(x - bar_width/2, inv_original, bar_width, label="Original order", color=colors["match"], alpha=0.85)
ax2.bar(x + bar_width/2, inv_shuffled, bar_width, label="Shuffled order", color=colors["match"], alpha=0.4, hatch="//")
ax2.set_title("Panel 2: Permutation-Invariant Model\n(DeepSets mean pooling)", fontsize=10, fontweight="bold")
ax2.set_xlabel("Embedding dimension")
ax2.set_ylabel("Aggregated value")
ax2.set_xticks(x)
ax2.set_xticklabels(dims)
ax2.legend(fontsize=8)
ax2.set_ylim(0, 1.1)
diff2 = np.linalg.norm(inv_original - inv_shuffled)
ax2.text(0.5, 0.92, f"L2 diff = {diff2:.6f}  (zero!)", transform=ax2.transAxes,
         ha="center", fontsize=9, color="green", fontweight="bold")

# ---------------------------------------------------------------
# Panel 2b: Show that mean pooling is truly order-independent
# ---------------------------------------------------------------
ax2b = fig.add_subplot(gs[1, 1])
# Show all 5 signal embeddings stacked, illustrating sum is symmetric
bottom = np.zeros(embed_dim)
for i, idx in enumerate(original_order):
    ax2b.bar(x, embeddings[idx], bottom=bottom,
             label=signal_names[idx][:14], alpha=0.75)
    bottom += embeddings[idx]
ax2b.set_xticks(x)
ax2b.set_xticklabels(dims)
ax2b.set_title("Stacked embeddings (order-independent sum)\nRearrange bars, total stays the same", fontsize=9)
ax2b.set_ylabel("Contribution to sum")
ax2b.legend(fontsize=6, loc="upper right")

# ---------------------------------------------------------------
# Panel 3a: PLAN attention weights per signal
# ---------------------------------------------------------------
ax3 = fig.add_subplot(gs[0, 2])
sig_labels = [signal_names[i][:16] for i in original_order]
x_a = np.arange(len(original_order))
bars = ax3.bar(x_a, alphas_orig, color=colors["attn"], alpha=0.85)
ax3.set_xticks(x_a)
ax3.set_xticklabels(sig_labels, rotation=28, ha="right", fontsize=7)
ax3.set_title("Panel 3: PLAN Phrase-Localized Attention\n(softmax over importance scores)", fontsize=10, fontweight="bold")
ax3.set_ylabel("Attention weight (alpha)")
ax3.set_ylim(0, 0.45)
# Annotate raw importance scores on bars
for bar, score, alpha in zip(bars, importance_scores[original_order], alphas_orig):
    ax3.text(bar.get_x() + bar.get_width()/2, bar.get_height() + 0.005,
             f"imp={score:.2f}\na={alpha:.2f}", ha="center", va="bottom", fontsize=7)

ax3.axhline(1/len(original_order), color="gray", linestyle="--", linewidth=0.8, label="uniform (mean pool)")
ax3.legend(fontsize=8)

# ---------------------------------------------------------------
# Panel 3b: Compare mean-pool output vs PLAN attention-weighted output
# ---------------------------------------------------------------
ax3b = fig.add_subplot(gs[1, 2])
ax3b.bar(x - bar_width/2, mean_orig,  bar_width, label="Mean pool (uniform)",        color=colors["match"],  alpha=0.85)
ax3b.bar(x + bar_width/2, plan_orig,  bar_width, label="PLAN attention-weighted",    color=colors["attn"],   alpha=0.85)
ax3b.set_xticks(x)
ax3b.set_xticklabels(dims)
ax3b.set_title("Mean pool vs PLAN output\n(same set, different weighting)", fontsize=9)
ax3b.set_ylabel("Aggregated value")
ax3b.legend(fontsize=8)
ax3b.set_ylim(0, 1.1)
ax3b.text(0.5, 0.92,
          "PLAN upweights high-intent signals\nbut stays permutation-invariant",
          transform=ax3b.transAxes, ha="center", fontsize=8, color=colors["attn"])

# ---------------------------------------------------------------
# Footer annotation
# ---------------------------------------------------------------
fig.text(0.5, 0.01,
    "Key insight: PLAN uses content-based (not position-based) attention. "
    "The same signals in any order produce the same intent score.\n"
    "This matters for B2B because signals arrive asynchronously across channels "
    "and storing them in a fixed order is arbitrary.",
    ha="center", fontsize=9, style="italic", color="#444444")

out_path = "scripts/plan_viz.png"
plt.savefig(out_path, dpi=150, bbox_inches="tight")
print(f"Saved plot to: {out_path}")
plt.show()

# ---------------------------------------------------------------
# Console summary for quick reading
# ---------------------------------------------------------------
print("\n=== PLAN Permutation-Invariance Demo ===")
print(f"Order-sensitive model L2 diff (original vs shuffled): {diff:.4f}  <-- BAD, should be 0")
print(f"DeepSets mean pool    L2 diff (original vs shuffled): {diff2:.8f}  <-- GOOD, is 0")
print("\nPLAN attention weights (original order):")
for name, alpha, score in zip([signal_names[i] for i in original_order], alphas_orig, importance_scores[original_order]):
    bar = "#" * int(alpha * 100)
    print(f"  {name:<25} importance={score:.2f}  alpha={alpha:.3f}  {bar}")
print("\nTakeaway: High-importance signals get higher alpha, but the math is symmetric.")
print("Shuffle the input and you get the exact same alphas assigned to the same signals.")
