from __future__ import annotations

import sys
import types


def test_separate_stems_resolves_auto_device_before_demucs(monkeypatch, tmp_path):
    from app.pipelines import music
    from app.runtime_devices import device_registry

    commands: list[list[str]] = []
    torch = types.ModuleType("torch")
    torch.cuda = types.SimpleNamespace(
        is_available=lambda: False,
        empty_cache=lambda: None,
    )
    monkeypatch.setitem(sys.modules, "torch", torch)
    monkeypatch.setattr(
        music,
        "find_spec",
        lambda name: object() if name == "demucs" else None,
    )
    monkeypatch.setattr(
        music.subprocess,
        "run",
        lambda command, **kwargs: commands.append(command),
    )
    device_registry.reset()

    result = music.separate_stems("vocal.wav", str(tmp_path), device="auto")

    command = commands[0]
    assert command[command.index("-d") + 1] == "cpu"
    assert result["vocals"] == str(
        tmp_path / "_sep" / "htdemucs" / "vocal" / "vocals.wav"
    )
