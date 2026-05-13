import json
from pathlib import Path

import pytest

from redshift_backend.core.persistence import PersistenceManager


def test_save_then_load_roundtrip(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    pm.save("alpha", {"hello": "world", "n": 7})
    assert pm.load("alpha") == {"hello": "world", "n": 7}


def test_load_missing_returns_none(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    assert pm.load("nope") is None


def test_load_corrupt_file_returns_none(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    (pm.base_dir / "broken.json").write_text("{not json", encoding="utf-8")
    assert pm.load("broken") is None


def test_load_non_dict_root_returns_none(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    (pm.base_dir / "arr.json").write_text("[1, 2, 3]", encoding="utf-8")
    assert pm.load("arr") is None


def test_save_is_atomic_no_leftover_tempfile(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    pm.save("beta", {"x": 1})
    leftovers = [p.name for p in pm.base_dir.iterdir() if p.name.endswith(".tmp")]
    assert leftovers == []


def test_save_overwrites_previous(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    pm.save("gamma", {"v": 1})
    pm.save("gamma", {"v": 2})
    assert pm.load("gamma") == {"v": 2}


def test_save_writes_json_on_disk(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    pm.save("delta", {"k": "v"})
    raw = (pm.base_dir / "delta.json").read_text(encoding="utf-8")
    assert json.loads(raw) == {"k": "v"}


def test_delete_removes_file(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    pm.save("eps", {"a": 1})
    pm.delete("eps")
    assert pm.load("eps") is None


def test_delete_missing_is_noop(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    pm.delete("never_existed")  # must not raise


def test_invalid_namespace_raises(tmp_path: Path) -> None:
    pm = PersistenceManager(tmp_path / "store")
    with pytest.raises(ValueError):
        pm.load("Bad-Name")
    with pytest.raises(ValueError):
        pm.save("../escape", {"x": 1})
    with pytest.raises(ValueError):
        pm.save("", {"x": 1})


def test_creates_base_dir_if_missing(tmp_path: Path) -> None:
    target = tmp_path / "nested" / "deeper" / "store"
    pm = PersistenceManager(target)
    assert target.is_dir()
    pm.save("zeta", {"ok": True})
    assert pm.load("zeta") == {"ok": True}
