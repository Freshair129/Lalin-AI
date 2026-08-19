from pathlib import Path
import runpy
import sys

target = Path(__file__).resolve().parents[1] / "tools" / "build" / "make_icons.py"
sys.argv[0] = str(target)
runpy.run_path(str(target), run_name="__main__")
