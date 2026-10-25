'use strict';

/* =========================================================
   EXÁMENES Y ENTREGAS + TAREAS POR ASIGNATURA
   Dos tarjetas nuevas en la pantalla "Hoy", debajo de las demás:
   - Exámenes y entregas: actividades de tipo "Examen / Entrega" con cuenta atrás.
   - Tareas pendientes: agrupadas por asignatura, con fecha límite opcional.
   Se carga DESPUÉS de app.js y de metas.js.
   Datos: S.tasks = [{ id, text, subjectId, due, done, created }]
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const ensure = () => { if (!Array.isArray(S.tasks)) S.tasks = []; return S.tasks; };
  ensure();
  let showDone = false;
  const shortDate = ds => parse(ds).toLocaleDateString('es-ES');
  const daysTo = ds => Math.round((parse(ds) - parse(fmt(new Date()))) / 86400000);

  // ---------- Exámenes y entregas ----------
  function examsCard() {
    const today = fmt(new Date());
    const list = S.events
      .filter(e => e.cat === 'examen' && e.repeat !== 'weekly' && e.date >= today)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start))
      .slice(0, 8);
    const rows = list.map(e => {
      const n = daysTo(e.date), sub = getSubj(e.subjectId);
      const label = n === 0 ? 'HOY' : n === 1 ? 'MAÑANA' : n + ' días';
      const urg = n <= 3 ? 'hot' : n <= 7 ? 'warm' : '';
      return `<div class="exam" style="--c:${evColor(e)}" data-act="editEvent" data-id="${e.id}" data-date="${e.date}">
        <div class="exam-days ${urg}">${label}</div>
        <div class="exam-main"><b>${esc(e.title)}</b>
          <div class="muted" style="font-size:.85rem">${sub ? esc(sub.name) + ' · ' : ''}${shortDate(e.date)} · ${e.start}</div></div></div>`;
    }).join('') || '<p class="muted">No hay exámenes ni entregas próximos. Añade uno con el botón.</p>';
    return `<div class="card"><div class="es-title"><h3>📝 Exámenes y entregas</h3>
      <button class="small primary" data-act="newExam">+ Añadir</button></div>${rows}</div>`;
  }

  // ---------- Tareas pendientes ----------
  function taskRow(t) {
    const today = fmt(new Date());
    return `<div class="tk ${t.done ? 'done' : ''}">
      <span class="tk-check ${t.done ? 'on' : ''}" data-act="toggleTask" data-id="${t.id}" title="Marcar como hecha">${t.done ? '✓' : ''}</span>
      <span class="t">${esc(t.text)}</span>
      ${t.due ? `<span class="due ${!t.done && t.due < today ? 'late' : ''}">${shortDate(t.due)}</span>` : ''}
      <button class="small ghost" data-act="editTask" data-id="${t.id}" title="Editar tarea">✏️</button></div>`;
  }
  function groupBySubject(list) {
    const by = new Map();
    list.forEach(t => {
      const k = getSubj(t.subjectId) ? t.subjectId : '';
      if (!by.has(k)) by.set(k, []);
      by.get(k).push(t);
    });
    return [...by.entries()].map(([k, ts]) => {
      const s = getSubj(k);
      return `<div class="tk-group"><div class="tk-head" style="--c:${s ? s.color : '#64748b'}">${s ? esc(s.name) : 'Sin asignatura'}</div>${ts.map(taskRow).join('')}</div>`;
    }).join('');
  }
  function tasksCard() {
    const byDue = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.created || 0) - (b.created || 0);
    const pend = ensure().filter(t => !t.done).sort(byDue);
    const done = ensure().filter(t => t.done).sort(byDue);
    return `<div class="card"><div class="es-title"><h3>✅ Tareas pendientes</h3>
      <button class="small primary" data-act="newTask">+ Nueva tarea</button></div>
      ${groupBySubject(pend) || '<p class="muted">No tienes tareas pendientes. ¡Bien!</p>'}
      ${done.length ? `<div style="margin-top:10px"><button class="small ghost" data-act="toggleDoneTasks">${showDone ? 'Ocultar' : 'Ver'} hechas (${done.length})</button>
        ${showDone ? '<button class="small ghost" data-act="clearDoneTasks">Borrar hechas</button>' : ''}</div>${showDone ? groupBySubject(done) : ''}` : ''}</div>`;
  }

  // Las dos tarjetas van en una fila nueva debajo del resto de la pantalla "Hoy"
  const prevToday = renderToday;
  renderToday = function () {
    return prevToday() + `<div class="grid2" style="margin-top:16px">${examsCard()}${tasksCard()}</div>`;
  };

  // ---------- Estilos ----------
  const style = document.createElement('style');
  style.textContent = `
    .es-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .es-title h3 { margin: 0; }
    .exam { display: flex; align-items: center; gap: 12px; padding: 8px 10px; margin-bottom: 8px; border-radius: 8px; border-left: 5px solid var(--c); background: var(--bg); cursor: pointer; }
    .exam-main { flex: 1; min-width: 0; }
    .exam-days { min-width: 74px; text-align: center; font-weight: 700; font-size: .85rem; padding: 4px 8px; border-radius: 999px; background: var(--card); border: 1px solid var(--line); }
    .exam-days.warm { background: #f59e0b; border-color: #f59e0b; color: #3a2a00; }
    .exam-days.hot { background: var(--danger); border-color: var(--danger); color: #fff; }
    .tk-group { margin-bottom: 10px; }
    .tk-head { font-size: .8rem; font-weight: 700; color: var(--muted); text-transform: uppercase; letter-spacing: .03em; padding-left: 8px; border-left: 4px solid var(--c); margin-bottom: 4px; }
    .tk { display: flex; align-items: center; gap: 8px; padding: 3px 0 3px 12px; }
    .tk .t { flex: 1; }
    .tk.done .t { text-decoration: line-through; color: var(--muted); }
    .tk .due { font-size: .75rem; color: var(--muted); }
    .tk .due.late { color: var(--danger); font-weight: 600; }
    .tk button { border: 0; padding: 2px 6px; }
    .tk-check { width: 20px; height: 20px; flex: none; border: 2px solid var(--muted); border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: .8rem; line-height: 1; color: #fff; }
    .tk-check:hover { border-color: var(--ok); }
    .tk-check.on { background: var(--ok); border-color: var(--ok); }
  `;
  document.head.appendChild(style);

  // ---------- Diálogo de tarea ----------
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="taskDlg">
      <form id="taskForm">
        <h2 id="tk-heading">Nueva tarea</h2>
        <input type="hidden" id="tk-id">
        <label>Tarea <input id="tk-text" required maxlength="140" placeholder="Ej. Entregar la práctica 2"></label>
        <div class="row">
          <label>Asignatura (opcional) <select id="tk-subj"></select></label>
          <label>Fecha límite (opcional) <input type="date" id="tk-due"></label>
        </div>
        <div class="actions">
          <button type="button" class="danger" id="tk-del">Eliminar</button>
          <span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cancelar</button>
          <button type="submit" class="primary">Guardar</button>
        </div>
      </form>
    </dialog>`);
  document.querySelectorAll('#taskDlg [data-x]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

  function openTask(id) {
    const t = id ? ensure().find(x => x.id === id) : null;
    q('tk-heading').textContent = t ? 'Editar tarea' : 'Nueva tarea';
    q('tk-id').value = t ? t.id : '';
    q('tk-text').value = t ? t.text : '';
    q('tk-subj').innerHTML = '<option value="">— Ninguna —</option>' +
      S.subjects.map(s => `<option value="${s.id}" ${t && t.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    q('tk-due').value = t ? t.due || '' : '';
    q('tk-del').style.display = t ? '' : 'none';
    q('taskDlg').showModal();
  }
  q('taskForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const id = q('tk-id').value;
    const old = id ? ensure().find(x => x.id === id) : null;
    const data = {
      id: id || uid(), text: q('tk-text').value.trim(), subjectId: q('tk-subj').value, due: q('tk-due').value,
      done: old ? old.done : false, created: old ? old.created : Date.now()
    };
    if (old) Object.assign(old, data); else ensure().push(data);
    save(); q('taskDlg').close(); render();
  });
  q('tk-del').addEventListener('click', () => {
    const t = ensure().find(x => x.id === q('tk-id').value);
    if (!t || !confirm(`¿Eliminar la tarea "${t.text}"?`)) return;
    S.tasks = S.tasks.filter(x => x !== t);
    save(); q('taskDlg').close(); render();
  });

  // ---------- Acciones (se enganchan al sistema data-act de app.js) ----------
  actions.newTask = () => openTask(null);
  actions.editTask = d => openTask(d.id);
  actions.toggleTask = d => {
    const t = ensure().find(x => x.id === d.id);
    if (!t) return;
    t.done = !t.done;
    save(); render();
  };
  actions.toggleDoneTasks = () => { showDone = !showDone; render(); };
  actions.clearDoneTasks = () => {
    const n = ensure().filter(t => t.done).length;
    if (!n || !confirm(`¿Borrar las ${n} tareas hechas?`)) return;
    S.tasks = S.tasks.filter(t => !t.done);
    save(); render();
  };
  actions.newExam = () => {
    openEvent(null, fmt(new Date()));
    q('ev-cat').value = 'examen';
    q('ev-scope').value = 'all';
    const c = document.querySelector('input[name=rem][value=daybefore]');
    if (c) c.checked = true;
    q('ev-title').focus();
  };

  render(); // pinta ya las tarjetas nuevas
})();