# NIDS Live Monitor — Docker Deployment

Sistem complet de detecție a intruziunilor în rețea (1D-CNN) + dashboard SOC,
containerizat cu Docker Compose.

## Arhitectură

```
┌─────────────────────────────────────────────────────────────┐
│  HOST (Kali Linux)                                          │
│                                                             │
│  ┌──────────────────────────┐    ┌─────────────────────┐   │
│  │ nids-backend             │    │ nids-frontend       │   │
│  │ (network_mode: host)     │    │ (bridge + :8080)    │   │
│  │                          │    │                     │   │
│  │  • Scapy sniffer on eth0 │    │  • nginx            │   │
│  │  • 1D-CNN inference      │◀───│  • Vite build static│   │
│  │  • Flask API :5000       │    │  • React dashboard  │   │
│  └──────────────────────────┘    └─────────────────────┘   │
│                                                             │
│            ▲                              ▲                 │
│            │ raw packets                  │ HTTP            │
│            │                              │                 │
└────────────┼──────────────────────────────┼─────────────────┘
             │                              │
        host's eth0                    Browser (host:8080)
```

## Structură folder

```
nids-docker/
├── docker-compose.yml
├── README.md  (acesta)
├── logs/                            ← creat la primul `up`, CSV-uri persistente
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── requirements.txt
│   ├── live_sniffer_with_api.py     ✓ inclus
│   ├── backend_inference.py         ← TREBUIE adăugat de tine
│   └── <fișiere model>              ← TREBUIE adăugate de tine (ex: model.h5)
└── frontend/
    ├── Dockerfile
    ├── .dockerignore
    ├── nginx.conf
    ├── package.json
    ├── vite.config.js
    ├── tailwind.config.js
    ├── postcss.config.js
    ├── index.html
    └── src/
        ├── main.jsx
        ├── App.jsx
        └── index.css
```

## Pași de pregătire (o singură dată)

### 1. Adaugă fișierele tale în `backend/`

Copiază în folderul `backend/`:
- `backend_inference.py` (modulul tău cu funcția `predict_packet`)
- Toate fișierele de model pe care le încarcă (ex: `model.h5`, `scaler.pkl`,
  `label_encoder.pkl` etc.)

### 2. Editează `backend/requirements.txt`

Decomentează / adaugă librăriile necesare pentru `backend_inference.py`.
De exemplu, dacă modelul tău este Keras:
```
tensorflow>=2.15.0
scikit-learn>=1.3.0
joblib>=1.3.0
```

### 3. Verifică numele interfeței de rețea

În `docker-compose.yml`, schimbă `NIDS_INTERFACE=eth0` cu interfața ta dacă
nu e `eth0`. Vezi interfețele cu `ip a` pe host.

## Pornire

```bash
cd nids-docker
docker compose up --build
```

Apoi deschide în browser: **http://localhost:8080**

Prima dată va dura câteva minute (download imagini base, build).
Următoarele porniri sunt instant (`docker compose up`, fără `--build`).

## Comenzi utile

```bash
# Pornește în fundal
docker compose up -d --build

# Vezi log-urile (live)
docker compose logs -f backend
docker compose logs -f frontend

# Restart doar backend (după modificări la sniffer)
docker compose restart backend

# Rebuild după modificări la cod
docker compose up --build

# Oprește tot
docker compose down

# Oprește + șterge volumele (CSV-urile rămân în ./logs)
docker compose down -v
```

## Verificare

**Backend funcționează:**
```bash
curl http://localhost:5000/api/health
# → {"status": "ok", "interface": "eth0"}
```

**Frontend funcționează:** deschizi `http://localhost:8080`. Dacă vezi banner-ul
amber "Backend offline", înseamnă că browserul nu poate ajunge la `:5000` —
verifică `docker compose logs backend` pentru erori (cel mai des: lipsesc
fișierele model sau dependențe ML din `requirements.txt`).

## Schimbarea adresei API

Dacă vrei să accesezi dashboard-ul de pe altă mașină din rețea, browserul va
încerca `localhost:5000` (al lui), care nu va merge. Soluții:

**Opțiunea A — rebuild cu IP-ul real:**
```bash
docker compose build --build-arg VITE_API_BASE=http://192.168.1.10:5000 frontend
docker compose up
```

**Opțiunea B — modifică `docker-compose.yml`:**
```yaml
args:
  VITE_API_BASE: http://192.168.1.10:5000
```

## Note tehnice

- **De ce `network_mode: host` la backend?** Containerele cu bridge networking
  primesc o interfață virtuală (`veth`) care vede doar traficul propriu. Pentru
  IDS real e nevoie să vezi traficul de pe interfața fizică a host-ului, deci
  containerul trebuie să folosească stack-ul de rețea al gazdei.

- **Capabilities (`NET_RAW`, `NET_ADMIN`):** alternativa ar fi `privileged: true`,
  dar e mai sigur să dăm doar capabilities-urile necesare.

- **Log-uri CSV:** sunt persistente în `./logs/` pe host (volume mount), nu se
  pierd la restart sau rebuild.

- **Frontend = build static:** nu rulează Node în container, doar nginx care
  servește HTML/CSS/JS pre-compilate. Container final ~50 MB.
