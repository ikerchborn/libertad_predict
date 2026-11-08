"""Automated architecture boundary and Alembic single-head verification tests.

Enforces:
1. Domain purity: `turismo.<module>.domain` never imports `infrastructure`, `sqlalchemy`,
   `fastapi`, or `httpx`.
2. Bounded-context independence: feature modules (`places`, `scoring`, `weather`, `safety`,
   `events`, `pricing`) never import each other directly; only `turismo.app` assembles them.
3. Single Alembic migration head: prevents branched migration histories in PRs.
"""
from __future__ import annotations

import ast
from pathlib import Path

from alembic.config import Config
from alembic.script import ScriptDirectory

FEATURE_MODULES = ("places", "scoring", "weather", "safety", "events", "pricing")
FORBIDDEN_IN_DOMAIN = ("sqlalchemy", "fastapi", "httpx", "starlette", "apscheduler")


def _extract_imports(py_file: Path) -> list[str]:
    tree = ast.parse(py_file.read_text(encoding="utf-8"), filename=str(py_file))
    imports: list[str] = []
    for node in ast.walk(tree):
        if isinstance(node, ast.Import):
            for alias in node.names:
                imports.append(alias.name)
        elif isinstance(node, ast.ImportFrom) and node.module:
            imports.append(node.module)
    return imports


def test_domain_layers_do_not_depend_on_infrastructure_or_frameworks() -> None:
    src_root = Path("src/turismo")
    violations: list[str] = []

    for mod in FEATURE_MODULES:
        domain_dir = src_root / mod / "domain"
        if not domain_dir.exists():
            continue
        for py_file in domain_dir.rglob("*.py"):
            for imp in _extract_imports(py_file):
                if ".infrastructure" in imp or any(
                    imp == pkg or imp.startswith(f"{pkg}.") for pkg in FORBIDDEN_IN_DOMAIN
                ):
                    violations.append(f"{py_file}: forbidden import '{imp}'")

    assert violations == [], "Domain purity violations:\n" + "\n".join(violations)


def test_feature_modules_are_independent_of_each_other() -> None:
    src_root = Path("src/turismo")
    violations: list[str] = []

    for mod in FEATURE_MODULES:
        mod_dir = src_root / mod
        other_modules = {m for m in FEATURE_MODULES if m != mod}
        for py_file in mod_dir.rglob("*.py"):
            for imp in _extract_imports(py_file):
                parts = imp.split(".")
                if len(parts) >= 2 and parts[0] == "turismo" and parts[1] in other_modules:
                    sibling = parts[1]
                    violations.append(
                        f"{py_file}: module '{mod}' imports '{imp}' from sibling '{sibling}'"
                    )

    assert violations == [], "Module independence violations:\n" + "\n".join(violations)


def test_alembic_has_single_head() -> None:
    alembic_cfg = Config("alembic.ini")
    script = ScriptDirectory.from_config(alembic_cfg)
    heads = script.get_heads()
    assert len(heads) == 1, f"Expected exactly 1 Alembic head, found {len(heads)}: {heads}"
