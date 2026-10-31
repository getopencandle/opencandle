"""Read-only bounded ZIP inventory/content verification; never extracts files."""
import argparse
import hashlib
import json
from pathlib import Path
import stat
import zipfile

ROOT=Path(__file__).resolve().parents[1]
MAX_ENTRY_BYTES=512*1024*1024
MAX_TOTAL_BYTES=2*1024*1024*1024
def inside(file):
    result=Path(file).resolve()
    if not result.is_relative_to(ROOT/'out'):raise ValueError('Artifact path must remain within public workspace out directory.')
    return result
def safe_name(name):
    if not isinstance(name,str) or not name or '\\' in name or '\0' in name or name.startswith('/') or any(part in ('','.','..') for part in name.split('/')):raise ValueError('Unsafe archive path.')
def verify(manifest_file,archive_file):
    manifest_bytes=inside(manifest_file).read_bytes();manifest=json.loads(manifest_bytes)
    directory=inside(ROOT/manifest['directory']);prefix=directory.name+'/'
    expected=dict(manifest['files'])
    expected['build-manifest.json']={'bytes':len(manifest_bytes),'sha256':hashlib.sha256(manifest_bytes).hexdigest()}
    if not 1<=len(expected)<=10000:raise ValueError('Artifact inventory exceeds bounds.')
    for name,item in expected.items():
        safe_name(name)
        if type(item.get('bytes')) is not int or not 0<=item['bytes']<=MAX_ENTRY_BYTES:raise ValueError('Invalid expected file length.')
    if sum(item['bytes'] for item in expected.values())>MAX_TOTAL_BYTES:raise ValueError('Expected artifact exceeds bounds.')
    seen=set();total=0
    with zipfile.ZipFile(inside(archive_file)) as archive:
        if len(archive.infolist())>20000:raise ValueError('Archive entry count exceeds bounds.')
        for info in archive.infolist():
            path=info.filename[:-1] if info.is_dir() else info.filename
            safe_name(path)
            if stat.S_ISLNK(info.external_attr>>16) or info.flag_bits&1:raise ValueError('Archive symlinks or encryption are unsupported.')
            if info.is_dir():
                if path!=directory.name and not path.startswith(prefix):raise ValueError('Unexpected archive directory.')
                continue
            if not path.startswith(prefix):raise ValueError('Archive file is outside the portable folder.')
            relative=path[len(prefix):]
            if relative not in expected or relative in seen:raise ValueError('Unexpected or duplicate archive file.')
            expected_file=expected[relative]
            if info.file_size!=expected_file['bytes'] or info.file_size>MAX_ENTRY_BYTES:raise ValueError('Archive file length differs from manifest.')
            digest=hashlib.sha256();length=0
            with archive.open(info) as stream:
                while chunk:=stream.read(1024*1024):
                    length+=len(chunk);total+=len(chunk)
                    if length>expected_file['bytes'] or total>MAX_TOTAL_BYTES:raise ValueError('Archive stream exceeds verified bounds.')
                    digest.update(chunk)
            if length!=expected_file['bytes'] or digest.hexdigest()!=expected_file['sha256']:raise ValueError('Archive file content differs from manifest.')
            seen.add(relative)
    if seen!=set(expected):raise ValueError('Archive is missing manifest files.')
    return {'buildId':manifest['buildId'],'verifiedFiles':len(seen),'uncompressedBytes':total,'allFileHashesMatch':True,'scope':'Read-only ZIP contents versus captured manifest; no extraction, launch or interface evidence','capturesCreated':0}
def main():
    parser=argparse.ArgumentParser(description=__doc__);parser.add_argument('--manifest',required=True);parser.add_argument('--zip',required=True);args=parser.parse_args()
    print(json.dumps(verify(args.manifest,args.zip)))
if __name__=='__main__':main()
