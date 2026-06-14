# NIDS Live Monitor — Docker Deployment

Sistem complet de detecție a intruziunilor în rețea (1D-CNN) + dashboard SOC,
cu autentificare și containerizat cu Docker Compose.

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
│  │    (PyTorch)             │    │  • React dashboard  │   │
│  │  • Flask API :5000       │    │  • Login / Account  │   │
│  │  • JWT auth + SQLite     │    │                     │   │
│  └──────────────────────────┘    └─────────────────────┘   │
│                                                             │
│            ▲                              ▲                 │
│            │ raw packets                  │ HTTP + Bearer   │
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
├── data/                            ← creat la primul `up`, baza de date SQLite (conturi)
├── backend/
│   ├── Dockerfile
│   ├── .dockerignore
│   ├── requirements.txt
│   ├── live_sniffer_with_api.py     ✓ inclus (sniffer + Flask API + endpoint-uri auth)
│   ├── auth.py                      ✓ inclus (User model, bcrypt, JWT, blueprint)
│   ├── test_auth.py                 ✓ inclus (suită de teste unitare pytest)
│   ├── backend_inference.py         ← TREBUIE adăugat de tine
│   └── <fișiere model>              ← TREBUIE adăugate de tine (vezi mai jos)
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
        ├── App.jsx                  (dashboard + routing + integrare auth)
        ├── AuthContext.jsx          (context React: token, login, apiFetch)
        ├── LoginPage.jsx            (pagina de login / register)
        ├── AccountPage.jsx          (gestiune cont: update / delete)
        └── index.css
```

## Pași de pregătire (o singură dată)

### 1. Adaugă fișierele tale în `backend/`

Copiază în folderul `backend/`:
- `backend_inference.py` (modulul tău cu funcția `predict_packet`)
- Toate artefactele de model pe care le încarcă. Pentru modelul 1D-CNN
  (PyTorch) acestea sunt de regulă:
  - `model_nids_1dcnn_best.pth` (ponderile rețelei)
  - `scaler.pkl` (StandardScaler-ul fit-uit la antrenare)
  - `label_encoder.pkl` (encoder-ul de clase)

### 2. Verifică `backend/requirements.txt`

Dependențele ML sunt deja configurate pentru **PyTorch (CPU-only)** și pentru
modulul de autentificare:
```
# Sniffer + API
scapy>=2.5.0
flask>=3.0.0
flask-cors>=4.0.0
numpy>=1.24.0

# Auth: SQLite + ORM, hashing parolă, JWT
flask-sqlalchemy>=3.1.0
bcrypt>=4.1.0
PyJWT>=2.8.0

# Model 1D-CNN (PyTorch CPU-only) + scaler/encoder
--extra-index-url https://download.pytorch.org/whl/cpu
torch>=2.1.0
scikit-learn>=1.3.0
joblib>=1.3.0
```

### 3. Generează un secret JWT și configurează interfața

În `docker-compose.yml`:
- Generează un secret robust și pune-l în `NIDS_JWT_SECRET`:
  ```bash
  openssl rand -hex 32
  ```
- Schimbă `NIDS_INTERFACE=eth0` cu interfața ta dacă nu e `eth0`
  (vezi interfețele cu `ip a` pe host).

> ⚠️ **Important:** nu lăsa valoarea implicită a `NIDS_JWT_SECRET` în producție.
> Tokenurile sunt semnate cu acest secret; dacă e cunoscut, oricine poate forja tokenuri valide.

## Pornire

```bash
cd nids-docker
docker compose up --build
```

Apoi deschide în browser: **http://localhost:8080**

Prima dată va dura câteva minute (download imagini base, build).
Următoarele porniri sunt instant (`docker compose up`, fără `--build`).

### Primul acces — creează un cont

La prima accesare vei fi redirecționat către pagina de **login**. Deoarece nu
există încă niciun cont, accesează tab-ul **Register** și creează-ți unul:
- username: 3–32 caractere alfanumerice (plus `_ . -`)
- email valid
- parolă cu minim 8 caractere

După înregistrare ești autentificat automat și ai acces la dashboard. Conturile
sunt persistente în `./data/nids.db` (volume mount), deci rămân între restart-uri.

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

# Oprește + șterge volumele Docker (CSV-urile și DB rămân în ./logs și ./data)
docker compose down -v
```

## Teste

Suita de teste unitare pentru modulul de autentificare (hashing bcrypt, validare
credențiale, ciclul JWT) se rulează cu `pytest`:

```bash
# Local (în backend/, cu dependențele instalate)
pytest test_auth.py -v

# Sau în interiorul containerului
docker compose exec backend pytest test_auth.py -v
```

Rezultat așteptat: `15 passed`.

## Verificare

**Backend funcționează** (endpoint public, fără autentificare):
```bash
curl http://localhost:5000/api/health
# → {"status": "ok", "interface": "eth0"}
```

> Restul endpoint-urilor (`/api/recent`, `/api/stats`, `/api/start` etc.) sunt
> **protejate cu JWT**. Un `curl` fără header `Authorization: Bearer <token>`
> va primi `401 Unauthorized` — acesta este comportamentul corect, nu o eroare.

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

## API — endpoint-uri

| Metodă | Cale | Auth | Descriere |
|--------|------|:----:|-----------|
| GET    | `/api/health`        | — | Verificare disponibilitate (Docker healthcheck) |
| GET    | `/api/recent`        | ✓ | Ultimele N fluxuri analizate |
| GET    | `/api/stats`         | ✓ | KPI-uri agregate |
| GET    | `/api/timeline`      | ✓ | Serie temporală a traficului |
| GET    | `/api/interfaces`    | ✓ | Listă interfețe de rețea |
| POST   | `/api/start`         | ✓ | Pornește o sesiune de captură |
| POST   | `/api/stop`          | ✓ | Oprește sesiunea curentă |
| GET    | `/api/download_log`  | ✓ | Descarcă CSV-ul ultimei sesiuni |
| POST   | `/api/auth/register` | — | Creare cont |
| POST   | `/api/auth/login`    | — | Autentificare (username/email + parolă) |
| GET    | `/api/auth/me`       | ✓ | Profilul utilizatorului curent |
| PUT    | `/api/auth/update`   | ✓ | Actualizare username / email / parolă |
| DELETE | `/api/auth/delete`   | ✓ | Ștergere permanentă a contului |

## Note tehnice

- **De ce `network_mode: host` la backend?** Containerele cu bridge networking
  primesc o interfață virtuală (`veth`) care vede doar traficul propriu. Pentru
  IDS real e nevoie să vezi traficul de pe interfața fizică a host-ului, deci
  containerul trebuie să folosească stack-ul de rețea al gazdei.

- **Capabilities (`NET_RAW`, `NET_ADMIN`):** alternativa ar fi `privileged: true`,
  dar e mai sigur să dăm doar capabilities-urile necesare.

- **Autentificare:** parolele sunt stocate ca hash bcrypt (cost factor 12), iar
  sesiunile folosesc tokenuri JWT (HMAC-SHA256, expirare 24h) semnate cu
  `NIDS_JWT_SECRET`. Toate endpoint-urile operaționale necesită un token valid.

- **Persistență:** log-urile CSV sunt în `./logs/`, iar baza de date cu conturi
  în `./data/` (ambele volume mount pe host), deci nu se pierd la restart sau rebuild.

- **Frontend = build static:** nu rulează Node în container, doar nginx care
  servește HTML/CSS/JS pre-compilate. Container final ~50 MB.