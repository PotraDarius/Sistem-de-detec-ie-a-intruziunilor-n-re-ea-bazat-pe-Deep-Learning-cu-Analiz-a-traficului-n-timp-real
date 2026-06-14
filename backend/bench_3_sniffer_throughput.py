"""
bench_3_sniffer_throughput.py
==============================
Test 3: Throughput-ul sniffer-ului sub trafic TCP real generat cu hping3.

CUM SE RULEAZĂ:
1. Pornește sniffer-ul pe Kali, pe interfața eth1, prin POST /api/start
   din dashboard (interface: eth1)
2. Pe Kali, deschide al doilea terminal și rulează acest script
3. Scriptul va:
   - apela GET /api/stats pentru a citi totalFlows înainte
   - lansa hping3 pentru DURATION secunde
   - apela GET /api/stats după
   - calcula throughput-ul real (fluxuri procesate / secundă)

Pre-requisite: hping3 instalat (sudo apt install hping3)

Rulare:
    sudo python bench_3_sniffer_throughput.py

NOTĂ: Necesită sudo pentru hping3.
"""

import subprocess
import time
import requests
import sys

API_BASE = "http://localhost:5000"
TARGET_IP = "192.168.56.101"
TARGET_PORT = 80
INTERFACE = "eth1"

DURATION_SEC = 30        # cât rulează hping3
PACKET_RATE = 200        # pachete/sec (hping3 -i u5000 = 200/sec; mai mare = stress mai mare)

print("=" * 70)
print("Test 3: Throughput sniffer sub trafic TCP real")
print("=" * 70)
print(f"  Target     : {TARGET_IP}:{TARGET_PORT}")
print(f"  Interfață  : {INTERFACE}")
print(f"  Durată     : {DURATION_SEC} secunde")
print(f"  Rate hping3: ~{PACKET_RATE} pachete/sec")
print()

# Verifică că sniffer-ul e activ
try:
    r = requests.get(f"{API_BASE}/api/stats", timeout=2)
    stats_before = r.json()
    if not stats_before.get("isSniffing"):
        print("❌ Sniffer-ul nu rulează. Pornește-l mai întâi din dashboard.")
        sys.exit(1)
except Exception as e:
    print(f"❌ Nu pot contacta backend-ul: {e}")
    sys.exit(1)

print(f"📊 Stare inițială:")
print(f"   Fluxuri procesate: {stats_before['totalFlows']}")
print(f"   Pachete           : {stats_before['totalPackets']}")
print()

# Calcul interval hping3 pentru rate dorit
interval_us = int(1_000_000 / PACKET_RATE)
hping_cmd = [
    "sudo", "hping3",
    "-S",              # SYN flag
    "-p", str(TARGET_PORT),
    "-i", f"u{interval_us}",  # interval în microsecunde
    "-c", str(PACKET_RATE * DURATION_SEC),  # număr total de pachete
    TARGET_IP
]

print(f"🚀 Pornire trafic: {' '.join(hping_cmd)}")
print(f"   (rulează {DURATION_SEC} secunde...)\n")

t_start = time.time()
proc = subprocess.Popen(hping_cmd, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
proc.wait()
t_end = time.time()
elapsed = t_end - t_start

# Așteaptă 2 secunde să se proceseze ultimele fluxuri
print("⏳ Aștept 2 secunde pentru finalizarea procesării...")
time.sleep(2)

# Citire stare după
r = requests.get(f"{API_BASE}/api/stats", timeout=2)
stats_after = r.json()

flows_delta = stats_after['totalFlows'] - stats_before['totalFlows']
packets_delta = stats_after['totalPackets'] - stats_before['totalPackets']

print("\n" + "=" * 70)
print("REZULTATE — Throughput sniffer")
print("=" * 70)
print(f"  Durată trafic real        : {elapsed:.2f} secunde")
print(f"  Fluxuri procesate         : {flows_delta}")
print(f"  Pachete procesate         : {packets_delta}")
print(f"  Throughput fluxuri        : {flows_delta / elapsed:.1f} fluxuri/sec")
print(f"  Throughput pachete        : {packets_delta / elapsed:.1f} pachete/sec")
print(f"  Pachete medii per flux    : {packets_delta / max(flows_delta, 1):.2f}")

# Salvare în text pentru include în raport
with open("bench_3_results.txt", "w") as f:
    f.write(f"Test 3: Throughput sniffer\n")
    f.write(f"==========================\n")
    f.write(f"Target            : {TARGET_IP}:{TARGET_PORT}\n")
    f.write(f"Interfață         : {INTERFACE}\n")
    f.write(f"Durată trafic     : {elapsed:.2f} secunde\n")
    f.write(f"Fluxuri procesate : {flows_delta}\n")
    f.write(f"Pachete procesate : {packets_delta}\n")
    f.write(f"Throughput fluxuri: {flows_delta / elapsed:.1f} fluxuri/sec\n")
    f.write(f"Throughput pachete: {packets_delta / elapsed:.1f} pachete/sec\n")

print(f"\n✅ Rezultate salvate în: bench_3_results.txt")