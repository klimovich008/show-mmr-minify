"""Supply the runtime with Minify's actual Steam installation, not an account ID."""
from pathlib import Path

from core import constants, steam


def main():
    root = str(Path(steam.ROOT)).replace("\\", "/")
    if any(c in root for c in '\"\r\n'):
        raise ValueError("Steam path cannot be represented in KeyValues")
    target = Path(constants.minify_dota_compile_output_path) / "scripts/show_mmr_paths.txt"
    target.parent.mkdir(parents=True, exist_ok=True)
    target.write_text('"ShowMMRPaths"\n{\n\t"steam_root" "' + root + '"\n}\n', encoding="utf-8")
