"""
bench_4_api_latency.py
=======================
Test 4: Latența endpoint-urilor REST API.

Măsoară timpul de răspuns al fiecărui endpoint sub un număr de iterații.
Rulează în timp ce sniffer-ul e activ și colectează date (recomandat),
pentru a captura latența reală sub contenție pe state_lock.

Rulare:
    python bench_4_api_latency.py
"""

import time
import requests
import statistics
import csv
import numpy as np

API_BASE = "http://localhost:5000"
NUM_ITERATIONS = 500
WARMUP = 20

ENDPOINTS = [
    ("/api/health",              "GET"),
    ("/api/interfaces",          "GET"),
    ("/api/recent?limit=40",     "GET"),
    ("/api/stats",               "GET"),
    ("/api/timeline?buckets=30", "GET"),
]

print("=" * 70)
print("Test 4: Latența endpoint-urilor REST API")
print("=" * 70)
print(f"  Iterații per endpoint: {NUM_ITERATIONS} (+ {WARMUP} warmup)")
print()

try:
    r = requests.get(f"{API_BASE}/api/health", timeout=2)
    r.raise_for_status()
except Exception as e:
    print(f"❌ Nu pot contacta backend-ul: {e}")
    raise SystemExit(1)

results_summary = {}

for endpoint, method in ENDPOINTS:
    url = f"{API_BASE}{endpoint}"
    print(f"📡 Testare {method} {endpoint}")

    for _ in range(WARMUP):
        requests.get(url, timeout=5)

    latencies_ms = []
    for _ in range(NUM_ITERATIONS):
        t0 = time.perf_counter()
        r = requests.get(url, timeout=5)
        t1 = time.perf_counter()
        if r.status_code == 200:
            latencies_ms.append((t1 - t0) * 1000)

    if not latencies_ms:
        print(f"   ⚠️  Toate cererile au eșuat\n")
        continue

    summary = {
        "min":    min(latencies_ms),
        "max":    max(latencies_ms),
        "mean":   statistics.mean(latencies_ms),
        "median": statistics.median(latencies_ms),
        "p95":    np.percentile(latencies_ms, 95),
        "p99":    np.percentile(latencies_ms, 99),
    }
    results_summary[endpoint] = summary

    print(f"   min={summary['min']:.2f}ms  mean={summary['mean']:.2f}ms  "
          f"median={summary['median']:.2f}ms  p95={summary['p95']:.2f}ms  "
          f"p99={summary['p99']:.2f}ms  max={summary['max']:.2f}ms")
    print()

with open("bench_4_results.csv", "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["endpoint", "min_ms", "mean_ms", "median_ms", "p95_ms", "p99_ms", "max_ms"])
    for endpoint, s in results_summary.items():
        writer.writerow([
            endpoint,
            f"{s['min']:.2f}", f"{s['mean']:.2f}", f"{s['median']:.2f}",
            f"{s['p95']:.2f}", f"{s['p99']:.2f}", f"{s['max']:.2f}"
        ])

print("=" * 70)
print("SUMAR")
print("=" * 70)
print(f"{'Endpoint':<32} {'Mean (ms)':>12} {'P95 (ms)':>12} {'P99 (ms)':>12}")
print("-" * 70)
for endpoint, s in results_summary.items():
    print(f"{endpoint:<32} {s['mean']:>12.2f} {s['p95']:>12.2f} {s['p99']:>12.2f}")

print(f"\n✅ Sumar salvat în: bench_4_results.csv")