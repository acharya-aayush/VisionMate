import numpy as np
from fastapi.testclient import TestClient

import face_recognition_api as api
from simple_recognizer import RecognitionResult


def test_list_users_contract(monkeypatch):
    monkeypatch.setattr(api.recognizer, "list_users", lambda: {1: "Aayush", 2: "Devesh"})

    client = TestClient(api.app)
    response = client.get("/users")

    assert response.status_code == 200
    payload = response.json()
    assert payload["count"] == 2
    assert payload["users"]["1"] == "Aayush"


def test_train_max_samples_passthrough(monkeypatch):
    capture = {}

    def fake_train(max_per_user=100):
        capture["max_per_user"] = max_per_user
        return {"processed": 1, "failed": 0, "users": 1}

    monkeypatch.setattr(api.recognizer, "train", fake_train)

    client = TestClient(api.app)
    response = client.post("/train?max_samples=24")

    assert response.status_code == 200
    assert capture["max_per_user"] == 24
    assert response.json()["success"] is True


def test_recognize_base64_response_shape(monkeypatch):
    monkeypatch.setattr(
        api,
        "decode_base64_image",
        lambda _payload: np.zeros((120, 120, 3), dtype=np.uint8),
    )
    monkeypatch.setattr(
        api.recognizer,
        "recognize",
        lambda _img: [
            RecognitionResult(
                user_id=1,
                user_name="Aayush",
                confidence=82.3,
                face_location=(10, 80, 90, 5),
                is_known=True,
            )
        ],
    )

    client = TestClient(api.app)
    response = client.post("/recognize-base64", json={"image": "abc"})

    assert response.status_code == 200
    payload = response.json()
    assert payload["success"] is True
    assert payload["faces"][0]["user_name"] == "Aayush"
    assert "timestamp" in payload
