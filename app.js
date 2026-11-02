"use strict";
// Plan B: static data files at d/{DATA_PATH}/, DATA_PATH from #d= fragment, kept in localStorage.
(() => {
const $ = s => document.querySelector(s), V = $("#view");
const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd = (n, d=2) => n == null ? "—" : (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d});
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
let frag = new URLSearchParams(location.hash.slice(1)).get("d");
if (frag) { localStorage.setItem("desk_d", frag); history.replaceState(null, "", location.pathname); }
const DP = localStorage.getItem("desk_d");
const D = { state:null, chart:null, activity:null, err:null };
let tab = "home", sub = null;

const BASE = location.hostname.endsWith("github.io") ? `https://raw.githubusercontent.com/akaaasth/fomo-desk/data/d/${DP}/` : `d/${DP}/`;
async function get(f) { const r = await fetch(`${BASE}${f}?t=${Date.now()}`, {cache:"no-store"}); if (!r.ok) throw new Error(r.status); return r.json(); }
async function load() {
  if (!DP) { D.err = "No data link. Open the app with the link that ends in #d=…"; return render(); }
  try { [D.state, D.chart, D.activity] = await Promise.all([get("state.json"), get("chart.json"), get("activity.json")]); D.err = null; }
  catch (e) { D.err = "Can't reach the desk data (" + e.message + ")."; }
  render();
}
document.querySelectorAll("nav button").forEach(b => b.onclick = () => { tab = b.dataset.tab; sub = null; document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x === b)); render(); });

function render() {
  if (D.err && !D.state) { V.innerHTML = `<div class="state err">${h(D.err)}</div>`; return; }
  if (!D.state) { V.innerHTML = `<div class="state">Loading…</div>`; return; }
  $("#badge").textContent = D.state.mode;
  if (sub) return sub.kind === "coin" ? coin(sub.mint) : auditor();
  ({home, agents, activity, account})[tab]();
  if (D.err) V.insertAdjacentHTML("afterbegin", `<div class="state err" style="padding:8px">${h(D.err)} Showing last data.</div>`);
}

function odometer(el, v) { el.innerHTML = [...usd(v)].map(c => `<span>${c}</span>`).join(""); }
function line(cv, pts) {
  const r = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W*r; cv.height = H*r;
  const g = cv.getContext("2d"); g.scale(r, r);
  if (pts.length < 2) { g.fillStyle = css("--sec"); g.font = "13px -apple-system"; g.fillText("Chart fills in as the desk runs", 8, H/2); return; }
  const vs = pts.map(p => p.v), lo = Math.min(...vs), hi = Math.max(...vs), sp = hi - lo || 1;
  const up = vs[vs.length-1] >= vs[0]; g.strokeStyle = up ? css("--green") : css("--red"); g.lineWidth = 2; g.beginPath();
  pts.forEach((p, i) => { const x = i/(pts.length-1)*W, y = H-6-(p.v-lo)/sp*(H-12); i ? g.lineTo(x, y) : g.moveTo(x, y); }); g.stroke();
}
function card(k, title, alive, big, sm, extra="") {
  return `<div class="card" data-k="${k}"><div><h3><span class="dot ${alive?"ok":""}"></span>${title}</h3></div>${extra}<div><div class="big">${big}</div><div class="sm">${sm}</div></div></div>`;
}
function cards() {
  const a = D.state.agents, la = a.auditor.last, run = a.auditor.events.length && (!la || a.auditor.events.at(-1).ts > la.ts);
  const strips = `<div class="strips">${(la?la.layers:Array(8).fill({})).map(l => `<i class="${l.pass===true?"p":l.pass===false?"f":""}"></i>`).join("")}</div>`;
  const sc = a.analyst.last ? a.analyst.last.score : null;
  const ring = `<svg class="ring" viewBox="0 0 36 36"><circle cx="18" cy="18" r="15" fill="none" stroke="${css("--c2")}" stroke-width="3"/><circle cx="18" cy="18" r="15" fill="none" stroke="${sc>=D.state.settings["analyst.min_score"]?css("--green"):css("--orange")}" stroke-width="3" stroke-dasharray="${(sc||0)*0.942} 94.2" transform="rotate(-90 18 18)"/><text x="18" y="22" fill="#fff" font-size="10" text-anchor="middle">${sc??"–"}</text></svg>`;
  const ex = a.executor.last, rl = a.risk.lastExit;
  return `<div class="grid">
  ${card("scanner","Scanner",a.scanner.alive,`${a.scanner.pools} pools`,`${a.scanner.waiting} waiting · ${a.scanner.passed} passed · ${a.scanner.killed} killed`)}
  ${card("auditor","Auditor",a.auditor.alive,`${a.auditor.taken} taken apart`, run?"taking apart…":la?(la.passed?"8/8 → Executor":h(la.reason))+` · ${a.auditor.rejected} rejected`:"waiting for a pass", strips)}
  ${card("analyst","Analyst",a.analyst.alive,"Scoring",`${a.analyst.scored} scored · ${a.analyst.mode}`, ring)}
  ${card("executor","Executor",a.executor.alive,`${a.executor.trades} trades`, ex&&ex.sizeUsd?`${usd(ex.sizeUsd)} · ${ex.stackPct}% of stack · ✓ Filled`:"no trades yet")}
  ${card("risk","Risk",a.risk.alive,a.risk.open.length?"Guarding":(rl?(rl.reason==="trail"?"Trailed out":"Stopped"):"Idle"), `<span class="pill r">stop -${a.risk.stopPct}%</span><span class="pill g">trail ${a.risk.trailPct}%</span>`)}
  </div>`;
}
function wire() {
  const w = V.querySelector(".card")?.clientWidth; if (w) V.querySelectorAll(".card").forEach(c => c.style.setProperty("--r", (42*w/504)+"px"));
  V.querySelectorAll(".card").forEach(c => c.onclick = () => { if (c.dataset.k === "auditor") { sub = {kind:"auditor"}; render(); } else { tab = "agents"; render(); } });
  V.querySelectorAll("[data-mint]").forEach(r => r.onclick = () => { sub = {kind:"coin", mint:r.dataset.mint}; render(); });
}
function home() {
  const s = D.state, ch = s.balance - s.startStack;
  V.innerHTML = `<div class="sub">${s.mode} balance</div><div class="bal odo" id="odo"></div>
   <div class="sub" style="color:${ch>=0?css("--green"):css("--red")}">${ch>=0?"+":""}${usd(ch)} since start</div>
   <canvas id="chart"></canvas>${cards()}
   ${s.agents.risk.open.length?`<h2>Open</h2><div class="list">${s.agents.risk.open.map(p=>`<div class="row" data-mint="${h(p.mint)}"><span>${h(p.name)}</span><span class="r">${usd(p.size)}</span></div>`).join("")}</div>`:""}`;
  odometer($("#odo"), s.balance); line($("#chart"), D.chart || []); wire();
}
function agents() {
  const a = D.state.agents, hb = D.state.heartbeats;
  const feed = a.scanner.feed.map(f => f.verdict === "pass"
    ? `<div class="row"><span>${h(f.name)} · liq ${usd(f.liquidityUsd,0)} · → auditor</span></div>`
    : `<div class="row kill"><span class="n">${h(f.name||f.mint.slice(0,6))}</span><span class="r">${h(f.reason)}</span></div>`).join("") || `<div class="state">No decisions yet. Coins wait ${D.state.settings["scanner.min_pool_age_min"]} min before a pass.</div>`;
  V.innerHTML = `${cards()}<h2>Heartbeats</h2><div class="list">${Object.entries(hb).map(([k,v])=>`<div class="row"><span>${k}</span><span class="r">${new Date(v).toLocaleTimeString()}</span></div>`).join("")}</div>
   <h2>Scanner feed</h2><div class="list">${feed}</div>`; wire();
}
function activity() {
  const rows = D.activity || [];
  V.innerHTML = rows.length ? `<div class="list">${rows.map(r=>`<div class="row"><span><b>${h(r.title)}</b><br><span class="sub">${h(r.detail)} · ${new Date(r.ts).toLocaleTimeString()}</span></span><span class="r">${h(r.amount)}${r.link?`<br><a class="btn" href="${h(r.link)}" target="_blank" rel="noopener">FOMO</a>`:""}</span></div>`).join("")}</div>`
    : `<div class="state">Nothing yet. Passes, rejects, buys and exits show up here.</div>`;
}
function account() {
  const s = D.state, st = s.settings, ac = s.account;
  V.innerHTML = `<div class="list"><div class="row"><span>Mode</span><span class="badge">${h(s.mode)}</span></div>
   <a class="row" href="${h(ac.profileUrl)}" target="_blank" rel="noopener"><span>FOMO profile</span><span class="r">@${h(ac.handle)} ›</span></a>
   <button class="row" id="inv" style="width:100%;background:none;border:0;color:var(--blue);font:inherit"><span>Invite a friend</span><span>›</span></button></div>
   <h2>Settings</h2><div class="sub">Read-only in this version.</div>
   <div class="list">${Object.keys(st).sort().map(k=>`<div class="row"><span class="mono">${h(k)}</span><span class="r mono">${h(JSON.stringify(st[k]))}</span></div>`).join("")}</div>`;
  $("#inv").onclick = async () => { const u = ac.inviteUrl;
    if (navigator.share) { try { await navigator.share({title:"FOMO", url:u}); } catch(e){} }
    else { try { await navigator.clipboard.writeText(u); $("#inv span").textContent = "Link copied"; } catch(e) { prompt("Copy this link", u); } } };
}
function auditor() {
  const a = D.state.agents.auditor, la = a.last, ev = a.events;
  V.innerHTML = `<button class="back" id="bk">‹ Back</button><h2>Auditor</h2><div class="sub">${a.taken} taken apart · ${a.rejected} rejected</div>
   ${la?`<div class="list">${la.layers.map(l=>{ const live = ev.find(e=>e.mint===la.mint&&e.n===l.n); return `<div class="layer"><span>${l.n}. ${h(l.name)}</span><span class="v ${l.pass===true?"p":l.pass===false?"f":"n"}">${l.pass===true?"✓ ":l.pass===false?"✕ ":""}${h(l.value)}</span></div>`;}).join("")}</div>
   <div class="row" data-mint="${h(la.mint)}" style="color:var(--blue)">Open coin ›</div>`:`<div class="state">No audits yet.</div>`}
   <h2>Recent</h2><div class="list">${a.list.map(x=>`<div class="row" data-mint="${h(x.mint)}"><span class="mono">${h(x.mint.slice(0,6))}…</span><span class="r" style="color:${x.passed?css("--green"):css("--red")}">${x.passed?"8/8":h(x.reason)}</span></div>`).join("")}</div>`;
  $("#bk").onclick = () => { sub = null; render(); }; wire();
}
async function coin(mint) {
  V.innerHTML = `<button class="back" id="bk">‹ Back</button><div class="state">Loading…</div>`; $("#bk").onclick = () => { sub = null; render(); };
  let c; try { c = await get(`coin/${encodeURIComponent(mint)}.json`); } catch(e) { V.querySelector(".state").textContent = "No data for this coin yet."; V.querySelector(".state").className = "state err"; return; }
  V.innerHTML = `<button class="back" id="bk">‹ Back</button><h2>${h(c.name||mint.slice(0,8))} <span class="sub">${h(c.symbol||"")}</span></h2>
   <canvas id="candles"></canvas>${c.exitLine?`<div class="legend">- - Risk trailing stop ${c.exitLine.toPrecision(4)}</div>`:""}
   ${c.audit?`<div class="list">${c.audit.layers.map(l=>`<div class="layer"><span>${l.n}. ${h(l.name)}</span><span class="v ${l.pass===true?"p":l.pass===false?"f":"n"}">${h(l.value)}</span></div>`).join("")}<div class="layer"><span>Holders</span><span>${c.audit.holders??"—"}</span></div></div>`:""}
   <a class="btn row list" style="justify-content:center" href="${h(c.link)}" target="_blank" rel="noopener">Open on FOMO</a>`;
  $("#bk").onclick = () => { sub = null; render(); }; candles($("#candles"), c.candles, c.exitLine);
}
function candles(cv, cs, exitLine) {
  const r = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W*r; cv.height = H*r;
  const g = cv.getContext("2d"); g.scale(r, r);
  if (!cs.length) { g.fillStyle = css("--sec"); g.font = "13px -apple-system"; g.fillText("No candles yet", 12, H/2); return; }
  const vals = cs.flatMap(c => [c.h, c.l]).concat(exitLine ? [exitLine] : []), lo = Math.min(...vals), hi = Math.max(...vals), sp = hi - lo || hi*0.01 || 1;
  const y = v => H-10-(v-lo)/sp*(H-20), bw = Math.max(2, Math.min(12, (W-20)/cs.length*0.7));
  cs.forEach((c, i) => { const x = 10 + (i+0.5)*(W-20)/cs.length, col = c.c >= c.o ? css("--green") : css("--red");
    g.strokeStyle = g.fillStyle = col; g.beginPath(); g.moveTo(x, y(c.h)); g.lineTo(x, y(c.l)); g.stroke();
    g.fillRect(x-bw/2, Math.min(y(c.o), y(c.c)), bw, Math.max(1, Math.abs(y(c.o)-y(c.c)))); });
  if (exitLine) { g.setLineDash([6,4]); g.strokeStyle = css("--orange"); g.beginPath(); g.moveTo(0, y(exitLine)); g.lineTo(W, y(exitLine)); g.stroke(); }
}
load(); setInterval(load, 15000); addEventListener("resize", render);
})();
