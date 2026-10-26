'use strict';

/* =========================================================
   MENÚ POR ASIGNATURA
   Al pulsar una asignatura aparece, a la izquierda de su ficha, un menú con:
     🏠 Resumen · 📄 Apuntes · 📝 Exámenes · 📊 Notas · 📅 Actividades · ✅ Ejercicios y tareas
   No crea datos nuevos: reutiliza lo que ya existe
     - apuntes y notas: s.notes y s.grades (con sus botones de IA y calculadora)
     - exámenes y actividades: S.events con subjectId (los exámenes son los de tipo "examen")
     - ejercicios y tareas: S.tasks con subjectId
   Se carga DESPUÉS de repaso.js (que amplía la pestaña de apuntes).
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const SECTIONS = [
    { k: 'overview', icon: '🏠', n: 'Resumen' },
    { k: 'notes', icon: '📄', n: 'Apuntes' },
    { k: 'exams', icon: '📝', n: 'Exámenes' },
    { k: 'grades', icon: '📊', n: 'Notas' },
    { k: 'acts', icon: '📅', n: 'Actividades' },
    { k: 'tasks', icon: '✅', n: 'Ejercicios y tareas' }
  ];
  const sd = ds => parse(ds).toLocaleDateString('es-ES');
  const daysTo = ds => Math.round((parse(ds) - parse(fmt(new Date()))) / 86400000);
  const today = () => fmt(new Date());

  // ---------- Datos de cada sección (solo lectura) ----------
  const tasksOf = s => (Array.isArray(S.tasks) ? S.tasks : []).filter(t => t.subjectId === s.id);
  const examsOf = s => S.events
    .filter(e => e.cat === 'examen' && e.subjectId === s.id && e.repeat !== 'weekly')
    .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start));
  // Próximas actividades (no exámenes) de los próximos 60 días; las repeticiones semanales se expanden
  function actsOf(s, days = 60, max = 40) {
    const out = [], now = new Date();
    for (let i = 0; i <= days && out.length < max; i++) {
      occurrencesOn(fmt(addDays(now, i))).forEach(o => { if (o.subjectId === s.id && o.cat !== 'examen') out.push(o); });
    }
    return out.slice(0, max);
  }
  // Nota de una evaluación que cae el mismo día que el examen (si la hay)
  const gradeOfExam = (s, e) => (s.grades || []).find(g => g.date === e.date && g.grade !== '' && g.grade != null);

  // ---------- Secciones ----------
  function examRow(s, e) {
    const n = daysTo(e.date), past = n < 0, g = gradeOfExam(s, e);
    const label = past ? 'Hecho' : n === 0 ? 'HOY' : n === 1 ? 'MAÑANA' : n + ' días';
    const urg = past ? '' : n <= 3 ? 'hot' : n <= 7 ? 'warm' : '';
    return `<div class="exam" style="--c:${evColor(e)}" data-act="editEvent" data-id="${e.id}" data-date="${e.date}">
      <div class="exam-days ${urg}">${label}</div>
      <div class="exam-main"><b>${esc(e.title)}</b>
        <div class="muted" style="font-size:.85rem">${sd(e.date)} · ${e.start}–${minStr(toMin(e.start) + e.duration)}${g ? ` · <b>Nota: ${esc(g.grade)}</b>` : ''}</div>
        ${e.notes ? `<div class="sj-cont">${esc(e.notes)}</div>` : ''}</div></div>`;
  }
  function examsSection(s) {
    const all = examsOf(s), t = today();
    const next = all.filter(e => e.date >= t), past = all.filter(e => e.date < t).reverse();
    return `<div class="es-title"><h3>📝 Exámenes de ${esc(s.name)}</h3><button class="small primary" data-act="newExamSubj">+ Añadir examen</button></div>
      ${next.map(e => examRow(s, e)).join('') || '<p class="muted">No hay exámenes próximos para esta asignatura.</p>'}
      ${past.length ? `<h3 style="margin-top:16px">Pasados</h3>${past.map(e => examRow(s, e)).join('')}` : ''}
      <p class="hint">En las notas del examen puedes apuntar el contenido o el aula. Si hay una evaluación con la misma fecha en <b>Notas</b>, aquí se muestra su nota.</p>`;
  }
  function actsSection(s) {
    const list = actsOf(s);
    return `<div class="es-title"><h3>📅 Próximas actividades (60 días)</h3><button class="small primary" data-act="newActSubj">+ Nueva actividad</button></div>
      ${list.map(o => itemHTML(o, true)).join('') || '<p class="muted">No hay actividades próximas ligadas a esta asignatura.</p>'}
      <p class="hint">Aquí salen las actividades en las que elegiste esta asignatura (clases, estudio...). Los exámenes están en su propia sección.</p>`;
  }
  function taskRow(t) {
    const late = !t.done && t.due && t.due < today();
    return `<div class="tk ${t.done ? 'done' : ''}">
      <span class="tk-check ${t.done ? 'on' : ''}" data-act="toggleTask" data-id="${t.id}" title="Marcar como hecha">${t.done ? '✓' : ''}</span>
      <span class="t">${esc(t.text)}</span>
      ${t.due ? `<span class="due ${late ? 'late' : ''}">${sd(t.due)}</span>` : ''}
      <button class="small ghost" data-act="editTask" data-id="${t.id}" title="Editar">✏️</button></div>`;
  }
  function tasksSection(s) {
    const by = (a, b) => (a.due || '9999').localeCompare(b.due || '9999') || (a.created || 0) - (b.created || 0);
    const pend = tasksOf(s).filter(t => !t.done).sort(by), done = tasksOf(s).filter(t => t.done).sort(by);
    return `<div class="es-title"><h3>✅ Ejercicios y tareas</h3><button class="small primary" data-act="newTaskSubj">+ Nueva tarea</button></div>
      ${pend.map(taskRow).join('') || '<p class="muted">No hay tareas pendientes en esta asignatura.</p>'}
      ${done.length ? `<h3 style="margin-top:16px">Hechas (${done.length})</h3>${done.map(taskRow).join('')}` : ''}
      <p class="hint">Apunta aquí los ejercicios, entregas o lecturas. Las mismas tareas salen también en la pantalla Hoy.</p>`;
  }
  function overviewSection(s) {
    const t = today(), next = examsOf(s).find(e => e.date >= t);
    const act = actsOf(s, 14, 1)[0], pend = tasksOf(s).filter(x => !x.done).length, nn = (s.notes || []).length;
    const kpi = (tab, title, big, sub) => `<div class="sj-kpi" data-act="tab" data-tab="${tab}"><span class="muted">${title}</span><b>${big}</b><span class="muted">${sub}</span></div>`;
    const nd = next ? daysTo(next.date) : null;
    return `${gradeSummary(s)}
      <div class="sj-kpis">
        ${kpi('exams', '📝 Próximo examen', next ? (nd === 0 ? 'HOY' : nd === 1 ? 'MAÑANA' : nd + ' días') : '—', next ? esc(sd(next.date)) : 'Sin exámenes')}
        ${kpi('tasks', '✅ Tareas pendientes', pend, pend ? 'Ver ejercicios y tareas' : 'Todo al día')}
        ${kpi('notes', '📄 Apuntes', nn, nn ? 'Ver apuntes' : 'Aún no hay ninguno')}
        ${kpi('acts', '📅 Próxima actividad', act ? esc(DAYS[(parse(act.occDate).getDay() + 6) % 7].slice(0, 3)) + ' ' + act.start : '—', act ? esc(act.title) : 'Nada en 14 días')}
      </div>`;
  }
  function section(s) {
    switch (ui.tab) {
      case 'notes': return notesTab(s);
      case 'grades': return gradesTab(s);
      case 'exams': return examsSection(s);
      case 'acts': return actsSection(s);
      case 'tasks': return tasksSection(s);
      default: return overviewSection(s);
    }
  }
  function counter(s, k) {
    if (k === 'notes') return (s.notes || []).length;
    if (k === 'exams') return examsOf(s).filter(e => e.date >= today()).length;
    if (k === 'tasks') return tasksOf(s).filter(t => !t.done).length;
    return 0;
  }

  // ---------- Vista ASIGNATURAS (sustituye a la de app.js) ----------
  renderSubjects = function () {
    if (!SECTIONS.some(x => x.k === ui.tab)) ui.tab = 'overview';
    const list = S.subjects.map(s => `<div class="sj-card ${ui.subj === s.id ? 'active' : ''}" style="--c:${s.color}" data-act="openSubject" data-id="${s.id}">
      <div class="name">${esc(s.name)}</div><div>${gradeBadge(s)}</div></div>`).join('')
      || '<p class="muted">Crea tu primera asignatura para subir apuntes y controlar tus notas.</p>';
    const s = getSubj(ui.subj);
    let detail = '<div class="card muted">Selecciona una asignatura.</div>';
    if (s) {
      const menu = SECTIONS.map(x => {
        const n = counter(s, x.k);
        return `<button class="${ui.tab === x.k ? 'active' : ''}" data-act="tab" data-tab="${x.k}"><span>${x.icon}</span><span class="lbl">${x.n}</span>${n ? `<span class="cnt">${n}</span>` : ''}</button>`;
      }).join('');
      detail = `<div class="card">
        <div class="toolbar"><h2 style="color:${s.color}">${esc(s.name)}</h2><button data-act="editSubject" data-id="${s.id}">✏️ Editar</button></div>
        <div class="sj-detail"><div class="sj-menu">${menu}</div><div class="sj-body">${section(s)}</div></div></div>`;
    }
    return `<div class="toolbar"><h2>Asignaturas</h2><button class="primary" data-act="newSubject">+ Nueva asignatura</button></div>
      <div class="subjects"><div>${list}</div><div>${detail}</div></div>`;
  };
  ui.tab = 'overview'; // al abrir una asignatura se empieza por el Resumen

  // ---------- Acciones: crear algo ya ligado a la asignatura abierta ----------
  actions.newExamSubj = () => { actions.newExam(); if (ui.subj) $('#ev-subj').value = ui.subj; };
  actions.newActSubj = () => { openEvent(null, today()); if (ui.subj) $('#ev-subj').value = ui.subj; $('#ev-title').focus(); };
  actions.newTaskSubj = () => { actions.newTask(); if (ui.subj) q('tk-subj').value = ui.subj; q('tk-text').focus(); };

  // ---------- Estilos ----------
  const style = document.createElement('style');
  style.textContent = `
    .sj-detail { display: grid; grid-template-columns: 180px minmax(0, 1fr); gap: 16px; align-items: start; }
    .sj-menu { display: flex; flex-direction: column; gap: 4px; position: sticky; top: 70px; }
    .sj-menu button { display: flex; align-items: center; gap: 8px; text-align: left; border-color: transparent; background: transparent; padding: 9px 10px; }
    .sj-menu button:hover { background: var(--bg); }
    .sj-menu button.active { background: var(--primary); color: #fff; }
    .sj-menu .cnt { margin-left: auto; font-size: .72rem; font-weight: 700; padding: 1px 7px; border-radius: 999px; background: var(--bg); color: var(--text); }
    .sj-menu button.active .cnt { background: rgba(255,255,255,.28); color: #fff; }
    .sj-body { min-width: 0; }
    .sj-kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; margin-top: 12px; }
    .sj-kpi { background: var(--bg); border-radius: 10px; padding: 12px; cursor: pointer; display: flex; flex-direction: column; gap: 2px; border: 1px solid transparent; }
    .sj-kpi:hover { border-color: var(--primary); }
    .sj-kpi b { font-size: 1.4rem; }
    .sj-cont { margin-top: 4px; font-size: .85rem; white-space: pre-wrap; color: var(--muted); }
    @media (max-width: 900px) {
      .sj-detail { grid-template-columns: 1fr; }
      .sj-menu { flex-direction: row; overflow-x: auto; position: static; padding-bottom: 4px; }
      .sj-menu button { flex: 0 0 auto; white-space: nowrap; font-size: .85rem; padding: 7px 10px; }
    }`;
  document.head.appendChild(style);

  window.AsignaturaMenu = { SECTIONS, examsOf, actsOf, tasksOf, gradeOfExam };
  render(); // repinta ya con el menú nuevo
})();