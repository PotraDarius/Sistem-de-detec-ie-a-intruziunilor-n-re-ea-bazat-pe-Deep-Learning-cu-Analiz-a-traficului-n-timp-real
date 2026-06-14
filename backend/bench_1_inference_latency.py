"""
bench_1_inference_latency.py
=============================
Test 1: Latența inferenței modelului NIDS_1D_CNN, izolat de restul pipeline-ului.
Măsoară timpul de procesare al funcției predict_packet() pe 1000 de vectori sintetici.

Rulare:
    python bench_1_inference_latency.py

Output:
    - Statistici: min, max, mean, median, p95, p99 (microsecunde)
    - Fișier CSV cu toate măsurătorile: bench_1_results.csv
"""

import time
import csv
import numpy as np
import statistics
from backend_inference import predict_packet

NUM_ITERATIONS = 1000
WARMUP_ITERATIONS = 50

print("=" * 70)
print("Test 1: Latența inferenței modelului NIDS_1D_CNN")
print("=" * 70)

np.random.seed(42)
synthetic_features = []
for _ in range(NUM_ITERATIONS + WARMUP_ITERATIONS):
    features = [
        np.random.randint(1, 65535),       
        np.random.uniform(64, 1500),       
        np.random.uniform(0, 1500),        
        np.random.uniform(0, 50000),       
        np.random.uniform(64, 1500),       
        np.random.choice([20, 24, 32, 40]),
        np.random.randint(0, 50),          
        np.random.uniform(100, 10000000),  
        np.random.uniform(0, 100000),      
        np.random.uniform(0, 500000),      
        np.random.uniform(0, 500),         
        np.random.randint(0, 100),         
        np.random.randint(0, 5),           
        np.random.randint(0, 5),           
    ]
    synthetic_features.append(features)

print(f"\nWarmup: {WARMUP_ITERATIONS} iterații...")
for i in range(WARMUP_ITERATIONS):
    predict_packet(synthetic_features[i])

print(f"Măsurare: {NUM_ITERATIONS} iterații...")
latencies_us = []
for i in range(WARMUP_ITERATIONS, WARMUP_ITERATIONS + NUM_ITERATIONS):
    t0 = time.perf_counter()
    pred, conf = predict_packet(synthetic_features[i])
    t1 = time.perf_counter()
    latencies_us.append((t1 - t0) * 1_000_000)

print("\n" + "=" * 70)
print("REZULTATE — Latență inferență (microsecunde)")
print("=" * 70)
print(f"  Min       : {min(latencies_us):.2f} μs")
print(f"  Max       : {max(latencies_us):.2f} μs")
print(f"  Mean      : {statistics.mean(latencies_us):.2f} μs")
print(f"  Median    : {statistics.median(latencies_us):.2f} μs")
print(f"  Std dev   : {statistics.stdev(latencies_us):.2f} μs")
print(f"  P95       : {np.percentile(latencies_us, 95):.2f} μs")
print(f"  P99       : {np.percentile(latencies_us, 99):.2f} μs")
print(f"  Throughput: {1_000_000 / statistics.mean(latencies_us):.0f} inferențe/sec")

csv_path = "bench_1_results.csv"
with open(csv_path, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["iteration", "latency_us"])
    for i, lat in enumerate(latencies_us):
        writer.writerow([i + 1, f"{lat:.2f}"])

print(f"\n✅ Detalii salvate în: {csv_path}")