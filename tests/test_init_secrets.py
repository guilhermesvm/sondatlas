import pytest

from sondatlas.init_secrets import PASSWORD_FILE, TOKEN_FILE, prepare_secrets


def read_secrets(directory):
    return {
        name: (directory / name).read_text(encoding="utf-8")
        for name in (PASSWORD_FILE, TOKEN_FILE)
    }


def test_first_start_generates_secrets_and_later_starts_keep_them(tmp_path):
    bolt_path = tmp_path / "influxd.bolt"

    assert sorted(prepare_secrets(tmp_path, bolt_path, {})) == [PASSWORD_FILE, TOKEN_FILE]
    generated = read_secrets(tmp_path)
    assert generated[PASSWORD_FILE] != generated[TOKEN_FILE]
    assert all(len(value) >= 40 for value in generated.values())

    bolt_path.touch()
    assert prepare_secrets(tmp_path, bolt_path, {}) == []
    assert read_secrets(tmp_path) == generated


def test_values_from_env_file_are_used(tmp_path):
    environment = {"INFLUXDB_TOKEN": "env-token", "INFLUXDB_ADMIN_PASSWORD": "env-password"}

    assert prepare_secrets(tmp_path, tmp_path / "influxd.bolt", environment) == []
    assert read_secrets(tmp_path) == {PASSWORD_FILE: "env-password", TOKEN_FILE: "env-token"}


def test_existing_database_without_token_stops_instead_of_generating(tmp_path):
    bolt_path = tmp_path / "influxd.bolt"
    bolt_path.touch()

    with pytest.raises(RuntimeError, match="O banco já existe"):
        prepare_secrets(tmp_path, bolt_path, {})
    assert not (tmp_path / TOKEN_FILE).exists()


def test_existing_database_accepts_token_from_env_file(tmp_path):
    bolt_path = tmp_path / "influxd.bolt"
    bolt_path.touch()

    assert prepare_secrets(tmp_path, bolt_path, {"INFLUXDB_TOKEN": "env-token"}) == []
    assert (tmp_path / TOKEN_FILE).read_text(encoding="utf-8") == "env-token"
    assert not (tmp_path / PASSWORD_FILE).exists()
