"""Run with Python + defusedxml. Tests the actual Minify settings hook in a temp folder."""
import importlib.util
from pathlib import Path
import sys
import tempfile
from types import ModuleType, SimpleNamespace
import xml.etree.ElementTree as ET

mod = Path(__file__).resolve().parents[1] / 'Minify/mods/Show MMR'
with tempfile.TemporaryDirectory() as temporary:
    core = ModuleType('core')
    core.base = SimpleNamespace(build_dir=temporary)
    sys.modules['core'] = core
    sys.modules['conditions'] = SimpleNamespace(workshop_installed=True)
    target = Path(temporary) / 'panorama/layout/popups/popup_settings_reborn.xml'
    target.parent.mkdir(parents=True)
    target.write_text('<root><PopupSettingsRebornSettingsBody><Panel id="AutoAcceptSection" /></PopupSettingsRebornSettingsBody></root>')
    spec = importlib.util.spec_from_file_location('settings_hook', mod / 'script_after_decompile.py')
    hook = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(hook)
    hook.main()
    hook.main()
    root = ET.parse(target).getroot()
    assert len(root.findall('.//*[@id="ShowMMRSettingsSection"]')) == 1
    assert root.find('.//*[@id="AutoAcceptSection"]') is not None
    assert len(root.findall('scripts/include')) == 1
    assert root.find('.//*[@id="ShowMMRShow"]') is not None
print('Settings injection checks passed; existing mod section preserved')
