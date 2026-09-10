/* IOC Explorer — client-side loader, correlation engine & graph/table views.
 * No build step: plain fetch() of manifest.json + the category text files
 * (CSV: indicator,url), rendered with D3 force-graph + a sortable table.
 */

const COLORS = d3.scaleOrdinal(d3.schemeTableau10);
const state = {
  categories: [],          // [{file,name}]
  rows: [],                // [{category, indicator, url, domain}]
  activeCategories: new Set(),
  search: "",
  sim: null,
  nodesById: new Map(),
};

function extractDomain(url) {
  try {
    const u = new URL(url.trim());
    return u.hostname.toLowerCase();
  } catch (e) {
    return null;
  }
}

// Parse "indicator,url" lines. URLs may themselves contain commas (rare) —
// we split on the FIRST comma only, which matches how these files are built.
function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .map(l => l.trim())
    .filter(l => l.length > 0 && !l.startsWith("#"))
    .map(line => {
      const idx = line.indexOf(",");
      if (idx === -1) return null;
      return { indicator: line.slice(0, idx).trim(), url: line.slice(idx + 1).trim() };
    })
    .filter(Boolean);
}

async function loadManifest() {
  const res = await fetch("manifest.json", { cache: "no-store" });
  if (!res.ok) throw new Error("manifest.json not found — run scripts/generate_manifest.py");
  return res.json();
}

async function loadCategoryFile(cat) {
  const res = await fetch(cat.file, { cache: "no-store" });
  if (!res.ok) return [];
  const text = await res.text();
  return parseCsv(text).map(r => ({
    category: cat.name,
    file: cat.file,
    indicator: r.indicator,
    url: r.url,
    domain: extractDomain(r.url),
  }));
}

async function init() {
  const manifest = await loadManifest();
  state.categories = manifest.categories || [];
  state.activeCategories = new Set(state.categories.map(c => c.name));

  const rowsPerCat = await Promise.all(state.categories.map(loadCategoryFile));
  state.rows = rowsPerCat.flat();

  buildSidebar(manifest.reports || []);
  computeSharedFlags();
  renderStats();
  renderTable();
  renderGraph();

  document.getElementById("loading").remove();
}

function computeSharedFlags() {
  const byIndicator = new Map();
  for (const r of state.rows) {
    if (!byIndicator.has(r.indicator)) byIndicator.set(r.indicator, new Set());
    byIndicator.get(r.indicator).add(r.category);
  }
  for (const r of state.rows) {
    r.sharedAcrossCategories = byIndicator.get(r.indicator).size > 1;
    r.sharedCategories = [...byIndicator.get(r.indicator)];
  }
}

function buildSidebar(reports) {
  const counts = {};
  for (const r of state.rows) counts[r.category] = (counts[r.category] || 0) + 1;

  const list = document.getElementById("categoryList");
  list.innerHTML = "";
  state.categories.forEach(c => {
    const color = COLORS(c.name);
    const label = document.createElement("label");
    label.innerHTML = `
      <input type="checkbox" checked data-cat="${c.name}">
      <span class="swatch" style="background:${color}"></span>
      <a href="${c.file}" target="_blank" title="Open raw file" onclick="event.stopPropagation()">${c.name}</a>
      <span class="count">${counts[c.name] || 0}</span>`;
    label.querySelector("input").addEventListener("change", onCategoryToggle);
    list.appendChild(label);
  });

  if (reports.length) {
    const h = document.createElement("h3");
    h.textContent = "Reports";
    list.appendChild(h);
    reports.forEach(rep => {
      const a = document.createElement("a");
      a.href = rep.file;
      a.target = "_blank";
      a.textContent = rep.name;
      a.style.display = "block";
      a.style.fontSize = "12px";
      a.style.padding = "4px 6px";
      list.appendChild(a);
    });
  }
}

function onCategoryToggle(e) {
  const cat = e.target.dataset.cat;
  if (e.target.checked) state.activeCategories.add(cat);
  else state.activeCategories.delete(cat);
  renderStats();
  renderTable();
  renderGraph();
}

function filteredRows() {
  const q = state.search.trim().toLowerCase();
  return state.rows.filter(r => {
    if (!state.activeCategories.has(r.category)) return false;
    if (!q) return true;
    return (
      r.indicator.toLowerCase().includes(q) ||
      r.url.toLowerCase().includes(q) ||
      (r.domain || "").includes(q) ||
      r.category.toLowerCase().includes(q)
    );
  });
}

function renderStats() {
  const rows = filteredRows();
  const indicators = new Set(rows.map(r => r.indicator));
  const domains = new Set(rows.map(r => r.domain).filter(Boolean));
  const shared = rows.filter(r => r.sharedAcrossCategories).length;
  document.getElementById("stats").innerHTML = `
    <span><b>${rows.length}</b> IOC pairs</span>
    <span><b>${indicators.size}</b> unique indicators</span>
    <span><b>${domains.size}</b> unique domains</span>
    <span class="shared"><b>${shared}</b> rows with cross-category matches</span>`;
}

/* ---------- Table view ---------- */

let sortKey = "category", sortAsc = true;

function renderTable() {
  const rows = filteredRows().slice().sort((a, b) => {
    const av = sortKey === "shared" ? (a.sharedAcrossCategories ? 1 : 0) : a[sortKey];
    const bv = sortKey === "shared" ? (b.sharedAcrossCategories ? 1 : 0) : b[sortKey];
    if (av < bv) return sortAsc ? -1 : 1;
    if (av > bv) return sortAsc ? 1 : -1;
    return 0;
  });
  const tbody = document.getElementById("tableBody");
  tbody.innerHTML = rows.slice(0, 3000).map(r => `
    <tr>
      <td><span class="tag" style="background:${COLORS(r.category)}">${r.category}</span></td>
      <td>${escapeHtml(r.indicator)}</td>
      <td><a href="${escapeAttr(r.url)}" target="_blank">${escapeHtml(r.url)}</a></td>
      <td>${r.sharedAcrossCategories ? `<span class="shared">${r.sharedCategories.join(", ")}</span>` : ""}</td>
    </tr>`).join("");
  if (rows.length > 3000) {
    tbody.innerHTML += `<tr><td colspan="4" style="color:var(--muted)">…${rows.length - 3000} more rows, refine your search</td></tr>`;
  }
}

document.querySelectorAll("#viewTable thead th").forEach(th => {
  th.addEventListener("click", () => {
    const k = th.dataset.k;
    if (sortKey === k) sortAsc = !sortAsc; else { sortKey = k; sortAsc = true; }
    renderTable();
  });
});

/* ---------- Graph view ---------- */

function buildGraphData() {
  const rows = filteredRows();
  const nodes = new Map(); // id -> node
  const linkKey = new Set();
  const links = [];

  function upsertNode(id, type, category) {
    if (!nodes.has(id)) {
      nodes.set(id, { id, type, categories: new Set(), degree: 0 });
    }
    const n = nodes.get(id);
    if (category) n.categories.add(category);
    return n;
  }

  for (const r of rows) {
    const indId = "ind:" + r.indicator;
    const domId = r.domain ? "dom:" + r.domain : "url:" + r.url;
    const nInd = upsertNode(indId, "indicator", r.category);
    const nDom = upsertNode(domId, r.domain ? "domain" : "url", r.category);
    nInd.label = r.indicator;
    nDom.label = r.domain || r.url;
    const lk = indId + "→" + domId;
    if (!linkKey.has(lk)) {
      linkKey.add(lk);
      links.push({ source: indId, target: domId, category: r.category });
      nInd.degree++;
      nDom.degree++;
    }
  }

  const nodeArr = [...nodes.values()];
  nodeArr.forEach(n => {
    n.shared = n.categories.size > 1;
    n.color = n.categories.size === 1 ? COLORS([...n.categories][0]) : "#f78166";
  });
  state.nodesById = nodes;
  return { nodes: nodeArr, links };
}

function renderGraph() {
  const container = document.getElementById("viewGraph");
  d3.select(container).selectAll("svg").remove();

  const { nodes, links } = buildGraphData();
  const width = container.clientWidth || 800;
  const height = container.clientHeight || 600;

  const svg = d3.select(container).insert("svg", "#tooltip")
    .attr("width", width).attr("height", height)
    .style("display", "block");

  const g = svg.append("g");

  svg.call(d3.zoom().scaleExtent([0.15, 6]).on("zoom", (event) => {
    g.attr("transform", event.transform);
  }));

  const sim = d3.forceSimulation(nodes)
    .force("link", d3.forceLink(links).id(d => d.id).distance(50).strength(0.4))
    .force("charge", d3.forceManyBody().strength(-90))
    .force("center", d3.forceCenter(width / 2, height / 2))
    .force("collide", d3.forceCollide(d => nodeRadius(d) + 2));

  state.sim = sim;

  const link = g.append("g").attr("stroke-opacity", 0.35)
    .selectAll("line")
    .data(links)
    .join("line")
    .attr("stroke", d => COLORS(d.category))
    .attr("stroke-width", 1);

  const node = g.append("g")
    .selectAll("circle")
    .data(nodes)
    .join("circle")
    .attr("r", nodeRadius)
    .attr("fill", d => d.color)
    .attr("stroke", d => d.shared ? "#fff" : "none")
    .attr("stroke-width", d => d.shared ? 1.5 : 0)
    .style("cursor", "pointer")
    .call(drag(sim))
    .on("mouseover", showTooltip)
    .on("mousemove", moveTooltip)
    .on("mouseout", hideTooltip)
    .on("click", (event, d) => showDetail(d));

  sim.on("tick", () => {
    link
      .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
      .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
    node.attr("cx", d => d.x).attr("cy", d => d.y);
  });
}

function nodeRadius(d) {
  const base = d.type === "indicator" ? 4 : 5;
  return Math.min(base + Math.sqrt(d.degree) * 2, 22);
}

function drag(sim) {
  function dragstarted(event, d) {
    if (!event.active) sim.alphaTarget(0.25).restart();
    d.fx = d.x; d.fy = d.y;
  }
  function dragged(event, d) { d.fx = event.x; d.fy = event.y; }
  function dragended(event, d) {
    if (!event.active) sim.alphaTarget(0);
    d.fx = null; d.fy = null;
  }
  return d3.drag().on("start", dragstarted).on("drag", dragged).on("end", dragended);
}

function showTooltip(event, d) {
  const tip = document.getElementById("tooltip");
  tip.style.display = "block";
  tip.innerHTML = `<b>${d.type}</b>: ${escapeHtml(d.label)}<br>
    categories: ${[...d.categories].join(", ")}<br>
    degree: ${d.degree}${d.shared ? "<br><span class='shared'>⚠ shared across categories</span>" : ""}`;
  moveTooltip(event);
}
function moveTooltip(event) {
  const tip = document.getElementById("tooltip");
  tip.style.left = (event.offsetX + 16) + "px";
  tip.style.top = (event.offsetY + 16) + "px";
}
function hideTooltip() {
  document.getElementById("tooltip").style.display = "none";
}

function showDetail(d) {
  const rows = state.rows.filter(r => {
    const indId = "ind:" + r.indicator;
    const domId = r.domain ? "dom:" + r.domain : "url:" + r.url;
    return indId === d.id || domId === d.id;
  });
  const byCat = {};
  rows.forEach(r => { (byCat[r.category] ||= []).push(r); });

  let html = `<h4>${escapeHtml(d.label)}</h4>
    <div class="legend-note">Type: ${d.type} · Degree: ${d.degree}</div>`;
  for (const [cat, rs] of Object.entries(byCat)) {
    html += `<h3 style="margin-top:12px">
      <span class="tag" style="background:${COLORS(cat)}">${cat}</span></h3><ul>`;
    rs.forEach(r => {
      html += d.type === "indicator"
        ? `<li><a href="${escapeAttr(r.url)}" target="_blank">${escapeHtml(r.url)}</a></li>`
        : `<li>${escapeHtml(r.indicator)}</li>`;
    });
    html += "</ul>";
  }
  document.getElementById("detailBody").innerHTML = html;
  document.getElementById("detail").classList.add("open");
}
function closeDetail() {
  document.getElementById("detail").classList.remove("open");
}

/* ---------- utils ---------- */

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}
function escapeAttr(s) { return escapeHtml(s); }

/* ---------- wiring ---------- */

document.getElementById("search").addEventListener("input", (e) => {
  state.search = e.target.value;
  renderStats();
  renderTable();
  renderGraph();
});

document.getElementById("tabGraph").addEventListener("click", () => switchTab("graph"));
document.getElementById("tabTable").addEventListener("click", () => switchTab("table"));

function switchTab(tab) {
  document.getElementById("tabGraph").classList.toggle("active", tab === "graph");
  document.getElementById("tabTable").classList.toggle("active", tab === "table");
  document.getElementById("viewGraph").style.display = tab === "graph" ? "block" : "none";
  document.getElementById("viewTable").style.display = tab === "table" ? "block" : "none";
  if (tab === "graph") renderGraph();
}

window.closeDetail = closeDetail;

init().catch(err => {
  document.getElementById("loading").textContent = "Error: " + err.message;
  console.error(err);
});
