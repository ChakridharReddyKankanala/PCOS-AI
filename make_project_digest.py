#!/usr/bin/env python3
"""
make_project_digest.py

Turns a whole project folder into a few compact text files you can upload to a chat.
It only READS your folder. Nothing is sent anywhere. Output files
(project_digest_01.md, project_digest_02.md, ...) are written into the folder
you run the command from.

Usage (Python 3.8+, standard library only):
    python make_project_digest.py "C:\\path\\to\\project"
    python make_project_digest.py              (digests the current folder)

What goes in the digest:
  - full folder map with file sizes
  - every code / config / markdown / text file (long files are cut, and marked as cut)
  - notebooks: code + markdown + text outputs (embedded images are dropped)
  - CSV/TSV files: row count, columns, first rows
  - image folders: counts per folder and per extension (e.g. class balance)
  - model / weight files and other binaries: name and size only
  - skipped dependency folders (node_modules, venv, .git ...): name and file count
  - .env files are NOT included, and lines that look like keys/passwords are redacted
"""
import csv
import json
import os
import re
import sys
from collections import defaultdict
from datetime import datetime
from pathlib import Path

ROOT = Path(sys.argv[1] if len(sys.argv) > 1 else ".").expanduser().resolve()
OUT_DIR = Path.cwd()

# ---- limits you can change -------------------------------------------------
PART_BYTES = 400_000      # approximate size cap of each output file
MAX_LINES = 500           # per code / text file
NB_MAX_LINES = 1000       # per notebook
MAX_LINE_CHARS = 300      # long lines (minified code, data dumps) are cut
MAX_OUTPUT_LINES = 15     # per notebook cell output
CSV_PREVIEW_ROWS = 3
LIST_LIMIT = 40           # files listed per folder in the folder map
# ----------------------------------------------------------------------------

SKIP_DIRS = {
    ".git", "node_modules", "venv", ".venv", "env", "__pycache__", ".idea",
    ".vscode", "dist", "build", ".next", ".ipynb_checkpoints", ".mypy_cache",
    ".pytest_cache", "site-packages",
}
TEXT_EXT = {
    ".py", ".js", ".jsx", ".ts", ".tsx", ".html", ".htm", ".css", ".scss",
    ".json", ".md", ".txt", ".yml", ".yaml", ".toml", ".cfg", ".ini", ".sql",
    ".sh", ".bat", ".ps1", ".xml", ".r", ".java", ".c", ".cpp", ".h", ".rst",
    ".tex", ".vue", ".svelte", ".gitignore", ".dockerignore",
}
TEXT_NAMES = {"dockerfile", "procfile", "makefile", "requirements.txt", "readme", "license"}
MODEL_EXT = {
    ".h5", ".keras", ".pt", ".pth", ".pkl", ".pickle", ".joblib", ".onnx",
    ".tflite", ".pb", ".ckpt", ".safetensors", ".bin", ".npy", ".npz", ".weights",
}
IMAGE_EXT = {
    ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".tif", ".tiff", ".webp", ".dcm",
    ".svg", ".ico",
}
LOCK_NAMES = {"package-lock.json", "yarn.lock", "pnpm-lock.yaml", "poetry.lock"}

# Matches things like  API_KEY = "abc",  "db_password": "x",  SECRET_KEY=abc  (name may have
# a prefix/suffix). Function calls such as  token = os.getenv("T")  are left alone.
SECRET_RE = re.compile(
    r"(?i)([A-Za-z0-9_.-]*(?:api[_-]?key|secret|token|password|passwd|pwd|private[_-]?key"
    r"|access[_-]?key)[A-Za-z0-9_.-]*[\"']?\s*[:=](?!=)\s*)"
    r"(\"[^\"\n]*\"|'[^'\n]*'|[^\s\"',()]+(?![\w(.]))"
)
HARMLESS_VALUE = re.compile(r"(?i)^(\d[\d.]*|true|false|none|null)$")   # e.g. max_tokens = 512
LARGE_FILE = 2_000_000    # text files bigger than this: only the beginning is read
SECRET_NAME_PARTS = ("secret", "credential", "serviceaccount", "id_rsa")
SECRET_EXT = {".pem", ".key", ".p12", ".pfx", ".keystore"}
SELF_NAME = "make_project_digest.py"


def human(n):
    n = float(n)
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024 or unit == "GB":
            return f"{n:.0f} {unit}" if unit == "B" else f"{n:.1f} {unit}"
        n /= 1024


def _redact_match(m):
    value = m.group(2)
    if HARMLESS_VALUE.match(value):          # unquoted number / boolean: keep as is
        return m.group(0)
    return m.group(1) + "***REDACTED***"


def redact(text):
    return SECRET_RE.sub(_redact_match, text)


def looks_binary(path):
    try:
        with open(path, "rb") as f:
            return b"\0" in f.read(2048)
    except OSError:
        return True


def clip(line):
    line = line.rstrip("\r\n")
    if len(line) > MAX_LINE_CHARS:
        return line[:MAX_LINE_CHARS] + " ...[line cut]"
    return line


def classify(p, size):
    name = p.name.lower()
    ext = p.suffix.lower()
    if name.startswith(".env") and not name.endswith(".example"):
        return "secret"
    if ext in SECRET_EXT or (ext in (".json", ".txt", ".yml", ".yaml", "")
                             and any(s in name for s in SECRET_NAME_PARTS)):
        return "secret"
    if name in LOCK_NAMES or ".min." in name:
        return "skip"
    if ext in MODEL_EXT:
        return "model"
    if ext in IMAGE_EXT:
        return "image"
    if ext in (".csv", ".tsv"):
        return "table"
    if ext == ".ipynb":
        return "notebook"
    if ext in TEXT_EXT or name in TEXT_NAMES:
        return "text"
    if size < 1_000_000 and not looks_binary(p):
        return "text"
    return "binary"


def render_text(p, rel):
    lines, total = [], 0
    try:
        size = p.stat().st_size
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            if size > LARGE_FILE:
                # huge file (data dump, log): read only the beginning, never the whole thing
                chunk = f.read(200_000)
                lines = [clip(l) for l in chunk.splitlines()[:MAX_LINES]]
                body = redact("\n".join(lines))
                return (f"\n### FILE: {rel}  (LARGE FILE, {human(size)}; only the first "
                        f"{len(lines)} lines shown)\n```\n{body}\n```\n")
            for line in f:
                total += 1
                if total <= MAX_LINES:
                    lines.append(clip(line))
    except OSError as e:
        return f"\n### FILE: {rel}\n[could not read: {e}]\n"
    body = redact("\n".join(lines))
    note = f"\n[... {total - MAX_LINES} more lines not shown]" if total > MAX_LINES else ""
    return f"\n### FILE: {rel}  ({total} lines)\n```\n{body}{note}\n```\n"


def render_notebook(p, rel):
    try:
        with open(p, "r", encoding="utf-8", errors="replace") as f:
            nb = json.load(f)
    except Exception as e:  # noqa: BLE001
        return f"\n### NOTEBOOK: {rel}\n[could not parse notebook: {e}]\n"
    out = []
    for i, cell in enumerate(nb.get("cells", []), 1):
        kind = cell.get("cell_type", "code")
        src = cell.get("source", "")
        src = "".join(src) if isinstance(src, list) else str(src)
        out.append(f"# --- [{kind} cell {i}] ---")
        out.extend(clip(l) for l in src.splitlines())
        if kind != "code":
            continue
        for o in cell.get("outputs", []):
            otype = o.get("output_type")
            if otype == "stream":
                text = o.get("text", "")
            elif otype in ("execute_result", "display_data"):
                text = o.get("data", {}).get("text/plain", "")
            elif otype == "error":
                text = f"{o.get('ename')}: {o.get('evalue')}"
            else:
                text = ""
            text = "".join(text) if isinstance(text, list) else str(text)
            if text.strip():
                tl = text.splitlines()
                out.append("# [output]")
                out.extend("#   " + clip(l) for l in tl[:MAX_OUTPUT_LINES])
                if len(tl) > MAX_OUTPUT_LINES:
                    out.append(f"#   ... {len(tl) - MAX_OUTPUT_LINES} more output lines")
    total = len(out)
    body = redact("\n".join(out[:NB_MAX_LINES]))
    note = f"\n[... {total - NB_MAX_LINES} more lines not shown]" if total > NB_MAX_LINES else ""
    return (f"\n### NOTEBOOK: {rel}  ({len(nb.get('cells', []))} cells; "
            f"embedded images dropped)\n```\n{body}{note}\n```\n")


def render_table(p, rel):
    delim = "\t" if p.suffix.lower() == ".tsv" else ","
    try:
        with open(p, "r", encoding="utf-8-sig", errors="replace", newline="") as f:
            reader = csv.reader(f, delimiter=delim)
            header = next(reader, [])
            preview, rows = [], 0
            for row in reader:
                rows += 1
                if len(preview) < CSV_PREVIEW_ROWS:
                    preview.append(row)
    except Exception as e:  # noqa: BLE001
        return f"\n### DATA TABLE: {rel}\n[could not read: {e}]\n"

    def cells(row):
        return " | ".join(c[:30] for c in row[:60]) + (" | ..." if len(row) > 60 else "")

    lines = [f"\n### DATA TABLE: {rel}  ({rows} rows x {len(header)} columns)",
             "columns: " + cells(header)]
    for i, row in enumerate(preview, 1):
        lines.append(f"row {i}: " + cells(row))
    return "\n".join(lines) + "\n"


def main():
    if not ROOT.is_dir():
        sys.exit(f"Folder not found: {ROOT}")

    skipped = []                 # (relative path, file count)
    all_files = []               # (Path, rel, size, kind)
    folder_info = {}             # rel dir -> list of (name, size, kind)

    for dirpath, dirnames, filenames in os.walk(ROOT):
        keep = []
        for d in sorted(dirnames):
            full = Path(dirpath) / d
            if d in SKIP_DIRS:
                count = sum(len(fs) for _, _, fs in os.walk(full))
                skipped.append((full.relative_to(ROOT).as_posix(), count))
            else:
                keep.append(d)
        dirnames[:] = keep
        rel_dir = Path(dirpath).relative_to(ROOT).as_posix()
        entries = []
        for name in sorted(filenames):
            if name.startswith("project_digest_") or name == SELF_NAME:
                continue
            p = Path(dirpath) / name
            try:
                size = p.stat().st_size
            except OSError:
                size = 0
            kind = classify(p, size)
            entries.append((name, size, kind))
            all_files.append((p, p.relative_to(ROOT).as_posix(), size, kind))
        folder_info[rel_dir] = entries

    # ---- overview ----------------------------------------------------------
    by_kind = defaultdict(lambda: [0, 0])
    for _, _, size, kind in all_files:
        by_kind[kind][0] += 1
        by_kind[kind][1] += size
    labels = {"text": "code/config/text", "notebook": "notebooks", "table": "csv/tsv tables",
              "image": "images", "model": "model/weight/array files",
              "binary": "other binary files", "secret": ".env files (contents NOT included)",
              "skip": "lock/minified files (contents skipped)"}
    overview = [
        f"Generated: {datetime.now():%Y-%m-%d %H:%M}",
        f"Project folder: {ROOT.name}",
        f"Total files read: {len(all_files)}  ({human(sum(s for _, _, s, _ in all_files))})",
        "",
        "## OVERVIEW BY TYPE",
    ]
    for kind, (n, size) in sorted(by_kind.items(), key=lambda kv: -kv[1][0]):
        overview.append(f"- {labels.get(kind, kind)}: {n} files, {human(size)}")
    overview.append("")
    blocks = ["\n".join(overview) + "\n"]

    # ---- skipped folders -----------------------------------------------------
    if skipped:
        lines = ["## SKIPPED FOLDERS (dependencies / generated, listed so nothing is hidden)"]
        lines += [f"- {rel}/  ({n} files)" for rel, n in skipped]
        blocks.append("\n".join(lines) + "\n")

    # ---- folder map ------------------------------------------------------------
    lines = ["## FOLDER MAP"]
    for rel_dir in sorted(folder_info):
        entries = folder_info[rel_dir]
        depth = 0 if rel_dir == "." else rel_dir.count("/") + 1
        pad = "  " * depth
        total = sum(s for _, s, _ in entries)
        title = "(project root)" if rel_dir == "." else rel_dir + "/"
        lines.append(f"{pad}{title}  [{len(entries)} files, {human(total)}]")
        non_img = [e for e in entries if e[2] != "image"]
        imgs = [e for e in entries if e[2] == "image"]
        for name, size, kind in non_img[:LIST_LIMIT]:
            lines.append(f"{pad}  - {name}  ({human(size)})")
        if len(non_img) > LIST_LIMIT:
            lines.append(f"{pad}  - ... +{len(non_img) - LIST_LIMIT} more files")
        if imgs:
            lines.append(f"{pad}  - [{len(imgs)} image files, {human(sum(s for _, s, _ in imgs))}]")
    blocks.append("\n".join(lines) + "\n")

    # ---- images ---------------------------------------------------------------
    img_dirs = {d: [e for e in es if e[2] == "image"] for d, es in folder_info.items()}
    img_dirs = {d: es for d, es in img_dirs.items() if es}
    if img_dirs:
        lines = ["## IMAGE FOLDERS (counts per folder; useful for class balance)"]
        for d in sorted(img_dirs):
            es = img_dirs[d]
            exts = defaultdict(int)
            for name, _, _ in es:
                exts[Path(name).suffix.lower()] += 1
            ext_txt = ", ".join(f"{e}: {c}" for e, c in sorted(exts.items()))
            examples = ", ".join(n for n, _, _ in es[:3])
            lines.append(f"- {d}/  {len(es)} images ({ext_txt}), {human(sum(s for _, s, _ in es))}"
                         f"; e.g. {examples}")
        blocks.append("\n".join(lines) + "\n")

    # ---- model files and other binaries -----------------------------------------
    lines = []
    for p, rel, size, kind in all_files:
        if kind == "model":
            lines.append(f"- {rel}  ({human(size)})")
    if lines:
        blocks.append("\n".join(["## MODEL / WEIGHT / ARRAY FILES (name and size only)"] + lines) + "\n")

    lines = []
    for p, rel, size, kind in all_files:
        if kind in ("binary", "secret", "skip"):
            why = {"binary": "binary, not readable here", "secret": "secrets file, contents not included",
                   "skip": "lock/minified file, contents skipped"}[kind]
            lines.append(f"- {rel}  ({human(size)}) - {why}")
    if lines:
        blocks.append("\n".join(["## OTHER FILES (upload separately if they matter, e.g. PDFs, "
                                 "Word files, spreadsheets)"] + lines) + "\n")

    # ---- tables ------------------------------------------------------------------
    for p, rel, size, kind in all_files:
        if kind == "table":
            blocks.append(render_table(p, rel))

    # ---- notebooks and text files (README first) -----------------------------------
    readable = [f for f in all_files if f[3] in ("text", "notebook")]
    readable.sort(key=lambda f: (0 if Path(f[1]).name.lower().startswith("readme") else 1, f[1]))
    blocks.append("\n## FILE CONTENTS\n")
    for p, rel, size, kind in readable:
        blocks.append(render_notebook(p, rel) if kind == "notebook" else render_text(p, rel))

    # ---- split into parts and write --------------------------------------------------
    parts, cur, cur_len = [], [], 0
    for b in blocks:
        if len(b) > PART_BYTES - 2000:
            b = b[: PART_BYTES - 2000] + "\n[... block cut to fit size cap]\n"
        if cur and cur_len + len(b) > PART_BYTES:
            parts.append(cur)
            cur, cur_len = [], 0
        cur.append(b)
        cur_len += len(b)
    if cur:
        parts.append(cur)

    n = len(parts)
    print(f"Read {len(all_files)} files from {ROOT}")
    for i, part in enumerate(parts, 1):
        path = OUT_DIR / f"project_digest_{i:02d}.md"
        header = f"# PROJECT DIGEST - part {i} of {n}  (folder: {ROOT.name})\n\n"
        path.write_text(header + "".join(part), encoding="utf-8")
        print(f"  wrote {path.name}  ({human(path.stat().st_size)})")
    print(f"Done. Upload the {n} file(s) named project_digest_XX.md to the chat.")


if __name__ == "__main__":
    main()
