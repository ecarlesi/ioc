#!/usr/bin/env python3
"""
Generates manifest.json at the repo root by scanning the top-level indicator
files (one CSV file per category) and the reports/ folder.

Run this script every time a new category file (or report) is added to the
repository, so that index.html can discover it automatically:

    python3 scripts/generate_manifest.py
"""
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# Files at the repo root that are NOT indicator/category files.
EXCLUDE = {"README.md", "LICENSE", "LICENSE.md", "manifest.json", "index.html"}
EXCLUDE_DIRS = {".git", "reports", "assets", "scripts", "node_modules", ".github"}


def build_categories():
    categories = []
    for entry in sorted(os.listdir(ROOT)):
        path = os.path.join(ROOT, entry)
        if not os.path.isfile(path):
            continue
        if entry in EXCLUDE or entry.startswith("."):
            continue
        categories.append({"file": entry, "name": os.path.splitext(entry)[0]})
    return categories


def build_reports():
    reports = []
    reports_dir = os.path.join(ROOT, "reports")
    if os.path.isdir(reports_dir):
        for entry in sorted(os.listdir(reports_dir)):
            path = os.path.join(reports_dir, entry)
            if os.path.isfile(path) and not entry.startswith("."):
                reports.append({
                    "file": f"reports/{entry}",
                    "name": os.path.splitext(entry)[0],
                })
    return reports


def main():
    manifest = {
        "categories": build_categories(),
        "reports": build_reports(),
    }
    out_path = os.path.join(ROOT, "manifest.json")
    with open(out_path, "w") as fh:
        json.dump(manifest, fh, indent=2)
        fh.write("\n")
    print(
        f"Wrote {out_path}: "
        f"{len(manifest['categories'])} categories, "
        f"{len(manifest['reports'])} reports"
    )


if __name__ == "__main__":
    main()
