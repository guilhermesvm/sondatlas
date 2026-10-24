import pytest

from ripe_atlas_tcc import settings


def test_ping_measurement_catalog_identifies_targets():
    assert settings.PING_MEASUREMENTS == (
        {
            "measurement_id": 1001,
            "target_name": "K-root",
            "measurement_category": "built-in",
        },
        {
            "measurement_id": 86206926,
            "target_name": "Google",
            "measurement_category": "well-known",
        },
    )


def test_load_influxdb_config_returns_required_values(monkeypatch):
    monkeypatch.setattr(settings, "load_dotenv", lambda: None)
    monkeypatch.setenv("INFLUXDB_URL", "http://localhost:8086")
    monkeypatch.setenv("INFLUXDB_ORG", "test-org")
    monkeypatch.setenv("INFLUXDB_BUCKET", "test-bucket")
    monkeypatch.setenv("INFLUXDB_TOKEN", "test-token")

    config = settings.load_influxdb_config()

    assert config == {
        "url": "http://localhost:8086",
        "org": "test-org",
        "bucket": "test-bucket",
        "token": "test-token",
    }


def test_load_influxdb_config_reports_missing_variables(monkeypatch):
    monkeypatch.setattr(settings, "load_dotenv", lambda: None)
    for variable_name in (
        "INFLUXDB_URL",
        "INFLUXDB_ORG",
        "INFLUXDB_BUCKET",
        "INFLUXDB_TOKEN",
        "INFLUXDB_TOKEN_FILE",
    ):
        monkeypatch.delenv(variable_name, raising=False)

    with pytest.raises(RuntimeError) as error:
        settings.load_influxdb_config()

    assert str(error.value) == (
        "Missing required environment variables: "
        "INFLUXDB_URL, INFLUXDB_ORG, INFLUXDB_BUCKET, INFLUXDB_TOKEN"
    )


def test_load_influxdb_config_reads_token_file_unless_token_is_set(
    monkeypatch, tmp_path
):
    monkeypatch.setattr(settings, "load_dotenv", lambda: None)
    monkeypatch.setenv("INFLUXDB_URL", "http://influxdb2:8086")
    monkeypatch.setenv("INFLUXDB_ORG", "test-org")
    monkeypatch.setenv("INFLUXDB_BUCKET", "test-bucket")
    token_file = tmp_path / "influxdb-token"
    token_file.write_text("file-token\n", encoding="utf-8")
    monkeypatch.setenv("INFLUXDB_TOKEN_FILE", str(token_file))
    monkeypatch.delenv("INFLUXDB_TOKEN", raising=False)

    assert settings.load_influxdb_config()["token"] == "file-token"

    monkeypatch.setenv("INFLUXDB_TOKEN", "env-token")
    assert settings.load_influxdb_config()["token"] == "env-token"


def test_load_polling_interval_seconds_uses_default(monkeypatch):
    monkeypatch.setattr(settings, "load_dotenv", lambda: None)
    monkeypatch.delenv("POLLING_INTERVAL_SECONDS", raising=False)

    assert settings.load_polling_interval_seconds() == 60


def test_load_polling_interval_seconds_reads_environment(monkeypatch):
    monkeypatch.setattr(settings, "load_dotenv", lambda: None)
    monkeypatch.setenv("POLLING_INTERVAL_SECONDS", "30")

    assert settings.load_polling_interval_seconds() == 30


@pytest.mark.parametrize("configured_value", ["0", "-1", "invalid"])
def test_load_polling_interval_seconds_rejects_invalid_values(
    monkeypatch,
    configured_value,
):
    monkeypatch.setattr(settings, "load_dotenv", lambda: None)
    monkeypatch.setenv("POLLING_INTERVAL_SECONDS", configured_value)

    with pytest.raises(
        RuntimeError,
        match="POLLING_INTERVAL_SECONDS must be a positive integer",
    ):
        settings.load_polling_interval_seconds()
