"""Run with Python + defusedxml. Tests the actual Minify settings hook in a temp folder."""
import importlib.util
import json
from pathlib import Path
import re
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
    section = root.find('.//*[@id="ShowMMRSettingsSection"]')
    assert 'showmmr_strings' not in section.attrib and not any('showmmr_key' in e.attrib for e in section.iter())

    # Translations follow Minify's output language (latam shares Spanish).
    core.config = SimpleNamespace(get=lambda key: 'latam' if key == 'output_locale' else None)
    target.write_text('<root><PopupSettingsRebornSettingsBody /></root>')
    hook.main()
    section = ET.parse(target).getroot().find('.//*[@id="ShowMMRSettingsSection"]')
    assert section.find('.//*[@id="ShowMMRAuto"]').get('text').startswith('Registrar resultados')
    assert json.loads(section.get('showmmr_strings'))['idle'] == 'inactivo'

# Every language covers every tagged label and every settings string, with the same placeholders.
strings = json.loads((mod / 'strings.json').read_text(encoding='utf-8'))
script = (mod / 'files_uncompiled/panorama/scripts/show_mmr_settings.js').read_text(encoding='utf-8')
english = dict(re.findall(r'(\w+): "([^"]*)"', script.split('var ShowMMR_SettingsStrings = {')[1].split('\n};')[0]))
english.update(dict.fromkeys(re.findall(r'showmmr_key="(\w+)"', (mod / 'menu.xml').read_text()), ''))
for lang, table in strings.items():
    assert set(table) == set(english), (lang, set(table) ^ set(english))
    for key, text in table.items():
        assert sorted(re.findall(r'\{\d\}', text)) == sorted(re.findall(r'\{\d\}', english[key])), (lang, key)
print('Settings injection checks passed; existing mod section preserved; translations complete')
