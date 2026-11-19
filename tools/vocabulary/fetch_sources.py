import argparse
import hashlib
import json
import os
from pathlib import Path
from urllib.request import Request, urlopen


def download(url, destination):
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix(destination.suffix + ".download")
    request = Request(url, headers={"User-Agent": "VocabularyLibraryBuilder/1.0"})
    with urlopen(request, timeout=120) as response:
        if response.status != 200:
            raise RuntimeError("Source HTTP {}: {}".format(response.status, url))
        temporary.write_bytes(response.read())
    digest = hashlib.sha256(temporary.read_bytes()).hexdigest()
    os.replace(str(temporary), str(destination))
    return {
        "url": url,
        "path": str(destination),
        "sha256": digest,
        "bytes": destination.stat().st_size
    }


def validate_awl(path):
    path = Path(path)
    lines = [
        line.strip()
        for line in path.read_text(encoding="utf-8-sig").splitlines()
        if line.strip()
    ]
    if len(lines) != 570 or len({line.casefold() for line in lines}) != 570:
        raise ValueError("AWL snapshot must contain exactly 570 unique family headwords")
    return lines


def main(root, config_path):
    config = json.loads(config_path.read_text(encoding="utf-8"))
    lock = {
        "ecdict": download(
            config["ecdict"]["url"], root / config["ecdict"]["snapshot"]
        ),
        "topik": download(
            config["topik"]["url"], root / config["topik"]["snapshot"]
        )
    }
    awl_path = root / config["awl"]["snapshot"]
    validate_awl(awl_path)
    lock["awl"] = {
        "url": config["awl"]["url"],
        "path": str(awl_path),
        "sha256": hashlib.sha256(awl_path.read_bytes()).hexdigest(),
        "bytes": awl_path.stat().st_size
    }
    (root / "sources.lock.json").write_text(
        json.dumps(lock, ensure_ascii=False, indent=2, sort_keys=True),
        encoding="utf-8"
    )


if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", required=True, type=Path)
    parser.add_argument("--config", required=True, type=Path)
    arguments = parser.parse_args()
    main(arguments.root, arguments.config)
