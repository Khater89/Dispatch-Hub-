// Canada Dispatch W2 — closest tech by postal code (Estimate + ORS driving when available)
(function(){
  const $ = (id)=>document.getElementById(id);

  const ticketText = $('ticketText');
  const postalInput = $('postalInput');
  const driveFactor = $('driveFactor');
  const speedKmh = $('speedKmh');

  const status = $('status');
  const resTitle = $('resTitle');
  const resMeta = $('resMeta');
  const kpiRow = $('kpiRow');
  const milesEl = $('miles');
  const kmEl = $('km');
  const driveKmEl = $('driveKm');
  const etaEl = $('eta');
  const checkBox = $('checkBox');
  const topList = $('topList');

  const btnFind = $('btnFind');
  const btnExtract = $('btnExtract');
  const btnClear = $('btnClear');
  const btnCopy = $('btnCopy');

  const TECHS = Array.isArray(window.CA_W2_TECHS) ? window.CA_W2_TECHS : [];
  const POSTAL_PROV = (window.CA_POSTAL_PROV && typeof window.CA_POSTAL_PROV === 'object') ? window.CA_POSTAL_PROV : {};

  const API_BASE = String(window.API_BASE || '').replace(/\/$/, '');
  const ORS_ENDPOINT = API_BASE ? `${API_BASE}/api/canada/ors_matrix` : '';

  function setStatus(text, ok=true){
    status.textContent = text;
    status.style.borderColor = ok ? 'rgba(21,128,61,.35)' : 'rgba(180,83,9,.35)';
    status.style.color = ok ? '#166534' : '#b45309';
    status.style.background = ok ? 'rgba(22,101,52,.06)' : 'rgba(180,83,9,.06)';
  }

  // Canadian postal code regex (allow space): A1A 1A1
  const CA_POSTAL_RE = /\b([ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTVXY])\s*([0-9][ABCEGHJ-NPRSTVXY][0-9])\b/i;

  function normalizePostal(s){
    s = String(s || '').toUpperCase().trim();
    s = s.replace(/[^A-Z0-9]/g,'');
    if (s.length >= 6) s = s.slice(0,6);
    if (s.length !== 6) return '';
    if (!/^[A-Z]\d[A-Z]\d[A-Z]\d$/.test(s)) return '';
    return s;
  }

  function formatPostal(p6){
    const p = normalizePostal(p6);
    if (!p) return '';
    return p.slice(0,3) + ' ' + p.slice(3);
  }

  function extractPostalFromText(text){
    const t = String(text || '');
    const m = t.match(CA_POSTAL_RE);
    if (!m) return '';
    return normalizePostal(m[1] + m[2]);
  }

  function provFromFirstLetter(ch){
    const c = String(ch||'').toUpperCase();
    if (c === 'A') return 'NL';
    if (c === 'B') return 'NS';
    if (c === 'C') return 'PE';
    if (c === 'E') return 'NB';
    if (c === 'G' || c === 'H' || c === 'J') return 'QC';
    if (c === 'K' || c === 'L' || c === 'M' || c === 'N' || c === 'P') return 'ON';
    if (c === 'R') return 'MB';
    if (c === 'S') return 'SK';
    if (c === 'T') return 'AB';
    if (c === 'V') return 'BC';
    if (c === 'X') return 'NT';
    if (c === 'Y') return 'YT';
    return '';
  }

  const PROV_PENALTY = {
    QC: 5.40, ON: 6.00, BC: 8.00, AB: 7.00, MB: 6.50, SK: 6.50,
    NB: 5.80, NS: 5.80, PE: 5.80, NL: 6.20, YT: 8.50, NT: 9.00, NU: 9.50
  };

  const PROV_CENTER = {
    NL: {lat:47.5615, lon:-52.7126},
    NS: {lat:44.6488, lon:-63.5752},
    PE: {lat:46.2382, lon:-63.1311},
    NB: {lat:45.9636, lon:-66.6431},
    QC: {lat:45.5017, lon:-73.5673},
    ON: {lat:43.6532, lon:-79.3832},
    MB: {lat:49.8951, lon:-97.1384},
    SK: {lat:50.4452, lon:-104.6189},
    AB: {lat:53.5461, lon:-113.4938},
    BC: {lat:49.2827, lon:-123.1207},
    NT: {lat:62.4540, lon:-114.3718},
    NU: {lat:63.7467, lon:-68.5167},
    YT: {lat:60.7212, lon:-135.0568}
  };

  const CITY_COORD = {
    'FREDERICKTON|NB': {lat:45.9636, lon:-66.6431},
    'FREDERICTON|NB': {lat:45.9636, lon:-66.6431},
    'WINNIPEG|MB': {lat:49.8951, lon:-97.1384},
    'CALGARY|AB': {lat:51.0447, lon:-114.0719},
    'LAVAL|QC': {lat:45.6066, lon:-73.7124},
    'THORNHILL|ON': {lat:43.8106, lon:-79.4263},
    'EDMONTON|AB': {lat:53.5461, lon:-113.4938},
    'RICHMOND (VANCOUVER)|BC': {lat:49.1666, lon:-123.1336},
    'RICHMOND|BC': {lat:49.1666, lon:-123.1336},
    'SCARBOROUGH|ON': {lat:43.7764, lon:-79.2318}
  };

  const POSTAL_OVERRIDE = Object.create(null);
  for (const t of TECHS){
    const p = normalizePostal(t.postal);
    if (!p) continue;
    const key = (String(t.city||'').toUpperCase().trim() + '|' + String(t.province||'').toUpperCase().trim());
    const cc = CITY_COORD[key];
    if (cc) POSTAL_OVERRIDE[p] = cc;
  }

  function provForPostal(p6){
    const p = normalizePostal(p6);
    if (!p) return '';
    const prov = POSTAL_PROV[p];
    if (prov) return String(prov).toUpperCase();
    return provFromFirstLetter(p[0]);
  }

  function latLonForPostal(p6, cityHint, provHint){
    const p = normalizePostal(p6);
    if (!p) return null;

    const prov = (provHint ? String(provHint).toUpperCase().trim() : provForPostal(p));
    const city = cityHint ? String(cityHint).toUpperCase().trim() : '';

    if (POSTAL_OVERRIDE[p]){
      const c = POSTAL_OVERRIDE[p];
      return { lat: c.lat, lon: c.lon, prec: 'postal', prov, city };
    }

    if (city && prov){
      const k = city + '|' + prov;
      if (CITY_COORD[k]){
        const c = CITY_COORD[k];
        return { lat: c.lat, lon: c.lon, prec: 'city', prov, city };
      }
    }

    if (prov && PROV_CENTER[prov]){
      const c = PROV_CENTER[prov];
      return { lat: c.lat, lon: c.lon, prec: 'prov', prov, city: '' };
    }

    return null;
  }

  function haversineKm(a, b){
    const R = 6371;
    const toRad = (x)=>x * Math.PI / 180;
    const dLat = toRad(b.lat - a.lat);
    const dLon = toRad(b.lon - a.lon);
    const lat1 = toRad(a.lat);
    const lat2 = toRad(b.lat);

    const s = Math.sin(dLat/2)**2 + Math.cos(lat1)*Math.cos(lat2)*Math.sin(dLon/2)**2;
    const c = 2 * Math.asin(Math.min(1, Math.sqrt(s)));
    return R * c;
  }

  function clamp(x, lo, hi){
    x = Number(x);
    if (!isFinite(x)) return lo;
    return Math.max(lo, Math.min(hi, x));
  }

  function fmtNum(x, digits=1){
    if (!isFinite(x)) return '—';
    return Number(x).toFixed(digits);
  }

  function effectiveDriveFactor(base, ticketLL, techLL){
    let m = base;
    if (ticketLL && ticketLL.prec === 'prov'){
      const prov = ticketLL.prov || '';
      m *= (PROV_PENALTY[prov] || 6.0);
    }
    if (techLL && techLL.prec === 'prov'){
      m *= 1.8;
    }
    return clamp(m, 1, 12);
  }

  function etaFromKm(km, speed){
    if (!isFinite(km) || !isFinite(speed) || speed <= 0) return '—';
    const hours = km / speed;
    const h = Math.floor(hours);
    const m = Math.round((hours - h) * 60);
    if (h <= 0) return `${m} min`;
    return `${h}h ${m}m`;
  }

  function etaFromMinutes(min){
    if (!isFinite(min)) return '—';
    const total = Math.max(0, Math.round(Number(min)));
    const h = Math.floor(total / 60);
    const m = total % 60;
    if (h <= 0) return `${total} min`;
    return `${h}h ${m}m`;
  }

  async function postJson(url, body){
    const r = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    let j = null;
    const text = await r.text();
    try{ j = text ? JSON.parse(text) : null; }catch(e){}

    if (!r.ok){
      const msg = (j && j.error) ? j.error : `HTTP ${r.status}`;
      throw new Error(msg);
    }
    return j;
  }

  async function copyText(text){
    const t = String(text || '');
    if (!t) return;
    try{
      if (navigator.clipboard && window.isSecureContext){
        await navigator.clipboard.writeText(t);
        setStatus('Copied.', true);
        return;
      }
    }catch(e){}
    try{
      parent.postMessage({type:'COPY', text:t}, '*');
      setStatus('Copied (via hub).', true);
    }catch(e){
      setStatus('Copy failed. Try Ctrl+C.', false);
    }
  }

  function clearUI(){
    ticketText.value = '';
    postalInput.value = '';
    checkBox.value = '';
    resTitle.textContent = '—';
    resMeta.textContent = '—';
    kpiRow.style.display = 'none';
    topList.style.display = 'none';
    topList.innerHTML = '';
    setStatus('Ready', true);
  }

  function escapeHtml(s){
    return String(s ?? '').replace(/[&<>"']/g, (c)=>({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]));
  }

  function renderTopList(sorted, showDriving){
    const top = sorted.slice(0, Math.min(8, sorted.length));
    topList.innerHTML = '';
    for (const row of top){
      const div = document.createElement('div');
      div.className = 'item';

      const right = (showDriving && row.driveKm != null && row.driveMin != null)
        ? `
          <div><b>${escapeHtml(etaFromMinutes(row.driveMin))}</b></div>
          <div>${fmtNum(row.driveMiles,1)} mi</div>
          <div>${fmtNum(row.driveKm,1)} km</div>
        `
        : `
          <div><b>${fmtNum(row.miles,1)}</b> mi</div>
          <div>${fmtNum(row.km,1)} km</div>
        `;

      div.innerHTML = `
        <div class="left">
          <div class="name">${escapeHtml(row.tech.name)} <span class="muted">(#${escapeHtml(row.tech.tech_id)})</span></div>
          <div class="meta">${escapeHtml(row.tech.city)}, ${escapeHtml(row.tech.province)} • ${escapeHtml(formatPostal(row.tech.postal))}</div>
        </div>
        <div class="right">${right}</div>
      `;
      topList.appendChild(div);
    }
    topList.style.display = top.length ? 'grid' : 'none';
  }

  async function findClosest(){
    const baseFactor = Math.max(0.8, Math.min(5, parseFloat(driveFactor.value || '1.25') || 1.25));
    const speed = Math.max(20, Math.min(130, parseFloat(speedKmh.value || '80') || 80));

    let p = normalizePostal(postalInput.value);
    if (!p){
      p = extractPostalFromText(ticketText.value);
      if (p) postalInput.value = formatPostal(p);
    }

    if (!p){
      setStatus('No valid Canadian postal code found.', false);
      resTitle.textContent = '—';
      resMeta.textContent = 'Paste ticket or enter postal code.';
      kpiRow.style.display = 'none';
      topList.style.display = 'none';
      return;
    }

    const ticketLL = latLonForPostal(p, null, null);
    if (!ticketLL){
      setStatus('Unable to resolve location for ticket postal code.', false);
      return;
    }

    const scored = [];
    for (const tech of TECHS){
      const ll = latLonForPostal(tech.postal, tech.city, tech.province);
      if (!ll) continue;
      const km = haversineKm(ticketLL, ll);
      const miles = km * 0.621371;
      scored.push({tech, km, miles, ll, driveKm: null, driveMiles: null, driveMin: null});
    }

    if (!scored.length){
      setStatus('No tech locations available.', false);
      return;
    }

    scored.sort((a,b)=>a.km-b.km);

    // Try ORS driving first (accurate)
    let usedORS = false;
    let best = null;
    let listToRender = scored;

    if (ORS_ENDPOINT){
      const candidates = scored.slice(0, 25);
      try{
        setStatus('Calculating driving distance (ORS)…', true);
        const j = await postJson(ORS_ENDPOINT, {
          ticket_postal: p,
          tech_postals: candidates.map(x => x.tech.postal)
        });

        if (!j || !j.ok) throw new Error(j?.error || 'ORS routing failed');

        for (let i=0; i<candidates.length; i++){
          const dk = j.distances_km?.[i];
          const dm = j.durations_min?.[i];
          candidates[i].driveKm = (typeof dk === 'number' && isFinite(dk)) ? dk : null;
          candidates[i].driveMin = (typeof dm === 'number' && isFinite(dm)) ? dm : null;
          candidates[i].driveMiles = candidates[i].driveKm != null ? candidates[i].driveKm * 0.621371 : null;
        }

        candidates.sort((a,b)=>{
          const am = (a.driveMin != null) ? a.driveMin : 1e12;
          const bm = (b.driveMin != null) ? b.driveMin : 1e12;
          if (am !== bm) return am - bm;
          const ak = (a.driveKm != null) ? a.driveKm : 1e12;
          const bk = (b.driveKm != null) ? b.driveKm : 1e12;
          return ak - bk;
        });

        best = candidates.find(x=>x.driveKm!=null && x.driveMin!=null) || candidates[0];
        listToRender = candidates;
        usedORS = true;
      }catch(e){
        console.warn('ORS routing failed; using estimate:', e);
        usedORS = false;
      }
    }

    if (usedORS && best && best.driveKm != null){
      const eta = etaFromMinutes(best.driveMin);

      setStatus('Closest tech found (ORS driving).', true);
      resTitle.textContent = `${best.tech.name} (W2) — #${best.tech.tech_id}`;
      resMeta.textContent = `${best.tech.city}, ${best.tech.province} • ${formatPostal(best.tech.postal)} • Ticket: ${formatPostal(p)} • Mode: ORS driving`;

      milesEl.textContent = `${fmtNum(best.miles,1)} (drive ${fmtNum(best.driveMiles,1)})`;
      kmEl.textContent = `${fmtNum(best.km,1)}`;
      driveKmEl.textContent = `${fmtNum(best.driveKm,1)} (ORS)`;
      etaEl.textContent = eta;
      kpiRow.style.display = 'flex';

      checkBox.value = [
        `Check this:`,
        `Closest W2 Canada tech: ${best.tech.name} (#${best.tech.tech_id})`,
        `Location: ${best.tech.city}, ${best.tech.province} ${formatPostal(best.tech.postal)}`,
        `Ticket postal: ${formatPostal(p)}`,
        `Straight-line (Haversine): ${fmtNum(best.miles,1)} mi (${fmtNum(best.km,1)} km)`,
        `Driving (ORS): ${fmtNum(best.driveMiles,1)} mi (${fmtNum(best.driveKm,1)} km)`,
        `ETA (ORS): ~${eta}`
      ].join('\n');

      renderTopList(listToRender, true);
      return;
    }

    // Fallback: original estimate logic
    const best2 = scored[0];
    const effFactor = effectiveDriveFactor(baseFactor, ticketLL, best2.ll);

    const driveKm = best2.km * effFactor;
    const driveMi = best2.miles * effFactor;
    const eta = etaFromKm(driveKm, speed);

    setStatus('Closest tech found (estimate).', true);
    resTitle.textContent = `${best2.tech.name} (W2) — #${best2.tech.tech_id}`;
    resMeta.textContent = `${best2.tech.city}, ${best2.tech.province} • ${formatPostal(best2.tech.postal)} • Ticket: ${formatPostal(p)} • Mode: estimate`;

    milesEl.textContent = `${fmtNum(best2.miles,1)} (drive ${fmtNum(driveMi,1)})`;
    kmEl.textContent = `${fmtNum(best2.km,1)}`;
    driveKmEl.textContent = `${fmtNum(driveKm,1)} (factor ${fmtNum(effFactor,2)})`;
    etaEl.textContent = eta;
    kpiRow.style.display = 'flex';

    checkBox.value = [
      `Check this:`,
      `Closest W2 Canada tech: ${best2.tech.name} (#${best2.tech.tech_id})`,
      `Location: ${best2.tech.city}, ${best2.tech.province} ${formatPostal(best2.tech.postal)}`,
      `Ticket postal: ${formatPostal(p)}`,
      `Distance (Haversine): ${fmtNum(best2.miles,1)} mi (${fmtNum(best2.km,1)} km)`,
      `Driving-adjusted: ${fmtNum(driveMi,1)} mi (${fmtNum(driveKm,1)} km) [factor ${fmtNum(effFactor,2)}]`,
      `ETA: ~${eta} @ ${speed} km/h`
    ].join('\n');

    renderTopList(scored, false);
  }

  btnFind.addEventListener('click', ()=>{ findClosest(); });

  btnExtract.addEventListener('click', ()=>{
    const p = extractPostalFromText(ticketText.value);
    if (!p){
      setStatus('No postal code found in ticket text.', false);
      return;
    }
    postalInput.value = formatPostal(p);
    setStatus('Postal extracted from ticket.', true);
  });

  btnClear.addEventListener('click', clearUI);
  btnCopy.addEventListener('click', ()=>copyText(checkBox.value));

  let tmo = null;
  ticketText.addEventListener('input', ()=>{
    if (tmo) clearTimeout(tmo);
    tmo = setTimeout(()=>{
      const p = extractPostalFromText(ticketText.value);
      if (p && !normalizePostal(postalInput.value)){
        postalInput.value = formatPostal(p);
        setStatus('Postal auto-detected from ticket.', true);
      }
    }, 250);
  });

  setStatus('Ready', true);
})();
