"""
live_sniffer_with_api.py - NIDS Live Interceptor + Dashboard API
========================================================
Sniffer Scapy (1D-CNN) + server Flask, in același proces, în thread-uri
separate. Sesiune-based: la fiecare start se generează un fișier CSV nou,
iar la stop datele rămân disponibile pentru descărcare.

Variabile de mediu (toate opționale):
    NIDS_INTERFACE   interfața de capturat   (default: eth0)
    NIDS_LOG_DIR     unde scrie CSV-urile    (default: .)
    NIDS_API_HOST    host bind pentru Flask  (default: 0.0.0.0)
    NIDS_API_PORT    port pentru Flask       (default: 5000)
    NIDS_JWT_SECRET  secret pentru JWT       (vezi auth.py)
    NIDS_DB_PATH     cale SQLite             (vezi auth.py)

Endpoint-uri (toate protejate cu JWT, mai puțin /api/health):
    GET  /api/recent?limit=40
    GET  /api/stats
    GET  /api/timeline?buckets=30
    GET  /api/health                       (public — pentru Docker healthcheck)
    GET  /api/interfaces
    POST /api/start            { interface: "eth0" }
    POST /api/stop
    GET  /api/download_log     → întoarce ultimul CSV ca attachment

Endpoint-uri auth (vezi auth.py):
    POST   /api/auth/register
    POST   /api/auth/login
    GET    /api/auth/me
    PUT    /api/auth/update
    DELETE /api/auth/delete
"""

import os
import time
import threading
import csv
from collections import deque, defaultdict
from datetime import datetime, timezone

import numpy as np
from scapy.all import sniff, IP, TCP, Ether, get_if_list
from flask import Flask, jsonify, request, send_file, abort
from flask_cors import CORS

from backend_inference import predict_packet
from auth import init_auth, token_required

# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
INTERFACE  = os.environ.get("NIDS_INTERFACE",  "eth0")
LOG_DIR    = os.environ.get("NIDS_LOG_DIR",    ".")
API_HOST   = os.environ.get("NIDS_API_HOST",   "0.0.0.0")
API_PORT   = int(os.environ.get("NIDS_API_PORT", "5000"))

FEED_RING_SIZE       = 200
TIMELINE_BUCKET_SEC  = 5
TIMELINE_MAX_BUCKETS = 120

ATTACK_CLASSES = ["Normal", "Suspicious", "DoS", "DDoS", "PortScan", "BruteForce", "WebAttack", "Botnet"]

CSV_HEADER = [
    "Timestamp", "MAC Sursă", "IP Sursă", "Port Sursă",
    "MAC Dest", "IP Dest", "Port Dest", "Total Pachete",
    "Durată (ms)", "Status/Atac", "Confidență",
]

# ─────────────────────────────────────────────────────────────────────────────
# STATE PARTAJAT
# ─────────────────────────────────────────────────────────────────────────────
state_lock = threading.Lock()

sniffer_running = False        
sniffer_thread  = None
current_log_file = None        

recent_flows = deque(maxlen=FEED_RING_SIZE)
class_counts = defaultdict(int)
totals = {"packets": 0, "flows": 0, "alerts": 0, "conf_sum": 0.0}
timeline_buckets = {}

active_flows = {}

os.makedirs(LOG_DIR, exist_ok=True)


# ─────────────────────────────────────────────────────────────────────────────
# RESET STATE
# ─────────────────────────────────────────────────────────────────────────────
def reset_backend_state():
    """Golește toată memoria de sesiune (feed, contoare, timeline, fluxuri active)."""
    with state_lock:
        recent_flows.clear()
        class_counts.clear()
        totals["packets"]  = 0
        totals["flows"]    = 0
        totals["alerts"]   = 0
        totals["conf_sum"] = 0.0
        timeline_buckets.clear()
        active_flows.clear()
    print("🧹 State resetat — sesiune curată.", flush=True)


def start_new_log_session():
    """Creează un fișier CSV nou cu timestamp și scrie header-ul."""
    global current_log_file
    ts = datetime.now().strftime("%Y%m%d_%H%M%S")
    path = os.path.join(LOG_DIR, f"capture_{ts}.csv")
    with open(path, mode="w", newline="") as f:
        csv.writer(f).writerow(CSV_HEADER)
    current_log_file = path
    print(f"📝 Sesiune nouă de log: {path}", flush=True)
    return path


# ─────────────────────────────────────────────────────────────────────────────
# HELPERI
# ─────────────────────────────────────────────────────────────────────────────
def _bucket_key(ts: float) -> int:
    return int(ts) - (int(ts) % TIMELINE_BUCKET_SEC)


def _record_flow(flow_dict, prediction, confidence, packet_count):
    with state_lock:
        recent_flows.appendleft(flow_dict)
        class_counts[prediction] += 1
        totals["flows"]    += 1
        totals["packets"]  += packet_count
        totals["conf_sum"] += confidence
        if prediction not in ("Normal", "Suspicious"):
            totals["alerts"] += 1

        key = _bucket_key(time.time())
        bucket = timeline_buckets.setdefault(key, {"normal": 0, "attacks": 0})
        if prediction == "Normal":
            bucket["normal"] += 1
        elif prediction != "Suspicious":
            bucket["attacks"] += 1

        if len(timeline_buckets) > TIMELINE_MAX_BUCKETS * 2:
            cutoff = key - TIMELINE_MAX_BUCKETS * TIMELINE_BUCKET_SEC
            for k in [k for k in timeline_buckets if k < cutoff]:
                del timeline_buckets[k]


# ─────────────────────────────────────────────────────────────────────────────
# SNIFFER
# ─────────────────────────────────────────────────────────────────────────────
def process_packet(packet):
    if not (IP in packet and TCP in packet):
        return

    mac_src = packet[Ether].src if Ether in packet else "N/A"
    mac_dst = packet[Ether].dst if Ether in packet else "N/A"
    ip_src  = packet[IP].src
    ip_dst  = packet[IP].dst
    port_src = packet[TCP].sport
    port_dst = packet[TCP].dport

    flow_key  = tuple(sorted([f"{ip_src}:{port_src}", f"{ip_dst}:{port_dst}"]))
    pkt_len   = len(packet)
    pkt_time  = time.time()
    tcp_flags = packet[TCP].flags

    if flow_key not in active_flows:
        active_flows[flow_key] = {
            "start_time": pkt_time, "last_time": pkt_time,
            "packets": [], "fwd_packets_len": [], "bwd_packets_len": [],
            "iats": [],
            "psh_count": 0, "ack_count": 0, "fin_count": 0, "urg_count": 0,
            "fwd_ip": ip_src, "mac_src": mac_src, "mac_dst": mac_dst,
            "min_seg_size": float('inf'),
        }

    flow = active_flows[flow_key]
    iat = pkt_time - flow["last_time"]
    if iat > 0:
        flow["iats"].append(iat)
    flow["last_time"] = pkt_time
    flow["packets"].append(pkt_len)
    seg_size = len(packet[TCP])

    if ip_src == flow["fwd_ip"]:
        flow["fwd_packets_len"].append(pkt_len)
    if seg_size < flow["min_seg_size"]:
        flow["min_seg_size"] = seg_size
    else:
        flow["bwd_packets_len"].append(pkt_len)

    if "P" in tcp_flags: flow["psh_count"] += 1
    if "A" in tcp_flags: flow["ack_count"] += 1
    if "F" in tcp_flags: flow["fin_count"] += 1
    if "U" in tcp_flags: flow["urg_count"] += 1

    if "F" in tcp_flags or "R" in tcp_flags or len(flow["packets"]) >= 5:
        avg_packet_size      = float(np.mean(flow["packets"]))
        bwd_pkt_len_min      = min(flow["bwd_packets_len"]) if flow["bwd_packets_len"] else 0
        tot_len_fwd_pkts     = sum(flow["fwd_packets_len"])
        fwd_pkt_len_mean     = float(np.mean(flow["fwd_packets_len"])) if flow["fwd_packets_len"] else 0
        min_seg_size_forward = flow["min_seg_size"] if flow["min_seg_size"] != float('inf') else 0
        psh_flag_count       = flow["psh_count"]
        flow_duration        = (flow["last_time"] - flow["start_time"]) * 1_000_000
        flow_iat_mean        = float(np.mean(flow["iats"]) * 1_000_000) if flow["iats"] else 0
        flow_iat_max         = float(max(flow["iats"])    * 1_000_000) if flow["iats"] else 0
        packet_length_std    = float(np.std(flow["packets"])) if len(flow["packets"]) > 1 else 0
        ack_flag_count       = flow["ack_count"]
        fin_flag_count       = flow["fin_count"]
        urg_flag_count       = flow["urg_count"]

        features = [
            port_dst, avg_packet_size, bwd_pkt_len_min, tot_len_fwd_pkts,
            fwd_pkt_len_mean, min_seg_size_forward, psh_flag_count,
            flow_duration, flow_iat_mean, flow_iat_max, packet_length_std,
            ack_flag_count, fin_flag_count, urg_flag_count,
        ]

        predictie, probabilitate = predict_packet(features)

        current_time = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        total_pkts   = len(flow["packets"])
        duration_ms  = round(flow_duration / 1000, 2)

        if predictie == "Normal":
            print(f"🟢 [NORMAL] {current_time} | {ip_src}:{port_src} -> {ip_dst}:{port_dst} | Pkts: {total_pkts} | Conf: {probabilitate:.1f}%", flush=True)
        else:
            print(f"🔴 [ATAC: {predictie.upper()}] {current_time}", flush=True)
            print(f"    ├─ Sursă: {ip_src}:{port_src} (MAC: {flow['mac_src']})", flush=True)
            print(f"    ├─ Dest : {ip_dst}:{port_dst} (MAC: {flow['mac_dst']})", flush=True)
            print(f"    ├─ Detalii: {total_pkts} pachete în {duration_ms} ms", flush=True)
            print(f"    └─ Confidență AI: {probabilitate:.2f}%\n", flush=True)

        if current_log_file:
            with open(current_log_file, mode="a", newline="") as f:
                csv.writer(f).writerow([
                    current_time, flow["mac_src"], ip_src, port_src,
                    flow["mac_dst"], ip_dst, port_dst, total_pkts,
                    duration_ms, predictie, f"{probabilitate:.2f}%",
                ])

        flow_dict = {
            "id":         f"{pkt_time:.6f}-{port_src}-{port_dst}",
            "ts":         datetime.now(timezone.utc).isoformat(),
            "ipSrc":      ip_src,
            "portSrc":    port_src,
            "ipDst":      ip_dst,
            "portDst":    port_dst,
            "macSrc":     flow["mac_src"],
            "macDst":     flow["mac_dst"],
            "packets":    total_pkts,
            "durationMs": duration_ms,
            "prediction": predictie,
            "confidence": round(float(probabilitate), 2),
        }
        _record_flow(flow_dict, predictie, float(probabilitate), total_pkts)

        del active_flows[flow_key]


def run_sniffer(iface_to_sniff):
    global sniffer_running
    bpf_filter = "not port 5000"

    print(f"🛡️  Sniffer Scapy pornit pe interfața {iface_to_sniff}…", flush=True)
    while sniffer_running:
        try:
            sniff(prn=process_packet, store=False, iface=iface_to_sniff,
                  timeout=1, filter=bpf_filter)
        except Exception as e:
            print(f"❌ Sniffer eroare: {e}", flush=True)
            time.sleep(1)
    print("🛑 Sniffer oprit din Dashboard.", flush=True)

# ─────────────────────────────────────────────────────────────────────────────
# FLASK API
# ─────────────────────────────────────────────────────────────────────────────
app = Flask(__name__)
CORS(app)

init_auth(app)


@app.get("/api/recent")
@token_required
def api_recent():
    limit = int(request.args.get("limit", 40))
    with state_lock:
        flows = list(recent_flows)[:limit]
    return jsonify({"flows": flows, "count": len(flows)})


@app.get("/api/stats")
@token_required
def api_stats():
    with state_lock:
        total_flows = totals["flows"]
        normal_n    = class_counts.get("Normal", 0)
        avg_conf    = (totals["conf_sum"] / total_flows) if total_flows else 0.0
        distribution = {cls: class_counts.get(cls, 0) for cls in ATTACK_CLASSES}
        active = len(active_flows)
        recent_pkts = sum(b["normal"] + b["attacks"] for b in timeline_buckets.values())
        throughput_mbps = round((recent_pkts * 800 * 8) / (10 * 1_000_000), 1)

    return jsonify({
        "totalFlows":     total_flows,
        "totalPackets":   totals["packets"],
        "criticalAlerts": totals["alerts"],
        "normalRatio":    (normal_n / total_flows * 100) if total_flows else 100.0,
        "activeFlows":    active,
        "distribution":   distribution,
        "avgConfidence":  round(avg_conf, 1),
        "throughputMbps": throughput_mbps,
        "isSniffing":     sniffer_running,
        "hasLog":         current_log_file is not None,
    })


@app.get("/api/interfaces")
@token_required
def api_interfaces():
    ifaces = get_if_list()
    return jsonify({"interfaces": ifaces, "current": INTERFACE})


@app.post("/api/start")
@token_required
def api_start():
    """Pornește o sesiune nouă: reset state + log nou + thread sniffer."""
    global sniffer_running, sniffer_thread

    if sniffer_running:
        return jsonify({"status": "already_running"})

    data = request.get_json(silent=True) or {}
    selected_iface = data.get("interface", INTERFACE)

    reset_backend_state()

    log_path = start_new_log_session()

    sniffer_running = True
    sniffer_thread = threading.Thread(
        target=run_sniffer, args=(selected_iface,), daemon=True
    )
    sniffer_thread.start()

    return jsonify({"status": "started", "interface": selected_iface, "log_file": log_path})


@app.post("/api/stop")
@token_required
def api_stop():
    """Oprește sniffer-ul și resetează state-ul (UI va primi date goale).
       Fișierul CSV rămâne disponibil pentru download."""
    global sniffer_running
    sniffer_running = False

    if sniffer_thread is not None:
        sniffer_thread.join(timeout=2.5)

    reset_backend_state()

    return jsonify({
        "status": "stopped",
        "hasLog": current_log_file is not None,
    })


@app.get("/api/timeline")
@token_required
def api_timeline():
    buckets = int(request.args.get("buckets", 30))
    now_key = _bucket_key(time.time())
    points = []
    with state_lock:
        for i in range(buckets - 1, -1, -1):
            key = now_key - i * TIMELINE_BUCKET_SEC
            b   = timeline_buckets.get(key, {"normal": 0, "attacks": 0})
            points.append({
                "time":    datetime.fromtimestamp(key).strftime("%H:%M:%S"),
                "normal":  b["normal"],
                "attacks": b["attacks"],
            })
    return jsonify({"points": points, "bucketSec": TIMELINE_BUCKET_SEC})


@app.get("/api/download_log")
@token_required
def api_download_log():
    """Trimite ultimul fișier CSV de sesiune ca attachment."""
    if not current_log_file or not os.path.exists(current_log_file):
        abort(404, description="Niciun log de sesiune disponibil.")
    return send_file(
        current_log_file,
        mimetype="text/csv",
        as_attachment=True,
        download_name=os.path.basename(current_log_file),
    )


@app.get("/api/health")
def api_health():
    """Public — folosit de Docker healthcheck."""
    return jsonify({"status": "ok", "interface": INTERFACE})

# ─────────────────────────────────────────────────────────────────────────────
# ENTRY
# ─────────────────────────────────────────────────────────────────────────────
def main():
    print("=" * 70, flush=True)
    print("🛡️  NIDS Live Interceptor + Dashboard API", flush=True)
    print(f"📡 Iface default :  {INTERFACE}", flush=True)
    print(f"🌐 API server    :  http://{API_HOST}:{API_PORT}", flush=True)
    print(f"📂 Log dir       :  {LOG_DIR}", flush=True)
    print(f"ℹ️  Sniffer pornit doar la /api/start (din dashboard)", flush=True)
    print("=" * 70, flush=True)

    app.run(host=API_HOST, port=API_PORT, debug=False, use_reloader=False)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        print(f"\n🛑 Server oprit. Ultimul log: {current_log_file}", flush=True)