import copy
import json
from pathlib import Path
import tempfile
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen
from train import load_dataset, load_model, predict, train
from serve import make_server


class TrainingTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.data = load_dataset(Path(__file__).with_name("dataset.json"))
        cls.model = train(cls.data)

    def test_real_training_changes_weights_and_reduces_loss(self):
        self.assertTrue(any(abs(w) > 0.01 for w in self.model["weights"]))
        history = self.model["history"]
        self.assertLess(history[-1]["trainLoss"], history[0]["trainLoss"] - 0.05)
        self.assertEqual(self.model["selectionSplit"], "validation")
        self.assertEqual(self.model["selectedEpoch"], min(history, key=lambda r: r["validationLoss"])["epoch"])
        self.assertGreater(self.model["metrics"]["testAccuracy"], self.model["metrics"]["baselineTestAccuracy"])

    def test_determinism_and_holdout_is_not_training(self):
        self.assertEqual(self.model, train(self.data))
        changed = copy.deepcopy(self.data)
        changed["test"][0]["text"] += " sealedholdoutword"
        changed["test"][0]["label"] = 0
        model = train(changed)
        self.assertNotIn("sealedholdoutword", model["vocabulary"])
        for key in ("weights", "vocabulary", "bias", "selectedEpoch", "history"):
            self.assertEqual(self.model[key], model[key])

    def test_dataset_rejects_leakage_and_invalid_records(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "data.json"
            for mutate in (
                lambda d: d.update(sourceApproved=False),
                lambda d: d["test"][0].update(group=d["train"][0]["group"]),
                lambda d: d["test"][0].update(text=d["train"][0]["text"].upper()),
                lambda d: d["train"][0].update(label=4),
                lambda d: d.update(validation=[]),
            ):
                data = copy.deepcopy(self.data)
                mutate(data)
                path.write_text(json.dumps(data), encoding="utf-8")
                with self.assertRaises(ValueError):
                    load_dataset(path)

    def test_export_reload_and_real_http_inference(self):
        with tempfile.TemporaryDirectory() as tmp:
            path = Path(tmp) / "model.json"
            path.write_text(json.dumps(self.model), encoding="utf-8")
            restored = load_model(path)
            self.assertEqual(predict(restored, "fix crash"), predict(self.model, "fix crash"))
            server = make_server(restored, 0)
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            base = f"http://127.0.0.1:{server.server_port}"
            try:
                with urlopen(base + "/health", timeout=3) as response:
                    self.assertTrue(json.load(response)["ready"])
                request = Request(base + "/predict", data=b'{"text":"fix crash"}', headers={"Content-Type": "application/json"})
                with urlopen(request, timeout=3) as response:
                    self.assertEqual(json.load(response)["label"], "bugfix")
                for body in (b"{}", b"[]", b"invalid"):
                    with self.assertRaises(HTTPError) as error:
                        urlopen(Request(base + "/predict", data=body), timeout=3)
                    self.assertEqual(error.exception.code, 400)
                with self.assertRaises(HTTPError) as error:
                    urlopen(Request(base + "/predict", data=b'{"text":"fix"}', headers={"Origin": "https://outside.example"}), timeout=3)
                self.assertEqual(error.exception.code, 403)
            finally:
                server.shutdown()
                server.server_close()
                thread.join(timeout=3)


if __name__ == "__main__":
    unittest.main()
