"""Add a native settings section without replacing Valve's settings layout."""
import json
from pathlib import Path

import conditions
import defusedxml.ElementTree as ET
from core import base

# Dota language names that share a translation.
ALIASES = {'latam': 'spanish', 'portuguese': 'brazilian'}


def language():
    """Minify's Dota output language; English when unknown."""
    try:
        from core import config
        return str(config.get('output_locale') or 'english').lower()
    except Exception:
        return 'english'


def localize(section, strings):
    """Translate tagged static labels and hand dynamic strings to show_mmr_settings.js."""
    for element in section.iter():
        key = element.attrib.pop('showmmr_key', None)
        if key and key in strings:
            element.set('text', strings[key])
    if strings:
        section.set('showmmr_strings', json.dumps(strings, ensure_ascii=False))


def main():
    if not conditions.workshop_installed:
        return
    target = Path(base.build_dir) / 'panorama/layout/popups/popup_settings_reborn.xml'
    tree = ET.parse(target)
    root = tree.getroot()
    body = root.find('.//PopupSettingsRebornSettingsBody')
    if body is None:
        raise ValueError('Show MMR: native settings body not found')
    if body.find(".//*[@id='ShowMMRSettingsSection']") is not None:
        return
    scripts = root.find('scripts')
    if scripts is None:
        scripts = ET.fromstring('<scripts />')
        root.insert(0, scripts)
    scripts.append(ET.fromstring('<include src="s2r://panorama/scripts/show_mmr_settings.vjs_c" />'))
    here = Path(__file__).parent
    section = ET.parse(here / 'menu.xml').getroot()
    translations = json.loads((here / 'strings.json').read_text(encoding='utf-8'))
    lang = language()
    localize(section, translations.get(ALIASES.get(lang, lang), {}))
    body.append(section)
    tree.write(target, encoding='utf-8')
