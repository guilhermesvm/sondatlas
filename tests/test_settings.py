import pytest

from ripe_atlas_tcc import settings


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
    ):
        monkeypatch.delenv(variable_name, raising=False)

    with pytest.raises(RuntimeError) as error:
        settings.load_influxdb_config()

    assert str(error.value) == (
        "Missing required environment variables: "
        "INFLUXDB_URL, INFLUXDB_ORG, INFLUXDB_BUCKET, INFLUXDB_TOKEN"
    )
