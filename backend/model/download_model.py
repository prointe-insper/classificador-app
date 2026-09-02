"""Baixa os artefatos dos modelos das Releases do GitHub (ou do Hugging Face).

Os ``model.joblib`` não são versionados no git por serem binários grandes; eles
são distribuídos via *Releases* do repositório e, futuramente, via Hugging Face.

O app serve **dois** modelos ao mesmo tempo, com taxonomias diferentes, e o
usuário escolhe na tela: a v2 (16 assuntos da cauda) e a v1 (dez assuntos de
massa mais ``Outros``). Faltando o artefato de um deles, ele apenas não aparece
no seletor.

Uso::

    # Os dois modelos, cada um no caminho padrão:
    uv run python -m model.download_model --modelo todos

    # Só um deles:
    uv run python -m model.download_model --modelo v2

    # URL específica (por exemplo, uma release antiga):
    uv run python -m model.download_model --url https://github.com/prointe-insper/classificador-app/releases/download/v0.1.0/model.joblib

    # Do Hugging Face (quando publicado):
    uv run python -m model.download_model --hf prointe-insper/classificador-assuntos-pge
"""

from __future__ import annotations

import argparse
import urllib.request
from pathlib import Path

ARTIFACTS_DIR = Path(__file__).resolve().parent / "artifacts"


def download_url(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    print(f"Baixando {url} -> {dest} ...")
    urllib.request.urlretrieve(url, dest)  # noqa: S310 - URL fornecida pelo operador
    print("Concluído.")
    return dest


def download_hf(repo_id: str, dest_dir: Path) -> Path:
    try:
        from huggingface_hub import hf_hub_download
    except ImportError as exc:  # pragma: no cover
        raise SystemExit(
            "Instale huggingface_hub: uv add huggingface_hub"
        ) from exc
    dest_dir.mkdir(parents=True, exist_ok=True)
    path = hf_hub_download(repo_id=repo_id, filename="model.joblib", local_dir=dest_dir)
    print(f"Baixado de {repo_id}: {path}")
    return Path(path)


REPO = "prointe-insper/classificador-app"

#: Modelos que o app serve, com a release de onde sai cada artefato. A aplicação
#: usa os dois ao mesmo tempo: são taxonomias distintas, não gerações que se
#: substituem (ver ``app/services/models.py``).
MODELOS = {
    "v2": ("v0.3.1", ARTIFACTS_DIR / "model.joblib"),
    "v1": ("v0.2.1", ARTIFACTS_DIR.parent / "artifacts_xgb_v1" / "model.joblib"),
}


def release_url(tag: str) -> str:
    return f"https://github.com/{REPO}/releases/download/{tag}/model.joblib"


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument(
        "--modelo",
        choices=[*MODELOS, "todos"],
        help="Baixa um modelo do catálogo (ou 'todos') no caminho padrão dele.",
    )
    group.add_argument("--url", help="URL direta do asset model.joblib.")
    group.add_argument("--hf", help="repo_id no Hugging Face (ex.: org/modelo).")
    parser.add_argument("--dest", type=Path, default=ARTIFACTS_DIR / "model.joblib")
    args = parser.parse_args()

    if args.modelo:
        escolhidos = MODELOS if args.modelo == "todos" else {args.modelo: MODELOS[args.modelo]}
        for nome, (tag, destino) in escolhidos.items():
            print(f"[{nome}] release {tag}")
            download_url(release_url(tag), destino)
    elif args.url:
        download_url(args.url, args.dest)
    else:
        download_hf(args.hf, args.dest.parent)


if __name__ == "__main__":
    main()
