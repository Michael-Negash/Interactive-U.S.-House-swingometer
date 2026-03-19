/*
 * ─────────────────────────────────────────────────────────────────────────────
 *  House Demographic Swingometer — swingometer.js
 *  © Open Source Zone  |  https://oszpolls.com
 *
 *  NOTICE: This file is a stripped portfolio demo.
 *  The real district VAP dataset, per-district margin adjustments, and
 *  AlbersUSA SVG are NOT included. Stub data is used so the UI / logic
 *  can be inspected without replicating the full tool.
 * ─────────────────────────────────────────────────────────────────────────────
 */

// ── CONFIG ────────────────────────────────────────────────────────────────────
// Point these at real files to run the full tool.
const DISTRICTS_FILE            = './demographic-house-swingometer-district.json';
const SVG_FILE                  = './demographic-house-119th-map.svg';
const DISTRICT_RACE_MARGIN_FILE = './demographic-house-swingometer-margins.json';
const COMBINED_KEY              = 'Asian & other';

// ── STUB DATA ─────────────────────────────────────────────────────────────────
// 10 fake districts used as a fallback when real data files are absent.
const STUB_DISTRICTS = Array.from({ length: 10 }, (_, i) => ({
  id:         `STUB-${i + 1}`,
  name:       `Demo District ${i + 1}`,
  totalVap:   400000 + i * 15000,
  raceShares: {
    White:           55 - i,
    Black:           12 + (i % 4),
    Hispanic:        18,
    'Asian & other': 15 - (i % 3)
  }
}));

// ── STATE ─────────────────────────────────────────────────────────────────────
let DISTRICTS            = [];
let RACES                = [];
let raceControls         = {};
let lastAllocById        = {};
let mappedShapes         = [];
let DISTRICT_RACE_MARGIN = {};

// tooltip state
let currentTooltipFeatureId = null;
let currentTooltipTargetEl  = null;

// tooltip DOM ref (resolved after DOMContentLoaded)
let tooltip = null;

// ── UTILS ─────────────────────────────────────────────────────────────────────
const clampIntPct = n => { const v = Math.round(Number(n) || 0); return Math.max(0, Math.min(100, v)); };
const roundInt    = n => Math.round(Number(n) || 0);

function roundAllocate(floats, total) {
  const floors = floats.map(f => Math.floor(f || 0));
  let rem      = Math.round(total - floors.reduce((s, x) => s + x, 0));
  const fracs  = floats.map((f, i) => ({ i, frac: (f || 0) - Math.floor(f || 0) }))
                       .sort((a, b) => b.frac - a.frac);
  const result = floors.slice();
  let idx = 0;
  while (rem > 0 && idx < fracs.length) {
    result[fracs[idx].i]++;
    rem--;
    idx++;
    if (idx === fracs.length && rem > 0) idx = 0;
  }
  return result;
}

function normalizeId(raw) {
  const s    = String(raw || '').replace(/\u00A0/g, ' ').trim();
  const mNum = s.match(/^0*([1-9]\d{0,2}|0)$/);
  if (mNum) return String(Number(mNum[1] || 0));
  const mState = s.match(/([A-Za-z]{2})\s*[-_]?\s*(\d{1,2})$/);
  if (mState) return mState[1].toUpperCase() + mState[2].padStart(2, '0');
  if (/^\d{3,4}$/.test(s)) return s;
  return s.replace(/\s+/g, '_');
}

function fetchJSON(url) {
  return fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.json(); });
}
function fetchText(url) {
  return fetch(url).then(r => { if (!r.ok) throw new Error(r.status); return r.text(); });
}

// ── RACE KEY HELPERS ──────────────────────────────────────────────────────────
function collectRaceKeys() {
  const rawKeys = new Set();
  DISTRICTS.forEach(d => Object.keys(d.raceShares || {}).forEach(k => rawKeys.add(k.trim())));
  const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  let hasOther = false;
  rawKeys.forEach(k => {
    const nk = norm(k);
    if (nk !== norm('white') && nk !== norm('black') && nk !== norm('hispanic')) hasOther = true;
  });
  const result = ['White', 'Black', 'Hispanic'];
  if (hasOther) result.push(COMBINED_KEY);
  return result;
}

function getUnifiedShare(d, raceKey) {
  const shares = d.raceShares || {};
  const norm   = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  if (raceKey === COMBINED_KEY) {
    let sum = 0;
    Object.keys(shares).forEach(k => {
      const nk = norm(k);
      if (nk !== norm('white') && nk !== norm('black') && nk !== norm('hispanic'))
        sum += Number(shares[k]) || 0;
    });
    return sum;
  }
  const target = norm(raceKey);
  for (const k of Object.keys(shares)) { if (norm(k) === target) return Number(shares[k]) || 0; }
  return 0;
}

function inferStateCodeFromDistrictObj(d) {
  if (!d) return '';
  if (d.state) return String(d.state).trim().toUpperCase();
  const id = String(d.id || '').toUpperCase().trim();
  const m  = id.match(/^([A-Z]{2})\b/);
  return m ? m[1] : '';
}

// ── SLIDER VISUAL HELPERS ─────────────────────────────────────────────────────
function updateDemSlider(s, pct) {
  pct = clampIntPct(pct);
  s.style.background =
    `linear-gradient(to right, var(--dem) 0%, var(--dem) ${pct}%, var(--rep) ${pct}%, var(--rep) 100%)`;
}

function updateTurnoutSlider(s, pct) {
  pct = clampIntPct(pct);
  s.style.background =
    `linear-gradient(to right, #000 0%, #000 ${pct}%, #e6eef6 ${pct}%, #e6eef6 100%)`;
}

// ── BUILD RACE CONTROLS ───────────────────────────────────────────────────────
function buildRaceControls() {
  RACES = collectRaceKeys();

  const DISPLAY  = { White: 'White', Hispanic: 'Hispanic', Black: 'Black', [COMBINED_KEY]: 'Asian & Other' };
  const defaults = {
    White:          { turnout: 63, demShare: 42 },
    Black:          { turnout: 53, demShare: 85 },
    Hispanic:       { turnout: 46, demShare: 55 },
    [COMBINED_KEY]: { turnout: 51, demShare: 60 }
  };

  const container  = document.getElementById('raceControls');
  container.innerHTML = '';

  RACES.forEach(r => {
    const init = defaults[r] || { turnout: 50, demShare: 50 };
    raceControls[r] = { turnout: init.turnout, demShare: init.demShare };

    const div       = document.createElement('div');
    div.className   = 'race-card';
    div.dataset.race = r;
    div.innerHTML   = `
      <div class="race-header">
        <div class="label">${DISPLAY[r] || r}</div>
        <div class="race-share"><span class="p-share">—</span></div>
      </div>
      <div class="muted" style="margin-top:4px">Turnout %</div>
      <div class="control-row">
        <div class="percent left"> </div>
        <input type="range" data-race="${r}" data-type="turnout"
               min="0" max="100" step="1" value="${init.turnout}">
        <div class="percent" style="color:#000"><span class="p-turnout">${init.turnout}%</span></div>
      </div>
      <div class="muted" style="margin-top:4px">Party split</div>
      <div class="control-row">
        <div class="percent left"><span class="p-left">${init.demShare}%</span></div>
        <input type="range" data-race="${r}" data-type="demShare"
               min="0" max="100" step="1" value="${init.demShare}">
        <div class="percent right"><span class="p-right">${100 - init.demShare}%</span></div>
      </div>`;
    container.appendChild(div);

    updateDemSlider(div.querySelector('[data-type="demShare"]'), init.demShare);
    updateTurnoutSlider(div.querySelector('[data-type="turnout"]'), init.turnout);
  });

  container.querySelectorAll('input[type="range"]').forEach(inp => {
    inp.addEventListener('input', e => {
      const race = e.target.dataset.race;
      const type = e.target.dataset.type;
      const val  = clampIntPct(e.target.value);
      const card = e.target.closest('.race-card');

      if (type === 'turnout') {
        raceControls[race].turnout = val;
        card.querySelector('.p-turnout').textContent = val + '%';
        updateTurnoutSlider(e.target, val);
      } else {
        raceControls[race].demShare = val;
        card.querySelector('.p-left').textContent  = val + '%';
        card.querySelector('.p-right').textContent = (100 - val) + '%';
        updateDemSlider(e.target, val);
      }
      render();
    });
  });
}

// ── MAP HELPERS ───────────────────────────────────────────────────────────────
function isLikelyDistrict(el) {
  for (const a of ['data-district', 'data-id', 'id', 'aria-label']) {
    try {
      const v = a === 'id' ? el.id : el.getAttribute && el.getAttribute(a);
      if (v && v.trim().length) return true;
    } catch (e) {}
  }
  try { const t = el.querySelector && el.querySelector('title'); if (t && t.textContent.trim()) return true; } catch (e) {}
  try { const bb = el.getBBox(); if (Number.isFinite(bb.width * bb.height) && bb.width * bb.height > 6) return true; } catch (e) {}
  try { if (el.getAttribute && el.getAttribute('d') && el.getAttribute('d').trim()) return true; } catch (e) {}
  return false;
}

function inferFeatureId(el, fallbackIndex) {
  const ATTRS = ['data-district', 'data-id', 'data-geoid', 'id', 'aria-label', 'class'];
  let cur = el;
  for (let depth = 0; cur && depth < 6; depth++, cur = cur.parentElement) {
    for (const a of ATTRS) {
      try {
        let val = a === 'id' ? cur.id : cur.getAttribute && cur.getAttribute(a);
        if (val) {
          val = String(val).trim();
          if (val && !/congress|albersusa|\.svg|^svg$/i.test(val)) return normalizeId(val);
        }
      } catch (e) {}
    }
    try {
      const t = cur.querySelector && cur.querySelector('title');
      if (t && t.textContent.trim() && !/congress|albersusa/i.test(t.textContent))
        return normalizeId(t.textContent.trim());
    } catch (e) {}
  }
  return String(fallbackIndex + 1);
}

function injectSVG(svgText) {
  document.getElementById('svgLoading').style.display = 'none';
  const mapContainer = document.getElementById('mapContainer');
  mapContainer.insertAdjacentHTML('afterbegin', svgText);
  const svgEl = mapContainer.querySelector('svg');
  if (!svgEl) return;

  const candidates = Array.from(svgEl.querySelectorAll('path, polygon, rect, g, circle, ellipse'));
  const visible    = candidates.filter(el => { try { return isLikelyDistrict(el); } catch (e) { return false; } });

  mappedShapes = visible.map((el, idx) => {
    const featureId = inferFeatureId(el, idx);
    el.dataset.featureId = featureId;
    try { el.style.fill = '#eef2f7'; el.style.pointerEvents = 'auto'; } catch (e) {}

    el.addEventListener('mouseenter', () => { try { el.style.opacity = '.85'; } catch (e) {} });
    el.addEventListener('mouseleave', () => { try { el.style.opacity = '1';   } catch (e) {} });
    el.addEventListener('click', ev => {
      ev.stopPropagation();
      const alloc = lastAllocById[featureId];
      showTooltip(alloc || { id: featureId, name: `District ${featureId}`, perRace: {} }, el);
    });
    return { el, featureId };
  });
}

// ── TOOLTIP ───────────────────────────────────────────────────────────────────
function hideTooltip() {
  tooltip.style.display = 'none';
  tooltip.setAttribute('aria-hidden', 'true');
  currentTooltipFeatureId = null;
  currentTooltipTargetEl  = null;
}

function buildTooltipHtml(dAlloc) {
  const races  = Object.entries(dAlloc.perRace || {});
  const totDem = races.reduce((s, [, r]) => s + (r.dem || 0), 0);
  const totRep = races.reduce((s, [, r]) => s + (r.rep || 0), 0);
  const total  = totDem + totRep;
  const dPct   = total ? clampIntPct(totDem / total * 100) : 0;
  const rPct   = total ? clampIntPct(totRep / total * 100) : 0;
  const winner = totDem > totRep ? 'Democrats' : totDem < totRep ? 'Republicans' : 'Tie';
  const margin = clampIntPct(Math.abs(totDem - totRep) / Math.max(total, 1) * 100);

  const rows = races.map(([race, r]) => {
    const rt    = (r.dem || 0) + (r.rep || 0);
    const rdPct = rt ? clampIntPct(r.dem / rt * 100) : 0;
    const rrPct = rt ? clampIntPct(r.rep / rt * 100) : 0;
    const rmLbl = r.dem > r.rep
      ? `Dem +${clampIntPct(Math.abs(rdPct - rrPct))}%`
      : r.rep > r.dem
        ? `Rep +${clampIntPct(Math.abs(rdPct - rrPct))}%`
        : 'Tie';
    return `<tr>
      <td>${race}</td>
      <td style="text-align:right">${roundInt(r.voters || 0).toLocaleString()}</td>
      <td style="text-align:right">${rdPct}%</td>
      <td style="text-align:right">${rrPct}%</td>
      <td style="text-align:right">${rmLbl}</td>
    </tr>`;
  }).join('');

  return `
    <div style="font-weight:700;margin-bottom:6px">${dAlloc.name}</div>
    <table style="width:100%;border-collapse:collapse;font-size:12px">
      <tr style="font-weight:600;border-bottom:1px solid #ccc">
        <th style="text-align:left">Race</th>
        <th>Voters</th><th>Dem%</th><th>Rep%</th><th>Margin</th>
      </tr>
      ${rows}
    </table>
    <div style="margin-top:8px">Dem <b>${dPct}%</b> — Rep <b>${rPct}%</b></div>
    <div>Winner: <b>${winner === 'Tie' ? 'Tie' : winner + ' +' + margin + '%'}</b></div>`;
}

function placeTooltip(targetEl) {
  const mapContainer = document.getElementById('mapContainer');
  if (tooltip.parentElement !== mapContainer) mapContainer.appendChild(tooltip);
  tooltip.style.display    = 'block';
  tooltip.style.visibility = 'hidden';
  tooltip.setAttribute('aria-hidden', 'false');
  tooltip.style.position   = 'absolute';

  const ttW  = Math.min(320, tooltip.offsetWidth || 220);
  const ttH  = tooltip.offsetHeight || 120;
  const mapR = mapContainer.getBoundingClientRect();
  const tgtR = targetEl && targetEl.getBoundingClientRect ? targetEl.getBoundingClientRect() : null;
  const pad  = 8;

  let left = pad, top = pad;
  if (tgtR) {
    left = tgtR.left - mapR.left + tgtR.width / 2 - ttW / 2;
    top  = tgtR.bottom - mapR.top + 8;
    if (top + ttH > mapR.height - pad) top = tgtR.top - mapR.top - ttH - 8;
    left = Math.max(pad, Math.min(left, mapR.width  - ttW - pad));
    top  = Math.max(pad, Math.min(top,  mapR.height - ttH - pad));
  }
  tooltip.style.left       = left + 'px';
  tooltip.style.top        = top  + 'px';
  tooltip.style.visibility = 'visible';
  clearTimeout(tooltip._t);
  tooltip._t = setTimeout(hideTooltip, 6000);
}

function showTooltip(dAlloc, targetEl) {
  const id = (dAlloc && dAlloc.id) || (targetEl && targetEl.dataset && targetEl.dataset.featureId);
  currentTooltipFeatureId = id ? String(id) : null;
  currentTooltipTargetEl  = targetEl || null;
  tooltip.innerHTML =
    `<button class="close-btn" aria-label="Close">×</button>` + buildTooltipHtml(dAlloc);
  tooltip.querySelector('.close-btn').addEventListener('click', e => { e.stopPropagation(); hideTooltip(); });
  placeTooltip(currentTooltipTargetEl);
}

function refreshTooltip() {
  if (!currentTooltipFeatureId || !currentTooltipTargetEl) return;
  const alloc = lastAllocById[currentTooltipFeatureId];
  if (!alloc) return;
  tooltip.innerHTML =
    `<button class="close-btn" aria-label="Close">×</button>` + buildTooltipHtml(alloc);
  tooltip.querySelector('.close-btn').addEventListener('click', e => { e.stopPropagation(); hideTooltip(); });
  placeTooltip(currentTooltipTargetEl);
}

// ── FILL COLOUR ───────────────────────────────────────────────────────────────
function districtColor(dDem, dRep) {
  const total  = (Number(dDem) || 0) + (Number(dRep) || 0);
  if (!total) return '#ffffff';
  const demPct = dDem / total * 100;
  const margin = Math.abs(demPct - (100 - demPct));
  if (Math.abs(demPct - 50) < 0.0001) return '#ffffff';
  if (demPct > 50) return margin > 10 ? '#1e40af' : margin > 5 ? '#3b82f6' : '#bfe0ff';
  return margin > 10 ? '#991b1b' : margin > 5 ? '#ef4444' : '#ffbdbd';
}

// ── RENDER LOOP ───────────────────────────────────────────────────────────────
function render() {
  if (!DISTRICTS.length || !RACES.length) return;

  // Per-district allocation
  const allocations = DISTRICTS.map(d => {
    const floats  = RACES.map(r => (d.totalVap || 0) * getUnifiedShare(d, r));
    const alloc   = roundAllocate(floats, Math.round(d.totalVap || 0));
    const perRace = {};
    RACES.forEach((r, i) => { perRace[r] = { eligible: alloc[i] || 0 }; });
    return {
      id:        normalizeId(d.id || d.name || ''),
      name:      d.name || `District ${d.id}`,
      totalVap:  d.totalVap || 0,
      perRace,
      stateCode: inferStateCodeFromDistrictObj(d)
    };
  });

  allocations.forEach(dAlloc => {
    const voterFloats = RACES.map(r =>
      dAlloc.perRace[r].eligible * ((raceControls[r] && raceControls[r].turnout) || 50) / 100
    );
    const votersInts = roundAllocate(voterFloats, Math.round(voterFloats.reduce((s, f) => s + f, 0)));
    const demFloats  = RACES.map((r, i) => {
      const ds = (raceControls[r] && raceControls[r].demShare) || 50;
      return votersInts[i] * ds / 100;
    });
    const demInts = roundAllocate(demFloats, Math.round(demFloats.reduce((s, f) => s + f, 0)));
    RACES.forEach((r, i) => {
      dAlloc.perRace[r].voters = votersInts[i];
      dAlloc.perRace[r].dem   = demInts[i];
      dAlloc.perRace[r].rep   = Math.max(0, votersInts[i] - demInts[i]);
    });
  });

  lastAllocById = {};
  allocations.forEach(d => { lastAllocById[String(d.id)] = d; });

  // National totals
  const nat = {};
  RACES.forEach(r => { nat[r] = { voters: 0, dem: 0, rep: 0 }; });
  allocations.forEach(dAlloc => RACES.forEach(r => {
    nat[r].voters += dAlloc.perRace[r].voters;
    nat[r].dem    += dAlloc.perRace[r].dem;
    nat[r].rep    += dAlloc.perRace[r].rep;
  }));

  const natDem    = Object.values(nat).reduce((s, r) => s + r.dem,    0);
  const natRep    = Object.values(nat).reduce((s, r) => s + r.rep,    0);
  const natTotal  = natDem + natRep;
  const natVoters = Object.values(nat).reduce((s, r) => s + r.voters, 0);

  const popDemPct = natTotal ? clampIntPct(natDem / natTotal * 100) : 0;
  const popRepPct = natTotal ? clampIntPct(natRep / natTotal * 100) : 0;

  // Seat count
  let demSeats = 0, repSeats = 0, tieSeats = 0;
  allocations.forEach(dAlloc => {
    const dDem = Object.values(dAlloc.perRace).reduce((s, p) => s + (p.dem || 0), 0);
    const dRep = Object.values(dAlloc.perRace).reduce((s, p) => s + (p.rep || 0), 0);
    if (dDem > dRep) demSeats++;
    else if (dRep > dDem) repSeats++;
    else tieSeats++;
  });

  const totalSeats = demSeats + repSeats + tieSeats;
  const dPct = totalSeats ? clampIntPct(demSeats / totalSeats * 100) : 0;
  const rPct = totalSeats ? clampIntPct(repSeats / totalSeats * 100) : 0;
  const tPct = clampIntPct(100 - dPct - rPct);

  // Popular vote display
  document.getElementById('popularSummary').innerHTML = `
    <div style="display:flex;justify-content:space-between;width:100%">
      <span style="color:var(--dem)">Dem ${popDemPct}% (${Math.round(natDem).toLocaleString()})</span>
      <span style="color:var(--rep)">Rep ${popRepPct}% (${Math.round(natRep).toLocaleString()})</span>
    </div>`;

  // Seat bar
  const natBar = document.getElementById('natBar');
  natBar.innerHTML = '';
  if (totalSeats > 0) {
    [
      { pct: dPct, bg: 'var(--dem)', lbl: dPct > 8 ? `Dem ${demSeats}` : '' },
      tieSeats > 0 ? { pct: tPct, bg: '#94a3b8', lbl: tPct > 8 ? `Tie ${tieSeats}` : '' } : null,
      { pct: rPct, bg: 'var(--rep)', lbl: rPct > 8 ? `Rep ${repSeats}` : '' }
    ].filter(Boolean).forEach(seg => {
      const div = document.createElement('div');
      div.style.cssText =
        `width:${seg.pct}%;background:${seg.bg};display:flex;align-items:center;justify-content:center;font-weight:700;color:white`;
      div.textContent = seg.lbl;
      natBar.appendChild(div);
    });
  }

  // Race electorate share labels
  const norm    = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const grouped = { White: 0, Black: 0, Hispanic: 0, [COMBINED_KEY]: 0 };
  Object.keys(nat).forEach(k => {
    const v = nat[k].voters || 0;
    if      (norm(k) === norm('white'))    grouped.White    += v;
    else if (norm(k) === norm('black'))    grouped.Black    += v;
    else if (norm(k) === norm('hispanic')) grouped.Hispanic += v;
    else                                   grouped[COMBINED_KEY] += v;
  });
  Object.keys(grouped).forEach(canon => {
    const pct  = natVoters ? clampIntPct(grouped[canon] / natVoters * 100) : 0;
    const card = document.querySelector(`.race-card[data-race="${CSS.escape(canon)}"]`);
    if (card) { const el = card.querySelector('.p-share'); if (el) el.textContent = `Share: ${pct}%`; }
  });

  // Map colours
  mappedShapes.forEach(({ el, featureId }) => {
    const alloc = lastAllocById[featureId];
    if (!alloc) { try { el.style.fill = '#eef2f7'; } catch (e) {} return; }
    const dDem = Object.values(alloc.perRace).reduce((s, p) => s + (p.dem || 0), 0);
    const dRep = Object.values(alloc.perRace).reduce((s, p) => s + (p.rep || 0), 0);
    try { el.style.fill = districtColor(dDem, dRep); el.style.opacity = '1'; } catch (e) {}
  });

  refreshTooltip();
}

// ── BOOT ──────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  tooltip = document.getElementById('mapTooltip');
  document.addEventListener('keydown', e => { if (e.key === 'Escape') hideTooltip(); });

  const loadingEl = document.getElementById('svgLoading');
  try {
    // Margins file — optional, silently skip if absent
    try {
      const marginsRaw = await fetchJSON(DISTRICT_RACE_MARGIN_FILE);
      if (marginsRaw) {
        for (const k of Object.keys(marginsRaw))
          DISTRICT_RACE_MARGIN[normalizeId(k)] = marginsRaw[k];
      }
    } catch (e) { /* not available in demo — expected */ }

    // District data — fall back to stubs if absent
    let districtData = null;
    try { districtData = await fetchJSON(DISTRICTS_FILE); } catch (e) { /* use stubs */ }
    DISTRICTS = Array.isArray(districtData) ? districtData : STUB_DISTRICTS;

    // SVG map — fall back to placeholder rectangles if absent
    let svgText = null;
    try { svgText = await fetchText(SVG_FILE); } catch (e) { /* use stub */ }

    if (!svgText) {
      loadingEl.textContent = 'Map file not found — showing placeholder shapes.';
      const rects = STUB_DISTRICTS.map((d, i) => {
        const col = 1 + (i % 5), row = 1 + Math.floor(i / 5);
        const x   = (col - 1) * 80 + 4, y = (row - 1) * 60 + 4;
        return `<rect id="STUB-${i + 1}" x="${x}" y="${y}" width="76" height="56" rx="4"
                      style="stroke:#ccc;stroke-width:1"/>`;
      }).join('\n');
      svgText = `<svg viewBox="0 0 404 128" xmlns="http://www.w3.org/2000/svg">${rects}</svg>`;
    }

    injectSVG(svgText);
    buildRaceControls();
    render();

  } catch (err) {
    console.error(err);
    loadingEl.textContent = 'Error: ' + (err && err.message ? err.message : err);
  }
});