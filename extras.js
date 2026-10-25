'use strict';

/* =========================================================
   EXTRAS
   1) Mover y redimensionar actividades arrastrando en la vista Semana.
   2) Copiar una semana y duplicar una actividad.
   3) Buscador (botón "Buscar" o tecla "/").
   4) Festivos y vacaciones (las clases que se repiten no salen esos días).
   Se carga el ÚLTIMO (después de estudio.js).
   Datos: S.holidays = [{ id, name, from, to, kind: 'festivo'|'vacaciones'|'sinclase' }]
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const clearFired = id => {
    const f = fired();
    Object.keys(f).forEach(k => { if (k.startsWith(id + '|')) delete f[k]; });
    saveFired(f);
  };

  /* ---------------------------------------------------------
     4) Festivos y vacaciones
     --------------------------------------------------------- */
  const KINDS = { festivo: ['🎉', 'Festivo'], vacaciones: ['🏖️', 'Vacaciones'], sinclase: ['⛔', 'Sin clase'] };
  const holidays = () => (S.holidays = Array.isArray(S.holidays) ? S.holidays : []);
  const holidayOn = ds => holidays().find(h => h.from <= ds && ds <= (h.to || h.from));
  const kindIcon = h => (KINDS[h.kind] || KINDS.festivo)[0];

  // Esos días desaparecen las clases que se repiten cada semana (las actividades sueltas se mantienen)
  const prevOcc = occurrencesOn;
  occurrencesOn = function (ds) {
    const list = prevOcc(ds);
    return holidayOn(ds) ? list.filter(o => o.repeat !== 'weekly') : list;
  };

  const NACIONALES = [
    ['2026-01-01', 'Año Nuevo'], ['2026-01-06', 'Reyes'], ['2026-04-03', 'Viernes Santo'], ['2026-05-01', 'Día del Trabajo'],
    ['2026-08-15', 'Asunción'], ['2026-10-12', 'Fiesta Nacional'], ['2026-11-01', 'Todos los Santos'],
    ['2026-12-06', 'Constitución'], ['2026-12-08', 'Inmaculada'], ['2026-12-25', 'Navidad'],
    ['2027-01-01', 'Año Nuevo'], ['2027-01-06', 'Reyes'], ['2027-03-26', 'Viernes Santo'], ['2027-05-01', 'Día del Trabajo'],
    ['2027-08-15', 'Asunción'], ['2027-10-12', 'Fiesta Nacional'], ['2027-11-01', 'Todos los Santos'],
    ['2027-12-06', 'Constitución'], ['2027-12-08', 'Inmaculada'], ['2027-12-25', 'Navidad']
  ];
  function addNationalHolidays() {
    let n = 0;
    NACIONALES.forEach(([d, name]) => {
      if (holidays().some(h => h.from === d)) return;
      holidays().push({ id: uid(), name, from: d, to: '', kind: 'festivo' });
      n++;
    });
    return n;
  }
  function addHoliday(name, from, to, kind) {
    if (!name || !from) throw new Error('faltan el nombre o la fecha');
    if (to && to < from) throw new Error('la fecha final es anterior a la inicial');
    holidays().push({ id: uid(), name: String(name).trim().slice(0, 60), from, to: to || '', kind: KINDS[kind] ? kind : 'festivo' });
  }
  const shortD = ds => parse(ds).toLocaleDateString('es-ES');

  function holList() {
    const list = holidays().slice().sort((a, b) => a.from.localeCompare(b.from));
    q('hol-list').innerHTML = list.map(h => `<div class="hol-row">
      <span>${kindIcon(h)} <b>${esc(h.name)}</b> <span class="muted">${shortD(h.from)}${h.to && h.to !== h.from ? ' – ' + shortD(h.to) : ''}</span></span>
      <button type="button" class="small ghost" data-hdel="${h.id}" title="Quitar">✕</button></div>`).join('')
      || '<p class="muted">Aún no has añadido festivos ni vacaciones.</p>';
  }

  /* ---------------------------------------------------------
     1) Mover / redimensionar arrastrando en Semana
     --------------------------------------------------------- */
  const SNAP = 15; // minutos
  let act = null, moving = false, suppressClick = false;

  // Aplica un cambio de fecha/hora/duración a una actividad. mode: 'one' | 'all' (solo si se repite)
  function applyChange(id, occ, ch, mode) {
    const e = S.events.find(x => x.id === id);
    if (!e) return false;
    if (e.repeat === 'weekly' && mode === 'one') {
      e.skip = e.skip || [];
      if (!e.skip.includes(occ)) e.skip.push(occ);
      const copy = { ...e, id: uid(), repeat: 'none', until: '', date: ch.date, start: ch.start, duration: ch.duration };
      delete copy.skip;
      S.events.push(copy);
    } else if (e.repeat === 'weekly') {
      const delta = Math.round((parse(ch.date) - parse(occ)) / 86400000);
      e.date = fmt(addDays(parse(e.date), delta));
      if (e.skip) e.skip = e.skip.map(d => fmt(addDays(parse(d), delta)));
      e.start = ch.start; e.duration = ch.duration;
    } else {
      e.date = ch.date; e.start = ch.start; e.duration = ch.duration;
    }
    clearFired(id);
    save();
    return true;
  }

  const tipEl = document.createElement('div');
  tipEl.id = 'ev-tip';
  tipEl.style.display = 'none';
  document.body.appendChild(tipEl);
  function tip(e, text) {
    tipEl.textContent = text;
    tipEl.style.display = 'block';
    tipEl.style.left = (e.clientX + 14) + 'px';
    tipEl.style.top = (e.clientY + 14) + 'px';
  }
  const hideTip = () => { tipEl.style.display = 'none'; };
  const ratio = col => col.offsetHeight / col.getBoundingClientRect().height; // compensa el zoom

  function cancelDrag() {
    const wasMoving = moving;
    act = null; moving = false; hideTip();
    if (wasMoving) render();
  }

  document.addEventListener('mousedown', e => {
    if (e.button !== 0 || ui.view !== 'week') return;
    const el = e.target.closest && e.target.closest('.ev');
    if (!el) return;
    const col = el.closest('.wk-col');
    const ev = S.events.find(x => x.id === el.dataset.id);
    if (!col || !ev) return;
    act = {
      type: e.target.closest('.ev-rs') ? 'resize' : 'move', el, id: ev.id, occ: el.dataset.date, col,
      x0: e.clientX, y0: e.clientY, start0: toMin(ev.start), dur0: ev.duration, started: false
    };
    act.start = act.start0; act.dur = act.dur0;
    if (act.type === 'resize') e.preventDefault();
  });

  document.addEventListener('mousemove', e => {
    if (!act) return;
    if (!(e.buttons & 1)) { cancelDrag(); return; } // se soltó el ratón fuera de la ventana
    const dx = e.clientX - act.x0, dy = e.clientY - act.y0;
    if (!act.started) {
      if (Math.hypot(dx, dy) < 5) return;
      act.started = true; moving = true;
      act.el.classList.add('dragging');
    }
    const r = ratio(act.col);
    const dMin = Math.round(dy * r / HH * 60 / SNAP) * SNAP;
    if (act.type === 'resize') {
      act.dur = Math.max(SNAP, Math.min(act.dur0 + dMin, 1440 - act.start0));
      act.el.style.height = Math.max(18, act.dur / 60 * HH - 2) + 'px';
      tip(e, `${minStr(act.start0)} – ${minStr(act.start0 + act.dur)} · ${act.dur} min`);
    } else {
      act.start = Math.max(0, Math.min(act.start0 + dMin, 1440 - act.dur0));
      const cols = [...document.querySelectorAll('.wk-col')];
      act.tcol = cols.find(c => { const b = c.getBoundingClientRect(); return e.clientX >= b.left && e.clientX < b.right; }) || act.col;
      const shiftX = (act.tcol.getBoundingClientRect().left - act.col.getBoundingClientRect().left) * r;
      const shiftY = (act.start - act.start0) / 60 * HH;
      act.el.style.transform = `translate(${shiftX}px, ${shiftY}px)`;
      const d = parse(act.tcol.dataset.slot);
      tip(e, `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()} · ${minStr(act.start)} – ${minStr(act.start + act.dur0)}`);
    }
  });

  document.addEventListener('mouseup', () => {
    if (!act) return;
    const a = act; act = null;
    hideTip();
    if (!a.started) return; // fue un clic normal: se abre la actividad como siempre
    suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
    moving = false;
    const ev = S.events.find(x => x.id === a.id);
    const ch = {
      date: a.type === 'move' ? ((a.tcol && a.tcol.dataset.slot) || a.occ) : a.occ,
      start: minStr(a.start), duration: a.dur
    };
    if (!ev || (ch.date === a.occ && ch.start === ev.start && ch.duration === ev.duration)) { render(); return; }
    let mode;
    if (ev.repeat === 'weekly') {
      if (confirm(`Esta actividad se repite cada semana.\n\n¿Cambiar SOLO el ${shortD(a.occ)}?\n(Aceptar = solo ese día · Cancelar = más opciones)`)) mode = 'one';
      else if (confirm('¿Cambiar TODA la serie (todas las semanas)?\n(Aceptar = toda la serie · Cancelar = no cambiar nada)')) mode = 'all';
      else { render(); return; }
    }
    applyChange(a.id, a.occ, ch, mode);
    render(); checkReminders();
  });

  // Un arrastre no debe abrir además el diálogo de la actividad
  document.addEventListener('click', e => {
    if (suppressClick) { e.stopPropagation(); e.preventDefault(); suppressClick = false; }
  }, true);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && act) cancelDrag(); });

  /* ---------------------------------------------------------
     2) Copiar semana y duplicar actividad
     --------------------------------------------------------- */
  // Actividades sueltas de la semana que empieza en `monday` (las series y los exámenes no se copian)
  function weekCopyable(monday) {
    const a = fmt(monday), b = fmt(addDays(monday, 6));
    return S.events.filter(e => e.repeat !== 'weekly' && e.cat !== 'examen' && e.date >= a && e.date <= b);
  }
  function copyWeekEvents(monday, n) {
    const src = weekCopyable(monday);
    let count = 0;
    for (let k = 1; k <= n; k++) {
      src.forEach(e => {
        const date = fmt(addDays(parse(e.date), 7 * k));
        if (S.events.some(x => x.title === e.title && x.date === date && x.start === e.start)) return;
        const copy = { ...e, id: uid(), date };
        delete copy.skip;
        S.events.push(copy);
        count++;
      });
    }
    if (count) save();
    return count;
  }

  // Botón "Duplicar" dentro del diálogo de actividad
  const dupBtn = document.createElement('button');
  dupBtn.type = 'button';
  dupBtn.className = 'ghost';
  dupBtn.id = 'ev-dup';
  dupBtn.textContent = 'Duplicar';
  dupBtn.title = 'Crear otra actividad igual en otra fecha';
  const evActions = document.querySelector('#eventDlg .actions');
  evActions.insertBefore(dupBtn, evActions.querySelector('.spacer'));

  function duplicate() {
    const e = S.events.find(x => x.id === q('ev-id').value);
    if (!e) return false;
    const occ = q('ev-occ').value || e.date;
    q('eventDlg').close();
    openEvent(null, occ);
    q('evHeading').textContent = 'Duplicar actividad';
    q('ev-title').value = e.title;
    q('ev-start').value = e.start;
    q('ev-dur').value = e.duration;
    q('ev-cat').value = e.cat;
    refreshSubjOptions(e.subjectId);
    q('ev-scope').value = e.scope || 'all';
    q('ev-notes').value = e.notes || '';
    document.querySelectorAll('input[name=rem]').forEach(c => { c.checked = (e.remind || []).includes(c.value); });
    updateEndHint();
    q('ev-date').focus();
    return true;
  }
  dupBtn.addEventListener('click', duplicate);

  const prevOpen = openEvent;
  openEvent = function (...args) {
    prevOpen(...args);
    dupBtn.style.display = q('ev-id').value ? '' : 'none';
  };

  /* ---------------------------------------------------------
     3) Buscador
     --------------------------------------------------------- */
  function searchAll(text) {
    const tokens = norm(text).split(/\s+/).filter(Boolean);
    if (!tokens.length) return [];
    const match = hay => { const h = norm(hay); return tokens.every(t => h.includes(t)); };
    const out = [];
    const subjName = id => (getSubj(id) ? getSubj(id).name : '');

    S.events.forEach(e => {
      if (!match([e.title, e.notes, subjName(e.subjectId), CATS[e.cat] && CATS[e.cat].n].join(' '))) return;
      out.push({
        icon: e.cat === 'examen' ? '📝' : '📅', title: e.title,
        sub: `${shortD(e.date)} · ${e.start}${e.repeat === 'weekly' ? ' · cada semana' : ''}${subjName(e.subjectId) ? ' · ' + subjName(e.subjectId) : ''}`,
        go: () => { ui.week = mondayOf(parse(e.date)); ui.view = 'week'; render(); openEvent(e.id, e.date); }
      });
    });
    S.subjects.forEach(s => {
      if (match(s.name)) out.push({ icon: '📚', title: s.name, sub: 'Asignatura', go: () => actions.goSubject({ id: s.id }) });
      (s.notes || []).forEach(n => {
        if (!match([n.title, n.text, ...(n.files || []).map(f => f.name)].join(' '))) return;
        out.push({
          icon: '📄', title: n.title, sub: `${s.name} · ${String(n.text || '').replace(/\s+/g, ' ').slice(0, 80)}`,
          go: () => { ui.subj = s.id; ui.view = 'subjects'; ui.tab = 'notes'; render(); openNote(n.id); }
        });
      });
      (s.grades || []).forEach(g => {
        if (!match(g.name + ' ' + s.name)) return;
        out.push({
          icon: '📊', title: g.name, sub: `${s.name} · ${g.grade === '' || g.grade == null ? 'pendiente' : 'nota ' + g.grade} · ${g.weight}%`,
          go: () => { ui.subj = s.id; ui.view = 'subjects'; ui.tab = 'grades'; render(); }
        });
      });
    });
    (S.tasks || []).forEach(t => {
      if (match(t.text + ' ' + subjName(t.subjectId))) out.push({
        icon: t.done ? '☑️' : '✅', title: t.text, sub: 'Tarea' + (subjName(t.subjectId) ? ' · ' + subjName(t.subjectId) : '') + (t.due ? ' · hasta ' + shortD(t.due) : ''),
        go: () => actions.editTask({ id: t.id })
      });
    });
    (S.goals || []).forEach(g => {
      if (match([g.title, g.notes, ...(g.objectives || []).map(o => o.text)].join(' '))) out.push({
        icon: '🎯', title: g.title, sub: `Meta · ${(g.objectives || []).filter(o => o.done).length}/${(g.objectives || []).length} objetivos`,
        go: () => actions.editGoal({ id: g.id })
      });
    });
    holidays().forEach(h => {
      if (match(h.name)) out.push({ icon: kindIcon(h), title: h.name, sub: shortD(h.from) + (h.to && h.to !== h.from ? ' – ' + shortD(h.to) : ''), go: () => openHolidays() });
    });
    return out.slice(0, 40);
  }

  let results = [];
  function runSearch() {
    results = searchAll(q('sr-in').value);
    q('sr-out').innerHTML = !q('sr-in').value.trim()
      ? '<p class="muted">Escribe para buscar en actividades, apuntes, notas, tareas y metas.</p>'
      : results.map((r, i) => `<div class="sr-row" data-i="${i}"><span class="sr-ic">${r.icon}</span>
          <div><b>${esc(r.title)}</b><div class="muted" style="font-size:.82rem">${esc(r.sub)}</div></div></div>`).join('')
        || '<p class="muted">No he encontrado nada.</p>';
  }
  function openSearch() {
    q('searchDlg').showModal();
    q('sr-in').value = '';
    runSearch();
    q('sr-in').focus();
  }

  /* ---------------------------------------------------------
     Diálogos y estilos
     --------------------------------------------------------- */
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="copyDlg">
      <form id="copyForm">
        <h2>📋 Copiar semana</h2>
        <p class="hint" id="cp-info"></p>
        <label>Copiar a las próximas <input type="number" id="cp-n" min="1" max="12" value="1" required> semana(s)</label>
        <p class="hint">Se copian las actividades sueltas de esta semana (también las que son solo de la semana).
          Las clases que ya se repiten cada semana y los exámenes no se copian. Si ya existe una igual (mismo título, día y hora), se omite.</p>
        <div class="actions">
          <span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cancelar</button>
          <button type="submit" class="primary" id="cp-go">Copiar</button>
        </div>
      </form>
    </dialog>
    <dialog id="holDlg">
      <form id="holForm">
        <h2>🏖️ Festivos y vacaciones</h2>
        <p class="hint">Esos días no salen las clases que se repiten cada semana. Las actividades sueltas sí se mantienen.</p>
        <div id="hol-list"></div>
        <div class="row">
          <label>Nombre <input id="hol-name" required maxlength="60" placeholder="Ej. Vacaciones de Navidad"></label>
          <label>Tipo <select id="hol-kind">
            <option value="festivo">🎉 Festivo</option>
            <option value="vacaciones">🏖️ Vacaciones</option>
            <option value="sinclase">⛔ Sin clase</option></select></label>
        </div>
        <div class="row">
          <label>Desde <input type="date" id="hol-from" required></label>
          <label>Hasta (opcional) <input type="date" id="hol-to"></label>
        </div>
        <div class="actions">
          <button type="button" class="ghost" id="hol-es" title="Año Nuevo, Reyes, Viernes Santo, 1 de mayo, 15 de agosto, 12 de octubre, 1 de noviembre, 6 y 8 de diciembre y Navidad (2026-2027)">Añadir festivos nacionales</button>
          <span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cerrar</button>
          <button type="submit" class="primary">Añadir</button>
        </div>
      </form>
    </dialog>
    <dialog id="searchDlg">
      <input id="sr-in" placeholder="Buscar actividades, apuntes, tareas, metas…" autocomplete="off">
      <div id="sr-out"></div>
      <div class="actions"><span class="spacer"></span><button type="button" class="ghost" data-x>Cerrar</button></div>
    </dialog>`);
  document.querySelectorAll('#copyDlg [data-x], #holDlg [data-x], #searchDlg [data-x]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  const style = document.createElement('style');
  style.textContent = `
    .ev { cursor: grab; user-select: none; -webkit-user-select: none; }
    .ev.dragging { z-index: 30; opacity: .88; cursor: grabbing; box-shadow: 0 8px 22px rgba(0,0,0,.35); }
    .ev-rs { position: absolute; left: 0; right: 0; bottom: 0; height: 8px; cursor: ns-resize; background: linear-gradient(transparent, rgba(0,0,0,.28)); }
    #ev-tip { position: fixed; z-index: 200; padding: 4px 9px; border-radius: 8px; background: #111827; color: #fff; font-size: .8rem; pointer-events: none; white-space: nowrap; }
    .wk-col.hol { background-image: repeating-linear-gradient(135deg, transparent 0 9px, rgba(245,158,11,.14) 9px 18px), repeating-linear-gradient(to bottom, transparent 0, transparent calc(var(--hh) - 1px), var(--line) calc(var(--hh) - 1px), var(--line) var(--hh)); }
    .wk-head .hol { color: #b45309; font-weight: 700; }
    .cell.hol { background: rgba(245,158,11,.10); }
    .hol-tag { font-size: .72rem; color: #b45309; padding: 1px 6px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .hol-banner { background: #fef3c7; border: 1px solid #f59e0b; color: #78350f; border-radius: 10px; padding: 10px 14px; margin-bottom: 14px; }
    @media (prefers-color-scheme: dark) { .hol-banner { background: #3a2a00; color: #fde68a; } .hol-tag, .wk-head .hol { color: #fbbf24; } }
    #hol-list { max-height: 190px; overflow: auto; margin-bottom: 12px; }
    .hol-row { display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 4px 0; border-bottom: 1px solid var(--line); }
    .hol-row button { border: 0; padding: 2px 8px; }
    #searchDlg { width: min(640px, 94vw); }
    #sr-in { margin-bottom: 10px; font-size: 1.05rem; }
    #sr-out { max-height: 55vh; overflow: auto; }
    .sr-row { display: flex; gap: 10px; align-items: center; padding: 8px 10px; border-radius: 8px; cursor: pointer; }
    .sr-row:hover { background: var(--bg); }
    .sr-ic { font-size: 1.2rem; }
  `;
  document.head.appendChild(style);

  /* ---------------------------------------------------------
     Eventos de los diálogos y acciones
     --------------------------------------------------------- */
  function openHolidays() { holList(); q('holDlg').showModal(); }
  function openCopy() {
    const n = weekCopyable(ui.week).length;
    q('cp-info').textContent = n
      ? `Esta semana tiene ${n} actividad(es) suelta(s) que se pueden copiar.`
      : 'Esta semana no tiene actividades sueltas que copiar (las clases repetidas ya salen cada semana).';
    q('cp-go').disabled = !n;
    q('copyDlg').showModal();
  }
  q('copyForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const n = Math.max(1, Math.min(12, Number(q('cp-n').value) || 1));
    const c = copyWeekEvents(ui.week, n);
    q('copyDlg').close();
    render();
    toast('📋 Semana copiada', c ? `Se han creado ${c} actividades en las próximas ${n} semana(s).` : 'No se ha creado nada: ya existían iguales.');
  });

  q('holForm').addEventListener('submit', ev => {
    ev.preventDefault();
    try { addHoliday(q('hol-name').value, q('hol-from').value, q('hol-to').value, q('hol-kind').value); }
    catch (err) { alert('No se pudo añadir: ' + err.message); return; }
    save(); q('hol-name').value = ''; q('hol-from').value = ''; q('hol-to').value = '';
    holList(); render();
  });
  q('hol-list').addEventListener('click', e => {
    const id = e.target.dataset && e.target.dataset.hdel;
    if (!id) return;
    S.holidays = holidays().filter(h => h.id !== id);
    save(); holList(); render();
  });
  q('hol-es').addEventListener('click', () => {
    const n = addNationalHolidays();
    save(); holList(); render();
    toast('🎉 Festivos añadidos', n ? `Se han añadido ${n} festivos nacionales (2026-2027). Añade a mano los de tu comunidad y tu universidad.` : 'Ya estaban todos añadidos.');
  });

  q('sr-in').addEventListener('input', runSearch);
  q('sr-in').addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); const r = results[0]; if (r) { q('searchDlg').close(); r.go(); } }
  });
  q('sr-out').addEventListener('click', e => {
    const row = e.target.closest && e.target.closest('.sr-row');
    if (!row) return;
    const r = results[Number(row.dataset.i)];
    if (r) { q('searchDlg').close(); r.go(); }
  });

  actions.copyWeek = openCopy;
  actions.holidays = openHolidays;
  actions.search = openSearch;

  // Botón "Buscar" en la cabecera y atajo "/"
  const bar = document.querySelector('.top');
  const sb = document.createElement('button');
  sb.className = 'ghost';
  sb.textContent = '🔍 Buscar';
  sb.title = 'Buscar (atajo: tecla /)';
  sb.addEventListener('click', openSearch);
  bar.append(sb);
  document.addEventListener('keydown', e => {
    const tag = (document.activeElement && document.activeElement.tagName) || '';
    if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(tag) && !document.querySelector('dialog[open]')) {
      e.preventDefault(); openSearch();
    }
  });

  /* ---------------------------------------------------------
     Decorar las vistas después de cada render()
     --------------------------------------------------------- */
  function decorate() {
    const app = document.getElementById('app');
    if (ui.view === 'week') {
      document.querySelectorAll('#app .ev').forEach(el =>
        el.insertAdjacentHTML('beforeend', '<span class="ev-rs" title="Arrastra para cambiar la duración"></span>'));
      const heads = document.querySelectorAll('#app .wk-head > div');
      document.querySelectorAll('#app .wk-col').forEach((col, i) => {
        const h = holidayOn(col.dataset.slot);
        if (!h) return;
        col.classList.add('hol');
        if (heads[i + 1]) { heads[i + 1].classList.add('hol'); heads[i + 1].title = h.name; }
      });
      const pb = document.querySelector('#app .toolbar .primary');
      if (pb) pb.insertAdjacentHTML('beforebegin',
        '<button data-act="copyWeek" title="Copiar las actividades de esta semana a otras">📋 Copiar semana</button><button data-act="holidays">🏖️ Festivos</button>');
    } else if (ui.view === 'month') {
      document.querySelectorAll('#app .cell[data-date]').forEach(c => {
        const h = holidayOn(c.dataset.date);
        if (!h) return;
        c.classList.add('hol');
        c.insertAdjacentHTML('beforeend', `<div class="hol-tag" title="${esc(h.name)}">${kindIcon(h)} ${esc(h.name)}</div>`);
      });
      const pb = document.querySelector('#app .toolbar .primary');
      if (pb) pb.insertAdjacentHTML('beforebegin', '<button data-act="holidays">🏖️ Festivos</button>');
    } else if (ui.view === 'today') {
      const h = holidayOn(fmt(new Date()));
      if (h) app.insertAdjacentHTML('afterbegin', `<div class="hol-banner">${kindIcon(h)} Hoy es <b>${esc(h.name)}</b>: no hay clases que se repitan.</div>`);
    }
  }

  const prevRender = render;
  render = function () {
    if (moving) return; // no repintar mientras se arrastra
    prevRender();
    decorate();
  };

  // Para pruebas
  window.Extras = { applyChange, weekCopyable, copyWeekEvents, searchAll, holidayOn, addHoliday, addNationalHolidays, duplicate };

  render(); // pinta ya los botones y marcas nuevos
})();