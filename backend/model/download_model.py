"""Baixa o artefato do modelo de uma Release do GitHub (ou Hugging Face).

O modelo (``model.joblib``) não é versionado no git por ser binário/grande; ele
é distribuído via *Releases* do repositório e, futuramente, via Hugging Face.

Uso::

    # Da Release do GitHub (informe a URL do asset):
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


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    group = parser.add_mutually_exclusive_group(required=True)
    group.add_argument("--url", help="URL direta do asset model.joblib.")
    group.add_argument("--hf", help="repo_id no Hugging Face (ex.: org/modelo).")
    parser.add_argument("--dest", type=Path, default=ARTIFACTS_DIR / "model.joblib")
    args = parser.parse_args()

    if args.url:
        download_url(args.url, args.dest)
    else:
        download_hf(args.hf, args.dest.parent)


if __name__ == "__main__":
    main()
