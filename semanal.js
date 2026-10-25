'use strict';

/* =========================================================
   OBJETIVO SEMANAL DE HORAS + RESUMEN SEMANAL
   Dos tarjetas nuevas al final de "Hoy":
   - 🎯 Objetivo semanal: horas que quieres estudiar cada semana por asignatura, con
     barra de progreso, lo que falta y cuánto toca al día. Aviso al cumplir un objetivo.
   - 📊 Resumen semanal: horas de la semana (y comparación con la anterior), reparto por
     asignatura, tareas hechas y lo que viene. Se puede ver semanas pasadas y copiar el texto.
   Datos: S.weekGoals = { [idAsignatura]: horasPorSemana }  ·  S.tasks[].doneAt = 'YYYY-MM-DD'
   Se carga DESPUÉS de repaso.js.
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
  const goals = () => (S.weekGoals = (S.weekGoals && typeof S.weekGoals === 'object' && !Array.isArray(S.weekGoals)) ? S.weekGoals : {});
  const studyArr = () => Array.isArray(S.study) ? S.study : [];
  const tasksArr = () => Array.isArray(S.tasks) ? S.tasks : [];
  const fm = m => { m = Math.round(m); if (m < 60) return m + ' min'; const h = Math.floor(m / 60), r = m % 60; return r ? `${h} h ${r} min` : `${h} h`; };
  const range = off => { const m = addDays(mondayOf(new Date()), off * 7); return { from: fmt(m), to: fmt(addDays(m, 6)), m }; };
  const inR = (d, r) => d >= r.from && d <= r.to;
  const short = ds => { const d = parse(ds); return `${d.getDate()}/${d.getMonth() + 1}`; };
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  let off = 0; // semana que muestra el resumen: 0 = esta, -1 = la pasada...

  function perSubject(r) {
    const m = {};
    studyArr().filter(x => inR(x.date, r)).forEach(x => { m[x.subjectId || ''] = (m[x.subjectId || ''] || 0) + x.min; });
    return m;
  }
  const total = m => Object.values(m).reduce((a, b) => a + b, 0);
  const sName = id => (getSubj(id) || {}).name || 'Sin asignatura';
  const sColor = id => (getSubj(id) || {}).color || '#64748b';

  // ---------- Tarjeta: objetivo semanal ----------
  function goalRows() {
    const g = goals(), per = perSubject(range(0));
    const dow = (new Date().getDay() + 6) % 7, left = 7 - dow; // días que quedan, contando hoy
    return S.subjects.filter(s => Number(g[s.id]) > 0).map(s => {
      const goalMin = Number(g[s.id]) * 60, done = per[s.id] || 0;
      return { s, goalMin, done, reached: done >= goalMin, pct: Math.min(100, Math.round(done / goalMin * 100)), perDay: Math.max(0, goalMin - done) / left, left };
    });
  }
  function goalCard() {
    const rows = goalRows();
    const head = `<div class="es-title"><h3>🎯 Objetivo semanal</h3><button class="small primary" data-act="wgEdit">${rows.length ? '✏️ Editar' : '+ Fijar objetivos'}</button></div>`;
    if (!rows.length) {
      return `<div class="card">${head}<p class="muted">${S.subjects.length
        ? 'Fija cuántas horas quieres estudiar cada semana de cada asignatura y verás aquí cuánto te falta.'
        : 'Crea primero alguna asignatura para poder fijar un objetivo semanal.'}</p></div>`;
    }
    const gTot = rows.reduce((a, r) => a + r.goalMin, 0), dTot = rows.reduce((a, r) => a + Math.min(r.done, r.goalMin), 0);
    const html = rows.map(r => `<div class="wg-row" style="--c:${r.s.color}">
      <div class="wg-top"><span class="n">${esc(r.s.name)}</span><b>${fm(r.done)} / ${fm(r.goalMin)}</b></div>
      <div class="wg-bar"><span class="${r.reached ? 'ok' : ''}" style="width:${r.pct}%"></span></div>
      <div class="wg-sub">${r.reached ? '✅ ¡Objetivo cumplido!' : `Faltan ${fm(r.goalMin - r.done)} · unos ${fm(Math.ceil(r.perDay / 5) * 5)} al día hasta el domingo`}</div></div>`).join('');
    return `<div class="card">${head}
      <div class="wg-total"><b>${Math.round(dTot / gTot * 100)}%</b><span>de tu objetivo de ${fm(gTot)} esta semana</span></div>${html}</div>`;
  }

  // ---------- Resumen semanal (datos + texto) ----------
  function summaryData(o) {
    const r = range(o), pr = range(o - 1), today = fmt(new Date());
    const cur = perSubject(r), prev = perSubject(pr), tot = total(cur), ptot = total(prev);
    const perDay = [...Array(7)].map((_, i) => { const ds = fmt(addDays(r.m, i)); return { ds, i, min: studyArr().filter(x => x.date === ds).reduce((a, x) => a + x.min, 0) }; });
    const best = perDay.slice().sort((a, b) => b.min - a.min)[0];
    const done = tasksArr().filter(t => t.done && t.doneAt && inR(t.doneAt, r));
    const g = goals();
    const goalRes = S.subjects.filter(s => Number(g[s.id]) > 0).map(s => ({ s, goalMin: g[s.id] * 60, done: cur[s.id] || 0 }));
    const next = o === 0 ? {
      exams: S.events.filter(e => e.cat === 'examen' && e.repeat !== 'weekly' && e.date >= today && daysBetween(today, e.date) <= 14)
        .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)),
      tasks: tasksArr().filter(t => !t.done && t.due && t.due >= today && daysBetween(today, t.due) <= 7).sort((a, b) => a.due.localeCompare(b.due)),
      late: tasksArr().filter(t => !t.done && t.due && t.due < today)
    } : null;
    return { r, tot, ptot, cur, perDay, best, daysStudied: perDay.filter(d => d.min > 0).length, done, goalRes, next };
  }
  const diffTxt = (a, b) => b === 0 && a === 0 ? 'sin horas registradas ninguna de las dos semanas'
    : a === b ? 'igual que la semana anterior'
      : `${a > b ? '▲' : '▼'} ${fm(Math.abs(a - b))} ${a > b ? 'más' : 'menos'} que la semana anterior (${fm(b)})`;
  function summaryText(o) {
    const d = summaryData(o);
    const L = [`Resumen semanal ${short(d.r.from)} – ${short(d.r.to)}`, '', `Estudio: ${fm(d.tot)} · ${diffTxt(d.tot, d.ptot)}`, `Días con estudio: ${d.daysStudied} de 7${d.best.min ? ` · mejor día: ${DIAS[d.best.i]} (${fm(d.best.min)})` : ''}`];
    const subs = Object.entries(d.cur).sort((a, b) => b[1] - a[1]);
    if (subs.length) { L.push('', 'Por asignatura:'); subs.forEach(([id, m]) => L.push(`- ${sName(id)}: ${fm(m)}`)); }
    if (d.goalRes.length) { L.push('', 'Objetivos semanales:'); d.goalRes.forEach(x => L.push(`- ${x.s.name}: ${fm(x.done)} de ${fm(x.goalMin)} ${x.done >= x.goalMin ? '✅' : ''}`)); }
    L.push('', `Tareas hechas: ${d.done.length}`); d.done.slice(0, 8).forEach(t => L.push(`- ${t.text}`));
    if (d.next) {
      if (d.next.exams.length) { L.push('', 'Exámenes próximos (14 días):'); d.next.exams.forEach(e => L.push(`- ${e.title} · ${short(e.date)} ${e.start}`)); }
      if (d.next.tasks.length) { L.push('', 'Tareas para los próximos 7 días:'); d.next.tasks.forEach(t => L.push(`- ${t.text} · ${short(t.due)}`)); }
      if (d.next.late.length) L.push('', `Tareas atrasadas: ${d.next.late.length}`);
    }
    return L.join('\n');
  }
  function summaryCard() {
    const d = summaryData(off);
    const title = off === 0 ? 'Esta semana' : off === -1 ? 'Semana pasada' : `Hace ${-off} semanas`;
    const nav = `<div class="wk-nav"><button class="small ghost" data-act="wkSumPrev" title="Semana anterior">◀</button>
      <button class="small ghost" data-act="wkSumNext" title="Semana siguiente" ${off === 0 ? 'disabled' : ''}>▶</button></div>`;
    const subs = Object.entries(d.cur).sort((a, b) => b[1] - a[1]);
    const maxS = Math.max(1, ...subs.map(x => x[1]));
    const subHTML = subs.map(([id, m]) => `<div class="st-row" style="--c:${sColor(id)}"><span class="n">${esc(sName(id))}</span>
      <div class="st-bar"><span style="width:${m / maxS * 100}%"></span></div><b>${fm(m)}</b></div>`).join('') || '<p class="muted">No hay horas registradas esa semana.</p>';
    const goalHTML = d.goalRes.length ? `<div class="hint" style="margin-top:10px">Objetivos semanales</div>` + d.goalRes.map(x =>
      `<div class="sm-line">${x.done >= x.goalMin ? '✅' : '⬜'} ${esc(x.s.name)}: <b>${fm(x.done)}</b> de ${fm(x.goalMin)}</div>`).join('') : '';
    const doneHTML = `<div class="hint" style="margin-top:10px">Tareas hechas: ${d.done.length}</div>` + d.done.slice(0, 5).map(t => `<div class="sm-line">☑️ ${esc(t.text)}</div>`).join('')
      + (d.done.length > 5 ? `<div class="sm-line muted">…y ${d.done.length - 5} más</div>` : '');
    const nextHTML = d.next ? ((d.next.exams.length || d.next.tasks.length || d.next.late.length) ? `<div class="hint" style="margin-top:10px">Lo que viene</div>`
      + d.next.exams.map(e => `<div class="sm-line">📝 ${esc(e.title)} · ${short(e.date)} ${e.start}</div>`).join('')
      + d.next.tasks.map(t => `<div class="sm-line">⬜ ${esc(t.text)} · ${short(t.due)}</div>`).join('')
      + (d.next.late.length ? `<div class="sm-line" style="color:var(--danger)">⚠️ ${d.next.late.length} tarea(s) atrasada(s)</div>` : '') : '') : '';
    return `<div class="card"><div class="es-title"><h3>📊 Resumen semanal</h3>${nav}</div>
      <div class="hint">${title} · ${short(d.r.from)} – ${short(d.r.to)}</div>
      <div class="wg-total"><b>${fm(d.tot)}</b><span>${diffTxt(d.tot, d.ptot)}</span></div>
      <div class="sm-line">📅 Días con estudio: <b>${d.daysStudied} de 7</b>${d.best.min ? ` · mejor día: <b>${DIAS[d.best.i]}</b> (${fm(d.best.min)})` : ''}</div>
      <div style="margin-top:8px">${subHTML}</div>${goalHTML}${doneHTML}${nextHTML}
      <div style="margin-top:12px"><button class="small ghost" data-act="wkSumCopy">📋 Copiar resumen</button></div></div>`;
  }

  // ---------- Pantalla Hoy: dos tarjetas más ----------
  const prevToday = renderToday;
  renderToday = function () {
    return prevToday() + `<div class="grid2" style="margin-top:16px">${goalCard()}${summaryCard()}</div>`;
  };

  // ---------- Diálogo para fijar los objetivos ----------
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="wgDlg">
      <form id="wgForm">
        <h2>🎯 Objetivo semanal de horas</h2>
        <p class="hint">Horas que quieres estudiar cada semana de cada asignatura. Deja en blanco o en 0 las que no quieras medir.</p>
        <div id="wg-list"></div>
        <div class="actions"><span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cancelar</button>
          <button type="submit" class="primary">Guardar</button></div>
      </form>
    </dialog>`);
  document.querySelectorAll('#wgDlg [data-x]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  actions.wgEdit = () => {
    if (!S.subjects.length) { alert('Crea primero alguna asignatura.'); return; }
    const g = goals();
    q('wg-list').innerHTML = S.subjects.map(s => `<label class="wg-edit" style="--c:${s.color}"><span class="n">${esc(s.name)}</span>
      <input type="number" name="wg" data-id="${s.id}" min="0" max="80" step="0.5" placeholder="0" value="${g[s.id] > 0 ? g[s.id] : ''}"> <small>h/semana</small></label>`).join('');
    q('wgDlg').showModal();
  };
  q('wgForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const g = goals();
    document.querySelectorAll('#wg-list input[name=wg]').forEach(i => {
      const h = Math.max(0, Math.min(80, Number(i.value) || 0));
      if (h > 0) g[i.dataset.id] = h; else delete g[i.dataset.id];
    });
    save(); q('wgDlg').close(); render();
    reached(true);
  });

  actions.wkSumPrev = () => { off = Math.max(-104, off - 1); render(); };
  actions.wkSumNext = () => { off = Math.min(0, off + 1); render(); };
  actions.wkSumCopy = async () => {
    try { await navigator.clipboard.writeText(summaryText(off)); toast('📋 Copiado', 'El resumen semanal está en el portapapeles.'); }
    catch { toast('📋 No se pudo copiar', 'Tu navegador no deja copiar desde aquí.'); }
  };

  // Guarda cuándo se marca una tarea como hecha (para contarla en el resumen)
  const prevToggle = actions.toggleTask;
  actions.toggleTask = d => {
    if (prevToggle) prevToggle(d);
    const t = tasksArr().find(x => x.id === d.id);
    if (t) { if (t.done) t.doneAt = fmt(new Date()); else delete t.doneAt; save(); render(); }
  };

  // ---------- Aviso al cumplir un objetivo ----------
  const RK = 'planner.wgReached';
  function reached(silent) {
    let st = {};
    try { st = JSON.parse(localStorage.getItem(RK)) || {}; } catch { }
    const wk = range(0).from, ids = goalRows().filter(r => r.reached).map(r => r.s.id);
    const known = st.week === wk ? st.ids || [] : null;
    if (known && !silent) {
      goalRows().filter(r => r.reached && !known.includes(r.s.id)).forEach(r =>
        toast('🎯 ¡Objetivo semanal cumplido!', `${r.s.name}: ${fm(r.done)} de ${fm(r.goalMin)}. ¡Buen trabajo!`));
    }
    try { localStorage.setItem(RK, JSON.stringify({ week: wk, ids })); } catch { }
  }
  const prevRender = render;
  render = function () { prevRender(); reached(false); };

  const style = document.createElement('style');
  style.textContent = `
    .wg-total { display: flex; align-items: baseline; gap: 10px; margin: 8px 0 10px; }
    .wg-total b { font-size: 1.6rem; } .wg-total span { color: var(--muted); font-size: .88rem; }
    .wg-row { border-left: 5px solid var(--c); padding: 6px 10px; margin-bottom: 8px; background: var(--bg); border-radius: 8px; }
    .wg-top { display: flex; justify-content: space-between; gap: 8px; font-size: .92rem; }
    .wg-bar { height: 8px; border-radius: 99px; background: var(--line); overflow: hidden; margin: 5px 0; }
    .wg-bar span { display: block; height: 100%; background: var(--c); border-radius: 99px; }
    .wg-bar span.ok { background: var(--ok); }
    .wg-sub { font-size: .8rem; color: var(--muted); }
    .sm-line { font-size: .9rem; padding: 2px 0; }
    .wk-nav { display: flex; gap: 4px; } .wk-nav button { border: 0; }
    .wg-edit { display: flex !important; align-items: center; gap: 8px; padding: 6px 10px; margin-bottom: 6px; border-left: 5px solid var(--c); background: var(--bg); border-radius: 8px; color: var(--text) !important; }
    .wg-edit .n { flex: 1; } .wg-edit input { width: 90px !important; margin: 0 !important; }
  `;
  document.head.appendChild(style);

  window.Semanal = { goalRows, summaryData, summaryText, perSubject, range, state: () => ({ off }), reached };
  render();
})();