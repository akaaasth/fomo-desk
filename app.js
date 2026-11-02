"use strict";
// Plan B: static data files at d/{DATA_PATH}/, DATA_PATH from #d= fragment, kept in localStorage.
(() => {
const $ = s => document.querySelector(s), V = $("#view");
const h = s => String(s ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const usd = (n, d=2) => n == null ? "—" : (n < 0 ? "-" : "") + "$" + Math.abs(n).toLocaleString("en-US", {minimumFractionDigits:d, maximumFractionDigits:d});
const css = v => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
const FP = new URLSearchParams(location.hash.slice(1)); let frag = FP.get("d");
if (FP.get("t")) localStorage.setItem("desk_t", FP.get("t"));
if (frag) { localStorage.setItem("desk_d", frag); history.replaceState(null, "", location.pathname); }
const DP = localStorage.getItem("desk_d");
const D = { state:null, chart:null, activity:null, err:null };
let tab = "home", sub = null;

const BASE = location.hostname.endsWith("github.io") ? `https://raw.githubusercontent.com/akaaasth/fomo-desk/data/d/${DP}/` : `d/${DP}/`;
async function get(f) { const r = await fetch(`${BASE}${f}?t=${Date.now()}`, {cache:"no-store"}); if (!r.ok) throw new Error(r.status); return r.json(); }
async function load() {
  if (!DP) { D.err = "No data link. Open the app with the link that ends in #d=…"; return render(); }
  try { [D.state, D.chart, D.activity] = await Promise.all([get("state.json"), get("chart.json"), get("activity.json")]); D.err = null; toasts(); }
  catch (e) { D.err = "Can't reach the desk data (" + e.message + ")."; }
  if (LIVE.d && D.state) Object.assign(D.state, LIVE.d);
  render();
}
// Live relay via ntfy.sh (secret topic from #t=), gzip+base64 compact state every ~5s.
const LT = localStorage.getItem("desk_t"), LIVE = { d:null, ts:0 };
async function live() {
  if (!LT || !window.DecompressionStream) return;
  try {
    const r = await fetch(`https://ntfy.sh/${encodeURIComponent(LT)}/json?poll=1&since=latest`, {cache:"no-store"});
    const line = (await r.text()).trim().split("\n").pop(); if (!line) return;
    const m = JSON.parse(line), bin = Uint8Array.from(atob(m.message), c => c.charCodeAt(0));
    const d = JSON.parse(await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream("gzip"))).text());
    if (d.liveTs * 1000 <= LIVE.ts) return;
    LIVE.d = d; LIVE.ts = d.liveTs * 1000; delete d.liveTs;
    if (D.state) { Object.assign(D.state, d); D.err = null; toasts(); render(); }
  } catch (e) {}
}
function liveBadge() {
  const b = $("#badge"); if (!b || !D.state) return;
  const age = Math.round((Date.now() - LIVE.ts) / 1000);
  b.textContent = (D.state.mode === "PAPER" ? "PAPER" : "PAPER?") + (LIVE.ts && age < 60 ? ` · LIVE ${age}s` : "");
}
if (LT) { live(); setInterval(live, 4000); setInterval(liveBadge, 1000); }
document.querySelectorAll("nav button").forEach(b => b.onclick = () => { tab = b.dataset.tab; sub = null; document.querySelectorAll("nav button").forEach(x => x.classList.toggle("on", x === b)); render(); });

function render() {
  if (D.err && !D.state) { V.innerHTML = `<div class="state err">${h(D.err)}</div>`; return; }
  if (!D.state) { V.innerHTML = `<div class="state">Loading…</div>`; return; }
  $("#badge").textContent = D.state.mode === "PAPER" ? "PAPER" : "PAPER?";
  topbar(); if (LT) liveBadge();
  if (sub) return sub.kind === "coin" ? coin(sub.mint) : sub.kind === "logger" ? logger() : auditor();
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
const AG = {scanner:["Scanner","#6cb8ff","🔭"],auditor:["Auditor","#ffb35c","🔬"],analyst:["Analyst","#b79cff","🧠"],executor:["Executor","#39ff88","⚡"],risk:["Risk","#ff8fc8","🛡"],logger:["Logger","#5ce1e6","📜"]};
const ago = ts => { if (!ts) return "—"; const s = Math.max(0, (Date.now() - new Date(ts)) / 1000); return s < 60 ? Math.round(s) + "s" : s < 3600 ? Math.round(s/60) + "m" : Math.round(s/3600) + "h"; };
const hm = ts => new Date(ts).toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", hour12:false});
const px = p => p == null ? "—" : p >= 1 ? "$" + p.toFixed(2) : "$" + p.toPrecision(3);
let night = localStorage.getItem("desk_night") === "1";
function since23() { const d = new Date(); if (d.getHours() < 23) d.setDate(d.getDate() - 1); d.setHours(23,0,0,0); return d; }
const inWin = ts => !night || new Date(ts) >= since23();
function verb(l) {
  const a = l.action, r = l.reason || "";
  if (l.agent === "scanner") return a === "pass" ? `passed $${l.symbol} → Auditor` : `killed $${l.symbol} · ${r}`;
  if (l.agent === "auditor") return a === "pass" ? `$${l.symbol} 8/8 clean → Analyst` : `rejected $${l.symbol} 💀 ${r}`;
  if (l.agent === "analyst") return a === "pass" ? `scored $${l.symbol} ${r} ✓` : `scored $${l.symbol} ${r} ✕`;
  if (a === "buy") return `paper-bought $${l.symbol} · ${r}`;
  if (a === "exit") return `closed $${l.symbol} · ${r}`;
  return `${a} $${l.symbol} ${r}`;
}
function logLine(l) {
  const c = AG[l.agent]?.[1] || "#aaa", pn = l.pnl != null ? `<span class="${l.pnl>=0?"g":"rd"}">${l.pnl>=0?"+":""}${usd(l.pnl)}</span>` : "";
  return `<div class="ll" data-mint="${h(l.mint)}"><span class="t">${hm(l.ts)}</span><b style="color:${c}">${AG[l.agent]?.[0].toUpperCase()||h(l.agent)}</b><span class="x">${h(verb(l))}</span>${pn}</div>`;
}
function deskCard() {
  const s = D.state, a = s.agents, st = s.settings, hb = s.heartbeats, now = s.now || {}, lg = s.logger || {lines:[],reasons:0,killed:0};
  const lines = lg.lines.filter(l => inWin(l.ts));
  const scanned = night ? lines.filter(l => l.agent === "scanner").length : a.scanner.passed + a.scanner.killed;
  const traded = night ? lines.filter(l => l.action === "buy").length : a.executor.trades;
  const lastOf = ag => lines.find(l => l.agent === ag);
  const surv = a.auditor.taken ? Math.round(100 * (a.auditor.taken - a.auditor.rejected) / a.auditor.taken) + "%" : "—";
  const la = a.auditor.last, an = a.analyst.last, ex = a.executor.last, rl = a.risk.lastExit;
  const rows = {
    scanner: [`new pairs · ${a.scanner.pools} seen · ${a.scanner.waiting} waiting`, `${a.scanner.pools}`],
    auditor: [la && !la.passed ? `latest 💀 ${la.reason}` : la ? `latest ${la.mint.slice(0,4)} 8/8 clean` : "no coin reached audit yet", `${surv} survive`],
    analyst: [an ? `last score ${an.score} vs ${st["analyst.min_score"]} needed` : `scores survivors · needs ${st["analyst.min_score"]}`, `${a.analyst.scored} scored`],
    executor: [`cap ${st["executor.stack_pct"]}% of stack` + (ex && ex.sizeUsd ? ` · last ${usd(ex.sizeUsd)}` : " · no trades yet"), `${a.executor.trades}`],
    risk: [`stop -${a.risk.stopPct}% · trail ${a.risk.trailPct}%` + (rl ? ` · last ${rl.reason}` : ""), a.risk.open.length ? `${a.risk.open.length} open` : "idle"],
    logger: ["reason for all · every decision logged", `${lg.reasons} reasons`],
  };
  const row = k => { const [n, c, ic] = AG[k], age = k === "logger" ? null : hb[k];
    const fresh = k === "logger" ? true : age && (Date.now() - new Date(age)) < 120000;
    const nowTxt = k === "logger" ? (lines[0] ? verb(lines[0]) : "nothing logged yet") : (now[k]?.text || (lastOf(k) ? verb(lastOf(k)) : "idle"));
    return `<div class="ar" data-ag="${k}"><div class="ic" style="background:${c}22;color:${c}">${ic}</div>
      <div class="am"><div class="an">${n} <span class="pd ${fresh?"on":""}" style="--c:${c}"></span><span class="age">${k==="logger"?"":ago(age)}</span></div>
      <div class="as">${h(rows[k][0])}</div><div class="now" style="color:${c}">${h(nowTxt)}</div></div>
      <div class="mb" style="color:${c};background:${c}1f">${h(rows[k][1])}</div></div>`; };
  return `<div class="box hero"><div class="bh"><b>Desk • 6 agents</b><span><span class="mu">${scanned} scanned</span> <span class="g">${traded} traded</span></span></div>
    ${Object.keys(AG).map(row).join("")}</div>
   <div class="box"><div class="bh"><b>Live feed</b><span class="kb">${lg.killed} killed</span></div>
    <div class="feed">${lines.slice(0, 25).map(logLine).join("") || `<div class="state">Nothing logged ${night?"since 23:00":"yet"}.</div>`}</div></div>`;
}
function home() {
  const s = D.state, st = s.settings, ch = s.balance - s.startStack, pct = 100 * ch / s.startStack, wl = s.wl || {w:0,l:0,lastPnl:null};
  const [whole, dec] = s.balance.toFixed(2).split(".");
  const why = (s.why || []);
  V.innerHTML = `
   <div class="tape"><div class="tt" style="animation-delay:-${(Date.now()/1000)%40}s">${[...(s.tape||[]), ...(s.tape||[])].map(t => `<span class="tk" data-mint="${h(t.mint)}"><i>${h(t.symbol.slice(0,1))}</i>$${h(t.symbol)} <span class="mu">${px(t.price)}</span> ${t.chgPct==null?"":`<span class="${t.chgPct>=0?"g":"rd"}">${t.chgPct>=0?"+":""}${t.chgPct}%</span>`}</span>`).join("") || `<span class="mu">no priced pairs yet</span>`}</div></div>
   <div class="eq"><div class="mu sm">Equity · ${usd(s.startStack,0)} start · max size ${st["executor.stack_pct"]}%</div>
    <div class="eqb"><span class="bigb">$${Number(whole).toLocaleString("en-US")}<small>.${dec}</small></span><span class="mx">${(s.balance/s.startStack).toFixed(2)}x</span></div>
    <div class="sm"><span class="${ch>=0?"g":"rd"}">${ch>=0?"+":""}${usd(ch)} (${pct>=0?"+":""}${pct.toFixed(2)}%)</span> <span class="mu">· ${wl.w}W / ${wl.l}L</span></div>
    <div class="spw"><canvas id="chart"></canvas>${wl.lastPnl!=null?`<span class="fp ${wl.lastPnl>=0?"g":"rd"}">last ${wl.lastPnl>=0?"+":""}${usd(wl.lastPnl)}</span>`:`<span class="fp mu">no trades yet</span>`}</div></div>
   ${deskCard()}
   <div class="box"><div class="bh"><b>Why they died</b><span class="mu sm">all-time</span></div>
    ${why.length ? why.slice(0, 8).map(w => `<div class="wr"><span><b style="color:${AG[w.agent][1]}">${AG[w.agent][0]}</b> · ${h(({"liq":"low liquidity","top 10 hold":"top-10 holders too concentrated","never qualified":"never qualified in time"})[w.rule]||w.rule)}</span><span class="kb">${w.n}</span></div>`).join("") : `<div class="state">No kills yet.</div>`}</div>
   ${s.agents.risk.open.length?`<h2>Open (paper)</h2><div class="list">${s.agents.risk.open.map(p=>`<div class="row" data-mint="${h(p.mint)}"><span>${h(p.name)}</span><span class="r">${usd(p.size)}</span></div>`).join("")}</div>`:""}`;
  spark($("#chart"), D.chart || []); wire();
  V.querySelectorAll(".ar").forEach(r => r.onclick = () => { if (r.dataset.ag === "auditor") sub = {kind:"auditor"}; else if (r.dataset.ag === "logger") sub = {kind:"logger"}; else tab = "agents"; render(); });
}
function spark(cv, pts) {
  const r = devicePixelRatio || 1, W = cv.clientWidth, H = cv.clientHeight; cv.width = W*r; cv.height = H*r;
  const g = cv.getContext("2d"); g.scale(r, r); const vs = pts.map(p => p.v);
  const lo = Math.min(...vs), hi = Math.max(...vs), flat = vs.length < 2 || hi - lo < 0.005;
  const col = !flat && vs.at(-1) < vs[0] ? css("--red") : css("--neon");
  g.strokeStyle = col; g.lineWidth = 2.5; g.shadowColor = col; g.shadowBlur = 10; g.beginPath();
  if (flat) { g.moveTo(0, H/2); g.lineTo(W, H/2); }
  else vs.forEach((v, i) => { const x = i/(vs.length-1)*W, y = H-6-(v-lo)/(hi-lo)*(H-12); i ? g.lineTo(x, y) : g.moveTo(x, y); });
  g.stroke();
}
function logger() {
  const lg = D.state.logger;
  V.innerHTML = `<button class="back" id="bk">‹ Back</button><h2>Logger</h2><div class="sub">${lg.reasons} reasons logged · ${lg.killed} killed</div>
   <div class="box"><div class="feed">${lg.lines.map(logLine).join("") || `<div class="state">Nothing yet.</div>`}</div></div>`;
  $("#bk").onclick = () => { sub = null; render(); }; wire();
}
// toasts: fire once per new logger line / new trade, after first load
let seen = null;
function toasts() {
  const s = D.state, lines = s.logger?.lines || [], key = l => l.ts + l.agent + l.mint + l.action;
  if (seen === null) { seen = new Set(lines.map(key)); return; }
  const fresh = lines.filter(l => !seen.has(key(l))); lines.forEach(l => seen.add(key(l)));
  if (!fresh.length) return;
  const trades = fresh.filter(l => l.action === "buy" || l.action === "exit");
  trades.slice(0, 3).forEach(l => toast(`${AG[l.agent][0].toUpperCase()} · ${hm(l.ts)}`, verb(l), l.pnl));
  const rest = fresh.length - trades.length;
  if (rest) { const k = fresh.filter(l => l.action === "kill").length;
    toast(`DESK · ${hm(fresh[0].ts)}`, `${rest} new decisions · ${k} killed`, null, fresh.length === 1 ? verb(fresh[0]) : "Filter killed everything that failed the rules"); }
}
function toast(t, msg, pnl, sub2) {
  const el = document.createElement("div"); el.className = "toast";
  el.innerHTML = `<div><div class="tt1">${h(t)}</div><div>${h(msg)}</div>${sub2?`<div class="mu sm">${h(sub2)}</div>`:""}</div>${pnl!=null?`<b class="${pnl>=0?"g":"rd"}">${pnl>=0?"+":""}${usd(pnl)}</b>`:""}`;
  $("#toasts").appendChild(el); setTimeout(() => el.classList.add("out"), 4200); setTimeout(() => el.remove(), 4800);
}
function topbar() {
  $("#clock").textContent = new Date().toLocaleTimeString([], {hour:"2-digit", minute:"2-digit", hour12:false});
  const s = D.state; if (!s) return;
  const up = Object.values(s.heartbeats||{}).filter(t => Date.now() - new Date(t) < 120000).length;
  $("#agcount").textContent = `${up}/5 live · 6 agents`;
  $("#lag").textContent = `data ${ago(s.ts)} old`;
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
$("#night").onclick = () => { night = !night; localStorage.setItem("desk_night", night ? "1" : "0"); $("#night").classList.toggle("on", night); render(); };
$("#night").classList.toggle("on", night);
const GH = location.hostname.endsWith("github.io");
load(); setInterval(load, GH ? 20000 : 4000); setInterval(topbar, 1000); addEventListener("resize", render);
})();
