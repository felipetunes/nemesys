from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select

from app.models import UserRow
from app.services.auth import AuthError, AuthService, hash_password, verify_password


def test_password_hash_is_salted_and_verifiable():
    first = hash_password("correct horse battery staple")
    second = hash_password("correct horse battery staple")

    assert first != second
    assert verify_password("correct horse battery staple", first)
    assert not verify_password("wrong password", first)
    assert not verify_password("anything", "unsupported")


def test_repeated_login_failures_temporarily_lock_account(db_factory):
    with db_factory() as db:
        auth = AuthService(db)
        auth.register("owner@example.com", "correct horse battery staple", "Support", 7)

        with pytest.raises(AuthError, match="Invalid email or password"):
            auth.login("owner@example.com", "wrong-password", 7, max_failed_attempts=2, lockout_minutes=15)
        with pytest.raises(AuthError, match="Invalid email or password"):
            auth.login("owner@example.com", "wrong-again", 7, max_failed_attempts=2, lockout_minutes=15)
        with pytest.raises(AuthError, match="Too many failed attempts"):
            auth.login("owner@example.com", "correct horse battery staple", 7, max_failed_attempts=2)

        user = db.scalar(select(UserRow).where(UserRow.email == "owner@example.com"))
        assert user is not None
        assert user.locked_until is not None
        user.locked_until = datetime.now(UTC) - timedelta(minutes=1)
        db.commit()

        token = auth.login("owner@example.com", "correct horse battery staple", 7, max_failed_attempts=2)

        assert token.email == "owner@example.com"
        assert user.failed_login_attempts == 0
        assert user.last_login_at is not None
