"""
Latency benchmark for VisionMate recognition API.

Usage:
  python benchmark_navigation.py --runs 30 --api-url http://localhost:8000
"""

import argparse
import base64
import json
import statistics
import time
from pathlib import Path
from typing import List

import requests


def get_sample_image(dataset_root: Path) -> Path:
    for user_dir in sorted(dataset_root.iterdir()):
        if not user_dir.is_dir():
            continue
        jpg_files = sorted(user_dir.glob("*.jpg"))
        if jpg_files:
            return jpg_files[0]
    raise FileNotFoundError("No sample image found in dataset")


def encode_image_base64(image_path: Path) -> str:
    raw = image_path.read_bytes()
    return "data:image/jpeg;base64," + base64.b64encode(raw).decode("utf-8")


def percentile(values: List[float], p: float) -> float:
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = int((p / 100.0) * (len(sorted_values) - 1))
    return sorted_values[index]


def run_benchmark(api_url: str, image_payload: str, runs: int) -> dict:
    timings_ms: List[float] = []
    success_count = 0

    endpoint = f"{api_url.rstrip('/')}/recognize-base64"

    for _ in range(runs):
        start = time.perf_counter()
        response = requests.post(endpoint, json={"image": image_payload}, timeout=20)
        elapsed_ms = (time.perf_counter() - start) * 1000
        timings_ms.append(elapsed_ms)

        if response.ok:
            success_count += 1

    return {
        "runs": runs,
        "successes": success_count,
        "failures": runs - success_count,
        "min_ms": round(min(timings_ms), 2),
        "max_ms": round(max(timings_ms), 2),
        "avg_ms": round(statistics.mean(timings_ms), 2),
        "p50_ms": round(percentile(timings_ms, 50), 2),
        "p95_ms": round(percentile(timings_ms, 95), 2),
        "p99_ms": round(percentile(timings_ms, 99), 2),
    }


def main() -> None:
    parser = argparse.ArgumentParser(description="Benchmark recognition latency")
    parser.add_argument("--api-url", default="http://localhost:8000", help="Base API URL")
    parser.add_argument("--runs", type=int, default=30, help="Number of benchmark runs")
    parser.add_argument(
        "--dataset",
        default=str(Path(__file__).resolve().parent / "dataset"),
        help="Path to dataset folder",
    )

    args = parser.parse_args()
    dataset_path = Path(args.dataset)

    sample_image = get_sample_image(dataset_path)
    payload = encode_image_base64(sample_image)
    result = run_benchmark(args.api_url, payload, args.runs)

    print(json.dumps({
        "sample_image": str(sample_image),
        "api_url": args.api_url,
        "result": result,
    }, indent=2))


if __name__ == "__main__":
    main()
