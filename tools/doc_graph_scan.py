#!/usr/bin/env python3
"""tools/doc_graph_scan.py — RWANG doc-graph scanner (rerunnable)

สแกน docs/ + apps/api/app + apps/desktop/src แล้วอัปเดต docs/.doc-graph.json:
- doc nodes + content hash (ตรวจ drift รอบถัดไป)
- requirement nodes (FR/NFR/AI-AGT/AI-ETH/BR/DR) + defined_in
- code nodes + api_endpoint nodes (parse APIRouter prefix จริง)
- test nodes + edges (tests → code คู่ชื่อ)
- edges จาก markdown links ระหว่างเอกสาร + doc → code
- ตรวจ drift: endpoints/components ในโค้ด vs docs/architecture/BLUEPRINT.yaml
- preserve edges เดิมที่ไม่ได้มาจากการสแกน (source: manual/architect-seed)

รัน:  apps/api/.venv/Scripts/python.exe tools/doc_graph_scan.py
(stdlib เท่านั้น — ไม่พึ่ง dependency)
"""
import datetime
import hashlib
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DOCS = ROOT / "docs"
GRAPH = DOCS / ".doc-graph.json"
CODE_EXT = (".py", ".ts", ".tsx", ".rs", ".css")


def sha(p: Path) -> str:
    return hashlib.sha1(p.read_bytes()).hexdigest()[:12]


def read(p: Path) -> str:
    return p.read_text(encoding="utf-8", errors="replace")


now = datetime.datetime.now().astimezone().isoformat(timespec="seconds")

# ── โหลด graph เดิม (เก็บ edges ที่ไม่ใช่ของ scan ไว้) ──────────────
old = json.loads(GRAPH.read_text(encoding="utf-8")) if GRAPH.exists() else {}
old_nodes = {n["id"]: n for n in old.get("nodes", [])}
old_path2id = {n.get("path"): n["id"] for n in old.get("nodes", []) if n.get("path")}

nodes: dict[str, dict] = {}
edges: list[dict] = []
edge_keys: set[tuple] = set()


def add_node(nid: str, **kw) -> dict:
    if nid in nodes:
        for k, v in kw.items():
            if v is not None:
                nodes[nid][k] = v
        return nodes[nid]
    n = {"id": nid}
    n.update({k: v for k, v in kw.items() if v is not None})
    nodes[nid] = n
    return n


def add_edge(f: str, t: str, ty: str, source: str, **kw):
    key = (f, t, ty)
    if key in edge_keys:
        return
    edge_keys.add(key)
    e = {"from": f, "to": t, "type": ty, "status": kw.pop("status", "current"), "source": source}
    e.update(kw)
    edges.append(e)


# ── 1) doc nodes ──────────────────────────────────────────────────
doc_by_path: dict[str, str] = {}
for p in sorted(DOCS.rglob("*")):
    if p.is_dir() or p.name == ".doc-graph.json":
        continue
    rel = p.relative_to(ROOT).as_posix()
    nid = old_path2id.get(rel) or "doc:" + p.stem
    prev = old_nodes.get(nid, {})
    add_node(nid, type=prev.get("type", "document"), path=rel,
             title=prev.get("title", p.stem), hash=sha(p),
             prev_hash=prev.get("hash") or None,
             status="changed" if prev.get("hash") and prev["hash"] != sha(p) else "current",
             last_verified=now)
    doc_by_path[rel] = nid

# ── 2) requirement nodes (+ edges doc → req) ──────────────────────
REQ_DEF = {
    "FR": "docs/product/SRS.md",
    "NFR": "docs/product/SRS.md",
    # AI-AGT/AI-ETH/BR/DR: ยังไม่มีไฟล์นิยามในโครงสร้างปัจจุบัน (ไม่พบการใช้จริงใน docs/) —
    # ทิ้ง prefix ไว้เฉยๆ ให้ fallback ไปหาไฟล์แรกที่กล่าวถึง (sorted(where)[0]) ถ้ามีการใช้ในอนาคต
    "AI-AGT": "",
    "AI-ETH": "",
    "BR": "",
    "DR": "",
}
req_rx = re.compile(r"\b((?:FR|NFR|AI-AGT|AI-ETH|BR|DR)-[0-9]+[a-z]?)\b")
req_mentions: dict[str, set] = {}
doc_texts: dict[str, str] = {}
for rel in doc_by_path:
    if rel.endswith((".md", ".yaml")):
        doc_texts[rel] = read(ROOT / rel)
        for rid in set(req_rx.findall(doc_texts[rel])):
            req_mentions.setdefault(rid, set()).add(rel)

for rid, where in sorted(req_mentions.items()):
    prefix = rid.rsplit("-", 1)[0]
    dfile = REQ_DEF.get(prefix, "")
    if dfile not in where:
        dfile = sorted(where)[0]
    add_node("req:" + rid, type="requirement", label=rid, defined_in=dfile,
             status="current", last_verified=now)
    for rel in sorted(where - {dfile}):
        add_edge(doc_by_path[rel], "req:" + rid, "references", "doc-scan")

# ── 3) edges จาก markdown links (doc → doc, doc → code) ───────────
link_rx = re.compile(r"\]\(([^)#\s]+\.(?:md|yaml|py|ts|tsx|css|rs))(?:#[^)]*)?\)")
for rel, nid in doc_by_path.items():
    if rel not in doc_texts:
        continue
    base = (ROOT / rel).parent
    for lm in set(link_rx.findall(doc_texts[rel])):
        if lm.startswith("http"):
            continue
        try:
            trel = (base / lm).resolve().relative_to(ROOT).as_posix()
        except (ValueError, OSError):
            continue
        if trel in doc_by_path:
            if doc_by_path[trel] != nid:
                add_edge(nid, doc_by_path[trel], "references", "doc-scan")
        elif trel.endswith(CODE_EXT) and (ROOT / trel).exists():
            cid = "code:" + trel
            add_node(cid, type="code_file", path=trel, hash=sha(ROOT / trel),
                     status="current", last_verified=now)
            add_edge(nid, cid, "references", "doc-scan")

# ── 4) backend: code nodes + api endpoints ────────────────────────
BAPP = ROOT / "apps" / "api" / "app"
route_rx = re.compile(r"@router\.(get|post|put|delete|patch|websocket)\(\s*\"([^\"]*)\"")
prefix_rx = re.compile(r"APIRouter\(([^)]*)\)")
pref_kw = re.compile(r"prefix=\"([^\"]*)\"")
endpoints: list[tuple[str, str, str]] = []  # (method, path, router rel)

for p in sorted((BAPP / "routers").glob("*.py")):
    if p.name == "__init__.py":
        continue
    rel = p.relative_to(ROOT).as_posix()
    text = read(p)
    prefix = ""
    m = prefix_rx.search(text)
    if m:
        pk = pref_kw.search(m.group(1))
        if pk:
            prefix = pk.group(1)
    cid = "code:" + rel
    add_node(cid, type="code_file", path=rel, hash=sha(p), status="current", last_verified=now)
    for meth, pth in route_rx.findall(text):
        meth = "WS" if meth == "websocket" else meth.upper()
        full = (prefix + pth) or "/"
        aid = f"api:{meth}:{full}"
        add_node(aid, type="api_endpoint", label=f"{meth} {full}", status="current", last_verified=now)
        add_edge(cid, aid, "exposes", "code-scan")
        endpoints.append((meth, full, rel))

main_py = BAPP / "main.py"
if main_py.exists():
    main_rel = main_py.relative_to(ROOT).as_posix()
    add_node("code:" + main_rel, type="code_file", path=main_rel,
             hash=sha(main_py), status="current", last_verified=now)

for sub in ("pipelines", "brain", "services", "jobs", "utils"):
    d = BAPP / sub
    if not d.is_dir():
        continue
    for p in sorted(d.glob("*.py")):
        if p.name == "__init__.py":
            continue
        rel = p.relative_to(ROOT).as_posix()
        add_node("code:" + rel, type="code_file", path=rel, hash=sha(p),
                 status="current", last_verified=now)

# ── 5) frontend: code nodes + tests ───────────────────────────────
FSRC = ROOT / "apps" / "desktop" / "src"
fe_files: list[Path] = []
if FSRC.is_dir():
    for p in sorted(FSRC.rglob("*")):
        if p.suffix in (".ts", ".tsx") and p.is_file():
            fe_files.append(p)
for p in fe_files:
    rel = p.relative_to(ROOT).as_posix()
    is_test = p.name.endswith((".test.ts", ".test.tsx"))
    nid = ("test:" if is_test else "code:") + rel
    add_node(nid, type="test" if is_test else "code_file", path=rel, hash=sha(p),
             status="current", last_verified=now)
    if is_test:
        sibling = rel.replace(".test.", ".")
        if (ROOT / sibling).exists():
            add_edge(nid, "code:" + sibling, "tests", "code-scan")

# ── 6) annotation scan (@req/@spec/@designs/@tested + FR-xxx เปล่า) ─
ann_rx = re.compile(r"@(req|spec|designs|tested)[ :]")
code_scan_dirs = [BAPP, FSRC]
ann_hits, plain_hits = [], []
for d in code_scan_dirs:
    if not d.is_dir():
        continue
    for p in d.rglob("*"):
        if p.suffix not in (".py", ".ts", ".tsx") or not p.is_file():
            continue
        text = read(p)
        rel = p.relative_to(ROOT).as_posix()
        for mm in ann_rx.finditer(text):
            ann_hits.append(rel)
        for rid in set(req_rx.findall(text)):
            plain_hits.append((rel, rid))
            if "req:" + rid in nodes:
                add_edge("code:" + rel, "req:" + rid, "implements", "code-scan")

# ── 6b) verifies: test → requirement (ผ่านโค้ดที่มัน test) ────────
# ถ้าไม่มีบล็อกนี้ coverage "requirements_with_tests" จะเป็น 0% เสมอ
impl_by_code: dict[str, list[str]] = {}
for e in edges:
    if e["type"] == "implements":
        impl_by_code.setdefault(e["from"], []).append(e["to"])
for e in list(edges):
    if e["type"] == "tests":
        for rid in impl_by_code.get(e["to"], []):
            add_edge(e["from"], rid, "verifies", "code-scan")

# ── 7) drift: โค้ดจริง vs BLUEPRINT ───────────────────────────────
bp_text = doc_texts.get("docs/architecture/BLUEPRINT.yaml", "")
# path มี 2 แบบ: quoted ("/voices/{id}" — มี brace ข้างใน) กับ unquoted (/health)
bp_ep_rx = re.compile(r"\{method:\s*(\w+),\s*path:\s*(?:\"([^\"]+)\"|([^,}\s]+))")
norm = lambda s: re.sub(r"\{[^}]+\}", "{}", s)
bp_eps = {(m.upper(), norm(q or u)) for m, q, u in bp_ep_rx.findall(bp_text)}
missing_by_router: dict[str, list[str]] = {}
for meth, full, rel in endpoints:
    if (meth, norm(full)) not in bp_eps:
        missing_by_router.setdefault(rel, []).append(f"{meth} {full}")
for rel, miss in sorted(missing_by_router.items()):
    add_edge("code:" + rel, "doc:BLUEPRINT", "stale", "dag-propagation", status="stale",
             reason=f"{len(miss)} endpoint(s) in code not in BLUEPRINT api: " + ", ".join(miss[:4]) + ("..." if len(miss) > 4 else ""))

bp_components = set(re.findall(r"component:\s*(\w+)\.tsx", bp_text))
fe_components = {p.stem for p in (FSRC / "components").glob("*.tsx")} if (FSRC / "components").is_dir() else set()
undocumented_components = sorted(fe_components - bp_components)
if undocumented_components:
    # docs/archive/UI_SITEMAP.md ถูก supersede โดย docs/design/LALIN_SITEMAP_SOT.md แล้ว —
    # ไม่ flag ไฟล์ที่ archive ไว้ ให้ flag คู่ที่ยัง maintain component จริง:
    # BLUEPRINT.yaml (machine-readable) + COMPONENT_REGISTRY.md (ฉบับอ่านคน)
    for did in ("doc:BLUEPRINT", "doc:COMPONENT_REGISTRY"):
        if did in nodes:
            nodes[did]["status"] = "stale"
            nodes[did]["stale_reason"] = (f"{len(undocumented_components)} frontend components not in doc: "
                                          + ", ".join(undocumented_components[:8]) + "...")

# ── 8) merge edges เดิมที่ไม่ได้มาจาก scan (preserve) ─────────────
for e in old.get("edges", []):
    e.setdefault("source", "architect-seed")
    if e["source"] in ("doc-scan", "code-scan", "dag-propagation"):
        continue  # ของ scan รอบก่อน — สร้างใหม่แล้ว
    key = (e["from"], e["to"], e["type"])
    if key not in edge_keys and e["from"] in nodes and e["to"] in nodes:
        e.setdefault("status", "current")
        edge_keys.add(key)
        edges.append(e)

# ── 9) coverage + stats ───────────────────────────────────────────
req_ids = [n for n in nodes.values() if n["type"] == "requirement"]
impl_reqs = {e["to"] for e in edges if e["type"] == "implements"}
verif_reqs = {e["to"] for e in edges if e["type"] == "verifies"}
code_nodes = [n for n in nodes.values() if n["type"] == "code_file"]
doc_ref_code = {e["to"] for e in edges if e["type"] == "references" and e["to"].startswith("code:")}
tested_code = {e["to"] for e in edges if e["type"] == "tests"}


def pct(a, b):
    return f"{(100 * a // b) if b else 0}% ({a}/{b})"


stats = {
    "total_nodes": len(nodes),
    "total_edges": len(edges),
    "stale_edges": sum(1 for e in edges if e["status"] == "stale"),
    "stale_nodes": sum(1 for n in nodes.values() if n.get("status") == "stale"),
    "contradiction_edges": 0,
    "coverage": {
        "requirements_with_code_annotations": pct(len(impl_reqs), len(req_ids)),
        "requirements_with_tests": pct(len(verif_reqs), len(req_ids)),
        "code_files_referenced_by_docs": pct(len(doc_ref_code), len(code_nodes)),
        "code_files_with_tests": pct(len(tested_code), len(code_nodes)),
        "structured_annotations_found": len(ann_hits),
        "unstructured_req_refs_found": len(plain_hits),
    },
}

out = {
    "version": "1.0.0",
    "generated_by": "rwang:doc-graph",
    "generated_at": now,
    "template": old.get("template"),
    "id_scheme": old.get("id_scheme"),
    "standards": old.get("standards"),
    "stats": stats,
    "nodes": sorted(nodes.values(), key=lambda n: n["id"]),
    "edges": sorted(edges, key=lambda e: (e["from"], e["to"], e["type"])),
}
GRAPH.write_text(json.dumps(out, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

# ── รายงาน (ASCII เท่านั้น — คอนโซล cp1252) ───────────────────────
print("doc-graph updated:", GRAPH.relative_to(ROOT).as_posix())
print("nodes:", stats["total_nodes"], "edges:", stats["total_edges"],
      "stale_edges:", stats["stale_edges"], "stale_nodes:", stats["stale_nodes"])
for k, v in stats["coverage"].items():
    print(f"  {k}: {v}")
print("endpoints_scanned:", len(endpoints), "| in_blueprint:", len(bp_eps),
      "| missing_from_blueprint:", sum(len(v) for v in missing_by_router.values()))
print("fe_components:", len(fe_components), "| documented:", len(bp_components & fe_components),
      "| undocumented:", len(undocumented_components))
changed = [n["id"] for n in nodes.values() if n.get("status") == "changed"]
print("changed_since_last_scan:", len(changed))
for c in changed[:10]:
    print("  -", c)
