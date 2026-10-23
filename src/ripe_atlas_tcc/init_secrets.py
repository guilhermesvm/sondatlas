import os
import secrets
import sys
from pathlib import Path

SECRETS_DIRECTORY = Path("/run/kit-secrets")
INFLUXDB_BOLT_PATH = Path("/var/lib/influxdb2/influxd.bolt")
TOKEN_FILE = "influxdb-token"
PASSWORD_FILE = "influxdb-admin-password"
APP_USER_ID = 1000


def write_secret(path, value):
    path.write_text(value, encoding="utf-8")
    os.chmod(path, 0o600)
    if hasattr(os, "chown") and os.geteuid() == 0:
        os.chown(path, APP_USER_ID, APP_USER_ID)


def prepare_secrets(secrets_directory, bolt_path, environment):
    token_path = secrets_directory / TOKEN_FILE
    password_path = secrets_directory / PASSWORD_FILE

    if environment.get("INFLUXDB_TOKEN"):
        write_secret(token_path, environment["INFLUXDB_TOKEN"])

    if bolt_path.exists():
        if not token_path.exists():
            raise RuntimeError(
                "O banco já existe, mas o token sumiu do volume de segredos. "
                "Apague também os volumes do banco (docker compose down -v) para "
                "começar do zero, ou defina INFLUXDB_TOKEN no .env com o token atual."
            )
        return []

    created = []
    if environment.get("INFLUXDB_ADMIN_PASSWORD"):
        write_secret(password_path, environment["INFLUXDB_ADMIN_PASSWORD"])
    for path in (password_path, token_path):
        if not path.exists():
            write_secret(path, secrets.token_urlsafe(32))
            created.append(path.name)
    return created


def main():
    try:
        created = prepare_secrets(SECRETS_DIRECTORY, INFLUXDB_BOLT_PATH, os.environ)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    if created:
        print("Senha e token do InfluxDB gerados (não exibidos).")
    else:
        print("Senha e token do InfluxDB já existem; nada foi alterado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
