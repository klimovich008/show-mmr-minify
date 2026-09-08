"""Add a native settings section without replacing Valve's settings layout."""
from pathlib import Path

import conditions
import defusedxml.ElementTree as ET
from core import base


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
    body.append(ET.parse(Path(__file__).with_name('menu.xml')).getroot())
    tree.write(target, encoding='utf-8')
