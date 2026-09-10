# IOC identified by Matrix

This repository collects some of the indicators identified within kits detected by the [Matrix project](https://matrixproject.info/). 

For now the extraction of indicators is manual, so, in my spare time, I dedicate myself to updating these files to share useful information to the community. 

If you want to contribute, of course, you are welcome.

The kits listed are all available in the Matrix storage. If you are a researcher and need any of these kits for analysis you can write to me and I will send you the instructions to download it.

## Browsing the indicators

Each category file (e.g. `telegram.txt`, `email.txt`, `gobot.txt`, …) is a
two-column CSV: `indicator,source_url`.

To make it easier to explore the data and spot indicators that are **shared
across categories** (a strong sign of the same actor/campaign), this repo
ships a static, no-build-step HTML explorer:

```bash
python3 -m http.server 8000
# then open http://localhost:8000/index.html
```

(`fetch()` needs a real HTTP server — it won't work by opening `index.html`
directly with `file://`. GitHub Pages works too.)

The explorer offers:
- a **graph view** linking indicators to the domains/URLs they were seen
  with, highlighting nodes that appear in more than one category file;
- a **table view** with search/sort across all indicators, and a "shared"
  column pointing out cross-category matches;
- per-category toggles and links to the raw files and to `reports/`.

If you add a new category file at the repo root, regenerate the manifest it
reads from:

```bash
python3 scripts/generate_manifest.py
```
