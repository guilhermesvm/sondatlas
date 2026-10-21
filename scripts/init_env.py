import secrets
from pathlib import Path

GENERATED_KEYS = ("INFLUXDB_ADMIN_PASSWORD", "INFLUXDB_TOKEN")


def create_env(example_path, env_path):
    lines = []
    for line in example_path.read_text(encoding="utf-8").splitlines():
        key = line.split("=", 1)[0]
        if key in GENERATED_KEYS:
            line = f"{key}={secrets.token_urlsafe(32)}"
        lines.append(line)

    try:
        with env_path.open("x", encoding="utf-8") as env_file:
            env_file.write("\n".join(lines) + "\n")
    except FileExistsError:
        return False
    return True


def main():
    root = Path(__file__).resolve().parents[1]
    if create_env(root / ".env.example", root / ".env"):
        print(".env criado com senha e token gerados (não exibidos).")
        print("A senha para entrar em http://localhost:8086 está em INFLUXDB_ADMIN_PASSWORD.")
    else:
        print(".env já existe; nada foi alterado.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
