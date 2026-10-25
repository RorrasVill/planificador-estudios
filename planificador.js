'use strict';

/* =========================================================
   PLANIFICAR LA SEMANA
   Reparte bloques de estudio en los huecos libres de una semana, dando más
   tiempo a las asignaturas con examen cerca, tareas próximas o nota baja.
   El código calcula los huecos (nada se pisa con tus clases); el asistente de IA
   solo pide la propuesta ("planifícame la semana") y tú la revisas antes de aplicarla.
   Botón "🗓️ Planificar semana" en la vista Semana.
   Se carga DESPUÉS de estudio2.js.
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const daysBetween = (a, b) => Math.round((parse(b) - parse(a)) / 86400000);
  const DIAS3 = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const fmtMin = m => m < 60 ? `${m} min` : (m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${Math.floor(m / 60)} h`);
  const normTime = t => {
    const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})$/);
    return m && +m[1] < 24 && +m[2] < 60 ? `${pad(+m[1])}:${m[2]}` : null;
  };
  const isHoliday = ds => !!(window.Extras && window.Extras.holidayOn(ds));
  function findSubj(ref) {
    const r = norm(ref);
    if (!r) return null;
    return S.subjects.find(s => s.id === ref) || S.subjects.find(s => norm(s.name) === r)
      || S.subjects.find(s => norm(s.name).includes(r) || r.includes(norm(s.name)));
  }

  // ---------- Prioridad de cada asignatura ----------
  function subjectScores() {
    const today = fmt(new Date());
    return S.subjects.map(s => {
      let score = 1;
      const why = [];
      S.events.filter(e => e.cat === 'examen' && e.subjectId === s.id && e.repeat !== 'weekly' && e.date >= today).forEach(e => {
        const d = daysBetween(today, e.date);
        if (d <= 7) { score += 6; why.push(`examen en ${d} d`); }
        else if (d <= 14) { score += 4; why.push(`examen en ${d} d`); }
        else if (d <= 30) { score += 2; why.push(`examen en ${d} d`); }
      });
      const soon = (S.tasks || []).filter(t => !t.done && t.subjectId === s.id && t.due && daysBetween(today, t.due) <= 7);
      if (soon.length) { score += Math.min(3, soon.length); why.push(`${soon.length} tarea(s) para esta semana`); }
      const t = stats(s);
      if (t.avg != null && t.avg < t.target) { score += 2; why.push(`media ${t.avg.toFixed(1)} por debajo del ${t.target}`); }
      return { s, score, why: why.length ? why : ['reparto base'] };
    });
  }

  // ---------- Opciones ----------
  function normOpts(o = {}) {
    const hours = Math.max(1, Math.min(40, Number(o.hours) || 8));
    let from = normTime(o.from) || '16:00', to = normTime(o.to) || '21:00';
    if (toMin(from) >= toMin(to)) { from = '16:00'; to = '21:00'; }
    const len = [30, 45, 60, 90, 120].includes(Number(o.len)) ? Number(o.len) : 60;
    const dd = Array.isArray(o.days) ? o.days.map(Number).filter(n => n >= 1 && n <= 7) : [];
    return {
      week: o.week === 'next' ? 'next' : 'this', hours, from, to, len, gap: 10,
      days: dd.length ? [...new Set(dd)] : [1, 2, 3, 4, 5],
      subjects: Array.isArray(o.subjects) ? o.subjects : []
    };
  }

  // ---------- Motor: genera la propuesta ----------
  function generate(opts) {
    const o = normOpts(opts), now = new Date(), today = fmt(now), nowMin = now.getHours() * 60 + now.getMinutes();
    const monday = addDays(mondayOf(now), o.week === 'next' ? 7 : 0);
    const nBlocks = Math.max(1, Math.round(o.hours * 60 / o.len));

    // 1) cuántos bloques para cada asignatura
    const explicit = o.subjects.map(x => ({ s: findSubj(x && x.subject), h: Number(x && x.hours) })).filter(x => x.s && x.h > 0);
    let alloc;
    if (explicit.length) {
      alloc = explicit.map(x => ({ s: x.s, n: Math.max(1, Math.round(x.h * 60 / o.len)), why: ['lo pediste'] }));
    } else if (S.subjects.length) {
      const sc = subjectScores(), tot = sc.reduce((a, x) => a + x.score, 0);
      const raw = sc.map(x => ({ ...x, exact: nBlocks * x.score / tot }));
      raw.forEach(x => { x.n = Math.floor(x.exact); });
      const left = nBlocks - raw.reduce((a, x) => a + x.n, 0);
      raw.slice().sort((a, b) => (b.exact - Math.floor(b.exact)) - (a.exact - Math.floor(a.exact)) || b.score - a.score)
        .slice(0, left).forEach(x => { x.n++; });
      alloc = raw.filter(x => x.n > 0).map(x => ({ s: x.s, n: x.n, why: x.why }));
    } else {
      alloc = [{ s: null, n: nBlocks, why: ['aún no tienes asignaturas: estudio general'] }];
    }

    // 2) orden de colocación: asignaturas alternadas (la que más bloques pendientes tiene, primero)
    const pending = alloc.map(a => ({ ...a, left: a.n }));
    const queue = [];
    while (pending.some(r => r.left > 0)) {
      pending.sort((a, b) => b.left - a.left);
      pending.forEach(r => { if (r.left > 0) { queue.push(r); r.left--; } });
    }

    // 3) días disponibles y su ocupación (clases, actividades, festivos)
    const dayList = [...Array(7)].map((_, i) => ({ i, ds: fmt(addDays(monday, i)), busy: [], count: 0, perSubj: {} }))
      .filter(d => o.days.includes(d.i + 1) && d.ds >= today && !isHoliday(d.ds));
    dayList.forEach(d => { d.busy = occurrencesOn(d.ds).map(e => [toMin(e.start), toMin(e.start) + e.duration]); });
    const from = toMin(o.from), to = toMin(o.to);
    const earliest = d => d.ds === today ? Math.max(from, Math.ceil((nowMin + 10) / 15) * 15) : from;
    const slot = d => {
      for (let t = earliest(d); t + o.len <= to; t += 15) {
        if (!d.busy.some(([a, b]) => t < b && t + o.len > a)) return t;
      }
      return null;
    };

    // 4) colocar: cada bloque en el día menos cargado (y sin repetir asignatura ese día si se puede)
    const maxDay = Math.max(2, Math.ceil(nBlocks / Math.max(1, dayList.length)) + 1);
    const blocks = [], unplaced = [];
    queue.forEach(r => {
      const key = r.s ? r.s.id : '';
      const cands = dayList.slice().sort((a, b) => ((a.perSubj[key] || 0) - (b.perSubj[key] || 0)) || (a.count - b.count) || (a.i - b.i));
      for (const d of cands) {
        if (d.count >= maxDay) continue;
        const t = slot(d);
        if (t == null) continue;
        d.busy.push([t - o.gap, t + o.len + o.gap]);
        d.count++; d.perSubj[key] = (d.perSubj[key] || 0) + 1;
        blocks.push({ date: d.ds, start: minStr(t), duration: o.len, subjectId: key, why: r.why.join(', '), on: true });
        return;
      }
      unplaced.push(r.s ? r.s.name : 'estudio');
    });
    blocks.sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
    return { blocks, unplaced, alloc, o, monday: fmt(monday), days: dayList.length };
  }

  // Crea las actividades de los bloques marcados
  function applyPlan(plan) {
    let n = 0;
    plan.blocks.filter(b => b.on).forEach(b => {
      const sub = getSubj(b.subjectId);
      S.events.push({
        id: uid(), title: 'Estudio' + (sub ? ': ' + sub.name : ''), date: b.date, start: b.start, duration: b.duration,
        cat: 'estudio', subjectId: b.subjectId || '', repeat: 'none', until: '', scope: 'week',
        notes: 'Planificado automáticamente', remind: ['15']
      });
      n++;
    });
    if (n) save();
    return n;
  }

  // ---------- Diálogo ----------
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="planDlg">
      <form id="planForm">
        <h2>🗓️ Planificar la semana</h2>
        <p class="hint">Reparte bloques de estudio en tus huecos libres. Das más tiempo a lo que tiene examen cerca, tareas próximas o nota baja. Tú decides qué bloques añadir.</p>
        <div class="row">
          <label>Semana <select id="pl-week"><option value="this">Esta semana</option><option value="next">La semana que viene</option></select></label>
          <label>Horas de estudio en total <input type="number" id="pl-hours" min="1" max="40" step="1" value="8"></label>
        </div>
        <div class="row">
          <label>Desde las <input type="time" id="pl-from" value="16:00"></label>
          <label>Hasta las <input type="time" id="pl-to" value="21:00"></label>
          <label>Duración del bloque <select id="pl-len"><option value="30">30 min</option><option value="45">45 min</option><option value="60" selected>1 h</option><option value="90">1 h 30</option><option value="120">2 h</option></select></label>
        </div>
        <fieldset id="pl-days"><legend>Días</legend>
          ${DIAS3.map((d, i) => `<label class="chk" style="display:inline-flex;margin-right:12px"><input type="checkbox" name="pl-day" value="${i + 1}"> ${d}</label>`).join('')}
        </fieldset>
        <button type="button" id="pl-gen">🔄 Generar propuesta</button>
        <div id="pl-out"></div>
        <div class="actions">
          <span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cancelar</button>
          <button type="submit" class="primary" id="pl-apply">✅ Añadir a mi semana</button>
        </div>
      </form>
    </dialog>`);
  document.querySelectorAll('#planDlg [data-x]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  const style = document.createElement('style');
  style.textContent = `
    #pl-out { margin: 12px 0 0; max-height: 40vh; overflow: auto; }
    #pl-out ul { margin: 6px 0 12px; padding-left: 20px; font-size: .88rem; }
    .pl-day { font-weight: 700; margin: 10px 0 4px; font-size: .9rem; }
    .pl-row { display: flex !important; align-items: center; gap: 8px; padding: 6px 10px; margin-bottom: 4px; border-radius: 8px; border-left: 5px solid var(--c); background: var(--bg); color: var(--text) !important; font-size: .9rem !important; }
    .pl-row input { width: auto !important; margin: 0 !important; }
    .pl-warn { color: var(--danger); font-size: .85rem; }
  `;
  document.head.appendChild(style);

  let plan = null;
  function readForm() {
    return {
      week: q('pl-week').value, hours: Number(q('pl-hours').value), from: q('pl-from').value, to: q('pl-to').value, len: Number(q('pl-len').value),
      days: [...document.querySelectorAll('input[name=pl-day]:checked')].map(c => Number(c.value)), subjects: lastSubjects
    };
  }
  let lastSubjects = []; // reparto pedido por el asistente (si lo hay)
  function fillForm(o) {
    q('pl-week').value = o.week; q('pl-hours').value = o.hours; q('pl-from').value = o.from; q('pl-to').value = o.to; q('pl-len').value = String(o.len);
    document.querySelectorAll('input[name=pl-day]').forEach(c => { c.checked = o.days.includes(Number(c.value)); });
  }
  function renderPlan() {
    const out = q('pl-out');
    if (!plan) { out.innerHTML = ''; return; }
    const sum = plan.alloc.map(a => `<li><b>${esc(a.s ? a.s.name : 'Estudio general')}</b>: ${a.n} bloque(s) · ${fmtMin(a.n * plan.o.len)} <span class="muted">(${esc(a.why.join(', '))})</span></li>`).join('');
    let lastDay = '', rows = '';
    plan.blocks.forEach((b, i) => {
      if (b.date !== lastDay) {
        lastDay = b.date;
        const d = parse(b.date);
        rows += `<div class="pl-day">${DIAS3[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}</div>`;
      }
      const s = getSubj(b.subjectId);
      rows += `<label class="pl-row" style="--c:${s ? s.color : '#4f7cff'}"><input type="checkbox" data-pi="${i}" ${b.on ? 'checked' : ''}>
        ${b.start}–${minStr(toMin(b.start) + b.duration)} · ${esc(s ? s.name : 'Estudio general')}</label>`;
    });
    out.innerHTML = `<ul>${sum}</ul>${rows || '<p class="muted">No hay huecos libres con estas condiciones. Amplía el horario o añade más días.</p>'}
      ${plan.unplaced.length ? `<p class="pl-warn">⚠️ No cabían ${plan.unplaced.length} bloque(s) (${esc([...new Set(plan.unplaced)].join(', '))}). Amplía el horario, añade días o reduce las horas.</p>` : ''}`;
    q('pl-apply').disabled = !plan.blocks.length;
  }
  function gen() { plan = generate(readForm()); renderPlan(); }

  q('pl-gen').addEventListener('click', () => { lastSubjects = []; gen(); });
  q('pl-out').addEventListener('change', e => {
    const i = e.target.dataset && e.target.dataset.pi;
    if (i != null && plan && plan.blocks[Number(i)]) plan.blocks[Number(i)].on = e.target.checked;
  });
  q('planForm').addEventListener('submit', ev => {
    ev.preventDefault();
    if (!plan) return;
    const n = applyPlan(plan);
    if (!n) { alert('No has marcado ningún bloque.'); return; }
    q('planDlg').close();
    ui.view = 'week'; ui.week = parse(plan.monday);
    render();
    toast('🗓️ Semana planificada', `Se han añadido ${n} bloques de estudio a tu semana.`);
  });

  // Abre el diálogo con una propuesta ya generada (lo usa también el asistente de IA)
  function open(opts) {
    const o = normOpts(opts || {});
    lastSubjects = o.subjects;
    fillForm(o);
    plan = generate(o);
    renderPlan();
    q('planDlg').showModal();
    const n = plan.blocks.length;
    return n
      ? `🗓️ Propuesta lista: ${n} bloques de estudio (${fmtMin(n * plan.o.len)}). Revísala en la ventana y pulsa «Añadir a mi semana».${plan.unplaced.length ? ` (No cabían ${plan.unplaced.length}.)` : ''}`
      : '🗓️ No he encontrado huecos libres con esas condiciones; ajusta el horario en la ventana.';
  }

  actions.planWeek = () => open({});

  // Botón en la barra de la vista Semana (después de que extras.js pinte la suya)
  const prevRender = render;
  render = function () {
    prevRender();
    if (ui.view !== 'week' || document.querySelector('#app [data-act=planWeek]')) return;
    const anchor = document.querySelector('#app [data-act=copyWeek]') || document.querySelector('#app .toolbar .primary');
    if (anchor) anchor.insertAdjacentHTML('beforebegin', '<button data-act="planWeek" title="Repartir bloques de estudio en tus huecos libres">🗓️ Planificar semana</button>');
  };

  window.Plan = { open, generate, applyPlan, subjectScores, normOpts };
  render(); // pinta ya el botón
})();