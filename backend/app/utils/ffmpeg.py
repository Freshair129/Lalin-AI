"""Self-contained ffmpeg wiring via imageio-ffmpeg."""
from __future__ import annotations

import os
import warnings
from pathlib import Path

_configured = False


def configure() -> str | None:
    """Point audio libraries at the bundled ffmpeg binary and update PATH."""
    global _configured
    if _configured:
        return None

    try:
        import imageio_ffmpeg

        exe = imageio_ffmpeg.get_ffmpeg_exe()
    except Exception:  # noqa: BLE001
        return None

    folder = str(Path(exe).parent)
    if folder not in os.environ.get("PATH", ""):
        os.environ["PATH"] = folder + os.pathsep + os.environ.get("PATH", "")

    try:
        # pydub warns during import when ffmpeg is not on the system PATH yet.
        # We override its converter immediately with the bundled binary.
        with warnings.catch_warnings():
            warnings.filterwarnings(
                "ignore",
                message="Couldn't find ffmpeg or avconv - defaulting to ffmpeg, but may not work",
                category=RuntimeWarning,
            )
            from pydub import AudioSegment

        AudioSegment.converter = exe
        AudioSegment.ffmpeg = exe

        ffprobe = Path(folder) / ("ffprobe" + (".exe" if os.name == "nt" else ""))
        if ffprobe.exists():
            AudioSegment.ffprobe = str(ffprobe)
    except Exception:  # noqa: BLE001
        pass

    _configured = True
    return exe
