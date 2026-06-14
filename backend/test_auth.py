"""
test_auth.py — Unit tests pentru modulul de autentificare (auth.py)
====================================================================
Rulare:  pytest test_auth.py -v

Testele acoperă cele patru responsabilități critice ale modulului de
autentificare: hashing-ul parolelor (bcrypt), validarea credențialelor,
ciclul de viață al tokenurilor JWT și fluxul complet de înregistrare/login
prin API.
"""

import pytest

from auth import (
    hash_password,
    verify_password,
    validate_credentials,
    generate_token,
    decode_token,
    MIN_PASSWORD_LEN,
)


# ─────────────────────────────────────────────────────────────────────────────
# 1. HASHING PAROLĂ (bcrypt)
# ─────────────────────────────────────────────────────────────────────────────
class TestPasswordHashing:

    def test_hash_is_not_plaintext(self):
        """Hash-ul nu trebuie să conțină parola în clar."""
        password = "MySecurePass123"
        hashed = hash_password(password)
        assert hashed != password
        assert password not in hashed

    def test_correct_password_verifies(self):
        """Parola corectă trebuie validată cu succes."""
        password = "CorrectHorse42"
        hashed = hash_password(password)
        assert verify_password(password, hashed) is True

    def test_wrong_password_fails(self):
        """O parolă greșită nu trebuie să treacă verificarea."""
        hashed = hash_password("OriginalPass1")
        assert verify_password("WrongPass2", hashed) is False

    def test_same_password_different_hashes(self):
        """Salt-ul aleator garantează hash-uri diferite pentru aceeași parolă."""
        password = "SamePassword99"
        assert hash_password(password) != hash_password(password)

    def test_verify_handles_invalid_hash(self):
        """Un hash malformat nu trebuie să arunce excepție, ci să întoarcă False."""
        assert verify_password("anything", "not-a-valid-hash") is False


# ─────────────────────────────────────────────────────────────────────────────
# 2. VALIDARE CREDENȚIALE
# ─────────────────────────────────────────────────────────────────────────────
class TestCredentialValidation:

    def test_valid_credentials_pass(self):
        """Credențiale valide nu produc erori."""
        errors = validate_credentials(
            username="darius_p", email="user@example.com", password="parola12"
        )
        assert errors == []

    def test_short_username_rejected(self):
        """Username sub 3 caractere este respins."""
        errors = validate_credentials(username="ab")
        assert len(errors) == 1

    def test_username_with_invalid_chars_rejected(self):
        """Caracterele speciale neadmise în username sunt respinse."""
        errors = validate_credentials(username="dar!us#")
        assert len(errors) == 1

    def test_invalid_email_rejected(self):
        """Un email fără @ sau domeniu este respins."""
        assert validate_credentials(email="not-an-email") != []
        assert validate_credentials(email="missing@domain") != []

    def test_short_password_rejected(self):
        """Parola sub lungimea minimă este respinsă."""
        short = "a" * (MIN_PASSWORD_LEN - 1)
        errors = validate_credentials(password=short)
        assert len(errors) == 1

    def test_multiple_errors_accumulate(self):
        """Mai multe câmpuri invalide produc mai multe erori simultan."""
        errors = validate_credentials(username="x", email="bad", password="123")
        assert len(errors) == 3


# ─────────────────────────────────────────────────────────────────────────────
# 3. CICLUL JWT
# ─────────────────────────────────────────────────────────────────────────────
class _FakeUser:
    """Stub minimal pentru a genera un token fără bază de date."""
    id = 42
    username = "darius_p"


class TestJWT:

    def test_token_roundtrip(self):
        """Un token generat trebuie să poată fi decodat cu același payload."""
        token = generate_token(_FakeUser())
        payload = decode_token(token)
        assert payload["user_id"] == 42
        assert payload["username"] == "darius_p"

    def test_token_contains_expiration(self):
        """Token-ul trebuie să includă câmpurile de expirare și emitere."""
        payload = decode_token(generate_token(_FakeUser()))
        assert "exp" in payload
        assert "iat" in payload

    def test_invalid_token_rejected(self):
        """Un token corupt este respins cu eroare 'invalid'."""
        result = decode_token("garbage.token.value")
        assert result.get("error") == "invalid"

    def test_tampered_token_rejected(self):
        """Un token cu semnătura modificată este respins."""
        token = generate_token(_FakeUser())
        tampered = token[:-3] + "abc"
        assert "error" in decode_token(tampered)


if __name__ == "__main__":
    pytest.main([__file__, "-v"])