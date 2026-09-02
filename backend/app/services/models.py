"""Catálogo de modelos disponíveis.

A aplicação serve mais de um modelo ao mesmo tempo, e a escolha é do usuário na
tela. Isso existe porque as gerações do classificador **não são substitutas uma
da outra**: a v1 (TF-IDF + XGBoost) cobre os dez assuntos de massa da PGE-SP e
tem as saídas de escape ``Outros`` e ``NÃO_NA_TAXONOMIA``; a v2 (chunks +
TF-IDF + Random Forest) cobre 16 assuntos da cauda da taxonomia e não tem
escape. Quem classifica uma execução fiscal de ICMS precisa da v1; quem
classifica uma usucapião precisa da v2.

Cada entrada aponta para um campo de ``Settings`` com o caminho do artefato, de
modo que o operador possa remanejar os arquivos por variável de ambiente. Um
modelo cujo artefato não está no disco não aparece na lista, em vez de aparecer
e quebrar na primeira classificação.
"""

from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path

from app.config import Settings
from app.schemas import ModelOption


@dataclass(frozen=True)
class ModelEntry:
    """Um modelo do catálogo."""

    id: str
    name: str
    description: str
    #: Campo de ``Settings`` que guarda o caminho do ``model.joblib``.
    settings_attr: str
    is_default: bool = False


CATALOG: tuple[ModelEntry, ...] = (
    ModelEntry(
        id="pge-fixedchunks-tfidf-rf-v2",
        name="PGE · TF-IDF + Random Forest (v2)",
        description=(
            "16 assuntos da cauda da taxonomia (usucapião, IPTU, ITCMD, erro médico, "
            "terceirização e outros). Chunks de 100 palavras + TF-IDF + Random Forest, "
            "vencedor do benchmark do juriclass. Não tem as saídas 'Outros' e "
            "'NÃO_NA_TAXONOMIA': o que sinaliza baixa aderência é a confiança."
        ),
        settings_attr="model_path",
        is_default=True,
    ),
    ModelEntry(
        id="pge-tfidf-xgboost-v1",
        name="PGE · TF-IDF + XGBoost (v1)",
        description=(
            "Dez assuntos de massa (ICMS declarado e autuação, IPVA, GESS, ALE, ATS, "
            "bonificação, licença-prêmio, Detran/AIT) mais 'Outros' e "
            "'NÃO_NA_TAXONOMIA'. TF-IDF 1-2 gramas + XGBoost, com explicabilidade por "
            "TreeSHAP."
        ),
        settings_attr="legacy_model_path",
    ),
)


def entry_for(model_id: str) -> ModelEntry | None:
    """Entrada do catálogo com esse id, ou ``None``."""
    return next((m for m in CATALOG if m.id == model_id), None)


def model_path(settings: Settings, entry: ModelEntry) -> Path:
    """Caminho do artefato desse modelo, conforme as configurações."""
    return Path(getattr(settings, entry.settings_attr))


def catalog_entries(settings: Settings) -> list[ModelEntry]:
    """Entradas cujo artefato existe no disco.

    O modelo padrão entra sempre: se ele faltar, é melhor a interface mostrá-lo e
    o ``/health`` reportar "não carregado" do que a lista vir vazia e o usuário
    não entender o que houve.
    """
    return [
        entry
        for entry in CATALOG
        if entry.is_default or model_path(settings, entry).exists()
    ]


def available_models(settings: Settings) -> list[ModelOption]:
    """Retorna os modelos que o serviço sabe servir, para o seletor da tela."""
    return [
        ModelOption(
            id=entry.id,
            name=entry.name,
            description=entry.description,
            is_default=entry.is_default,
        )
        for entry in catalog_entries(settings)
    ]


def is_valid_model_id(settings: Settings, model_id: str) -> bool:
    """Indica se ``model_id`` corresponde a um modelo disponível."""
    return any(m.id == model_id for m in catalog_entries(settings))


def default_model_id(settings: Settings) -> str:
    """Id do modelo pré-selecionado."""
    entries = catalog_entries(settings)
    return next((e.id for e in entries if e.is_default), entries[0].id)


__all__ = [
    "CATALOG",
    "ModelEntry",
    "available_models",
    "catalog_entries",
    "default_model_id",
    "entry_for",
    "is_valid_model_id",
    "model_path",
]
