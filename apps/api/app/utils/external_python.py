"""Launch optional Python tools outside the frozen sidecar's DLL search path."""
from __future__ import annotations

import os
from pathlib import Path


def demucs_python() -> str | None:
    value = os.environ.get("GMUSIC_DEMUCS_PYTHON", "")
    return value if value and Path(value).is_absolute() and Path(value).is_file() else None


# Reset in the child, not the multi-threaded sidecar: SetDllDirectoryW changes
# process-wide state. Do this before importing torch or the Demucs module.
RESET_DLL_SEARCH = "import os,ctypes; os.name == 'nt' and ctypes.windll.kernel32.SetDllDirectoryW(None); "
