"""Prepare the private server copy of the published stage symbol archive."""
import hashlib
import io
import json
import re
import sys
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path, PurePosixPath

SOURCE = 'https://template.kiwisoundworks.com/dl/StageOpenTemplate_svg_20250210.zip'
ROOT = Path(__file__).resolve().parent.parent / 'receipt-backend' / 'functions'
raw = Path(sys.argv[1]).read_bytes() if len(sys.argv) > 1 else urllib.request.urlopen(SOURCE, timeout=30).read()
out = ROOT / 'kiwi-assets'
out.mkdir(exist_ok=True)
catalog = []
with zipfile.ZipFile(io.BytesIO(raw), metadata_encoding='cp932') as archive:
    for entry in archive.infolist():
        path = PurePosixPath(entry.filename)
        if path.suffix.lower() != '.svg':
            continue
        if len(path.parts) != 3 or entry.file_size > 480000:
            raise ValueError(f'Unexpected SVG archive entry: {path}')
        data = archive.read(entry)
        if re.search(rb'<!ENTITY|<(?:\w+:)?(?:script|foreignObject)\b|\son[a-z]+\s*=|@import', data, re.I):
            raise ValueError(f'Unexpected active SVG: {path}')
        svg = ET.fromstring(data)
        if svg.tag != '{http://www.w3.org/2000/svg}svg':
            raise ValueError(f'Unexpected SVG document: {path}')
        for node in svg.iter():
            for attribute, value in node.attrib.items():
                if attribute.split('}')[-1] in ('href', 'src') and not value.startswith('#'):
                    raise ValueError(f'Unexpected SVG resource: {path}')
        width = re.fullmatch(r'([0-9.]+)mm', svg.attrib.get('width', ''))
        if 'viewBox' in svg.attrib:
            _, _, w, h = map(float, re.split(r'[\s,]+', svg.attrib['viewBox'].strip()))
        else:
            w, h = (float(re.match(r'[0-9.]+', svg.attrib[axis])[0]) for axis in ('width','height'))
        if not (w > 0 and h > 0):
            raise ValueError(f'Invalid SVG bounds: {path}')
        size = max(1, min(20000, round(float(width[1]) * 10))) if width else 60
        key = 'kiwi-' + hashlib.sha256(entry.filename.encode()).hexdigest()[:20]
        (out / (key + '.svg')).write_bytes(data)
        catalog.append(dict(id=key, label=path.stem, category=path.parts[1], ratio=max(.02, min(50, w/h)), size=size))
catalog.sort(key=lambda asset: (asset['category'], asset['label'], asset['id']))
(ROOT / 'kiwi-catalog.json').write_text(json.dumps(catalog, ensure_ascii=False, separators=(',', ':'))+'\n', encoding='utf-8')
print(f'Prepared {len(catalog)} SVG symbols for signed-in users.')
