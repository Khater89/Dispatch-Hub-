

    if (window.__xlsxFail || typeof XLSX === 'undefined') {
      document.write('<scr'+'ipt src="https://unpkg.com/xlsx-js-style@1.2.0/dist/xlsx.bundle.js"><\/scr'+'ipt>');
    }
  


    if (window.__chartFail || typeof Chart === 'undefined') {
      document.write('<scr'+'ipt src="https://unpkg.com/chart.js@4.4.2/dist/chart.umd.min.js"><\/scr'+'ipt>');
    }
  


    if (window.__jsPDFFail || typeof window.jspdf === 'undefined') {
      document.write('<scr'+'ipt src="https://unpkg.com/jspdf@2.5.1/dist/jspdf.umd.min.js"><\/scr'+'ipt>');
    }
  


    if (window.__h2cFail || typeof html2canvas === 'undefined') {
      document.write('<scr'+'ipt src="https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"><\/scr'+'ipt>');
    }
  

    /* Defeat Chrome autofill / address suggestions on all inputs */
    (function(){
      function killAutofill(){
        var inputs = document.querySelectorAll('input');
        inputs.forEach(function(el){
          var t = (el.type||'text').toLowerCase();
          if(['file','radio','checkbox','submit','button','hidden','reset'].indexOf(t)===-1){
            if(t!=='date'&&t!=='number'){
              el.setAttribute('autocomplete','new-password');
            }
            /* readonly trick: Chrome won't show suggestions on readonly fields */
            if(!el.readOnly && !el.disabled){
              el.setAttribute('readonly','');
              el.addEventListener('focus',function(){
                this.removeAttribute('readonly');
              },{once:false});
              el.addEventListener('blur',function(){
                this.setAttribute('readonly','');
              });
            }
          }
        });
      }
      if(document.readyState==='loading'){
        document.addEventListener('DOMContentLoaded',killAutofill);
      } else {
        killAutofill();
      }
      /* Also run after any dynamic content might be added */
      setTimeout(killAutofill, 500);
      setTimeout(killAutofill, 1500);
    })();
  

'use strict';

/* ═══ STATE ═══════════════════════════════════════════════════ */
const S={raw:[],filtered:[],fileMeta:null,charts:{pie:null,bar:null,typ:null}};

/* ═══ DOM ══════════════════════════════════════════════════════ */
const $=id=>document.getElementById(id);
const E={
  ban:$('ban'),dbg:$('dbg'),dbgMsg:$('dbgMsg'),dbgStk:$('dbgStack'),
  dz:$('dropzone'),fi:$('fileInput'),
  dash:$('dash'),sg:$('sgrid'),pb:$('pbar'),pl:$('plbl'),
  // Keep both aliases: older code uses E.tb, multi-file code uses E.tbp.
  tb:$('tbp'),tbp:$('tbp'),tbl:$('tbl'),tbody:$('tbody'),
  srch:$('srch'),typeF:$('typeF'),statF:$('statF'),specD:$('specD'),fromD:$('fromD'),toD:$('toD'),
  stag:$('stag'),
};

/* ═══ BANNER / DEBUG ══════════════════════════════════════════ */
function showBan(msg,type='err'){
  E.ban.textContent=msg;
  E.ban.className=type==='warn'?'s w':'s';
}
function hideBan(){E.ban.className='';}
function showDbg(msg,stack){
  E.dbgMsg.textContent=msg;
  $('dbgStack').textContent=stack||'';
  E.dbg.classList.remove('h');
}

/* ═══ LIB CHECK ═══════════════════════════════════════════════ */
function libsOk(){
  const m=[];
  if(typeof XLSX==='undefined') m.push('SheetJS (xlsx)');
  if(typeof Chart==='undefined') m.push('Chart.js');
  if(m.length){showBan(`Libraries failed to load: ${m.join(', ')}. Check internet connection and refresh.`);return false;}
  return true;
}

/* ═══ DATE UTILITIES ══════════════════════════════════════════
   FIX: raw:true keeps dates as Excel serial numbers.
   We decode them ourselves with UTC math → no timezone offset.
   ════════════════════════════════════════════════════════════ */
function p2(n){return String(n).padStart(2,'0');}
function hhmmFromParts(h, m, sec=0, ms=0){
  // Round to nearest minute to prevent Excel/JS precision issues like 09:00 showing as 08:59.
  let total = (Number(h)||0)*60 + (Number(m)||0);
  const seconds = (Number(sec)||0) + (Number(ms)||0)/1000;
  if(seconds >= 30) total += 1;
  total = ((total % 1440) + 1440) % 1440;
  return `${p2(Math.floor(total/60))}:${p2(total%60)}`;
}
function fd(y,m,d){return `${y}-${p2(m)}-${p2(d)}`;}
function fdL(dt){return fd(dt.getFullYear(),dt.getMonth()+1,dt.getDate());}
function fdU(dt){return fd(dt.getUTCFullYear(),dt.getUTCMonth()+1,dt.getUTCDate());}

/*
  Excel serial date → YYYY-MM-DD (UTC, no timezone shift)
  Epoch: serial 1 = Jan 1 1900 in UTC
  serial 60 = fake Feb 29 1900 (Excel bug) → we subtract 1 for serials ≥ 60
*/
function serial2date(v){
  if(typeof v!=='number'||!Number.isFinite(v)||v<1) return '';
  const adj=Math.floor(v)>=60?Math.floor(v)-1:Math.floor(v);
  const ms=Date.UTC(1899,11,31)+adj*86400000;
  return fdU(new Date(ms));
}

function parseDatePart(v){
  if(v===null||v===undefined||v==='') return '';
  if(typeof v==='number'&&Number.isFinite(v)) return serial2date(v);
  if(v instanceof Date) return fdL(v);
  const t=String(v).trim().replace(/\s+/g,' ');
  if(!t) return '';
  const iso=t.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if(iso) return fd(iso[1],iso[2],iso[3]);
  const sl=t.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if(sl){let y=sl[3];if(y.length===2)y='20'+y;const a=+sl[1],b=+sl[2];return fd(y,a>12?b:a,a>12?a:b);}
  const wd=t.match(/^([A-Za-z]{3,9})\s+(\d{1,2}),?\s*(\d{4})$/);
  if(wd){const dt=new Date(t);return isNaN(dt.getTime())?t:fdL(dt);}
  return t;
}

function parseTimePart(v){
  if(v===null||v===undefined||v==='') return '';
  if(v instanceof Date) return hhmmFromParts(v.getHours(), v.getMinutes(), v.getSeconds(), v.getMilliseconds());
  if(typeof v==='number'&&Number.isFinite(v)){
    let frac = v % 1; if(frac < 0) frac += 1;
    const tot=Math.round(frac*24*60);
    return `${p2(Math.floor(tot/60)%24)}:${p2(tot%60)}`;
  }
  if(typeof v==='string'){
    const t=v.trim().toUpperCase();
    const ap=t.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM)$/);
    if(ap){let h=+ap[1];const mn=+ap[2],sec=+(ap[3]||0),ms=+(ap[4]||0),ampm=ap[5];if(ampm==='PM'&&h<12)h+=12;if(ampm==='AM'&&h===12)h=0;return hhmmFromParts(h,mn,sec,ms);}
    const pl=t.match(/(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?/);
    if(pl) return hhmmFromParts(+pl[1], +pl[2], +(pl[3]||0), +(pl[4]||0));
  }
  return String(v).trim();
}

/* ═══ VALIDATION LOGIC ════════════════════════════════════════ */
function norm(v){return(v??'').toString().trim().replace(/\s+/g,' ');}
function normU(v){return norm(v).toUpperCase();}
function esc(v){return String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');}
function defTrk(){return{correctedMarked:false,correctedAt:''};}
function nowStr(){return new Date().toLocaleString();}

function recomp(row){
  const sOk=normU(row.ieFnStatus)==='OK';
  const hD=!!(row.ieDueDate&&row.fnSD);
  const hT=!!(row.ieDueTime&&row.fnST);
  const hN=!!(row.ieFEN||row.fnFEN);
  const rdOk=!hD?true:row.ieDueDate===row.fnSD;
  const rtOk=!hT?true:row.ieDueTime===row.fnST;
  const dExc=!rdOk&&row.type==='ITD';
  const tExc=!rtOk&&(row.type==='ITD'||row.type==='ITR');
  const dVal=!hD?true:(rdOk||dExc);
  const tVal=!hT?true:(rtOk||tExc);
  const nVal=!hN?true:((typeof mfFirstLastNameMatch==='function') ? mfFirstLastNameMatch(row.ieFEN,row.fnFEN) : normU(row.ieFEN)===normU(row.fnFEN));
  row.sOk=sOk;row.dVal=dVal;row.tVal=tVal;row.nVal=nVal;
  row.dExc=dExc;row.tExc=tExc;
  row.excA=dExc||tExc;
  row.excT=[dExc?'ITD-Date':'',tExc?`${row.type}-Time`:''].filter(Boolean).join(', ');
  const errs=[!sOk?'Status≠OK':'',!dVal?'DueDate≠FNDate':'',!tVal?'DueTime≠FNTime':'',!nVal?'IEName≠FNName':''].filter(Boolean);
  row.vRes=errs.length?'Error':'Matched';
  row.bDet=errs.length?errs.join('; '):(row.excA?`Matched via ${row.excT}`:'All checks passed');
  if(row.vRes==='Error'&&row.trk.correctedMarked){
    row.fRes='Corrected';row.det=`${row.bDet}; Corrected by user`;row.note=`Corrected on ${row.trk.correctedAt}`;
  } else {
    row.fRes=row.vRes;row.det=row.bDet;row.note=row.trk.correctedMarked?`Corrected on ${row.trk.correctedAt}`:'Pending';
  }
  if(row.excA&&!row.det.includes(row.excT)) row.det+=`; ${row.excT}`;
}

/* ═══ PARSE WORKBOOK ══════════════════════════════════════════
   KEY FIX: raw:true → numeric cells stay as numbers.
   We parse them manually. This prevents timezone-induced date shifts.
   ════════════════════════════════════════════════════════════ */
function parseSheet(rows){
  const out=[];
  for(let i=2;i<rows.length;i++){
    const r=rows[i]||[];
    const ticket=r[0];if(!ticket) continue;
    if(normU(r[12])!=='FIELD NATION') continue;
    const fnD=parseDatePart(r[20]),ieD=parseDatePart(r[7]);
    const row={
      rowId:`r${i}`,srcRow:i+1,ticket,type:normU(r[5]),company:norm(r[12]),
      ieFnStatus:norm(r[26]),ieFEN:norm(r[13]),fnFEN:norm(r[23]),
      ieDueDate:ieD,ieDueTime:parseTimePart(r[8]),
      ieSD:parseDatePart(r[9]),ieST:parseTimePart(r[10]),
      fnSD:fnD,fnST:parseTimePart(r[21]),fnStatus:norm(r[16]),
      filterDate:fnD||ieD||'',trk:defTrk(),
    };
    recomp(row);out.push(row);
  }
  return out;
}

function handleWB(file){
  if(!libsOk()) return;
  hideBan();
  S.fileMeta={name:file.name,size:file.size,lastModified:file.lastModified};
  const rd=new FileReader();
  rd.onload=ev=>{
    try{
      if(typeof XLSX==='undefined') throw new Error('SheetJS not available');
      const wb=XLSX.read(new Uint8Array(ev.target.result),{
        type:'array',
        cellDates:false,  // CRITICAL: keep as serial numbers
        cellNF:false,
        cellText:false,
      });
      const sn=wb.SheetNames.includes('Report')?'Report':wb.SheetNames[0];
      if(!sn) throw new Error('No sheets found in workbook');
      const rows=XLSX.utils.sheet_to_json(wb.Sheets[sn],{
        header:1,
        raw:true,         // CRITICAL: raw numbers, not formatted strings
        defval:'',
      });
      if(!rows||rows.length<3) throw new Error('Sheet is empty or has fewer than 3 rows');
      S.raw=parseSheet(rows);
      if(!S.raw.length){
        showBan('No Field Nation rows found. Verify: sheet name is "Report", Assigned Company column = "Field Nation".');
        return;
      }
      popTypes();loadState();
      ['dash','tbp','tbl'].forEach(id=>$(id).classList.remove('h'));
      applyFilters();
    } catch(err){
      console.error('[VRA]',err);
      showBan(`File processing failed: ${err.message}`);
      showDbg(`Failed to process "${file.name}": ${err.message}`,err.stack||String(err));
    }
  };
  rd.onerror=()=>{showBan('File could not be read. Try another browser or file.');showDbg('FileReader.onerror','');};
  rd.readAsArrayBuffer(file);
}

/* ═══ FILTERS ═════════════════════════════════════════════════ */
function popTypes(){
  const cur=E.typeF.value||'all';
  const ts=[...new Set(S.raw.map(r=>r.type).filter(Boolean))].sort();
  E.typeF.innerHTML='<option value="all">All Types</option>'+ts.map(t=>`<option value="${esc(t)}">${esc(t)}</option>`).join('');
  E.typeF.value=ts.includes(cur)?cur:'all';
}
function applyFilters(){
  const q=norm(E.srch.value).toLowerCase(),type=E.typeF.value,sp=E.specD.value,fr=E.fromD.value,to=E.toD.value,st=E.statF.value;
  S.filtered=S.raw.filter(r=>{
    if(q&&!`${r.ticket} ${r.ieFEN} ${r.fnFEN}`.toLowerCase().includes(q)) return false;
    if(type!=='all'&&r.type!==type) return false;
    const d=r.filterDate||'';
    if(sp&&d!==sp) return false;
    if(fr&&d&&d<fr) return false;
    if(to&&d&&d>to) return false;
    if(st==='errors'&&r.fRes!=='Error') return false;
    if(st==='corrected'&&r.fRes!=='Corrected') return false;
    if(st==='matched'&&r.fRes!=='Matched') return false;
    if(st==='exception'&&!(r.excA&&r.fRes==='Matched')) return false;
    return true;
  });
  renderStats(S.filtered);renderCharts(S.filtered);renderTable(S.filtered);
  E.stag.textContent=`${S.filtered.length} of ${S.raw.length} tickets`;
  saveState();
}
function clearF(){
  [E.srch,E.specD,E.fromD,E.toD].forEach(e=>{e.value='';});
  E.typeF.value='all';E.statF.value='all';applyFilters();
}

/* ═══ STATS ═══════════════════════════════════════════════════ */
function calcStats(rows){
  const n=rows.length,m=rows.filter(r=>r.fRes==='Matched').length,c=rows.filter(r=>r.fRes==='Corrected').length,
        e=rows.filter(r=>r.fRes==='Error').length,x=rows.filter(r=>r.excA).length,
        cp=n?(((m+c)/n)*100).toFixed(1):'0.0',
        se=rows.filter(r=>!r.sOk).length,de=rows.filter(r=>!r.dVal).length,
        te=rows.filter(r=>!r.tVal).length,ne=rows.filter(r=>!r.nVal).length;
  return{n,m,c,e,x,cp,se,de,te,ne};
}
/* Detect if any UI filter is currently active */
function hasActiveFilters(){
  return !!(
    (E.srch.value||'').trim() ||
    (E.typeF.value && E.typeF.value!=='all') ||
    (E.statF.value && E.statF.value!=='all') ||
    E.specD.value || E.fromD.value || E.toD.value
  );
}
function activeFilterSummary(){
  const parts=[];
  const q=(E.srch.value||'').trim();
  if(q) parts.push(`Search: "${q}"`);
  if(E.typeF.value && E.typeF.value!=='all') parts.push(`Type: ${E.typeF.value}`);
  if(E.statF.value && E.statF.value!=='all') parts.push(`Status: ${E.statF.value}`);
  if(E.specD.value) parts.push(`Date: ${E.specD.value}`);
  else if(E.fromD.value && E.toD.value) parts.push(`${E.fromD.value} → ${E.toD.value}`);
  else if(E.fromD.value) parts.push(`From ${E.fromD.value}`);
  else if(E.toD.value) parts.push(`Up to ${E.toD.value}`);
  return parts.length ? parts.join(' · ') : 'All Data (no filters)';
}

function renderStats(rows){
  const active = hasActiveFilters();
  const badge = active ? `<span class="filter-active-badge">Filtered</span>` : '';
  if(!rows.length){
    const hasData = S.raw.length > 0;
    E.sg.innerHTML = `
      <div class="empty-audit-state">
        <div class="empty-audit-icon">${hasData ? '🔍' : '📂'}</div>
        <div class="empty-audit-title">
          ${hasData ? 'No records match the current filters' : 'No data loaded yet'}
          ${badge}
        </div>
        <div class="empty-audit-sub">
          ${hasData
            ? `All statistics below are zero because no tickets in the dataset of <strong>${S.raw.length}</strong> match: <em>${esc(activeFilterSummary())}</em>. Clear or adjust the filters to see results.`
            : 'Upload an Excel file (Single Workbook) or use Multi-File Validation to populate the audit dashboard.'}
        </div>
        ${hasData ? '<button class="empty-audit-btn" id="empClearBtn">✕ Clear All Filters</button>' : ''}
      </div>`;
    const btn = document.getElementById('empClearBtn');
    if(btn) btn.addEventListener('click', clearF);
    E.pb.style.width='0%'; E.pl.textContent='0%';
    return;
  }
  const s=calcStats(rows);
  E.sg.innerHTML=`
    <div class="sc st"><div class="slb">Tickets ${badge}</div><div class="svl">${s.n}</div>${active?`<div class="ssb">of ${S.raw.length} total</div>`:''}</div>
    <div class="sc sm"><div class="slb">Matched</div><div class="svl">${s.m}</div></div>
    <div class="sc scr"><div class="slb">Corrected</div><div class="svl">${s.c}</div></div>
    <div class="sc se"><div class="slb">Open Errors</div><div class="svl">${s.e}</div></div>
    <div class="sc sx"><div class="slb">Exceptions</div><div class="svl">${s.x}</div></div>
    <div class="sc sr"><div class="slb">Completion</div><div class="svl">${s.cp}%</div><div class="ssb">matched+corrected</div></div>
    <div class="sc"><div class="slb">Status Errs</div><div class="svl" style="font-size:22px;color:var(--err-text)">${s.se}</div></div>
    <div class="sc"><div class="slb">Date Errs</div><div class="svl" style="font-size:22px;color:var(--err-text)">${s.de}</div></div>
    <div class="sc"><div class="slb">Time Errs</div><div class="svl" style="font-size:22px;color:var(--err-text)">${s.te}</div></div>
    <div class="sc"><div class="slb">Name Errs</div><div class="svl" style="font-size:22px;color:var(--err-text)">${s.ne}</div></div>`;
  E.pb.style.width=`${parseFloat(s.cp)}%`;E.pl.textContent=`${s.cp}%`;
}

/* ═══ CHARTS ══════════════════════════════════════════════════ */
const CC={m:'#22c55e',c:'#8b5cf6',e:'#ef4444',x:'#f59e0b',s:'#f97316',d:'#3b82f6',t:'#6366f1',n:'#ec4899'};
const TC=['#3b82f6','#f97316','#8b5cf6','#22c55e','#f59e0b','#ec4899','#06b6d4','#84cc16'];
function dstC(k){if(S.charts[k]){S.charts[k].destroy();S.charts[k]=null;}}
function renderCharts(rows){
  if(typeof Chart==='undefined') return;
  dstC('pie'); dstC('bar'); dstC('typ');
  if(!rows.length){
    ['cPie','cBar','cType'].forEach(id=>{
      const c=$(id); if(!c) return;
      const parent=c.parentElement;
      const w=(parent&&parent.clientWidth)||c.clientWidth||300;
      const h=(parent&&parent.clientHeight)||c.clientHeight||200;
      c.width=w; c.height=h;
      const ctx=c.getContext('2d');
      ctx.clearRect(0,0,w,h);
      ctx.save();
      ctx.fillStyle='#94a3b8';
      ctx.textAlign='center';
      ctx.textBaseline='middle';
      ctx.font='26px "Space Grotesk", sans-serif';
      ctx.fillText('📭', w/2, h/2 - 14);
      ctx.font='600 12px "Space Grotesk", sans-serif';
      ctx.fillText('No data for current filters', w/2, h/2 + 14);
      ctx.restore();
    });
    return;
  }
  const s=calcStats(rows);
  S.charts.pie=new Chart($('cPie'),{type:'doughnut',
    data:{labels:['Matched','Corrected','Errors','Exceptions'],
      datasets:[{data:[s.m,s.c,s.e,s.x],backgroundColor:[CC.m,CC.c,CC.e,CC.x],borderWidth:2,borderColor:'#fff'}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{position:'right',labels:{font:{family:'Space Grotesk',size:11},padding:10}}}}});
  S.charts.bar=new Chart($('cBar'),{type:'bar',
    data:{labels:['Status','Date','Time','Name'],
      datasets:[{label:'Errors',data:[s.se,s.de,s.te,s.ne],backgroundColor:[CC.s,CC.d,CC.t,CC.n],borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{y:{beginAtZero:true,ticks:{font:{family:'Space Grotesk'}}},x:{ticks:{font:{family:'Space Grotesk'}}}}}});
  const tc={};rows.forEach(r=>{const k=r.type||'Unknown';tc[k]=(tc[k]||0)+1;});
  const tl=Object.keys(tc).sort();
  S.charts.typ=new Chart($('cType'),{type:'bar',
    data:{labels:tl,datasets:[{label:'Tickets',data:tl.map(t=>tc[t]),backgroundColor:tl.map((_,i)=>TC[i%TC.length]),borderRadius:5}]},
    options:{responsive:true,maintainAspectRatio:false,plugins:{legend:{display:false}},
      scales:{y:{beginAtZero:true,ticks:{font:{family:'Space Grotesk'}}},x:{ticks:{font:{family:'Space Grotesk',size:10}}}}}});
}

/* ═══ TABLE ═══════════════════════════════════════════════════ */
function pill(cls,lbl){return `<span class="pill ${cls}"><span class="pdot"></span>${esc(lbl)}</span>`;}
function rPill(r){
  if(r.fRes==='Corrected') return pill('co','Corrected');
  if(r.fRes==='Error')     return pill('er','Error');
  if(r.excA)               return pill('wn','Exception');
  return pill('ok','Matched');
}
function mc(v,ex){return(!v&&!ex)?'mm':'';}
function renderTable(rows){
  if(!rows.length){E.tbody.innerHTML=`<tr><td colspan="23" class="emp">No rows match the current filters.</td></tr>`;return;}
  E.tbody.innerHTML=rows.map(r=>{
    const rc=r.fRes==='Corrected'?'rc':r.fRes==='Error'?'re':r.excA?'rx':'rm';
    const act=r.fRes==='Corrected'
      ?`<button class="abtn dn" disabled>✓ Corrected</button>`
      :r.vRes==='Error'
      ?`<button class="abtn mk" data-cid="${esc(r.rowId)}">Correct</button>`
      :`<span style="color:var(--text3)">—</span>`;
    return `<tr class="${rc}">
      <td class="mn" style="color:var(--text3)">${esc(r.srcRow)}</td>
      <td><strong>${esc(r.ticket)}</strong></td>
      <td>${esc(r.type)}</td>
      <td style="font-size:11px;color:var(--text2)">${esc(r.company)}</td>
      <td class="mn">${esc(r.filterDate)}</td>
      <td class="${r.sOk?'':'mm'}">${esc(r.ieFnStatus)}</td>
      <td class="${mc(r.nVal,false)}">${esc(r.ieFEN)}</td>
      <td class="mn ${mc(r.dVal,r.dExc)}">${esc(r.ieDueDate)}</td>
      <td class="mn ${mc(r.tVal,r.tExc)}">${esc(r.ieDueTime)}</td>
      <td class="mn" style="color:var(--text2)">${esc([r.ieSD,r.ieST].filter(Boolean).join(' '))}</td>
      <td style="font-size:11px">${esc(r.fnStatus)}</td>
      <td class="${mc(r.nVal,false)}">${esc(r.fnFEN)}</td>
      <td class="mn ${mc(r.dVal,r.dExc)}">${esc(r.fnSD)}</td>
      <td class="mn ${mc(r.tVal,r.tExc)}">${esc(r.fnST)}</td>
      <td>${r.sOk?pill('ok','OK'):pill('er','Error')}</td>
      <td>${r.dVal?pill(r.dExc?'wn':'ok',r.dExc?'ITD':'OK'):pill('er','Error')}</td>
      <td>${r.tVal?pill(r.tExc?'wn':'ok',r.tExc?r.type:'OK'):pill('er','Error')}</td>
      <td>${r.nVal?pill('ok','OK'):pill('er','Error')}</td>
      <td>${r.excA?pill('wn',r.excT):'<span style="color:var(--text3);font-size:11px">—</span>'}</td>
      <td>${rPill(r)}</td>
      <td class="dcl2">${esc(r.det)}</td>
      <td class="ncl">${esc(r.note)}</td>
      <td>${act}</td>
    </tr>`;
  }).join('');
}

/* ═══ CORRECTION ══════════════════════════════════════════════ */
function markCorrected(id){
  const r=S.raw.find(x=>x.rowId===id);
  if(!r||r.vRes!=='Error'||r.trk.correctedMarked) return;
  r.trk.correctedMarked=true;r.trk.correctedAt=nowStr();
  recomp(r);saveState();applyFilters();
}

/* ═══ PERSISTENCE ═════════════════════════════════════════════ */
function sKey(){if(!S.fileMeta)return null;return `vra3:${S.fileMeta.name}:${S.fileMeta.size}:${S.fileMeta.lastModified}`;}
function saveState(){
  const k=sKey();if(!k)return;
  try{localStorage.setItem(k,JSON.stringify({
    f:{q:E.srch.value||'',t:E.typeF.value||'all',sp:E.specD.value||'',fr:E.fromD.value||'',to:E.toD.value||'',st:E.statF.value||'all'},
    trk:S.raw.reduce((a,r)=>{if(r.trk.correctedMarked)a[r.rowId]=r.trk;return a;},{}),
  }));}catch(_){}
}
function loadState(){
  const k=sKey();if(!k)return;
  try{
    const raw=localStorage.getItem(k);if(!raw)return;
    const p=JSON.parse(raw);
    S.raw.forEach(r=>{r.trk=p.trk?.[r.rowId]?{...defTrk(),...p.trk[r.rowId]}:defTrk();recomp(r);});
    E.srch.value=p.f?.q||'';E.typeF.value=p.f?.t||'all';E.specD.value=p.f?.sp||'';
    E.fromD.value=p.f?.fr||'';E.toD.value=p.f?.to||'';E.statF.value=p.f?.st||'all';
  }catch(_){}
}

/* ═══ EXPORT — MANAGEMENT PDF ════════════════════════════════
   Uses jsPDF (text/shapes) + html2canvas (chart snapshots).
   Produces a corporate A4 PDF with:
     • Header bar with gradient branding
     • Executive KPI cards
     • Pie + Bar chart images
     • Anomaly details table (errors + corrected rows)
     • Footer with timestamp and filter context
   ════════════════════════════════════════════════════════════ */

function stamp(){const n=new Date();return `${n.getFullYear()}${p2(n.getMonth()+1)}${p2(n.getDate())}_${p2(n.getHours())}${p2(n.getMinutes())}`;}
function dl(blob,name){const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),500);}

/* Capture a chart canvas → base64 PNG at 2× resolution */
async function captureChart(canvasId){
  const canvas=document.getElementById(canvasId);
  if(!canvas) return null;
  try{
    const img=await html2canvas(canvas,{scale:2,backgroundColor:'#ffffff',useCORS:true,logging:false});
    return img.toDataURL('image/png');
  }catch(_){ return null; }
}

/* Draw a rounded rectangle (jsPDF helper) */
function roundRect(doc,x,y,w,h,r,fill,stroke){
  doc.roundedRect(x,y,w,h,r,r,fill&&stroke?'FD':fill?'F':stroke?'D':'S');
}

async function exportPDF(){
  if(!S.raw.length){ showBan('Upload a file first.'); return; }
  if(typeof window.jspdf==='undefined'&&typeof jsPDF==='undefined'){
    showBan('PDF library (jsPDF) failed to load. Check internet connection and refresh.');return;
  }

  // Show loading spinner
  $('pdfOverlay').classList.remove('h');

  try{
    await new Promise(r=>setTimeout(r,50)); // allow overlay to paint

    const { jsPDF } = window.jspdf||{jsPDF:window.jsPDF};
    const doc = new jsPDF({ orientation:'portrait', unit:'mm', format:'a4' });
    const PW=210, PH=297; // A4
    const M=14;  // margin
    const CW=PW-M*2; // content width

    // ── STATS LOGIC ────────────────────────────────────────
    // ── STATS LOGIC (Audit Tab spec) ───────────────────────
    // filteredRows = currently filtered dataset (same as on-screen)
    //                → single source of truth for ALL KPIs, cards, charts
    const filteredRows = S.filtered;
    const fullDataset  = S.raw;

    const sv = calcStats(filteredRows);
    const sa = calcStats(fullDataset);
    const now   = new Date().toLocaleString();
    const fname = S.fileMeta?.name || 'Unknown File';

    const sp=E.specD.value, fr=E.fromD.value, to=E.toD.value;
    const hasAnyFilter = hasActiveFilters();
    const filterLabel = activeFilterSummary();

    let periodLabel='All Dates';
    if(sp) periodLabel=`Date: ${sp}`;
    else if(fr&&to) periodLabel=`${fr}  →  ${to}`;
    else if(fr) periodLabel=`From ${fr}`;
    else if(to) periodLabel=`Up to ${to}`;

    // ── COLOUR PALETTE ──────────────────────────────────────
    const C={
      fnOrange:[249,115,22],
      ieBlue:[59,130,246],
      dark:[15,23,42],
      mid:[71,85,105],
      light:[148,163,184],
      border:[226,232,240],
      bg:[248,250,252],
      white:[255,255,255],
      ok:[34,197,94],
      err:[239,68,68],
      warn:[245,158,11],
      cor:[139,92,246],
    };
    const rgb=(arr)=>({r:arr[0],g:arr[1],b:arr[2]});

    let Y=0; // current Y cursor

    // ══════════════════════════════════════════════════════
    //  PAGE 1: EXECUTIVE SUMMARY
    // ══════════════════════════════════════════════════════

    // ── HEADER BAR ──────────────────────────────────────
    // Gradient simulation: two rects blended
    doc.setFillColor(...C.dark);
    doc.rect(0,0,PW,28,'F');

    // Orange accent strip (left)
    doc.setFillColor(...C.fnOrange);
    doc.rect(0,0,6,28,'F');

    // Logo text
    doc.setTextColor(...C.white);
    doc.setFont('helvetica','bold');
    doc.setFontSize(16);
    doc.text('Data Validation & Audit Summary',M+2,11);

    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.light);
    doc.text('Field Nation  ×  Internal Entity — Management Report',M+2,17.5);
    doc.text(`Generated: ${now}  |  Period: ${periodLabel}  |  Source: ${fname}`,M+2,22.5);

    // IE / FN badges (top right)
    const bx=PW-M-52;
    doc.setFillColor(...C.ieBlue);
    doc.roundedRect(bx,6,24,8,2,2,'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7);
    doc.text('IE = BLUE',bx+3.5,11.2);

    doc.setFillColor(...C.fnOrange);
    doc.roundedRect(bx+26,6,26,8,2,2,'F');
    doc.text('FN = ORANGE',bx+29,11.2);

    Y=34;

    // ── SECTION TITLE ─────────────────────────────────
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.mid);
    doc.text('EXECUTIVE DASHBOARD — KEY PERFORMANCE INDICATORS',M,Y);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.3);
    doc.line(M,Y+1.5,PW-M,Y+1.5);
    Y+=7;

    // ── KPI CARDS ─────────────────────────────────────
    // 6 cards in 2 rows × 3 cols
    const KW=(CW-8)/3, KH=20;
    const periodSub = hasAnyFilter ? `filtered · ${filteredRows.length} of ${fullDataset.length}` : 'all tickets';
    const kpis=[
      { label:'Total Tickets Audited', value:sv.n,       sub:periodSub,             color:C.dark },
      { label:'Accuracy Rate',         value:`${sv.cp}%`, sub:'matched + corrected', color:C.ieBlue },
      { label:'Manual Corrections',    value:sv.c,        sub:'marked as corrected', color:C.cor },
      { label:'Open Errors',           value:sv.e,        sub:'pending resolution',  color:C.err },
      { label:'ITD/ITR Exceptions',    value:sv.x,        sub:'auto-approved',       color:C.warn },
      { label:'Matched (Clean)',        value:sv.m,        sub:'no issues found',     color:C.ok },
    ];

    kpis.forEach((k,i)=>{
      const col=i%3, row=Math.floor(i/3);
      const kx=M+col*(KW+4), ky=Y+row*(KH+4);
      // card bg
      doc.setFillColor(...C.white);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(kx,ky,KW,KH,2,2,'FD');
      // left accent bar
      doc.setFillColor(...k.color);
      doc.roundedRect(kx,ky,3,KH,1,1,'F');
      // value
      doc.setFont('helvetica','bold');
      doc.setFontSize(16);
      doc.setTextColor(...k.color);
      doc.text(String(k.value),kx+6,ky+11);
      // label
      doc.setFont('helvetica','bold');
      doc.setFontSize(7);
      doc.setTextColor(...C.dark);
      doc.text(k.label.toUpperCase(),kx+6,ky+15.5);
      // sub
      doc.setFont('helvetica','normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.light);
      doc.text(k.sub,kx+6,ky+18.5);
    });

    Y+=2*(KH+4)+6;

    // ── COMPARISON ROW: Period vs Full File ────────────
    doc.setFillColor(...C.bg);
    doc.setDrawColor(...C.border);
    doc.setLineWidth(0.2);
    doc.roundedRect(M,Y,CW,11,2,2,'FD');

    doc.setFont('helvetica','bold');
    doc.setFontSize(7.5);
    doc.setTextColor(...C.dark);
    doc.text('Full File (all dates):',M+3,Y+7);
    doc.setFont('helvetica','normal');
    doc.setFontSize(7);
    doc.setTextColor(...C.mid);
    doc.text(
      `Total ${sa.n}  |  Matched ${sa.m}  |  Corrected ${sa.c}  |  Errors ${sa.e}  |  Accuracy ${sa.cp}%`,
      M+38, Y+7
    );
    Y+=17;

    // ── VISUAL ANALYTICS SECTION ───────────────────────
    doc.setFont('helvetica','bold');
    doc.setFontSize(10);
    doc.setTextColor(...C.mid);
    doc.text('VISUAL ANALYTICS',M,Y);
    doc.line(M,Y+1.5,PW-M,Y+1.5);
    Y+=7;

    // Capture charts from canvas
    const [pieImg,barImg,typImg]=await Promise.all([
      captureChart('cPie'),
      captureChart('cBar'),
      captureChart('cType'),
    ]);

    const chartH=52;
    const chartW=(CW-8)/3;

    const chartLabels=['Validation Results','Error Breakdown','Ticket Types'];
    const chartImgs=[pieImg,barImg,typImg];

    chartLabels.forEach((lbl,i)=>{
      const cx=M+i*(chartW+4);
      // chart frame
      doc.setFillColor(...C.bg);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(cx,Y,chartW,chartH+8,2,2,'FD');
      // chart title
      doc.setFont('helvetica','bold');
      doc.setFontSize(7);
      doc.setTextColor(...C.mid);
      doc.text(lbl.toUpperCase(),cx+3,Y+5);
      // embed image
      if(chartImgs[i]){
        try{ doc.addImage(chartImgs[i],'PNG',cx+2,Y+7,chartW-4,chartH-2); }catch(_){}
      } else {
        // Fallback: simple text
        doc.setFont('helvetica','normal');
        doc.setFontSize(8);
        doc.setTextColor(...C.light);
        doc.text('Chart unavailable',cx+chartW/2-12,Y+chartH/2+4);
      }
    });

    Y+=chartH+14;

    // ── PERIOD CONTEXT BOX ────────────────────────────
    doc.setFillColor(239,246,255); // light blue bg
    doc.setDrawColor(...C.ieBlue);
    doc.setLineWidth(0.3);
    doc.roundedRect(M,Y,CW,18,2,2,'FD');

    // Left accent
    doc.setFillColor(...C.ieBlue);
    doc.roundedRect(M,Y,3,18,1,1,'F');

    doc.setFont('helvetica','bold');
    doc.setFontSize(8);
    doc.setTextColor(...C.ieBlue);
    doc.text('REPORTING PERIOD',M+6,Y+6.5);

    doc.setFont('helvetica','bold');
    doc.setFontSize(9);
    doc.setTextColor(...C.dark);
    doc.text(periodLabel,M+6,Y+13);

    // Right side: note
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);
    doc.setTextColor(...C.mid);
    doc.text('KPI cards above reflect ALL tickets within this period, regardless of status filter.',PW-M-98,Y+7);
    doc.text(`UI status filter "${E.statF.value||'all'}" and type filter "${E.typeF.value||'all'}" affect the anomaly table (page 2) only.`,PW-M-98,Y+13);

    Y+=24;

    // ══════════════════════════════════════════════════════
    //  PAGE 2: AUDIT DETAILS TABLE
    // ══════════════════════════════════════════════════════
    doc.addPage();
    Y=0;

    // Header bar on page 2
    doc.setFillColor(...C.dark);
    doc.rect(0,0,PW,20,'F');
    doc.setFillColor(...C.fnOrange);
    doc.rect(0,0,6,20,'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica','bold');
    doc.setFontSize(13);
    doc.text('Audit Details — Anomalies & Resolution Status',M+2,13);
    Y=26;

    // Section subtitle
    doc.setFont('helvetica','normal');
    doc.setFontSize(8);
    doc.setTextColor(...C.mid);
    // Use filteredRows for the table — anomalies in the currently filtered view
    const anomalyRows=filteredRows.filter(r=>r.fRes!=='Matched'||(r.excA&&r.fRes==='Matched'));
    const filterBanner = hasAnyFilter ? `Filters: ${filterLabel}` : 'Scope: All Data (no filters)';
    doc.text(`${filterBanner}  |  ${anomalyRows.length} anomalies out of ${filteredRows.length} filtered tickets.`,M,Y);
    Y+=8;

    // Table header
    const cols=[
      {label:'Ticket',    w:28},
      {label:'Type',      w:14},
      {label:'Inside Edge Due Date',w:26},
      {label:'FN Date',   w:26},
      {label:'IE Name',   w:32},
      {label:'FN Name',   w:32},
      {label:'Result',    w:22},
      {label:'Details',   w:CW-28-14-26-26-32-32-22},
    ];
    const tableX=M;
    const rowH=7.5;
    const headerH=9;

    // Header bg
    doc.setFillColor(...C.dark);
    doc.rect(tableX,Y,CW,headerH,'F');
    doc.setTextColor(...C.white);
    doc.setFont('helvetica','bold');
    doc.setFontSize(7);
    let cx2=tableX+2;
    cols.forEach(col=>{
      doc.text(col.label,cx2,Y+6);
      cx2+=col.w;
    });
    Y+=headerH;

    // Table rows
    doc.setFont('helvetica','normal');
    doc.setFontSize(6.5);

    if(!anomalyRows.length){
      doc.setFillColor(...C.bg);
      doc.rect(tableX,Y,CW,10,'F');
      doc.setTextColor(...C.mid);
      doc.text('No anomalies found in current filter view — all tickets matched.',tableX+4,Y+6.5);
      Y+=10;
    }

    anomalyRows.forEach((r,idx)=>{
      // Page break check
      if(Y>PH-20){
        doc.addPage();
        Y=15;
        // mini header
        doc.setFillColor(...C.dark);
        doc.rect(0,0,PW,12,'F');
        doc.setFillColor(...C.fnOrange);
        doc.rect(0,0,6,12,'F');
        doc.setTextColor(...C.white);
        doc.setFont('helvetica','bold');
        doc.setFontSize(9);
        doc.text('Audit Details (continued)',M+2,8.5);
        Y=18;
        // re-draw table header
        doc.setFillColor(...C.dark);
        doc.rect(tableX,Y,CW,headerH,'F');
        doc.setTextColor(...C.white);
        doc.setFont('helvetica','bold');
        doc.setFontSize(7);
        let hx=tableX+2;
        cols.forEach(c=>{doc.text(c.label,hx,Y+6);hx+=c.w;});
        Y+=headerH;
        doc.setFont('helvetica','normal');
        doc.setFontSize(6.5);
      }

      // Row background
      const isEven=idx%2===0;
      if(r.fRes==='Error'){
        doc.setFillColor(254,226,226); // red tint
      } else if(r.fRes==='Corrected'){
        doc.setFillColor(237,233,254); // purple tint
      } else if(r.excA){
        doc.setFillColor(254,243,199); // yellow tint
      } else {
        doc.setFillColor(isEven?248:255,isEven?250:255,isEven?252:255);
      }
      doc.rect(tableX,Y,CW,rowH,'F');

      // Row border
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.1);
      doc.line(tableX,Y+rowH,tableX+CW,Y+rowH);

      // Result pill colour
      const pillCol=r.fRes==='Error'?C.err:r.fRes==='Corrected'?C.cor:r.excA?C.warn:C.ok;

      doc.setTextColor(...C.dark);
      let rx=tableX+2;
      const cellVals=[
        r.ticket,r.type,r.ieDueDate,r.fnSD,
        r.ieFEN.substring(0,18)||(r.ieFEN||''),
        r.fnFEN.substring(0,18)||(r.fnFEN||''),
      ];
      cellVals.forEach((v,i)=>{
        doc.setTextColor(...C.dark);
        doc.text(String(v||'').substring(0,cols[i].w/1.6),rx,Y+5);
        rx+=cols[i].w;
      });

      // Result pill
      doc.setFillColor(...pillCol);
      doc.roundedRect(rx,Y+1.5,18,5,1,1,'F');
      doc.setTextColor(...C.white);
      doc.setFont('helvetica','bold');
      doc.setFontSize(5.5);
      doc.text(r.fRes.toUpperCase(),rx+1.5,Y+5);
      doc.setFont('helvetica','normal');
      doc.setFontSize(6.5);
      rx+=cols[6].w;

      // Details (truncated)
      doc.setTextColor(...C.mid);
      const detStr=String(r.det||'').substring(0,52);
      doc.text(detStr,rx,Y+5);

      Y+=rowH;
    });

    Y+=6;

    // ── SUMMARY TOTALS AT BOTTOM OF TABLE ─────────────
    if(Y<PH-35){
      doc.setFillColor(...C.dark);
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.roundedRect(M,Y,CW,14,2,2,'FD');
      doc.setFont('helvetica','bold');
      doc.setFontSize(7.5);
      doc.setTextColor(...C.white);
      doc.text(`Period Summary  (${periodLabel}):`,M+4,Y+9);
      doc.setFont('helvetica','normal');
      doc.setFontSize(7.5);
      doc.setTextColor(200,220,255);
      doc.text(
        `Errors: ${sv.e}   Corrected: ${sv.c}   Exceptions: ${sv.x}   Matched: ${sv.m}   Total: ${sv.n}   Accuracy: ${sv.cp}%`,
        M+52,Y+9
      );
    }

    // ── FOOTER on all pages ──────────────────────────
    const pgCount=doc.internal.getNumberOfPages();
    for(let pg=1;pg<=pgCount;pg++){
      doc.setPage(pg);
      doc.setFillColor(...C.bg);
      doc.rect(0,PH-10,PW,10,'F');
      doc.setDrawColor(...C.border);
      doc.setLineWidth(0.2);
      doc.line(0,PH-10,PW,PH-10);
      doc.setFont('helvetica','normal');
      doc.setFontSize(6.5);
      doc.setTextColor(...C.light);
      doc.text(`Validation Report 0001  |  Field Nation × Internal Entity Audit  |  ${now}`,M,PH-4.5);
      doc.text(`Page ${pg} of ${pgCount}`,PW-M-16,PH-4.5);
    }

    // ── SAVE ─────────────────────────────────────────
    doc.save(`management_audit_report_${stamp()}.pdf`);

  } catch(err){
    console.error('[VRA PDF]',err);
    showBan(`PDF generation failed: ${err.message}`);
    showDbg('PDF export error',err.stack||String(err));
  } finally {
    $('pdfOverlay').classList.add('h');
  }
}

/* ═══ SELF-TEST ════════════════════════════════════════════════ */
function selfTest(){
  const iss=[];
  if(typeof XLSX==='undefined') iss.push('SheetJS not loaded — Excel files cannot be processed');
  if(typeof Chart==='undefined') iss.push('Chart.js not loaded — charts will not render');
  if(typeof window.jspdf==='undefined'&&typeof jsPDF==='undefined') iss.push('jsPDF not loaded — PDF export will not work');
  if(typeof html2canvas==='undefined') iss.push('html2canvas not loaded — chart images in PDF unavailable');
  if(!window.FileReader) iss.push('FileReader API missing — cannot read local files');
  if(iss.length){
    showBan(`⚠ ${iss.join(' | ')}. Try disabling ad-blockers or use Chrome/Edge.`,'warn');
    if(typeof XLSX==='undefined') showDbg('Critical: SheetJS failed to load',iss.join('\n')+'\n\nCheck your network, disable extensions, then refresh.');
  }
}

/* ═══ BIND ═════════════════════════════════════════════════════ */
function bindAll(){
  selfTest();
  const dz=E.dz,fi=E.fi;
  dz.addEventListener('click',()=>fi.click());
  fi.addEventListener('change',ev=>{const f=ev.target.files?.[0];if(f)handleWB(f);});
  dz.addEventListener('dragover',ev=>{ev.preventDefault();dz.classList.add('dr');});
  dz.addEventListener('dragleave',()=>dz.classList.remove('dr'));
  dz.addEventListener('drop',ev=>{ev.preventDefault();dz.classList.remove('dr');const f=ev.dataTransfer.files?.[0];if(f)handleWB(f);});
  $('applyBtn').addEventListener('click',applyFilters);
  $('clearBtn').addEventListener('click',clearF);
  $('pdfBtn').addEventListener('click',exportPDF);
  ['srch','typeF','statF','specD','fromD','toD'].forEach(id=>{
    $(id).addEventListener('input',applyFilters);$(id).addEventListener('change',applyFilters);
  });
  E.tbody.addEventListener('click',ev=>{const b=ev.target.closest('[data-cid]');if(b)markCorrected(b.getAttribute('data-cid'));});
  window.addEventListener('error',ev=>{console.error('[VRA]',ev.error||ev.message);showBan(`Error: ${ev.message||'Unknown'}`);});
  window.addEventListener('unhandledrejection',ev=>{console.error('[VRA]',ev.reason);showBan(`Async error: ${ev.reason?.message||ev.reason||'Unknown'}`);});

  /* ═══════════════════════════════════════════════════════════
     MULTI-FILE MODE
     Accepts 3 source files (IE / IE2 / FN), auto-detects each
     one by its columns, merges on Ticket Number, runs the five
     validation checks (Status / Due / Scheduled / Tech / Confirmed)
     and feeds results into the same S.raw table so all existing
     filters, stats, charts, empty-state, and PDF export keep working.
     Also exposes a dedicated Excel export with raw sheets included.
     ═══════════════════════════════════════════════════════════ */
  initMultiFileMode();
}

/* ═══ MODE TAB SWITCHER ═════════════════════════════════════════ */
function setMode(mode){
  document.querySelectorAll('.mode-tab').forEach(t=>{
    const on = t.getAttribute('data-mode')===mode;
    if(t.classList) t.classList.toggle('active',on);
    t.setAttribute('aria-selected',on?'true':'false');
  });
  const mf=$('mfRoot'), dz=$('dropzone');
  if(mode==='multifile'){
    if(mf) mf.classList.remove('h');
    if(dz) dz.classList.add('h');
  }else{
    if(mf) mf.classList.add('h');
    if(dz) dz.classList.remove('h');
  }
}

/* ═══ MULTI-FILE STATE ═════════════════════════════════════════ */
const MF = {
  ie:  { rows:null, aoa:null, file:null, headers:[] },
  ie2: { rows:null, aoa:null, file:null, headers:[] },
  fn:  { rows:null, aoa:null, file:null, headers:[] },
};

/* Column signatures (order-independent, case/space-normalised) */
const MF_SIG = {
  fn:  ['WO ID','Custom: Acuative Ticket Number','WO Status','Tech Name','Service Date'],
  ie2: ['Tkt Num','Address 1','City','State'],
  ie:  ['Tkt Num','Tkt Status','Ticket Type','Company Name','FE Name'],
};
const MF_LABEL = { ie:'Inside Edge Report', ie2:'Sheet1 (addresses)', fn:'FN Report' };

/* Exact Master workbook layout. Export must mirror the Master workbook sheets, not raw upload headers. */
const MASTER_REPORT_GROUP_ROW = ['', '', '', '', '', 'Inside Edge', '', '', '', '', '', '', '', '', '', '', 'Field Nation', '', '', '', '', '', '', '', '', 'Validation', '', '', '', '', '', 'Field Nation', '', '', '', 'Inside Edge', '', '', ''];
const MASTER_REPORT_HEADERS = [
  'Acuative Ticket','Client','Contract','Store #','Site Code','Ticket Type','Ticket Status','Due Date','Due Time','Scheduled Date','Scheduled Time','ETC','Assigned Company','Assigned FE Name','Phone #','E-Mail',
  'Status','Confirmed','Sent Date','Sent Time','Scheduled Date','Scheduled Time','FN FE ID','FN FE Name','Tech Requests',
  'Review Required','IE & FN Status','Due','Scheduled','Tech','Confirmed',
  'Address','City','State','Zip','Address','City','State','Zip'
];
const MASTER_FORMULAS_GROUP_ROW = ['', '', '', '', '', '', 'Inside Edge', '', '', '', '', '', '', '', '', '', 'Field Nation', '', '', '', '', '', '', '', '', 'Validation', '', '', '', '', '', '', '', '', '', '', '', '', ''];
const MASTER_FORMULAS_HEADERS = [
  'Acuative Ticket','Client','Contract','Store #','Site Code','Ticket Type','Ticket Status','Due Date','Due Time','Scheduled Date','Scheduled Time','ETC','Assigned Company','Assigned FE Name','Phone #','E-Mail',
  'Status','Confirmed','Sent Date','Sent Time','Scheduled Date','Scheduled Time','WM FE ID','WM FE Name','Requests',
  'Review Required','IE & WM Status','Due','Scheduled','Tech','Confirmed',
  'Street','City','State','Zip','Street','City','State','Zip'
];
const MASTER_IE_HEADERS = ['Client','Contract','Ord Num','Tkt Num','Store Num','Site Cd','OE Date','Company Name','FE Name','Primary','Secondary','Due Dt','Scheduled Dt','ETC','Tkt Status','Ticket Type','Comments','E-mail',''];
const MASTER_FN_HEADERS = ['WO ID','Project','Tech ID','Tech Name','Assignment Confirmed','WO Status','Service Date','Service Time','Street1','City','State','Zip','Published Date/Time','Requests','Acuative Order','Acuative Ticket'];
const MASTER_IE2_HEADERS = ['Client','Contract','Order Num','Tkt Num','Store Num','Site Cd','Order Entry Dt','Site Name','Address 1','Address 2','City','State','Zip Code','Appointment Type','Contractor?','Company Name','FE Name','Primary','Secondary','Due Dt','Scheduled Dt','ETC','Tkt Status','Ticket Type','Comments','Email','Eastern Time Scheduled Dt/Time',''];

function normHdr(h){ return String(h||'').trim().toLowerCase().replace(/\s+/g,' '); }
function headersInclude(headers, required){
  const low = headers.map(normHdr);
  return required.every(r => low.includes(normHdr(r)));
}
/* Return slot key best matching these headers, or null */
function detectSlot(headers){
  // Check FN first — has very distinctive columns
  if(headersInclude(headers, MF_SIG.fn)) return 'fn';
  // IE2 has address; distinguishes it from IE
  if(headersInclude(headers, MF_SIG.ie2)) return 'ie2';
  // IE is the baseline labor report
  if(headersInclude(headers, MF_SIG.ie)) return 'ie';
  return null;
}

/* ═══ FILE READING ═════════════════════════════════════════════ */
async function mfReadFile(file){
  const name = file.name.toLowerCase();
  let wb;
  if(name.endsWith('.csv')){
    const text = await file.text();
    wb = XLSX.read(text, {type:'string', cellDates:false});
  }else{
    const buf = await file.arrayBuffer();
    wb = XLSX.read(buf, {type:'array', cellDates:false});
  }
  const ws = wb.Sheets[wb.SheetNames[0]];

  // 1-2-3 copy: keep the uploaded sheet as rows/columns exactly as Excel shows it.
  // Column 1 -> Master column A, column 2 -> B, column 3 -> C, etc.
  const aoaRaw = XLSX.utils.sheet_to_json(ws, {header:1, defval:'', raw:true, blankrows:false});
  const aoa = (aoaRaw||[]).filter(r => (r||[]).some(v => String(v ?? '').trim() !== ''));
  const headers = aoa.length ? aoa[0].map(h => String(h ?? '').trim()) : [];

  // Object rows are kept for detection only. Export/calculation uses the 1-2-3 positional rows.
  const rows = XLSX.utils.sheet_to_json(ws, {defval:'', raw:true, blankrows:false});
  return { rows, aoa, headers };
}

/* ═══ UPLOAD HANDLERS ══════════════════════════════════════════ */
async function mfHandleUpload(intendedSlot, file){
  const statEl = $('mfStat' + intendedSlot.toUpperCase());
  const metaEl = $('mfMeta' + intendedSlot.toUpperCase());
  const slotEl = document.querySelector(`.mf-slot[data-slot="${intendedSlot}"]`);
  if(slotEl) slotEl.classList.remove('ok','err');
  if(statEl) statEl.textContent = '⏳ Reading…';
  if(metaEl) metaEl.textContent = '';
  try{
    const { rows, aoa, headers } = await mfReadFile(file);
    if(!rows.length){
      statEl.textContent = '❌ Empty file';
      if(slotEl) slotEl.classList.add('err');
      return;
    }
    const detected = detectSlot(headers);
    if(!detected){
      statEl.textContent = '❌ Unknown file — columns don\'t match any expected shape';
      metaEl.textContent = `Found ${headers.length} columns. Headers must match IE / IE2 / FN signature.`;
      if(slotEl) slotEl.classList.add('err');
      return;
    }
    if(detected !== intendedSlot){
      // Detected a different shape — accept it and warn
      const actualSlotEl = document.querySelector(`.mf-slot[data-slot="${detected}"]`);
      MF[detected] = { rows, aoa, file, headers };
      const actualStat = $('mfStat' + detected.toUpperCase());
      const actualMeta = $('mfMeta' + detected.toUpperCase());
      actualStat.textContent = `✅ Auto-routed: ${MF_LABEL[detected]}`;
      actualMeta.textContent = `${file.name} · ${rows.length.toLocaleString()} rows · ${headers.length} cols`;
      if(actualSlotEl) actualSlotEl.classList.add('ok');
      statEl.textContent = `↪ Moved to ${MF_LABEL[detected]} (detected by columns)`;
      statEl.style.color='';
    } else {
      MF[detected] = { rows, aoa, file, headers };
      statEl.textContent = `✅ ${MF_LABEL[detected]} loaded`;
      metaEl.textContent = `${file.name} · ${rows.length.toLocaleString()} rows · ${headers.length} cols`;
      if(slotEl) slotEl.classList.add('ok');
    }
  }catch(err){
    console.error(err);
    statEl.textContent = '❌ Read failed — ' + (err.message||'unknown error');
    if(slotEl) slotEl.classList.add('err');
  }
  mfUpdateGenBtn();
}

function mfUpdateGenBtn(){
  const ready = MF.ie.rows && MF.ie2.rows && MF.fn.rows;
  $('mfGenBtn').disabled = !ready;
  $('mfHint').textContent = ready
    ? 'All three files loaded. Click Generate. Only tickets existing in both Inside Edge and Field Nation will be counted.'
    : `Upload ${['ie','ie2','fn'].filter(k=>!MF[k].rows).length} more file(s) to enable generation.`;
}

function mfReset(){
  ['ie','ie2','fn'].forEach(k=>{
    MF[k] = { rows:null, aoa:null, file:null, headers:[] };
    const statEl = $('mfStat' + k.toUpperCase());
    const metaEl = $('mfMeta' + k.toUpperCase());
    const slotEl = document.querySelector(`.mf-slot[data-slot="${k}"]`);
    if(statEl) statEl.textContent = '⬜ Click or drop a file';
    if(metaEl) metaEl.textContent = '';
    if(slotEl) slotEl.classList.remove('ok','err');
    const fi = $('mfFile' + k.toUpperCase());
    if(fi) fi.value = '';
  });
  $('mfExcelBtn').disabled = true;
  mfUpdateGenBtn();
}

/* ═══ DATE / TIME NORMALISATION ════════════════════════════════ */
function mfSerialDateYMD(v){
  if(typeof v!=="number" || !Number.isFinite(v) || v<1) return "";
  const whole = Math.floor(v);
  const adj = whole >= 60 ? whole - 1 : whole;
  const dt = new Date(Date.UTC(1899, 11, 31) + adj * 86400000);
  return String(dt.getUTCFullYear()) + "-" + p2(dt.getUTCMonth()+1) + "-" + p2(dt.getUTCDate());
}
function mfParseDate(v){
  // Returns YYYY-MM-DD or '' if unparseable
  if(v==null||v==='') return '';
  if(typeof v === 'number' && Number.isFinite(v)) return mfSerialDateYMD(v);
  if(v instanceof Date && !isNaN(v)) {
    const y=v.getFullYear(), m=String(v.getMonth()+1).padStart(2,'0'), d=String(v.getDate()).padStart(2,'0');
    return `${y}-${m}-${d}`;
  }
  const s = String(v).trim();
  // ISO-ish
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if(m) return `${m[1]}-${m[2]}-${m[3]}`;
  // US style M/D/YYYY [time]
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if(m){
    let y = m[3]; if(y.length===2) y = (parseInt(y,10)<50?'20':'19')+y;
    return `${y}-${String(m[1]).padStart(2,'0')}-${String(m[2]).padStart(2,'0')}`;
  }
  // fall back to Date parsing
  const d = new Date(s);
  if(!isNaN(d)){
    const y=d.getFullYear(), mo=String(d.getMonth()+1).padStart(2,'0'), da=String(d.getDate()).padStart(2,'0');
    return `${y}-${mo}-${da}`;
  }
  return '';
}
function mfParseTime(v){
  // Returns HH:MM (24-hr) or '' if unparseable. Ignores timezone suffixes.
  // Important: times from Excel can arrive as 08:59:59.999 because of floating point precision.
  // We round to the nearest minute so IE 09:00 never becomes 08:59.
  if(v==null||v==='') return '';
  if(v instanceof Date && !isNaN(v)) return hhmmFromParts(v.getHours(), v.getMinutes(), v.getSeconds(), v.getMilliseconds());
  if(typeof v === 'number' && Number.isFinite(v)){
    let frac = v % 1; if(frac < 0) frac += 1;
    const tot = Math.round(frac * 1440);
    return `${p2(Math.floor(tot/60)%24)}:${p2(tot%60)}`;
  }
  let s = String(v).trim();
  // strip timezone tokens (HST, EST, PST, etc.)
  s = s.replace(/\s+[A-Z]{2,4}$/, '').trim();
  // "9:30 AM" / "09:30:00 PM"
  let m = s.match(/^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?\s*(AM|PM|am|pm)?$/);
  if(m){
    let h = parseInt(m[1],10); const mi = parseInt(m[2],10); const sec = parseInt(m[3]||'0',10); const ms = parseInt(m[4]||'0',10); const ap = (m[5]||'').toUpperCase();
    if(ap==='PM' && h<12) h+=12;
    if(ap==='AM' && h===12) h=0;
    return hhmmFromParts(h, mi, sec, ms);
  }
  // datetime with time — try Date parsing
  const d = new Date(s);
  if(!isNaN(d)) return hhmmFromParts(d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds());
  return '';
}
function mfPickField(obj, candidates){
  for(const c of candidates){
    for(const k of Object.keys(obj)){
      if(normHdr(k)===normHdr(c) && obj[k]!=null && obj[k]!=='') return obj[k];
    }
  }
  return null;
}

/* ═══ FIVE VALIDATION CHECKS - MATCH MASTER LOGIC ═══════════ */
function mfCheckStatus(ie, fn, notFN){
  const ieS = String(ie||'').trim().toUpperCase();
  const fnS = String(fn||'').trim().toLowerCase();
  // Exact master formula AA: S+Assigned, U+(Published|Routed), H+NotPosted, notFN+NotPosted
  if(ieS==='S' && fnS==='assigned') return 'OK';
  if(ieS==='U' && (fnS==='published' || fnS==='routed')) return 'OK';
  if(ieS==='H' && (fnS==='not posted' || fnS==='')) return 'OK';
  if(notFN && (fnS==='not posted' || fnS==='')) return 'OK';
  return 'Error';
}
function mfSameDate(a, b){
  const da = mfParseDate(a), db = mfParseDate(b);
  if(!da && !db) return true;
  return da !== '' && db !== '' && da === db;
}
function mfSameTime(a, b){
  const ta = mfParseTime(a), tb = mfParseTime(b);
  if(!ta && !tb) return true;
  return ta !== '' && tb !== '' && ta === tb;
}
/* Combined Due check (matches master AB: H or notFN auto-OK; else date AND time must match). */
function mfCheckDue(ieDueDate, ieDueTime, fnServDate, fnServTime, ieStatus, notFN, hasFN){
  if(String(ieStatus||'').toUpperCase()==='H') return 'OK';
  if(notFN) return 'OK';
  return (mfSameDate(ieDueDate, fnServDate) && mfSameTime(ieDueTime, fnServTime)) ? 'OK' : 'Error';
}
/* Split Due into Date-only / Time-only so we can populate Date Errs and Time Errs columns
   the way Single-Workbook mode does. ITD / ITR exceptions match the original Excel auditor. */
function mfDueDateOnly(ieDueDate, fnServDate, ieStatus, notFN, hasFN, ticketType){
  if(String(ieStatus||'').toUpperCase()==='H') return 'OK';
  if(notFN) return 'OK';
  if(!hasFN) return 'OK';
  if(!ieDueDate || !fnServDate) return 'OK';
  if(mfSameDate(ieDueDate, fnServDate)) return 'OK';
  // ITD = "I'll Take Date" exception: date mismatch is expected/auto-approved
  if(String(ticketType||'').toUpperCase()==='ITD') return 'Exception';
  return 'Error';
}
function mfDueTimeOnly(ieDueTime, fnServTime, ieStatus, notFN, hasFN, ticketType){
  if(String(ieStatus||'').toUpperCase()==='H') return 'OK';
  if(notFN) return 'OK';
  if(!hasFN) return 'OK';
  if(!ieDueTime || !fnServTime) return 'OK';
  if(mfSameTime(ieDueTime, fnServTime)) return 'OK';
  // ITD or ITR allow time mismatch as exception
  const t = String(ticketType||'').toUpperCase();
  if(t==='ITD' || t==='ITR') return 'Exception';
  return 'Error';
}
function mfCheckScheduled(ieSchedDate, ieSchedTime, fnServDate, fnServTime, fnStatus, hasFN){
  // Master formula AC: IF(Q="Assigned", date AND time match → OK else Error, otherwise OK)
  const fnS = String(fnStatus||'').trim().toLowerCase();
  if(fnS!=='assigned') return 'OK';
  return (mfSameDate(ieSchedDate, fnServDate) && mfSameTime(ieSchedTime, fnServTime)) ? 'OK' : 'Error';
}
function mfNameParts(name){
  // Robust name comparison for Tech check:
  // case-insensitive; punctuation/symbols become spaces; extra spaces are ignored.
  // Only FIRST token + LAST token must match.
  const cleaned = String(name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned ? cleaned.split(' ').filter(Boolean) : [];
}
function mfNameFirstLastKey(name){
  const parts = mfNameParts(name);
  if(parts.length < 2) return '';
  return parts[0] + '|' + parts[parts.length - 1];
}
function mfFullNameKey(name){
  return mfNameParts(name).join('');
}
function mfFirstLastNameMatch(a, b){
  const fa = mfFullNameKey(a);
  const fb = mfFullNameKey(b);
  if(fa && fb && fa === fb) return true;
  const ka = mfNameFirstLastKey(a);
  const kb = mfNameFirstLastKey(b);
  return !!ka && !!kb && ka === kb;
}
function mfCheckTech(ieFE, fnTech, ieStatus, notFN, hasFN){
  if(String(ieStatus||'').toUpperCase()==='H') return 'OK';
  if(notFN) return 'OK';
  return mfFirstLastNameMatch(fnTech, ieFE) ? 'OK' : 'Error';
}
function mfCheckConfirmed(conf, hasFN){
  return String(conf||'').trim().toLowerCase() === 'no' ? 'Error' : 'OK';
}
function mfSplitDateTime(v){
  if(v==null || v==='') return {date:'', time:''};
  return { date: mfParseDate(v), time: mfParseTime(v) };
}
function mfDateOnlyValue(v){
  if(v==null || v==='') return '';
  if(typeof v === 'number' && Number.isFinite(v)){
    const d = mfSerialDateYMD(v);
    if(!d) return '';
    const parts = d.split('-').map(Number);
    return new Date(parts[0], parts[1]-1, parts[2]);
  }
  if(v instanceof Date && !isNaN(v)) return new Date(v.getFullYear(), v.getMonth(), v.getDate());
  const d = mfParseDate(v);
  if(!d) return '';
  const parts = d.split('-').map(Number);
  return new Date(parts[0], parts[1]-1, parts[2]);
}
function mfTimeOnlyValue(v){
  if(v==null || v==='') return '';
  const t = mfParseTime(v);
  if(!t) return '';
  const parts = t.split(':').map(Number);
  return new Date(1899, 11, 30, parts[0] || 0, parts[1] || 0, 0);
}
function mfExcelDate(v){ return mfDateOnlyValue(v); }
function mfExcelTime(v){ return mfTimeOnlyValue(v); }
function mfAddOneMinuteTimeValue(v){
  // Emergency IE-side correction: keep raw sheets untouched, add +1 minute only to IE Due/Scheduled times.
  if(!v || !(v instanceof Date) || isNaN(v)) return v;
  return new Date(v.getTime() + 60000);
}
function mfRaw(obj, candidates){
  const v = mfPickField(obj||{}, candidates);
  return v==null ? '' : v;
}
function mfAoAFromRows(rows, headers, map){
  const body = (rows||[]).map(r => map(h => mfRaw(r, h)));
  return [headers, ...body];
}

/* 1-2-3 copy mode: uploaded columns are copied by position into the matching Master sheet.
   Uploaded column 1 goes to Master column A, 2 to B, 3 to C... Master headers stay fixed. */
function mfPad123(row, len){
  const out = [];
  for(let i=0;i<len;i++) out.push(row && row[i] != null ? row[i] : '');
  return out;
}
function mfAoA123(slot, masterHeaders){
  const aoa = MF[slot]?.aoa || [];
  const body = aoa.slice(1).map(r => mfPad123(r, masterHeaders.length));
  return [masterHeaders, ...body];
}
function mfRows123(slot, masterHeaders){
  const aoa = MF[slot]?.aoa || [];
  return aoa.slice(1).map(row => {
    const obj = {};
    masterHeaders.forEach((h,i)=>{ obj[h || ('__blank_'+i)] = row && row[i] != null ? row[i] : ''; });
    return obj;
  }).filter(obj => Object.values(obj).some(v => String(v ?? '').trim() !== ''));
}
function mfIEReportAoA(){
  return mfAoA123('ie', MASTER_IE_HEADERS);
}
function mfFNReportAoA(){
  return mfAoA123('fn', MASTER_FN_HEADERS);
}
function mfSheet1AoA(){
  return mfAoA123('ie2', MASTER_IE2_HEADERS);
}
function mfSetSheetCols(ws, widths){
  ws['!cols'] = widths.map(w => ({wch:w}));
}
function mfFormatDateTimeCols(ws, dateCols, timeCols, startRow){
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  for(let R=(startRow||1); R<=range.e.r; R++){
    dateCols.forEach(C=>{ const ref=XLSX.utils.encode_cell({r:R,c:C}); if(ws[ref]) ws[ref].z='m/d/yyyy'; });
    timeCols.forEach(C=>{ const ref=XLSX.utils.encode_cell({r:R,c:C}); if(ws[ref]) ws[ref].z='h:mm AM/PM'; });
  }
}

function mfCell(ws, r, c){
  const ref = XLSX.utils.encode_cell({r,c});
  if(!ws[ref]) ws[ref] = {t:'s', v:''};
  return ws[ref];
}
function mfStyle(fill, font, extra){
  const base = {
    font: Object.assign({name:'Calibri', sz:11, color:{rgb:'000000'}}, font||{}),
    alignment:{horizontal:'center', vertical:'center', wrapText:true},
    border:{top:{style:'thin', color:{rgb:'D9E2F3'}}, bottom:{style:'thin', color:{rgb:'D9E2F3'}}, left:{style:'thin', color:{rgb:'D9E2F3'}}, right:{style:'thin', color:{rgb:'D9E2F3'}}}
  };
  if(fill) base.fill = {patternType:'solid', fgColor:{rgb:fill}};
  return Object.assign(base, extra||{});
}
function mfApplyRangeStyle(ws, r1, c1, r2, c2, style){
  for(let r=r1;r<=r2;r++) for(let c=c1;c<=c2;c++) mfCell(ws,r,c).s = style;
}
function mfVal(v){ return String(v ?? '').trim().toLowerCase(); }
function mfStatusStyle(v){
  const x = mfVal(v);
  if(x === 'error') return mfStyle('FFC7CE',{bold:true,color:{rgb:'9C0006'}});
  if(x === 'ok' || x === 'matched' || x === 'no') return mfStyle('C6EFCE',{bold:true,color:{rgb:'006100'}});
  if(x === 'yes' || x.includes('itd') || x.includes('itr') || x.includes('time')) return mfStyle('FFEB9C',{bold:true,color:{rgb:'9C6500'}});
  return null;
}
function mfMasterColumnWidths(){
  return [9.2,9,10.2,10.2,10.5,6.2,8,8.8,8.8,9.7,9.7,5.4,12.5,21.8,13.2,47.7,9.8,9.8,9.3,9.3,9.3,9.3,9.2,19.5,9.3,9.8,9.8,9.8,9.8,9.3,9.3,37,18.5,11.2,9.5,37,18.5,11.2,10.7];
}
function mfApplyMasterReportFormat(ws, isFormula){
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  const lastR = range.e.r;
  ws['!cols'] = mfMasterColumnWidths().map((w,i)=>({wch:w, hidden:(i===14||i===15)?true:false}));
  ws['!rows'] = [{hpt:15},{hpt:23.25}, ...Array(Math.max(0,lastR-1)).fill({hpt:16})];
  ws['!merges'] = [{s:{r:0,c:5}, e:{r:0,c:15}}, {s:{r:0,c:16}, e:{r:0,c:24}}, {s:{r:0,c:25}, e:{r:0,c:30}}, {s:{r:0,c:31}, e:{r:0,c:34}}, {s:{r:0,c:35}, e:{r:0,c:38}}];
  ws['!autofilter'] = {ref:`A2:AM${Math.max(2,lastR+1)}`};
  ws['!freeze'] = {xSplit:0, ySplit:2, topLeftCell:'A3', activePane:'bottomLeft', state:'frozen'};
  const ieGroup = mfStyle('1F4E78',{bold:true,color:{rgb:'FFFFFF'},sz:12});
  const fnGroup = mfStyle('70AD47',{bold:true,color:{rgb:'FFFFFF'},sz:12});
  const valGroup = mfStyle('FFC000',{bold:true,color:{rgb:'000000'},sz:12});
  const headerBlue = mfStyle('D9EAF7',{bold:true,color:{rgb:'000000'}});
  const headerGreen = mfStyle('E2F0D9',{bold:true,color:{rgb:'000000'}});
  const headerYellow = mfStyle('FFF2CC',{bold:true,color:{rgb:'000000'}});
  mfApplyRangeStyle(ws,0,0,0,4,mfStyle(null,{color:{rgb:'000000'}}));
  mfApplyRangeStyle(ws,0,5,0,15,ieGroup);
  mfApplyRangeStyle(ws,0,16,0,24,fnGroup);
  mfApplyRangeStyle(ws,0,25,0,30,valGroup);
  mfApplyRangeStyle(ws,0,31,0,34,fnGroup);
  mfApplyRangeStyle(ws,0,35,0,38,ieGroup);
  mfApplyRangeStyle(ws,1,0,1,15,headerBlue);
  mfApplyRangeStyle(ws,1,16,1,24,headerGreen);
  mfApplyRangeStyle(ws,1,25,1,30,headerYellow);
  mfApplyRangeStyle(ws,1,31,1,34,headerGreen);
  mfApplyRangeStyle(ws,1,35,1,38,headerBlue);
  const body = mfStyle(null,{color:{rgb:'000000'}},{alignment:{horizontal:'left',vertical:'center',wrapText:false}});
  const centered = mfStyle(null,{color:{rgb:'000000'}},{alignment:{horizontal:'center',vertical:'center',wrapText:false}});
  for(let r=2;r<=lastR;r++){
    for(let c=0;c<=38;c++){
      const cell = mfCell(ws,r,c);
      cell.s = (c===7||c===8||c===9||c===10||c===18||c===19||c===20||c===21||(c>=25&&c<=30)) ? centered : body;
    }
    for(const c of [25,26,27,28,29,30]){
      const cell = mfCell(ws,r,c);
      const st = mfStatusStyle(cell.v);
      if(st) cell.s = st;
    }
  }
  mfFormatDateTimeCols(ws, [7,9,18,20], [8,10,19,21], 2);
}
function mfApplyRawSheetFormat(ws, widths){
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:A1');
  mfSetSheetCols(ws, widths);
  ws['!autofilter'] = {ref:XLSX.utils.encode_range(range)};
  ws['!freeze'] = {xSplit:0, ySplit:1, topLeftCell:'A2', activePane:'bottomLeft', state:'frozen'};
  const header = mfStyle('1F4E78',{bold:true,color:{rgb:'FFFFFF'}});
  const body = mfStyle(null,{color:{rgb:'000000'}},{alignment:{horizontal:'left',vertical:'center',wrapText:false}});
  for(let c=0;c<=range.e.c;c++) mfCell(ws,0,c).s = header;
  for(let r=1;r<=range.e.r;r++) for(let c=0;c<=range.e.c;c++) mfCell(ws,r,c).s = body;
}
function mfBuildMasterRow(ie, fn, addr){
  const ticket      = mfRaw(ie, ['Tkt Num','Ticket','Ticket Number']);
  const client      = mfRaw(ie, ['Client']);
  const contract    = mfRaw(ie, ['Contract']);
  const store       = mfRaw(ie, ['Store #','Store No','Store Num','Store Number','Store']);
  const siteCode    = mfRaw(ie, ['Site Cd','Site Code','Site']);
  const ticketType  = mfRaw(ie, ['Ticket Type','Type']);
  const ieStatus    = mfRaw(ie, ['Tkt Status','Ticket Status','IE Status']);
  const ieDueRaw    = mfRaw(ie, ['Due Dt','Due Date']);
  const ieSchedRaw  = mfRaw(ie, ['Scheduled Dt','Scheduled Date']);
  const explicitDueTime   = mfRaw(ie, ['Due Time','Due Tm']);
  const explicitSchedTime = mfRaw(ie, ['Scheduled Time','Scheduled Tm']);
  const ieDueDate   = mfExcelDate(ieDueRaw);
  const ieDueTime   = mfAddOneMinuteTimeValue(explicitDueTime ? mfExcelTime(explicitDueTime) : mfExcelTime(ieDueRaw));
  const ieSchedDate = mfExcelDate(ieSchedRaw);
  const ieSchedTime = mfAddOneMinuteTimeValue(explicitSchedTime ? mfExcelTime(explicitSchedTime) : mfExcelTime(ieSchedRaw));
  const etc         = mfRaw(ie, ['ETC']);
  const company     = mfRaw(ie, ['Company Name','Assigned Company']);
  const ieFE        = mfRaw(ie, ['FE Name','Inside Edge FE Name','Assigned FE Name']);
  const phone       = mfRaw(ie, ['Primary','Phone #','Phone','FE Phone']);
  const email       = mfRaw(ie, ['E-Mail','Email','E-mail','FE Email']);

  const hasFN       = !!fn;
  const fnStatus    = hasFN ? mfRaw(fn, ['WO Status','Status','FN Status']) : 'Not Posted';
  const confirmed   = (hasFN && String(fnStatus||'').trim().toLowerCase()==='assigned') ? mfRaw(fn, ['Assignment Confirmed','Confirmed']) : '';
  const published   = hasFN ? mfRaw(fn, ['Published Date/Time','Sent Date/Time','Published Date','Sent Date']) : '';
  const sent        = mfSplitDateTime(published);
  const fnSvcRawDate= hasFN ? mfRaw(fn, ['Service Date','Scheduled Date']) : '';
  const fnSvcRawTime= hasFN ? mfRaw(fn, ['Service Time','Scheduled Time']) : '';
  const fnSvcDate   = hasFN ? mfExcelDate(fnSvcRawDate) : '';
  const fnSvcTime   = hasFN ? mfExcelTime(fnSvcRawTime) : '';
  const fnTechId    = hasFN ? mfRaw(fn, ['Tech ID','FN FE ID']) : '';
  const fnTechName  = hasFN ? mfRaw(fn, ['Tech Name','FN FE Name','FE Name']) : '';
  const requests    = hasFN ? mfRaw(fn, ['Requests','Tech Requests']) : '';
  const fnAddr      = hasFN ? mfRaw(fn, ['Street1','Address','Address 1']) : '';
  const fnCity      = hasFN ? mfRaw(fn, ['City']) : '';
  const fnState     = hasFN ? mfRaw(fn, ['State']) : '';
  const fnZip       = hasFN ? mfRaw(fn, ['Zip','Zip Code']) : '';

  const ieAddr      = addr ? mfRaw(addr, ['Address 1','Address','Street1']) : '';
  const ieCity      = addr ? mfRaw(addr, ['City']) : '';
  const ieState     = addr ? mfRaw(addr, ['State']) : '';
  const ieZip       = addr ? mfRaw(addr, ['Zip Code','Zip']) : '';

  // Strict Field-Nation filter — exactly mirrors Single-Workbook's
  //   if(normU(r[12])!=='FIELD NATION') continue;
  // Empty company OR any non-FN value => excluded from dashboard counts.
  const companyU = String(company||'').trim().toUpperCase();
  const isFN = companyU === 'FIELD NATION';
  const notFN = !isFN;  // kept for downstream check helpers; semantics: "not exactly Field Nation"
  const statusCheck = mfCheckStatus(ieStatus, fnStatus, notFN);
  const dueCheck    = mfCheckDue(ieDueDate, ieDueTime, fnSvcDate, fnSvcTime, ieStatus, notFN, hasFN);
  const schedCheck  = mfCheckScheduled(ieSchedDate, ieSchedTime, fnSvcDate, fnSvcTime, fnStatus, hasFN);
  const techCheck   = mfCheckTech(ieFE, fnTechName, ieStatus, notFN, hasFN);
  const confCheck   = mfCheckConfirmed(confirmed, hasFN);
  // Granular date / time splits — fed into Single-Workbook-style row schema so
  // the dashboard cards "Date Errs" and "Time Errs" can show distinct counts.
  const dateOnlyCheck = mfDueDateOnly(ieDueDate, fnSvcDate, ieStatus, notFN, hasFN, ticketType);
  const timeOnlyCheck = mfDueTimeOnly(ieDueTime, fnSvcTime, ieStatus, notFN, hasFN, ticketType);
  const review      = [statusCheck,dueCheck,schedCheck,techCheck,confCheck].includes('Error') ? 'Yes' : 'No';

  return {
    values: [ticket,client,contract,store,siteCode,ticketType,ieStatus,ieDueDate,ieDueTime,ieSchedDate,ieSchedTime,etc,company,ieFE,phone,email,
      fnStatus,confirmed,mfDateOnlyValue(sent.date),mfTimeOnlyValue(sent.time),fnSvcDate,fnSvcTime,fnTechId,fnTechName,requests,
      review,statusCheck,dueCheck,schedCheck,techCheck,confCheck,
      fnAddr,fnCity,fnState,fnZip,ieAddr,ieCity,ieState,ieZip],
    meta: {ticket, ticketType, company, ieFE, fnTechName, fnSvcDate, fnSvcTime, ieDueDate, ieDueTime, ieSchedDate, ieSchedTime, ieStatus, fnStatus, confirmed, statusCheck, dueCheck, schedCheck, techCheck, confCheck, dateOnlyCheck, timeOnlyCheck, review, hasFN, notFN, isFN,
      orderNum: mfRaw(ie, ['Ord Num','Order Num','Order Number']), fnWOID: hasFN ? mfRaw(fn, ['WO ID']) : '', address: ieAddr, city: ieCity, state: ieState, zip: ieZip}
  };
}


function mfDashboardRowFromMaster(built, m, tkey, idx){
  const v = built.values || [];
  const row = {
    _idx: idx, rowId: 'mfr' + idx, srcRow: idx + 1,
    ticket: String(tkey || v[0] || '').trim(),
    type: String(v[5] || '').trim().toUpperCase(),
    company: v[12] || '',
    filterDate: mfParseDate(v[20]) || mfParseDate(v[7]) || mfParseDate(v[9]) || '',
    ieFEN: v[13] || '',
    ieFnStatus: v[26] || '',
    ieFnStat: (v[6] || '') + ' / ' + (v[16] || 'Not Posted'),
    ieDueDate: mfParseDate(v[7]) || '',
    ieDueTime: mfParseTime(v[8]) || '',
    ieSD: mfParseDate(v[9]) || '',
    ieST: mfParseTime(v[10]) || '',
    ieDD: mfParseDate(v[7]) || '',
    ieDT: mfParseTime(v[8]) || '',
    fnFEN: v[23] || '',
    fnSD: mfParseDate(v[20]) || '',
    fnST: mfParseTime(v[21]) || '',
    fnStatus: v[16] || '',
    trk: defTrk(),
    _masterRow: v,
    _mf:{
      orderNum:m.orderNum||'', ieStatus:v[6]||'', fnStatus:v[16]||'Not Posted',
      confirmed:v[17]||'', fnWOID:m.fnWOID||'',
      address:m.address||'', city:m.city||'', state:m.state||'', zip:m.zip||'',
      hasFN:m.hasFN,
      statusCheck:v[26]||'', dueCheck:v[27]||'', schedCheck:v[28]||'',
      techCheck:v[29]||'', confirmedCheck:v[30]||'', review:v[25]||''
    }
  };
  recomp(row);
  return row;
}

function mfFormulaCell(f){ return { f: String(f || '').replace(/^=/,'') }; }
function mfFormulaRow(r, sourceIeRow){
  const s = sourceIeRow || (r - 1);
  return [
    mfFormulaCell(`=IF('IE Report'!D${s}="","",'IE Report'!D${s})`),
    mfFormulaCell(`=IFERROR(IF(INDEX('IE Report'!A:A,MATCH(A${r},'IE Report'!D:D,0))="","",INDEX('IE Report'!A:A,MATCH(A${r},'IE Report'!D:D,0))),"")`),
    mfFormulaCell(`=IFERROR(IF(INDEX('IE Report'!B:B,MATCH(A${r},'IE Report'!D:D,0))="","",INDEX('IE Report'!B:B,MATCH(A${r},'IE Report'!D:D,0))),"")`),
    mfFormulaCell(`=IF(A${r}="","",VLOOKUP(A${r},'IE Report'!D:F,2,FALSE))`),
    mfFormulaCell(`=IF(A${r}="","",VLOOKUP(A${r},'IE Report'!D:F,3,FALSE))`),
    mfFormulaCell(`=IF(A${r}="","",VLOOKUP(A${r},'IE Report'!D:P,13,FALSE))`),
    mfFormulaCell(`=IF(A${r}="","",LEFT(VLOOKUP(A${r},'IE Report'!D:O,12,FALSE),1))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:L,9,FALSE)="","",DATE(YEAR(VLOOKUP(A${r},'IE Report'!D:L,9,FALSE)),MONTH(VLOOKUP(A${r},'IE Report'!D:L,9,FALSE)),DAY(VLOOKUP(A${r},'IE Report'!D:L,9,FALSE)))))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:L,9,FALSE)="","",TIME(HOUR(VLOOKUP(A${r},'IE Report'!D:L,9,FALSE)),MINUTE(VLOOKUP(A${r},'IE Report'!D:L,9,FALSE)),0)+TIME(0,1,0)))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:M,10,FALSE)="","",DATE(YEAR(VLOOKUP(A${r},'IE Report'!D:M,10,FALSE)),MONTH(VLOOKUP(A${r},'IE Report'!D:M,10,FALSE)),DAY(VLOOKUP(A${r},'IE Report'!D:M,10,FALSE)))))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:M,10,FALSE)="","",TIME(HOUR(VLOOKUP(A${r},'IE Report'!D:M,10,FALSE)),MINUTE(VLOOKUP(A${r},'IE Report'!D:M,10,FALSE)),0)+TIME(0,1,0)))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:N,11,FALSE)="","",VLOOKUP(A${r},'IE Report'!D:N,11,FALSE)))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:H,5,FALSE)="","",VLOOKUP(A${r},'IE Report'!D:H,5,FALSE)))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:I,6,FALSE)="","",VLOOKUP(A${r},'IE Report'!D:I,6,FALSE)))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:J,7,FALSE)="","",VLOOKUP(A${r},'IE Report'!D:J,7,FALSE)))`),
    mfFormulaCell(`=IF(A${r}="","",IF(VLOOKUP(A${r},'IE Report'!D:R,15,FALSE)="","",VLOOKUP(A${r},'IE Report'!D:R,15,FALSE)))`),
    mfFormulaCell(`=IFERROR(IF(A${r}="","",INDEX('FN Report'!F:F,MATCH(A${r},'FN Report'!P:P,0),1)),"Not Posted")`),
    mfFormulaCell(`=IFERROR(IF(Q${r}="Assigned",INDEX('FN Report'!E:E,MATCH(A${r},'FN Report'!P:P,0),1),""),"")`),
    mfFormulaCell(`=IF(A${r}="","",IF(Q${r}="Not Posted","",DATE(YEAR(INDEX('FN Report'!M:M,MATCH(A${r},'FN Report'!P:P,0),1)),MONTH(INDEX('FN Report'!M:M,MATCH(A${r},'FN Report'!P:P,0),1)),DAY(INDEX('FN Report'!M:M,MATCH(A${r},'FN Report'!P:P,0),1)))))`),
    mfFormulaCell(`=IF(A${r}="","",IF(Q${r}="Not Posted","",TIME(HOUR(INDEX('FN Report'!M:M,MATCH(A${r},'FN Report'!P:P,0),1)),MINUTE(INDEX('FN Report'!M:M,MATCH(A${r},'FN Report'!P:P,0),1)),0)))`),
    mfFormulaCell(`=IF(A${r}="","",IF(Q${r}="Not Posted","",DATE(YEAR(INDEX('FN Report'!G:G,MATCH(A${r},'FN Report'!P:P,0),1)),MONTH(INDEX('FN Report'!G:G,MATCH(A${r},'FN Report'!P:P,0),1)),DAY(INDEX('FN Report'!G:G,MATCH(A${r},'FN Report'!P:P,0),1)))))`),
    mfFormulaCell(`=IF(A${r}="","",IF(Q${r}="Not Posted","",TIMEVALUE(LEFT(INDEX('FN Report'!H:H,MATCH(A${r},'FN Report'!P:P,0),1),LEN(INDEX('FN Report'!H:H,MATCH(A${r},'FN Report'!P:P,0),1))-4))))`),
    mfFormulaCell(`=IF(OR(Q${r}="Assigned",Q${r}="Work Done"),INDEX('FN Report'!C:C,MATCH(A${r},'FN Report'!P:P,0),1),"")`),
    mfFormulaCell(`=IF(OR(Q${r}="Assigned",Q${r}="Work Done"),INDEX('FN Report'!D:D,MATCH(A${r},'FN Report'!P:P,0),1),"")`),
    mfFormulaCell(`=IF(OR(Q${r}="Routed",Q${r}="Published"),INDEX('FN Report'!N:N,MATCH(A${r},'FN Report'!P:P,0),1),"")`),
    mfFormulaCell(`=IF(A${r}="","",IF(OR(AA${r}="Error",AB${r}="Error",AC${r}="Error",AD${r}="Error",AE${r}="Error"),"Yes","No"))`),
    mfFormulaCell(`=IF(A${r}="","",IF(AND(G${r}="S",Q${r}="Assigned"),"OK",IF(AND(G${r}="U",Q${r}="Published"),"OK",IF(AND(G${r}="U",Q${r}="Routed"),"OK",IF(AND(G${r}="H",Q${r}="Not Posted"),"OK",IF(AND(M${r}<>"FIELD NATION",Q${r}="Not Posted"),"OK","Error"))))))`),
    mfFormulaCell(`=IF(A${r}="","",IF(G${r}="H","OK",IF(M${r}<>"FIELD NATION","OK",IF(AND(H${r}=U${r},I${r}=V${r}),"OK","Error"))))`),
    mfFormulaCell(`=IF(A${r}="","",IF(Q${r}="Assigned",IF(AND(J${r}=U${r},K${r}=V${r}),"OK","Error"),"OK"))`),
    mfFormulaCell(`=IF(A${r}="","",IF(OR(M${r}<>"FIELD NATION",G${r}="H"),"OK",LET(x,TRIM(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(X${r},"."," "),","," "),"-"," "),"_"," "),"/"," "),"'"," ")),n,TRIM(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(SUBSTITUTE(N${r},"."," "),","," "),"-"," "),"_"," "),"/"," "),"'"," ")),xf,UPPER(LEFT(x,FIND(" ",x&" ")-1)),nf,UPPER(LEFT(n,FIND(" ",n&" ")-1)),xl,UPPER(TRIM(RIGHT(SUBSTITUTE(x," ",REPT(" ",99)),99))),nl,UPPER(TRIM(RIGHT(SUBSTITUTE(n," ",REPT(" ",99)),99))),IF(OR(UPPER(SUBSTITUTE(x," ",""))=UPPER(SUBSTITUTE(n," ","")),AND(xf=nf,xl=nl,LEN(xf)>0,LEN(xl)>0)),"OK","Error"))))`),
    mfFormulaCell(`=IF(A${r}="","",IF(R${r}="No","Error","OK"))`),
    mfFormulaCell(`=IFERROR(INDEX('FN Report'!I:L, MATCH(A${r}, 'FN Report'!P:P, 0), 1), "")`),
    mfFormulaCell(`=IFERROR(INDEX('FN Report'!I:L, MATCH(A${r}, 'FN Report'!P:P, 0), 2), "")`),
    mfFormulaCell(`=IFERROR(INDEX('FN Report'!I:L, MATCH(A${r}, 'FN Report'!P:P, 0), 3), "")`),
    mfFormulaCell(`=IFERROR(INDEX('FN Report'!I:L, MATCH(A${r}, 'FN Report'!P:P, 0), 4), "")`),
    mfFormulaCell(`=IFERROR(INDEX(Sheet1!I:M, MATCH(A${r}, Sheet1!D:D, 0), 1), "")`),
    mfFormulaCell(`=IFERROR(INDEX(Sheet1!I:M, MATCH(A${r}, Sheet1!D:D, 0), 3), "")`),
    mfFormulaCell(`=IFERROR(INDEX(Sheet1!I:M, MATCH(A${r}, Sheet1!D:D, 0), 4), "")`),
    mfFormulaCell(`=IFERROR(INDEX(Sheet1!I:M, MATCH(A${r}, Sheet1!D:D, 0), 5), "")`)
  ];
}

/* ═══ GENERATE REPORT ══════════════════════════════════════════
   The Master workbook uses one row per IE ticket but only flags issues
   for tickets where Assigned Company = "Field Nation". Single-Workbook
   mode mirrors that by skipping non-FN rows entirely (parseSheet line:
   `if(normU(r[12])!=='FIELD NATION') continue;`). Multi-File mode does
   the same so the two modes produce identical card numbers given the
   same input data. ═══════════════════════════════════════════════════ */
function mfGenerateReport(){
  if(!(MF.ie.rows && MF.ie2.rows && MF.fn.rows)){ showBan('Upload all 3 files first.'); return; }

  const ieRows  = mfRows123('ie', MASTER_IE_HEADERS);
  const fnRows  = mfRows123('fn', MASTER_FN_HEADERS);
  const ie2Rows = mfRows123('ie2', MASTER_IE2_HEADERS);

  const fnByTkt = new Map();
  for(const r of fnRows){
    const t = mfPickField(r, ['Acuative Ticket','Custom: Acuative Ticket Number','Acuative Ticket Number','Ticket']);
    if(t!=null && t!=='') fnByTkt.set(String(t).trim(), r);
  }
  const ie2ByTkt = new Map();
  for(const r of ie2Rows){
    const t = mfPickField(r, ['Tkt Num','Ticket','Ticket Number']);
    if(t!=null && t!=='') ie2ByTkt.set(String(t).trim(), r);
  }

  const out = [];
  const masterRows = [];
  const masterFormulaIeRows = [];
  let idx = 0;
  let skippedNonFN = 0;
  let skippedNoFNMatch = 0;

  // New rule: count/export only tickets that exist on BOTH sides:
  // Inside Edge row must be assigned to FIELD NATION AND the same ticket must exist in FN Report.
  for(let ieIndex = 0; ieIndex < ieRows.length; ieIndex++){
    const ie = ieRows[ieIndex];
    const ticket = mfPickField(ie, ['Tkt Num','Ticket','Ticket Number']);
    if(ticket==null || ticket==='') continue;
    const tkey = String(ticket).trim();
    const fn   = fnByTkt.get(tkey) || null;
    const addr = ie2ByTkt.get(tkey) || null;
    const built = mfBuildMasterRow(ie, fn, addr);
    const m = built.meta;

    if(!m.isFN){ skippedNonFN++; continue; }
    if(!m.hasFN){ skippedNoFNMatch++; continue; }

    masterRows.push(built.values);
    // IE Report data starts on Excel row 2 because row 1 is headers.
    masterFormulaIeRows.push(ieIndex + 2);

    const dashRow = mfDashboardRowFromMaster(built, m, tkey, ++idx);
    out.push(dashRow);
  }

  MF.masterRows = masterRows;
  MF.masterFormulaIeRows = masterFormulaIeRows;
  MF.skippedNonFN = skippedNonFN;
  MF.skippedNoFNMatch = skippedNoFNMatch;
  S.raw = out;
  S.fileMeta = { name: 'Multi-File: ' + (MF.ie.file?.name||'Inside Edge') + ' + ' + (MF.ie2.file?.name||'Sheet1') + ' + ' + (MF.fn.file?.name||'FN'), rows: out.length, when: new Date().toISOString(), source: 'multi-file' };

  const ts=[...new Set(out.map(r=>r.type).filter(Boolean))].sort();
  E.typeF.innerHTML='<option value="all">All Types</option>'+ts.map(t=>'<option value="'+esc(t)+'">'+esc(t)+'</option>').join('');

  // Show the dashboard, restored filter toolbar, and report table after multi-file generation.
  if(E.dash) E.dash.classList.remove('h');
  if(E.tb) E.tb.classList.remove('h');
  if(E.tbp) E.tbp.classList.remove('h');
  if(E.tbl) E.tbl.classList.remove('h');
  clearF();
  const excelBtn=$('mfExcelBtn'); if(excelBtn) excelBtn.disabled = false;
  const pdfBtn=$('pdfBtn'); if(pdfBtn) pdfBtn.disabled = false;

  const errCount = out.filter(r=>r.fRes==='Error').length;
  const excCount = out.filter(r=>r.excA).length;
  showBan('✅ Generated ' + out.length.toLocaleString() + ' tickets existing in BOTH Inside Edge and Field Nation. Skipped: ' + skippedNonFN.toLocaleString() + ' non-Field-Nation Inside Edge rows, ' + skippedNoFNMatch.toLocaleString() + ' Inside Edge tickets not found in FN. ' + errCount + ' errors, ' + excCount + ' ITD/ITR exceptions.');
  setTimeout(()=>{ const el = $('dash'); if(el) el.scrollIntoView({behavior:'smooth', block:'start'}); }, 200);
}

/* ═══ EXCEL EXPORT (Multi-File) ════════════════════════════════ */
function mfExportExcel(){
  if(!S.raw.length){ showBan('Generate a report first.'); return; }
  if(typeof XLSX==='undefined'){ showBan('SheetJS failed to load.'); return; }

  const masterRows = (MF.masterRows && MF.masterRows.length) ? MF.masterRows : S.raw.map(r => r._masterRow || []);
  const reportAoA = [MASTER_REPORT_GROUP_ROW, MASTER_REPORT_HEADERS, ...masterRows];
  const formulaIeRows = (MF.masterFormulaIeRows && MF.masterFormulaIeRows.length) ? MF.masterFormulaIeRows : masterRows.map((_, i) => i + 2);
  const formulasAoA = [MASTER_FORMULAS_GROUP_ROW, MASTER_FORMULAS_HEADERS, ...masterRows.map((_, i) => mfFormulaRow(i + 3, formulaIeRows[i]))];

  const wb = XLSX.utils.book_new();
  const reportWs = XLSX.utils.aoa_to_sheet(reportAoA);
  const formulasWs = XLSX.utils.aoa_to_sheet(formulasAoA);
  const ieWs = XLSX.utils.aoa_to_sheet(mfIEReportAoA());
  const fnWs = XLSX.utils.aoa_to_sheet(mfFNReportAoA());
  const ie2Ws = XLSX.utils.aoa_to_sheet(mfSheet1AoA());

  mfApplyMasterReportFormat(reportWs, false);
  mfApplyMasterReportFormat(formulasWs, true);
  mfApplyRawSheetFormat(ieWs, [10,14,12,12,12,12,15,22,22,14,14,18,18,8,10,12,22,22,8]);
  mfApplyRawSheetFormat(fnWs, [12,28,12,22,20,14,14,16,24,18,10,12,20,10,16,16]);
  mfApplyRawSheetFormat(ie2Ws, [10,14,12,12,12,12,18,24,26,18,18,10,12,16,14,22,22,14,14,18,18,8,10,12,22,22,24,8]);

  XLSX.utils.book_append_sheet(wb, reportWs, 'Report');
  XLSX.utils.book_append_sheet(wb, formulasWs, 'Formulas');
  XLSX.utils.book_append_sheet(wb, ieWs, 'IE Report');
  XLSX.utils.book_append_sheet(wb, fnWs, 'FN Report');
  XLSX.utils.book_append_sheet(wb, ie2Ws, 'Sheet1');
  wb.SheetNames = ['Report','Formulas','IE Report','FN Report','Sheet1'];

  const fname = 'Field_Nation_Daily_Validation_Master_Matched_' + stamp() + '.xlsx';
  XLSX.writeFile(wb, fname);
  showBan('📊 Master-matched Excel exported: ' + fname);
}

/* ═══ INIT ═════════════════════════════════════════════════════ */
function initMultiFileMode(){
  // Mode switcher — use currentTarget so child clicks still resolve the button
  document.querySelectorAll('.mode-tab').forEach(t=>{
    t.addEventListener('click', (ev)=> {
      const btn = ev.currentTarget || (ev.target && ev.target.closest && ev.target.closest('.mode-tab')) || t;
      const m = btn && btn.getAttribute ? btn.getAttribute('data-mode') : null;
      if(m) setMode(m);
    });
  });

  // Upload slots
  ['ie','ie2','fn'].forEach(key=>{
    const input = $('mfFile' + key.toUpperCase());
    if(!input) return;
    input.addEventListener('change', ev => {
      const f = ev.target.files && ev.target.files[0];
      if(f) mfHandleUpload(key, f);
    });
    // Drag & drop on the slot label
    const slot = document.querySelector(`.mf-slot[data-slot="${key}"]`);
    if(slot){
      slot.addEventListener('dragover', ev=>{ ev.preventDefault(); slot.style.borderColor='var(--ie-bl)';});
      slot.addEventListener('dragleave', ()=>{ slot.style.borderColor=''; });
      slot.addEventListener('drop', ev=>{
        ev.preventDefault(); slot.style.borderColor='';
        const f = ev.dataTransfer.files && ev.dataTransfer.files[0];
        if(f) mfHandleUpload(key, f);
      });
    }
  });

  // Buttons
  const gb = $('mfGenBtn'); if(gb) gb.addEventListener('click', mfGenerateReport);
  const rb = $('mfResetBtn'); if(rb) rb.addEventListener('click', mfReset);
  const eb = $('mfExcelBtn'); if(eb) eb.addEventListener('click', mfExportExcel);

  mfUpdateGenBtn();
}

if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',bindAll);
else bindAll();
