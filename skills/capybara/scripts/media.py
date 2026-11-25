#!/usr/bin/env python3
"""查询 IP 参考与原件；只读，运行仅依赖 Python 标准库。"""

import argparse
import hashlib
import json
from pathlib import Path
import sys


SKILL_ROOT = Path(__file__).resolve().parents[1]


def load_catalog():
    return json.loads((SKILL_ROOT / "assets/media-catalog.json").read_text(encoding="utf-8"))


def matches(query, text):
    return all(token in text.casefold() for token in query.casefold().split())


def find_originals(catalog, query, kind=None):
    results = []
    for original in catalog["originals"]:
        if kind and original["kind"] != kind:
            continue
        for location in original["locations"]:
            text = " ".join([location["path"], location["family"], location["use"]])
            if matches(query, text):
                results.append({
                    "path": location["path"],
                    "use": location["use"],
                    "kind": original["kind"],
                    "bytes": original["bytes"],
                    **{key: original[key] for key in ("width", "height", "frames", "duration_ms")
                       if key in original},
                })
    return sorted(results, key=lambda row: row["path"])


def resolve_original(catalog, relative, project_root):
    for original in catalog["originals"]:
        if not any(location["path"] == relative for location in original["locations"]):
            continue
        path = project_root / relative
        if not path.is_file():
            raise ValueError(f"原件不在指定项目中: {path.as_uri()}；可继续使用内置参考。")
        digest = hashlib.sha256()
        with path.open("rb") as stream:
            for chunk in iter(lambda: stream.read(1024 * 1024), b""):
                digest.update(chunk)
        if digest.hexdigest() != original["sha256"]:
            raise ValueError(f"原件内容与索引不一致: {path.as_uri()}；核实文件后更新索引。")
        return {
            "url": path.as_uri(),
            "kind": original["kind"],
            "bytes": original["bytes"],
            **{key: original[key] for key in ("width", "height", "frames", "duration_ms")
               if key in original},
        }
    raise ValueError("索引没有该相对路径；先用 find 查询具体文件。")


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest="command", required=True)
    bundled = commands.add_parser("bundled", help="列出内置参考及其本地链接")
    bundled.add_argument("query", nargs="?", default="")
    find = commands.add_parser("find", help="按路径、用途和类别查询原件")
    find.add_argument("query", nargs="?", default="")
    find.add_argument("--kind", choices=("image", "animation", "video"))
    find.add_argument("--limit", type=int, default=20, help="最多显示条数，0表示全部")
    resolve = commands.add_parser("resolve", help="核对一个原件并返回本地链接")
    resolve.add_argument("relative_path")
    resolve.add_argument("--project-root", type=Path, default=Path.cwd(),
                         help="原素材所在项目根目录，默认当前目录")
    args = parser.parse_args()
    catalog = load_catalog()
    if args.command == "bundled":
        output = [
            {"url": (SKILL_ROOT / item["path"]).as_uri(), **item}
            for item in catalog["bundled_references"]
            if matches(args.query, " ".join([item["path"], item["operation"], *item["sources"]]))
        ]
    elif args.command == "find":
        if args.limit < 0:
            parser.error("--limit 应为非负数")
        results = find_originals(catalog, args.query, args.kind)
        output = {"matched": len(results), "results": results[:args.limit] if args.limit else results}
    else:
        output = resolve_original(catalog, args.relative_path,
                                  args.project_root.expanduser().resolve())
    print(json.dumps(output, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, KeyError) as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
