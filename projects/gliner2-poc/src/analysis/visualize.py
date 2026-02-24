"""
visualize.py - Visualization functions for GLiNER2 POC results.

Produces:
- plot_latency_scaling(): Latency vs label count for all models
- plot_f1_comparison(): Bar chart comparing NER F1 across models
- plot_classification_comparison(): Accuracy bar chart for classification
- save_all_plots(): Run all plots from results JSON files
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import matplotlib.pyplot as plt
import seaborn as sns

# Set consistent visual style
sns.set_theme(style="whitegrid", font_scale=1.2)
COLORS = {
    "gliner2": "#2196F3",      # Blue
    "spacy": "#4CAF50",        # Green
    "deberta_nli": "#FF5722",  # Orange-red
    "two_pass": "#9C27B0",     # Purple
}

RESULTS_DIR = Path(__file__).parent.parent.parent / "results"


def _ensure_results_dir() -> Path:
    """Ensure the results directory exists and return its path."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    return RESULTS_DIR


def plot_latency_scaling(
    results_path: str | Path | None = None,
    output_path: str | Path | None = None,
) -> Path:
    """Plot latency (ms/example) vs number of labels for each model.

    Reads from results/latency_results.json and saves to results/latency_scaling.png.

    Args:
        results_path: Path to latency_results.json. Defaults to results/latency_results.json.
        output_path: Path to save PNG. Defaults to results/latency_scaling.png.

    Returns:
        Path to the saved PNG file.
    """
    results_dir = _ensure_results_dir()
    if results_path is None:
        results_path = results_dir / "latency_results.json"
    if output_path is None:
        output_path = results_dir / "latency_scaling.png"

    results_path = Path(results_path)
    output_path = Path(output_path)

    with open(results_path) as f:
        data = json.load(f)

    fig, ax = plt.subplots(figsize=(9, 6))

    label_counts = data.get("label_counts", [])

    for model_key, label in [
        ("gliner2", "GLiNER2"),
        ("spacy", "spaCy en_core_web_sm"),
        ("deberta_nli", "DeBERTa NLI (small)"),
    ]:
        model_data = data.get(model_key, {})
        means = [model_data.get(str(k), {}).get("mean", None) for k in label_counts]
        p95s = [model_data.get(str(k), {}).get("p95", None) for k in label_counts]

        # Filter None values
        valid = [(k, m, p) for k, m, p in zip(label_counts, means, p95s) if m is not None]
        if not valid:
            continue

        ks, ms, ps = zip(*valid)
        color = COLORS.get(model_key, "gray")

        ax.plot(ks, ms, marker="o", linewidth=2, color=color, label=label)
        ax.fill_between(
            ks,
            [m - (p - m) for m, p in zip(ms, ps)],
            ps,
            alpha=0.15,
            color=color,
        )

    ax.set_xlabel("Number of Candidate Labels", fontsize=13)
    ax.set_ylabel("Latency per Example (ms)", fontsize=13)
    ax.set_title("Latency Scaling: GLiNER2 vs Baselines", fontsize=15, fontweight="bold")
    ax.legend(loc="upper left", framealpha=0.9)
    ax.set_xticks(label_counts)

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    print(f"Saved latency scaling plot: {output_path}")
    return output_path


def plot_f1_comparison(
    results_path: str | Path | None = None,
    output_path: str | Path | None = None,
) -> Path:
    """Plot entity-level F1 comparison bar chart for NER models.

    Reads from results/ner_results.json and saves to results/f1_comparison.png.

    Args:
        results_path: Path to ner_results.json. Defaults to results/ner_results.json.
        output_path: Path to save PNG. Defaults to results/f1_comparison.png.

    Returns:
        Path to the saved PNG file.
    """
    results_dir = _ensure_results_dir()
    if results_path is None:
        results_path = results_dir / "ner_results.json"
    if output_path is None:
        output_path = results_dir / "f1_comparison.png"

    results_path = Path(results_path)
    output_path = Path(output_path)

    with open(results_path) as f:
        data = json.load(f)

    models = []
    f1_scores = []
    precisions = []
    recalls = []
    bar_colors = []

    for model_key, label in [
        ("gliner2", "GLiNER2"),
        ("spacy", "spaCy"),
    ]:
        model_data = data.get(model_key, {})
        metrics = model_data.get("metrics", {})
        if metrics:
            models.append(label)
            f1_scores.append(metrics.get("f1", 0.0))
            precisions.append(metrics.get("precision", 0.0))
            recalls.append(metrics.get("recall", 0.0))
            bar_colors.append(COLORS.get(model_key, "gray"))

    if not models:
        print("Warning: No NER results found to plot.")
        return output_path

    x = range(len(models))
    width = 0.25

    fig, ax = plt.subplots(figsize=(8, 6))
    bars_f1 = ax.bar(
        [i - width for i in x], f1_scores, width, label="F1", color=bar_colors, alpha=0.85
    )
    bars_p = ax.bar(
        [i for i in x], precisions, width, label="Precision", color=bar_colors, alpha=0.55
    )
    bars_r = ax.bar(
        [i + width for i in x], recalls, width, label="Recall", color=bar_colors, alpha=0.35
    )

    ax.set_xlabel("Model", fontsize=13)
    ax.set_ylabel("Score", fontsize=13)
    ax.set_title("NER Entity F1: GLiNER2 vs spaCy (CrossNER AI)", fontsize=14, fontweight="bold")
    ax.set_xticks(list(x))
    ax.set_xticklabels(models, fontsize=12)
    ax.set_ylim(0, 1.0)
    ax.legend(loc="upper right")

    # Add value labels on bars
    for bar in bars_f1:
        height = bar.get_height()
        ax.text(
            bar.get_x() + bar.get_width() / 2.0,
            height + 0.01,
            f"{height:.2f}",
            ha="center",
            va="bottom",
            fontsize=10,
        )

    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    print(f"Saved F1 comparison plot: {output_path}")
    return output_path


def plot_classification_comparison(
    results_path: str | Path | None = None,
    output_path: str | Path | None = None,
) -> Path:
    """Plot accuracy comparison for classification models on Banking77 and AG News.

    Args:
        results_path: Path to classification_results.json.
        output_path: Path to save PNG.

    Returns:
        Path to the saved PNG file.
    """
    results_dir = _ensure_results_dir()
    if results_path is None:
        results_path = results_dir / "classification_results.json"
    if output_path is None:
        output_path = results_dir / "classification_comparison.png"

    results_path = Path(results_path)
    output_path = Path(output_path)

    with open(results_path) as f:
        data = json.load(f)

    datasets = ["banking77", "ag_news"]
    dataset_labels = ["Banking77 (77 intents)", "AG News (4 topics)"]
    model_keys = ["gliner2", "deberta_nli"]
    model_labels = ["GLiNER2", "DeBERTa NLI (small)"]

    fig, axes = plt.subplots(1, 2, figsize=(12, 6), sharey=True)

    for ax, dataset, ds_label in zip(axes, datasets, dataset_labels):
        ds_data = data.get(dataset, {})
        accuracies = []
        colors = []
        labels = []

        for mkey, mlabel in zip(model_keys, model_labels):
            model_metrics = ds_data.get(mkey, {}).get("metrics", {})
            acc = model_metrics.get("accuracy", 0.0)
            accuracies.append(acc)
            colors.append(COLORS.get(mkey, "gray"))
            labels.append(mlabel)

        bars = ax.bar(labels, accuracies, color=colors, alpha=0.85, width=0.5)
        ax.set_title(ds_label, fontsize=13, fontweight="bold")
        ax.set_ylabel("Accuracy" if ax == axes[0] else "", fontsize=12)
        ax.set_ylim(0, 1.0)

        for bar in bars:
            height = bar.get_height()
            ax.text(
                bar.get_x() + bar.get_width() / 2.0,
                height + 0.01,
                f"{height:.2f}",
                ha="center",
                va="bottom",
                fontsize=11,
            )

    fig.suptitle(
        "Classification Accuracy: GLiNER2 vs DeBERTa NLI",
        fontsize=15,
        fontweight="bold",
        y=1.01,
    )
    plt.tight_layout()
    fig.savefig(output_path, dpi=150, bbox_inches="tight")
    plt.close(fig)

    print(f"Saved classification comparison plot: {output_path}")
    return output_path


def save_all_plots() -> None:
    """Generate all plots from results JSON files."""
    results_dir = _ensure_results_dir()

    plots = [
        ("latency_results.json", plot_latency_scaling),
        ("ner_results.json", plot_f1_comparison),
        ("classification_results.json", plot_classification_comparison),
    ]

    for filename, plot_fn in plots:
        path = results_dir / filename
        if path.exists():
            try:
                plot_fn(results_path=path)
            except Exception as e:
                print(f"Warning: Failed to generate plot from {filename}: {e}")
        else:
            print(f"Skipping {filename} (not found, run experiments first).")


if __name__ == "__main__":
    save_all_plots()
