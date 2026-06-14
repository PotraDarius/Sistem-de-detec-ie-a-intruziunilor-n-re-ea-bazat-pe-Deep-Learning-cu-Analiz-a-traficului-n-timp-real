"""
bench_2_flow_pipeline_latency.py
=================================
Test 2: Latența pipeline-ului complet de procesare a unui flux:
extragere features + scaler + inferență + scriere CSV + record în feed.

Simulăm fluxuri complete (cu structura din sniffer) și măsurăm de la
momentul declanșării închiderii fluxului până la apariția lui în recent_flows.

Rulare:
    python bench_2_flow_pipeline_latency.py

Output:
    - Statistici: min, max, mean, median, p95, p99 (microsecunde)
    - Fișier CSV cu toate măsurătorile: bench_2_results.csv
"""

import time
import csv
import numpy as np
import statistics
from collections import deque, defaultdict
import threading

from backend_inference import predict_packet

NUM_ITERATIONS = 10000
WARMUP_ITERATIONS = 100

print("=" * 70)
print("Test 2: Latența pipeline-ului complet de procesare a unui flux")
print("=" * 70)

# Reproducem state-ul minimal partajat din live_sniffer_with_api.py
state_lock = threading.Lock()
recent_flows = deque(maxlen=200)
class_counts = defaultdict(int)
totals = {"packets": 0, "flows": 0, "alerts": 0, "conf_sum": 0.0}

def _record_flow(flow_dict, prediction, confidence, packet_count):
    with state_lock:
        recent_flows.appendleft(flow_dict)
        class_counts[prediction] += 1
        totals["flows"]    += 1
        totals["packets"]  += packet_count
        totals["conf_sum"] += confidence
        if prediction not in ("Normal", "Suspicious"):
            totals["alerts"] += 1


def simulate_flow_close(flow_data):
    """Simulează exact codul din process_packet la momentul închiderii fluxului."""
    avg_packet_size      = float(np.mean(flow_data["packets"]))
    bwd_pkt_len_min      = min(flow_data["bwd_packets_len"]) if flow_data["bwd_packets_len"] else 0
    tot_len_fwd_pkts     = sum(flow_data["fwd_packets_len"])
    fwd_pkt_len_mean     = float(np.mean(flow_data["fwd_packets_len"])) if flow_data["fwd_packets_len"] else 0
    min_seg_size_forward = flow_data["min_seg_size"] if flow_data["min_seg_size"] != float('inf') else 0
    psh_flag_count       = flow_data["psh_count"]
    flow_duration        = (flow_data["last_time"] - flow_data["start_time"]) * 1_000_000
    flow_iat_mean        = float(np.mean(flow_data["iats"]) * 1_000_000) if flow_data["iats"] else 0
    flow_iat_max         = float(max(flow_data["iats"])    * 1_000_000) if flow_data["iats"] else 0
    packet_length_std    = float(np.std(flow_data["packets"])) if len(flow_data["packets"]) > 1 else 0
    ack_flag_count       = flow_data["ack_count"]
    fin_flag_count       = flow_data["fin_count"]
    urg_flag_count       = flow_data["urg_count"]

    features = [
        flow_data["port_dst"], avg_packet_size, bwd_pkt_len_min, tot_len_fwd_pkts,
        fwd_pkt_len_mean, min_seg_size_forward, psh_flag_count,
        flow_duration, flow_iat_mean, flow_iat_max, packet_length_std,
        ack_flag_count, fin_flag_count, urg_flag_count,
    ]

    predictie, probabilitate = predict_packet(features)

    flow_dict = {
        "id": f"{time.time():.6f}",
        "ipSrc": "192.168.1.1", "portSrc": 12345,
        "ipDst": "192.168.1.2", "portDst": flow_data["port_dst"],
        "packets": len(flow_data["packets"]),
        "prediction": predictie,
        "confidence": round(float(probabilitate), 2),
    }
    _record_flow(flow_dict, predictie, float(probabilitate), len(flow_data["packets"]))
    return predictie, probabilitate


# Generăm fluxuri sintetice realiste
print(f"\nGenerare {NUM_ITERATIONS + WARMUP_ITERATIONS} fluxuri sintetice...")
np.random.seed(42)
flows_data = []
for _ in range(NUM_ITERATIONS + WARMUP_ITERATIONS):
    n_packets = np.random.randint(2, 10)
    packet_lens = [np.random.randint(64, 1500) for _ in range(n_packets)]
    start_t = time.time()
    iats = [np.random.uniform(0.0001, 0.01) for _ in range(n_packets - 1)]
    last_t = start_t + sum(iats)
    fwd_count = max(1, n_packets // 2)

    flow = {
        "port_dst": np.random.choice([80, 443, 22, 21, 8080, 3306]),
        "start_time": start_t,
        "last_time": last_t,
        "packets": packet_lens,
        "fwd_packets_len": packet_lens[:fwd_count],
        "bwd_packets_len": packet_lens[fwd_count:],
        "iats": iats,
        "psh_count": np.random.randint(0, 5),
        "ack_count": np.random.randint(0, n_packets),
        "fin_count": 1,
        "urg_count": 0,
        "min_seg_size": np.random.choice([20, 24, 32, 40]),
    }
    flows_data.append(flow)

# Warmup
print(f"Warmup: {WARMUP_ITERATIONS} iterații...")
for i in range(WARMUP_ITERATIONS):
    simulate_flow_close(flows_data[i])

# Reset state pentru măsurătoarea reală
recent_flows.clear()
class_counts.clear()
totals.update({"packets": 0, "flows": 0, "alerts": 0, "conf_sum": 0.0})

# Măsurătoare reală
print(f"Măsurare: {NUM_ITERATIONS} iterații...")
latencies_us = []
for i in range(WARMUP_ITERATIONS, WARMUP_ITERATIONS + NUM_ITERATIONS):
    t0 = time.perf_counter()
    simulate_flow_close(flows_data[i])
    t1 = time.perf_counter()
    latencies_us.append((t1 - t0) * 1_000_000)

# Statistici
print("\n" + "=" * 70)
print("REZULTATE — Latență pipeline complet flux (microsecunde)")
print("=" * 70)
print(f"  Min       : {min(latencies_us):.2f} μs")
print(f"  Max       : {max(latencies_us):.2f} μs")
print(f"  Mean      : {statistics.mean(latencies_us):.2f} μs")
print(f"  Median    : {statistics.median(latencies_us):.2f} μs")
print(f"  Std dev   : {statistics.stdev(latencies_us):.2f} μs")
print(f"  P95       : {np.percentile(latencies_us, 95):.2f} μs")
print(f"  P99       : {np.percentile(latencies_us, 99):.2f} μs")
print(f"  Throughput: {1_000_000 / statistics.mean(latencies_us):.0f} fluxuri/sec")

csv_path = "bench_2_results.csv"
with open(csv_path, "w", newline="") as f:
    writer = csv.writer(f)
    writer.writerow(["iteration", "latency_us"])
    for i, lat in enumerate(latencies_us):
        writer.writerow([i + 1, f"{lat:.2f}"])

print(f"\n✅ Detalii salvate în: {csv_path}")