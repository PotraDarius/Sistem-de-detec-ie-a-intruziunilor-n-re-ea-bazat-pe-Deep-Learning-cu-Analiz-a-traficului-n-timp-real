"""
auth.py — Modul de autentificare pentru NIDS Dashboard
=======================================================
Conține:
  - Modelul SQLAlchemy `User`
  - Helperi pentru hashing parolă (bcrypt)
  - Helperi pentru JWT (encode/decode, 24h expirare)
  - Decoratorul @token_required pentru protejarea endpoint-urilor Flask
  - Blueprint `auth_bp` cu rute: /register, /login, /me, /update, /delete
"""

import os
import re
import datetime
from functools import wraps

import bcrypt
import jwt
from flask import Blueprint, request, jsonify, g
from flask_sqlalchemy import SQLAlchemy


# ─────────────────────────────────────────────────────────────────────────────
# CONFIG
# ─────────────────────────────────────────────────────────────────────────────
JWT_SECRET    = os.environ.get("NIDS_JWT_SECRET", "schimba-ma-in-productie-please")
JWT_ALGORITHM = "HS256"
JWT_EXP_HOURS = 24

USERNAME_RE = re.compile(r"^[a-zA-Z0-9_.-]{3,32}$")
EMAIL_RE    = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LEN = 8


# ─────────────────────────────────────────────────────────────────────────────
# DATABASE
# ─────────────────────────────────────────────────────────────────────────────
db = SQLAlchemy()


class User(db.Model):
    __tablename__ = "users"

    id            = db.Column(db.Integer, primary_key=True)
    username      = db.Column(db.String(32), unique=True, nullable=False, index=True)
    email         = db.Column(db.String(120), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at    = db.Column(db.DateTime, default=datetime.datetime.utcnow, nullable=False)

    def to_dict(self):
        return {
            "id":         self.id,
            "username":   self.username,
            "email":      self.email,
            "created_at": self.created_at.isoformat() + "Z",
        }


# ─────────────────────────────────────────────────────────────────────────────
# PAROLĂ (bcrypt)
# ─────────────────────────────────────────────────────────────────────────────
def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


# ─────────────────────────────────────────────────────────────────────────────
# JWT
# ─────────────────────────────────────────────────────────────────────────────
def generate_token(user: User) -> str:
    payload = {
        "user_id":  user.id,
        "username": user.username,
        "exp":      datetime.datetime.utcnow() + datetime.timedelta(hours=JWT_EXP_HOURS),
        "iat":      datetime.datetime.utcnow(),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)


def decode_token(token: str):
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        return {"error": "expired"}
    except jwt.InvalidTokenError:
        return {"error": "invalid"}


# ─────────────────────────────────────────────────────────────────────────────
# DECORATOR
# ─────────────────────────────────────────────────────────────────────────────
def token_required(fn):
    """Decorator pentru endpoint-urile care necesită autentificare.
       Așază obiectul User curent în flask.g.current_user."""
    @wraps(fn)
    def wrapper(*args, **kwargs):
        auth_header = request.headers.get("Authorization", "")
        if not auth_header.startswith("Bearer "):
            return jsonify({"error": "missing_token"}), 401

        token = auth_header.split(" ", 1)[1].strip()
        payload = decode_token(token)
        if "error" in payload:
            return jsonify({"error": f"token_{payload['error']}"}), 401

        user = db.session.get(User, payload["user_id"])
        if not user:
            return jsonify({"error": "user_not_found"}), 401

        g.current_user = user
        return fn(*args, **kwargs)
    return wrapper


# ─────────────────────────────────────────────────────────────────────────────
# VALIDARE INPUT
# ─────────────────────────────────────────────────────────────────────────────
def validate_credentials(username=None, email=None, password=None):
    errors = []
    if username is not None and not USERNAME_RE.match(username or ""):
        errors.append("Username invalid (3-32 caractere alfanumerice, _, ., -)")
    if email is not None and not EMAIL_RE.match(email or ""):
        errors.append("Email invalid")
    if password is not None and len(password or "") < MIN_PASSWORD_LEN:
        errors.append(f"Parola trebuie să aibă minim {MIN_PASSWORD_LEN} caractere")
    return errors


# ─────────────────────────────────────────────────────────────────────────────
# BLUEPRINT
# ─────────────────────────────────────────────────────────────────────────────
auth_bp = Blueprint("auth", __name__, url_prefix="/api/auth")


@auth_bp.post("/register")
def register():
    data = request.get_json(silent=True) or {}
    username = (data.get("username") or "").strip()
    email    = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    errors = validate_credentials(username, email, password)
    if errors:
        return jsonify({"error": "validation", "details": errors}), 400

    if User.query.filter_by(username=username).first():
        return jsonify({"error": "username_taken"}), 409
    if User.query.filter_by(email=email).first():
        return jsonify({"error": "email_taken"}), 409

    user = User(username=username, email=email, password_hash=hash_password(password))
    db.session.add(user)
    db.session.commit()

    token = generate_token(user)
    return jsonify({"token": token, "user": user.to_dict()}), 201


@auth_bp.post("/login")
def login():
    data = request.get_json(silent=True) or {}
    identifier = (data.get("identifier") or data.get("username") or data.get("email") or "").strip()
    password   = data.get("password") or ""

    print(f"[LOGIN DEBUG] identifier={identifier!r} password_len={len(password)} password_repr={password!r}", flush=True)

    if not identifier or not password:
        return jsonify({"error": "missing_credentials"}), 400

    user = User.query.filter(
        (User.username == identifier) | (User.email == identifier.lower())
    ).first()
    
    print(f"[LOGIN DEBUG] user_found={user.username if user else None}", flush=True)
    if user:
        print(f"[LOGIN DEBUG] password_match={verify_password(password, user.password_hash)}", flush=True)
    
    if not user or not verify_password(password, user.password_hash):
        return jsonify({"error": "invalid_credentials"}), 401
    
    token = generate_token(user)
    return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.get("/me")
@token_required
def me():
    return jsonify({"user": g.current_user.to_dict()})


@auth_bp.put("/update")
@token_required
def update_account():
    """Permite actualizarea username / email / parolă.
       Pentru schimbarea parolei e necesară parola curentă."""
    data = request.get_json(silent=True) or {}
    user = g.current_user

    new_username = data.get("username")
    new_email    = data.get("email")
    new_password = data.get("new_password")
    current_password = data.get("current_password") or ""

    if not verify_password(current_password, user.password_hash):
        return jsonify({"error": "invalid_current_password"}), 401

    if new_username is not None:
        new_username = new_username.strip()
        errs = validate_credentials(username=new_username)
        if errs:
            return jsonify({"error": "validation", "details": errs}), 400
        if new_username != user.username and User.query.filter_by(username=new_username).first():
            return jsonify({"error": "username_taken"}), 409
        user.username = new_username

    if new_email is not None:
        new_email = new_email.strip().lower()
        errs = validate_credentials(email=new_email)
        if errs:
            return jsonify({"error": "validation", "details": errs}), 400
        if new_email != user.email and User.query.filter_by(email=new_email).first():
            return jsonify({"error": "email_taken"}), 409
        user.email = new_email

    if new_password is not None:
        errs = validate_credentials(password=new_password)
        if errs:
            return jsonify({"error": "validation", "details": errs}), 400
        user.password_hash = hash_password(new_password)

    db.session.commit()

    token = generate_token(user)
    return jsonify({"token": token, "user": user.to_dict()})


@auth_bp.delete("/delete")
@token_required
def delete_account():
    data = request.get_json(silent=True) or {}
    password = data.get("password") or ""
    user = g.current_user

    if not verify_password(password, user.password_hash):
        return jsonify({"error": "invalid_password"}), 401

    db.session.delete(user)
    db.session.commit()
    return jsonify({"status": "deleted"})


# ─────────────────────────────────────────────────────────────────────────────
# INIT
# ─────────────────────────────────────────────────────────────────────────────
def init_auth(app):
    """Atașează SQLAlchemy + blueprint-ul de auth la aplicația Flask."""
    db_path = os.environ.get("NIDS_DB_PATH", "/app/data/nids.db")
    os.makedirs(os.path.dirname(db_path), exist_ok=True)

    app.config["SQLALCHEMY_DATABASE_URI"] = f"sqlite:///{db_path}"
    app.config["SQLALCHEMY_TRACK_MODIFICATIONS"] = False

    db.init_app(app)
    app.register_blueprint(auth_bp)

    with app.app_context():
        db.create_all()

    print(f"🔐 Auth pornit · DB: {db_path} · JWT exp: {JWT_EXP_HOURS}h", flush=True)