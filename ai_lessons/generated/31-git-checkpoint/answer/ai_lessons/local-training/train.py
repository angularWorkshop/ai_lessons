"""Tiny real CPU training lab. Standard library only; not an LLM."""
import argparse
import hashlib
import json
import math
from pathlib import Path
import re


def tokens(text):
    return re.findall(r"[a-z]+", text.lower())


def load_dataset(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("sourceApproved") is not True:
        raise ValueError("Dataset provenance must be approved")
    groups, texts = {}, {}
    for split in ("train", "validation", "test"):
        rows = data.get(split)
        if not isinstance(rows, list) or not rows:
            raise ValueError("All three splits must be nonempty")
        for row in rows:
            if not isinstance(row.get("text"), str) or not tokens(row["text"]):
                raise ValueError("Text must contain words")
            if type(row.get("label")) is not int or row["label"] not in (0, 1):
                raise ValueError("Labels must be integer 0 (docs) or 1 (bugfix)")
            group = row.get("group")
            if not isinstance(group, str) or not group.strip():
                raise ValueError("Each row needs a source group")
            text = " ".join(tokens(row["text"]))
            if (group in groups and groups[group] != split) or (text in texts and texts[text] != split):
                raise ValueError("Cross-split group or text leakage")
            groups[group], texts[text] = split, split
    if {r["label"] for r in data["train"]} != {0, 1}:
        raise ValueError("Training data must contain both classes")
    return data


def features(text, vocabulary):
    words = set(tokens(text))
    return [float(word in words) for word in vocabulary]


def probability(vector, weights, bias):
    z = max(-40, min(40, sum(x * w for x, w in zip(vector, weights)) + bias))
    return 1 / (1 + math.exp(-z))


def loss(rows, weights, bias):
    values = []
    for x, y in rows:
        p = min(1 - 1e-12, max(1e-12, probability(x, weights, bias)))
        values.append(-y * math.log(p) - (1 - y) * math.log(1 - p))
    return sum(values) / len(values)


def predict(model, text):
    p = probability(features(text, model["vocabulary"]), model["weights"], model["bias"])
    return {"label": "bugfix" if p >= 0.5 else "docs", "probabilityBugfix": p}


def train(data, epochs=160, learning_rate=0.5):
    if epochs < 1 or not 0 < learning_rate <= 2:
        raise ValueError("Invalid training settings")
    vocabulary = sorted({word for row in data["train"] for word in tokens(row["text"])})
    rows = {split: [(features(r["text"], vocabulary), r["label"]) for r in data[split]]
            for split in ("train", "validation", "test")}
    weights, bias = [0.0] * len(vocabulary), 0.0
    history = []
    best = (float("inf"), 0, weights[:], bias)
    for epoch in range(epochs + 1):
        train_loss, validation_loss = loss(rows["train"], weights, bias), loss(rows["validation"], weights, bias)
        history.append({"epoch": epoch, "trainLoss": train_loss, "validationLoss": validation_loss})
        if validation_loss < best[0]:
            best = validation_loss, epoch, weights[:], bias
        if epoch == epochs:
            break
        errors = [(x, probability(x, weights, bias) - y) for x, y in rows["train"]]
        n = len(errors)
        weights = [w - learning_rate * sum(x[i] * error for x, error in errors) / n for i, w in enumerate(weights)]
        bias -= learning_rate * sum(error for _, error in errors) / n
    _, selected_epoch, weights, bias = best
    majority = int(sum(y for _, y in rows["train"]) >= len(rows["train"]) / 2)
    accuracy = lambda split: sum(int(probability(x, weights, bias) >= 0.5) == y for x, y in rows[split]) / len(rows[split])
    return {
        "schemaVersion": 1, "kind": "bag-of-words-logistic", "vocabulary": vocabulary,
        "weights": weights, "bias": bias,
        "datasetSha256": hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest(),
        "selectionSplit": "validation", "selectedEpoch": selected_epoch, "history": history,
        "metrics": {"trainAccuracy": accuracy("train"), "testAccuracy": accuracy("test"),
                    "baselineTestAccuracy": sum(y == majority for _, y in rows["test"]) / len(rows["test"])},
    }


def load_model(path):
    model = json.loads(Path(path).read_text(encoding="utf-8"))
    if model.get("schemaVersion") != 1 or model.get("kind") != "bag-of-words-logistic":
        raise ValueError("Unsupported model")
    if not isinstance(model.get("vocabulary"), list) or not model["vocabulary"] or not all(isinstance(w, str) for w in model["vocabulary"]):
        raise ValueError("Invalid vocabulary")
    weights, bias = model.get("weights"), model.get("bias")
    if not isinstance(weights, list) or len(weights) != len(model["vocabulary"]) or not all(type(w) in (int, float) and math.isfinite(w) for w in weights):
        raise ValueError("Invalid weights")
    if type(bias) not in (int, float) or not math.isfinite(bias):
        raise ValueError("Invalid bias")
    return model


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--data", type=Path, default=Path(__file__).with_name("dataset.json"))
    parser.add_argument("--output", type=Path, default=Path(__file__).with_name("model.json"))
    args = parser.parse_args()
    model = train(load_dataset(args.data))
    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(model, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"selectedEpoch": model["selectedEpoch"], "selectionSplit": model["selectionSplit"], **model["metrics"]}, indent=2))
    print("Synthetic teaching data only. These scores do not estimate real-world quality.")
