'use strict';

/* =========================================================
   POMODORO + HORAS DE ESTUDIO + CALCULADORA DE NOTA FINAL
   - Pomodoro: temporizador de concentración/descanso ligado a una asignatura.
     Cada sesión completada se guarda en S.study y suma a las horas de estudio.
   - Horas de estudio: tarjeta en "Hoy" con totales y reparto por asignatura.
   - Calculadora: dentro de Asignaturas > Mis notas (qué nota necesito y simulador).
   Se carga DESPUÉS de extras.js.
   Datos: S.study = [{ id, date, subjectId, min, ts }]   S.settings.pomo = { focus, brk }
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const studyArr = () => (S.study = Array.isArray(S.study) ? S.study : []);
  const cfg = () => {
    S.settings = S.settings || {};
    S.settings.pomo = Object.assign({ focus: 25, brk: 5 }, S.settings.pomo);
    return S.settings.pomo;
  };
  const shortD = ds => parse(ds).toLocaleDateString('es-ES');
  const pad2 = n => String(n).padStart(2, '0');
  const mmss = s => `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
  const fmtMin = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`);
  const r1 = x => Math.round(x * 10) / 10;
  const baseTitle = document.title;

  /* ---------------------------------------------------------
     Pomodoro
     --------------------------------------------------------- */
  const PKEY = 'planner.pomo';
  const st = { phase: 'focus', running: false, endsAt: 0, left: 0, subjectId: '' };
  const total = () => (st.phase === 'focus' ? cfg().focus : cfg().brk) * 60;
  const remaining = () => st.running ? Math.max(0, Math.round((st.endsAt - Date.now()) / 1000)) : st.left;
  const persist = () => { try { localStorage.setItem(PKEY, JSON.stringify(st)); } catch { } };

  function logStudy(min, subjectId, date) {
    min = Math.round(min);
    if (!(min >= 1)) return false;
    studyArr().push({ id: uid(), date: date || fmt(new Date()), subjectId: subjectId || '', min, ts: Date.now() });
    save();
    return true;
  }
  const subjName = id => (getSubj(id) ? getSubj(id).name : '');

  function complete() {
    const wasFocus = st.phase === 'focus';
    const mins = cfg().focus, sid = st.subjectId;
    if (wasFocus) logStudy(mins, sid);
    st.phase = wasFocus ? 'break' : 'focus';
    st.running = false; st.left = total(); persist();
    if (wasFocus) notify('🍅 ¡Pomodoro completado!', `Has estudiado ${mins} min${subjName(sid) ? ' de ' + subjName(sid) : ''}. Toca descansar ${cfg().brk} min.`);
    else notify('☕ Descanso terminado', 'Cuando quieras, empieza otro pomodoro.');
    render();
  }
  function toggle() {
    if (st.running) { st.left = remaining(); st.running = false; }
    else { if (st.left <= 0) st.left = total(); st.endsAt = Date.now() + st.left * 1000; st.running = true; }
    persist(); render(); updateLive();
  }
  function finish() {
    if (st.phase !== 'focus') { st.phase = 'focus'; st.running = false; st.left = total(); persist(); render(); return; } // saltar descanso
    const min = Math.floor((total() - remaining()) / 60);
    if (min < 1) { toast('🍅 Pomodoro', 'Aún no llevas ni un minuto de estudio.'); return; }
    logStudy(min, st.subjectId);
    st.phase = 'break'; st.running = false; st.left = total(); persist(); render();
    toast('✅ Registrado', `${fmtMin(min)} de estudio guardados.`);
  }
  function reset() { st.running = false; st.left = total(); persist(); render(); updateLive(); }

  // Chip en la cabecera mientras corre el temporizador
  const chip = document.createElement('button');
  chip.id = 'pm-chip';
  chip.className = 'ghost';
  chip.style.display = 'none';
  chip.title = 'Ir al Pomodoro';
  chip.addEventListener('click', () => { ui.view = 'today'; render(); });
  document.querySelector('.top').append(chip);

  function updateLive() {
    const r = remaining();
    if (st.running && r <= 0) { complete(); return; }
    const t = mmss(r), icon = st.phase === 'focus' ? '🍅' : '☕';
    const el = q('pm-time'); if (el) el.textContent = t;
    const bar = q('pm-bar'); if (bar) bar.style.width = (100 - r / total() * 100) + '%';
    chip.style.display = st.running ? '' : 'none';
    chip.textContent = `${icon} ${t}`;
    document.title = st.running ? `${icon} ${t} · Planificador` : baseTitle;
  }

  function restore() {
    st.left = total();
    try {
      const o = JSON.parse(localStorage.getItem(PKEY));
      if (o && (o.phase === 'focus' || o.phase === 'break')) {
        Object.assign(st, { phase: o.phase, running: !!o.running, endsAt: o.endsAt || 0, left: o.left > 0 ? o.left : total(), subjectId: o.subjectId || '' });
      }
    } catch { }
    if (st.running && st.endsAt - Date.now() <= 0) {
      if (Date.now() - st.endsAt <= 10 * 60000) setTimeout(complete, 0); // acabó con la página cerrada hace poco
      else { st.running = false; st.left = total(); }
    }
  }
  restore();

  function pomoCard() {
    const r = remaining(), focus = st.phase === 'focus', c = cfg();
    if (st.subjectId && !getSubj(st.subjectId)) st.subjectId = '';
    const opts = '<option value="">— Sin asignatura —</option>' +
      S.subjects.map(s => `<option value="${s.id}" ${s.id === st.subjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    const label = st.running ? '⏸ Pausa' : (r < total() ? '▶ Continuar' : '▶ Iniciar');
    return `<div class="card pm ${focus ? '' : 'brk'}">
      <div class="es-title"><h3>🍅 Pomodoro</h3><span class="pm-phase">${focus ? 'Concentración' : 'Descanso'}</span></div>
      <div class="pm-time" id="pm-time">${mmss(r)}</div>
      <div class="progress"><span id="pm-bar" style="width:${100 - r / total() * 100}%"></span></div>
      <label>Estudiando <select data-pm="subj">${opts}</select></label>
      <div class="pm-btns">
        <button class="primary" data-act="pmToggle">${label}</button>
        <button data-act="pmFinish">${focus ? '✔ Terminar y registrar' : '⏭ Saltar descanso'}</button>
        <button class="ghost" data-act="pmReset">↺ Reiniciar</button>
      </div>
      <div class="pm-cfg">Concentración <input type="number" min="1" max="180" value="${c.focus}" data-pm="focus" ${st.running ? 'disabled' : ''}> min ·
        Descanso <input type="number" min="1" max="60" value="${c.brk}" data-pm="brk" ${st.running ? 'disabled' : ''}> min</div>
    </div>`;
  }

  document.addEventListener('change', e => {
    const k = e.target.dataset && e.target.dataset.pm;
    if (!k) return;
    if (k === 'subj') { st.subjectId = e.target.value; persist(); return; }
    const v = Math.max(1, Math.min(k === 'focus' ? 180 : 60, Math.round(Number(e.target.value)) || 1));
    cfg()[k] = v;
    if (!st.running) st.left = total();
    save(); persist(); render();
  });

  /* ---------------------------------------------------------
     Horas de estudio
     --------------------------------------------------------- */
  let range = 'week';
  const rangeStart = r => {
    const now = new Date();
    return r === 'week' ? fmt(mondayOf(now)) : r === 'month' ? fmt(new Date(now.getFullYear(), now.getMonth(), 1)) : '0000-00-00';
  };
  const sumMin = list => list.reduce((a, x) => a + x.min, 0);
  function bySubject(r) {
    const from = rangeStart(r), m = new Map();
    studyArr().filter(x => x.date >= from).forEach(x => {
      const k = getSubj(x.subjectId) ? x.subjectId : '';
      m.set(k, (m.get(k) || 0) + x.min);
    });
    return [...m.entries()].map(([id, min]) => {
      const s = getSubj(id);
      return { id, name: s ? s.name : 'Sin asignatura', color: s ? s.color : '#64748b', min };
    }).sort((a, b) => b.min - a.min);
  }
  function studyCard() {
    const now = new Date(), today = fmt(now), wk = rangeStart('week');
    const all = studyArr();
    const kTotal = sumMin(all), kToday = sumMin(all.filter(x => x.date === today)), kWeek = sumMin(all.filter(x => x.date >= wk));
    const days = [...Array(7)].map((_, i) => {
      const ds = fmt(addDays(mondayOf(now), i));
      return { ds, i, min: sumMin(all.filter(x => x.date === ds)) };
    });
    const maxDay = Math.max(60, ...days.map(d => d.min));
    const cols = days.map(d => `<div class="st-day" title="${fmtMin(d.min)}">
      <small>${d.min ? r1(d.min / 60) + 'h' : ''}</small><i style="height:${Math.round(d.min / maxDay * 56)}px;${d.ds === today ? 'background:var(--ok)' : ''}"></i>
      <span>${DAYS[d.i].slice(0, 3)}</span></div>`).join('');
    const rows = bySubject(range);
    const maxS = Math.max(1, ...rows.map(r => r.min));
    const rowsHTML = rows.map(r => `<div class="st-row" style="--c:${r.color}"><span class="n">${esc(r.name)}</span>
      <div class="st-bar"><span style="width:${r.min / maxS * 100}%"></span></div><b>${fmtMin(r.min)}</b></div>`).join('')
      || '<p class="muted">Aún no hay horas en este periodo. Usa el Pomodoro o "+ Añadir tiempo".</p>';
    const tab = (r, t) => `<button class="${range === r ? 'active' : ''}" data-act="pmRange" data-r="${r}">${t}</button>`;
    const last = all.slice().sort((a, b) => b.ts - a.ts).slice(0, 4).map(x => `<div class="st-last">
      <span>${shortD(x.date)} · ${esc(subjName(x.subjectId) || 'Sin asignatura')} · ${fmtMin(x.min)}</span>
      <button class="small ghost" data-act="pmDel" data-id="${x.id}" title="Quitar esta sesión">✕</button></div>`).join('');
    return `<div class="card"><div class="es-title"><h3>⏱️ Horas de estudio</h3>
      <button class="small primary" data-act="pmAdd">+ Añadir tiempo</button></div>
      <div class="st-kpis"><div><b>${fmtMin(kToday)}</b><span>hoy</span></div><div><b>${fmtMin(kWeek)}</b><span>esta semana</span></div><div><b>${fmtMin(kTotal)}</b><span>en total</span></div></div>
      <div class="st-days">${cols}</div>
      <div class="tabs" style="margin:10px 0 6px">${tab('week', 'Semana')}${tab('month', 'Mes')}${tab('all', 'Todo')}</div>
      ${rowsHTML}
      ${last ? `<div class="hint" style="margin-top:10px">Últimas sesiones</div>${last}` : ''}</div>`;
  }

  // Las dos tarjetas van en una fila nueva debajo del resto de la pantalla "Hoy"
  const prevToday = renderToday;
  renderToday = function () {
    return prevToday() + `<div class="grid2" style="margin-top:16px">${pomoCard()}${studyCard()}</div>`;
  };

  /* ---------------------------------------------------------
     Calculadora de nota final (dentro de Mis notas)
     --------------------------------------------------------- */
  const calcState = {}; // por asignatura: { target, sims: { idEvaluacion: valor } }
  const cs = s => (calcState[s.id] = calcState[s.id] || { target: null, sims: {} });

  function calcNumbers(s, target, sims) {
    const t = stats(s);
    const pending = (s.grades || []).filter(g => g.grade === '' || g.grade == null)
      .map(g => ({ id: g.id, name: g.name, weight: Number(g.weight) || 0 }));
    const extra = Math.max(0, t.rem - pending.reduce((a, g) => a + g.weight, 0));
    if (extra > 0.0001) pending.push({ id: '_rest', name: 'Resto sin definir', weight: extra });
    let pf = 0, wOpen = 0;
    pending.forEach(g => {
      const v = sims[g.id];
      if (v === undefined || v === '' || isNaN(Number(v))) wOpen += g.weight;
      else pf += Math.max(0, Math.min(10, Number(v))) * g.weight / 100;
    });
    const base = t.pts + pf;
    return {
      st: t, pending, base, wOpen, min: base, max: base + wOpen / 10,
      keep: t.avg == null ? null : base + wOpen / 100 * t.avg,
      need: wOpen > 0 ? (target - base) / (wOpen / 100) : null, target
    };
  }
  function calcOut(s) {
    const c = cs(s), target = c.target != null ? c.target : Number(s.target ?? 5);
    const n = calcNumbers(s, target, c.sims), f2 = x => x.toFixed(2), w = r1(n.wOpen);
    let cls, msg;
    if (n.wOpen <= 0.0001) {
      cls = n.base >= target ? 'good' : 'bad';
      msg = n.base >= target ? `✅ Terminarías con <b>${f2(n.base)}</b>: llegas al ${target}.` : `Terminarías con <b>${f2(n.base)}</b>: no llegas al ${target}.`;
    } else if (n.need <= 0) {
      cls = 'good'; msg = `✅ Ya tienes asegurado el ${target}, aunque saques 0 en el ${w}% que falta.`;
    } else if (n.need > 10) {
      cls = 'bad'; msg = `⚠️ No es posible: ni con un 10 en el ${w}% que falta llegas al ${target} (máximo ${f2(n.max)}).`;
    } else {
      cls = 'info'; msg = `Para llegar al ${target} necesitas una media de <b>${f2(n.need)}</b> en el ${w}% que falta.`;
    }
    return `<div class="verdict ${cls}">${msg}</div>
      <div class="cc-grid">
        <div><b>${f2(n.st.pts)}</b><span>puntos ya conseguidos</span></div>
        <div><b>${f2(n.min)}</b><span>nota final mínima</span></div>
        <div><b>${n.keep == null ? '—' : f2(n.keep)}</b><span>si mantienes tu media${n.st.avg == null ? '' : ' (' + f2(n.st.avg) + ')'}</span></div>
        <div><b>${f2(n.max)}</b><span>nota final máxima</span></div></div>`;
  }
  function calcBlock(s) {
    const c = cs(s), target = c.target != null ? c.target : Number(s.target ?? 5);
    const n = calcNumbers(s, target, c.sims);
    const sims = n.pending.map(g => `<label class="cc-sim">${esc(g.name)} <span class="muted">(${r1(g.weight)}%)</span>
      <input type="number" min="0" max="10" step="0.1" placeholder="?" data-cc="sim" data-gid="${g.id}" data-sid="${s.id}" value="${esc(c.sims[g.id] ?? '')}"></label>`).join('');
    return `<div class="calc"><h3>🧮 Calculadora de nota final</h3>
      <label class="cc-t">Quiero sacar al final (0-10) <input type="number" min="0" max="10" step="0.1" data-cc="target" data-sid="${s.id}" value="${target}"></label>
      ${sims ? `<p class="hint">Simulador: escribe la nota que crees que sacarás en cada evaluación pendiente (déjalo vacío si no lo sabes).</p><div class="cc-sims">${sims}</div>` : ''}
      <div id="cc-out">${calcOut(s)}</div></div>`;
  }
  document.addEventListener('input', e => {
    const t = e.target, k = t.dataset && t.dataset.cc;
    if (!k) return;
    const s = getSubj(t.dataset.sid);
    if (!s) return;
    const c = cs(s);
    if (k === 'target') c.target = t.value === '' ? null : Math.max(0, Math.min(10, Number(t.value)));
    else c.sims[t.dataset.gid] = t.value;
    q('cc-out').innerHTML = calcOut(s);
  });

  const prevGrades = gradesTab;
  gradesTab = function (s) {
    const html = prevGrades(s), anchor = '<button class="primary" data-act="newGrade">', block = calcBlock(s);
    return html.includes(anchor) ? html.replace(anchor, () => block + anchor) : html + block;
  };

  /* ---------------------------------------------------------
     Diálogo "añadir tiempo", estilos y acciones
     --------------------------------------------------------- */
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="pmDlg">
      <form id="pmForm">
        <h2>⏱️ Añadir tiempo de estudio</h2>
        <div class="row">
          <label>Asignatura <select id="pa-subj"></select></label>
          <label>Minutos <input type="number" id="pa-min" min="1" max="720" value="60" required></label>
        </div>
        <label>Fecha <input type="date" id="pa-date" required></label>
        <div class="actions">
          <span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cancelar</button>
          <button type="submit" class="primary">Guardar</button>
        </div>
      </form>
    </dialog>`);
  document.querySelectorAll('#pmDlg [data-x]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  const style = document.createElement('style');
  style.textContent = `
    .pm-time { font-size: 3.2rem; font-weight: 800; font-variant-numeric: tabular-nums; text-align: center; margin: 2px 0 8px; }
    .pm.brk .pm-time { color: var(--ok); }
    .pm-phase { font-size: .85rem; color: var(--muted); }
    .pm label { display: block; margin: 12px 0 6px; font-size: .85rem; color: var(--muted); }
    .pm select, .pm-cfg input, .cc-sim input, .cc-t input { padding: 7px 8px; font: inherit; border: 1px solid var(--line); border-radius: 8px; background: var(--bg); color: var(--text); }
    .pm select { display: block; width: 100%; margin-top: 4px; }
    .pm-btns { display: flex; gap: 8px; flex-wrap: wrap; }
    .pm-cfg { margin-top: 12px; font-size: .85rem; color: var(--muted); }
    .pm-cfg input { width: 64px; padding: 4px 6px; }
    #pm-chip { font-variant-numeric: tabular-nums; font-weight: 700; }
    .st-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 12px; }
    .st-kpis div { background: var(--bg); border-radius: 10px; padding: 8px; text-align: center; }
    .st-kpis b { display: block; font-size: 1.05rem; }
    .st-kpis span { font-size: .75rem; color: var(--muted); }
    .st-days { display: flex; gap: 6px; align-items: flex-end; height: 96px; }
    .st-day { flex: 1; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; text-align: center; font-size: .7rem; color: var(--muted); height: 100%; }
    .st-day i { display: block; background: var(--primary); border-radius: 5px 5px 0 0; min-height: 2px; margin: 2px 0; }
    .st-row { display: flex; align-items: center; gap: 8px; margin: 7px 0; }
    .st-row .n { flex: 0 0 38%; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; border-left: 4px solid var(--c); padding-left: 8px; }
    .st-bar { flex: 1; height: 12px; background: var(--bg); border-radius: 999px; overflow: hidden; }
    .st-bar span { display: block; height: 100%; background: var(--c); }
    .st-row b { font-size: .85rem; min-width: 70px; text-align: right; }
    .st-last { display: flex; align-items: center; justify-content: space-between; font-size: .85rem; padding: 2px 0; }
    .st-last button { border: 0; padding: 2px 8px; }
    .calc { border: 1px solid var(--line); border-radius: 10px; padding: 12px 14px; margin: 14px 0; background: var(--bg); }
    .calc h3 { margin-top: 0; }
    .cc-t { display: block; font-size: .85rem; color: var(--muted); margin-bottom: 8px; }
    .cc-t input { width: 90px; margin-left: 6px; }
    .cc-sims { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 8px; margin-bottom: 8px; }
    .cc-sim { font-size: .85rem; }
    .cc-sim input { display: block; width: 100%; margin-top: 3px; }
    .cc-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 8px; }
    .cc-grid div { background: var(--card); border-radius: 10px; padding: 8px; text-align: center; border: 1px solid var(--line); }
    .cc-grid b { display: block; font-size: 1.15rem; }
    .cc-grid span { font-size: .75rem; color: var(--muted); }
  `;
  document.head.appendChild(style);

  q('pmForm').addEventListener('submit', ev => {
    ev.preventDefault();
    logStudy(Number(q('pa-min').value), q('pa-subj').value, q('pa-date').value);
    q('pmDlg').close(); render();
  });

  actions.pmToggle = toggle;
  actions.pmFinish = finish;
  actions.pmReset = reset;
  actions.pmRange = d => { range = d.r; render(); };
  actions.pmDel = d => { S.study = studyArr().filter(x => x.id !== d.id); save(); render(); };
  actions.pmAdd = () => {
    q('pa-subj').innerHTML = '<option value="">— Sin asignatura —</option>' +
      S.subjects.map(s => `<option value="${s.id}" ${s.id === st.subjectId ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    q('pa-min').value = 60;
    q('pa-date').value = fmt(new Date());
    q('pmDlg').showModal();
  };

  setInterval(updateLive, 500);

  // Para pruebas
  window.Pomo = { st, cfg, logStudy, complete, toggle, finish, reset, bySubject, calcNumbers, calcOut, cs, tick: updateLive, remaining };

  render(); // pinta ya las tarjetas nuevas
  updateLive();
})();