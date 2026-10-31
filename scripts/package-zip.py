"""Create a portable ZIP from one explicitly contained public artifact directory."""
import json
import os
import pathlib
import sys
import uuid
import zipfile


def create_archive(directory, destination, workspace):
    root = pathlib.Path(workspace).resolve(strict=True)
    public = (root / 'out').resolve(strict=True)
    if not public.is_relative_to(root) or (root / 'out').is_symlink() or pathlib.Path(directory).is_symlink():
        raise ValueError('Public artifact roots must remain inside workspace without symlinks.')
    directory = pathlib.Path(directory).resolve(strict=True)
    destination = pathlib.Path(destination).absolute()
    if not directory.is_relative_to(public) or directory == public:
        raise ValueError('Artifact directory must be inside workspace out.')
    if destination.parent.resolve(strict=True) != directory.parent or destination.suffix != '.zip':
        raise ValueError('ZIP must be adjacent to its artifact directory.')
    if destination.is_symlink() or directory.is_symlink():
        raise ValueError('Symbolic ZIP targets are forbidden.')
    files = sorted(path for path in directory.rglob('*') if path.is_file())
    if len(files) > 10000 or any(path.is_symlink() or not path.resolve(strict=True).is_relative_to(directory) for path in directory.rglob('*')):
        raise ValueError('Invalid artifact inventory.')
    if any(path.stat().st_size > 512 * 1024**2 for path in files) or sum(path.stat().st_size for path in files) > 2 * 1024**3:
        raise ValueError('Artifact exceeds portable ZIP limit.')
    temporary = destination.with_name(destination.name + '.tmp-' + uuid.uuid4().hex)
    try:
        with zipfile.ZipFile(temporary, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6, strict_timestamps=False) as archive:
            for path in files:
                archive.write(path, (pathlib.PurePosixPath(directory.name) / path.relative_to(directory).as_posix()).as_posix())
        os.replace(temporary, destination)
    finally:
        temporary.unlink(missing_ok=True)
    return {'files': len(files), 'bytes': destination.stat().st_size, 'timestampPolicy': 'ZIP metadata clamped to 1980-2107; original files unchanged'}


if __name__ == '__main__':
    if len(sys.argv) != 4:
        raise SystemExit('Usage: package-zip.py ARTIFACT_DIRECTORY ZIP_PATH WORKSPACE')
    print(json.dumps(create_archive(*sys.argv[1:])))
