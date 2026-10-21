from scripts.init_env import create_env

EXAMPLE = """INFLUXDB_ORG=network-measurement-platform
INFLUXDB_TOKEN={replace_with_your_influxdb_api_token}
INFLUXDB_ADMIN_USERNAME=admin
INFLUXDB_ADMIN_PASSWORD={replace_with_a_strong_password}
"""


def read_env(path):
    return dict(line.split("=", 1) for line in path.read_text(encoding="utf-8").splitlines())


def test_create_env_generates_secrets_and_keeps_other_values(tmp_path):
    example = tmp_path / ".env.example"
    example.write_text(EXAMPLE, encoding="utf-8")
    env_path = tmp_path / ".env"

    assert create_env(example, env_path) is True

    values = read_env(env_path)
    assert values["INFLUXDB_ORG"] == "network-measurement-platform"
    assert values["INFLUXDB_ADMIN_USERNAME"] == "admin"
    assert values["INFLUXDB_TOKEN"] != values["INFLUXDB_ADMIN_PASSWORD"]
    for key in ("INFLUXDB_TOKEN", "INFLUXDB_ADMIN_PASSWORD"):
        assert len(values[key]) >= 40
        assert "{" not in values[key]


def test_create_env_never_overwrites_existing_file(tmp_path):
    example = tmp_path / ".env.example"
    example.write_text(EXAMPLE, encoding="utf-8")
    env_path = tmp_path / ".env"
    env_path.write_text("INFLUXDB_TOKEN=keep-me\n", encoding="utf-8")

    assert create_env(example, env_path) is False
    assert env_path.read_text(encoding="utf-8") == "INFLUXDB_TOKEN=keep-me\n"
