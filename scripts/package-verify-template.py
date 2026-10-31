"""Compare every extracted public Electron distribution file to the checksum-verified ZIP."""
import argparse
import hashlib
import json
from pathlib import Path,PurePosixPath
import zipfile
parser=argparse.ArgumentParser()
parser.add_argument('--zip',required=True)
parser.add_argument('--template',required=True)
args=parser.parse_args()
root=Path.cwd().resolve()
template=Path(args.template).resolve()
archive=Path(args.zip).resolve()
if not template.is_relative_to(root/'.tmp') or not archive.is_relative_to(root/'.cache/electron'):raise ValueError('Public distribution path escapes workspace staging/cache.')
count=0
with zipfile.ZipFile(archive) as source:
    for entry in source.infolist():
        if entry.is_dir():continue
        relative=PurePosixPath(entry.filename)
        if relative.is_absolute() or '..' in relative.parts or '\\' in entry.filename:raise ValueError('Unsafe archive entry.')
        file=(template/Path(*relative.parts)).resolve()
        if not file.is_relative_to(template) or file.is_symlink():raise ValueError('Unsafe extracted template entry.')
        if hashlib.sha256(source.read(entry)).digest()!=hashlib.sha256(file.read_bytes()).digest():raise ValueError('Extracted template differs: '+entry.filename)
        count+=1
print(json.dumps({'files':count,'matched':True,'scope':'Read-only archive/template comparison.'}))
