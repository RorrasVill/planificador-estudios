'use strict';

/* =========================================================
   METAS y OBJETIVOS
   Una meta (lo que quieres conseguir) se divide en objetivos
   (lo que tienes que hacer para lograrla).
   - Pestaña "Metas" del menú superior: todas las metas con todos sus objetivos.
   - Pantalla "Hoy": resumen compacto (solo el nombre, la fecha y el progreso).
   Se carga DESPUÉS de app.js y usa sus funciones (S, save, render...).
   Datos: S.goals = [{ id, title, deadline, subjectId, notes, created,
                       objectives: [{ id, text, due, done }] }]
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const ensure = () => { if (!Array.isArray(S.goals)) S.goals = []; return S.goals; };
  ensure();

  const stats = g => {
    const total = (g.objectives || []).length;
    const done = (g.objectives || []).filter(o => o.done).length;
    return { total, done, pct: total ? Math.round(done / total * 100) : 0, complete: total > 0 && done === total };
  };
  const goalColor = g => (getSubj(g.subjectId) && getSubj(g.subjectId).color) || '#4f7cff';
  const daysLeft = ds => Math.round((parse(ds) - parse(fmt(new Date()))) / 86400000);
  const shortDate = ds => parse(ds).toLocaleDateString('es-ES');

  const sortedGoals = () => ensure().slice().sort((a, b) =>
    (stats(a).complete ? 1 : 0) - (stats(b).complete ? 1 : 0) || (a.deadline || '9999').localeCompare(b.deadline || '9999'));
  const dlText = g => {
    if (!g.deadline) return '';
    const st = stats(g), d = daysLeft(g.deadline), late = d < 0 && !st.complete;
    const txt = d < 0 ? `venció hace ${-d} d` : d === 0 ? 'vence hoy' : `faltan ${d} d`;
    return `<div class="${late ? 'meta-late' : 'muted'}" style="font-size:.85rem">Hasta el ${shortDate(g.deadline)} · ${txt}</div>`;
  };

  // ---------- Meta completa (pestaña "Metas") ----------
  function goalBlock(g) {
    const today = fmt(new Date());
    const st = stats(g), sub = getSubj(g.subjectId), c = goalColor(g);
    const objs = (g.objectives || []).map(o => `
      <div class="obj ${o.done ? 'done' : ''}">
        <span class="obj-check ${o.done ? 'on' : ''}" data-act="toggleObj" data-goal="${g.id}" data-id="${o.id}" title="Marcar como hecho">${o.done ? '✓' : ''}</span>
        <span class="t">${esc(o.text)}</span>
        ${o.due ? `<span class="due ${!o.done && o.due < today ? 'late' : ''}">${shortDate(o.due)}</span>` : ''}
        <button class="small ghost" data-act="editObj" data-goal="${g.id}" data-id="${o.id}" title="Editar objetivo">✏️</button>
      </div>`).join('');
    return `<div class="meta" style="--c:${c}">
      <div class="meta-head"><b>${st.complete ? '🎉 ' : '🎯 '}${esc(g.title)}</b>
        ${sub ? `<span class="muted" style="font-size:.8rem">${esc(sub.name)}</span>` : ''}
        <button class="small ghost" data-act="editGoal" data-id="${g.id}" title="Editar meta">✏️</button></div>
      ${g.notes ? `<div class="muted" style="font-size:.85rem">${esc(g.notes)}</div>` : ''}
      ${dlText(g)}
      <div class="progress" style="margin:8px 0 4px"><span style="width:${st.pct}%;background:${c}"></span></div>
      <div class="muted" style="font-size:.8rem;margin-bottom:6px">${st.total ? `${st.done}/${st.total} objetivos · ${st.pct}%${st.complete ? ' · ¡Meta cumplida!' : ''}` : 'Aún no tiene objetivos'}</div>
      ${objs}
      <button class="small" data-act="newObj" data-goal="${g.id}" style="margin-top:6px">+ Añadir objetivo</button>
    </div>`;
  }

  function goalsPage() {
    const goals = sortedGoals();
    const open = goals.filter(g => !stats(g).complete), done = goals.filter(g => stats(g).complete);
    const grid = list => `<div class="metas-grid">${list.map(goalBlock).join('')}</div>`;
    return `<div class="metas-page">
      <div class="meta-title"><h2 style="margin:0">🎯 Mis metas</h2>
        <button class="small primary" data-act="newGoal">+ Nueva meta</button></div>
      ${goals.length ? '' : '<p class="muted">Aún no tienes metas. Crea una y divídela en objetivos.</p>'}
      ${open.length ? grid(open) : ''}
      ${done.length ? `<h3 class="metas-sub">🎉 Cumplidas (${done.length})</h3>${grid(done)}` : ''}
    </div>`;
  }

  // ---------- Resumen compacto en "Hoy": solo el nombre ----------
  function goalsCard() {
    const items = sortedGoals().map(g => {
      const st = stats(g), c = goalColor(g);
      const d = g.deadline ? daysLeft(g.deadline) : null;
      const when = d === null ? '' : st.complete ? '' : d < 0 ? `<span class="meta-late">venció hace ${-d} d</span>` : d === 0 ? 'hoy' : `${d} d`;
      return `<div class="meta-mini" style="--c:${c}" data-act="view" data-view="goals" title="Ver los objetivos de esta meta">
        <div class="meta-mini-top"><b>${st.complete ? '🎉 ' : '🎯 '}${esc(g.title)}</b><span class="muted">${when}</span></div>
        <div class="progress" style="margin:5px 0 0;height:6px"><span style="width:${st.pct}%;background:${c}"></span></div>
      </div>`;
    }).join('') || '<p class="muted">Aún no tienes metas.</p>';
    return `<div class="card"><div class="meta-title"><h3>🎯 Mis metas</h3>
      <button class="small" data-act="view" data-view="goals">Ver todas</button></div>${items}</div>`;
  }

  // Pestaña "Metas" en el menú superior (si no está ya en el index.html)
  const nav = document.getElementById('nav');
  if (nav && !nav.querySelector('[data-view="goals"]')) {
    const b = document.createElement('button');
    b.dataset.act = 'view'; b.dataset.view = 'goals';
    b.textContent = 'Metas';
    nav.appendChild(b);
  }
  // La vista "goals" se pinta aquí; el resto de vistas las sigue pintando app.js
  const prevRender = render;
  render = function () {
    if (ui.view !== 'goals') return prevRender();
    document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === 'goals'));
    document.getElementById('app').innerHTML = goalsPage();
    updateUpNext(); updatePermBtn();
  };

  // Colocamos la tarjeta justo debajo de "Mis asignaturas"
  const origToday = renderToday;
  renderToday = function () {
    let html = origToday();
    const marker = '<div class="card"><h3>Mis asignaturas</h3>';
    const end = html.lastIndexOf('</div>');
    if (html.indexOf(marker) >= 0 && end >= 0) {
      html = html.replace(marker, '<div class="col-stack">' + marker);
      const e2 = html.lastIndexOf('</div>');
      return html.slice(0, e2) + goalsCard() + '</div>' + html.slice(e2);
    }
    return html + goalsCard();
  };

  // ---------- Estilos ----------
  const style = document.createElement('style');
  style.textContent = `
    .col-stack { display: flex; flex-direction: column; gap: 16px; min-width: 0; }
    .meta-title { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 10px; }
    .meta-title h3 { margin: 0; }
    .meta { border: 1px solid var(--line); border-left: 6px solid var(--c); border-radius: 10px; padding: 10px 12px; margin-bottom: 10px; background: var(--card); }
    #nav { flex: 1 0 auto; flex-wrap: nowrap; }
    #nav button { white-space: nowrap; }
    @media (max-width: 760px) { #nav { flex: 1 1 100%; flex-wrap: wrap; } }
    .metas-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; align-items: start; margin-bottom: 16px; }
    .metas-grid .meta { margin-bottom: 0; }
    .metas-sub { margin: 18px 0 10px; }
    .meta-mini { border: 1px solid var(--line); border-left: 6px solid var(--c); border-radius: 10px; padding: 8px 12px; margin-bottom: 8px; background: var(--card); cursor: pointer; }
    .meta-mini:hover { filter: brightness(.97); }
    .meta-mini-top { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; }
    .meta-mini-top .muted { font-size: .8rem; white-space: nowrap; }
    .meta-head { display: flex; align-items: center; gap: 8px; }
    .meta-head b { flex: 1; }
    .meta-late { color: var(--danger); }
    .obj { display: flex; align-items: center; gap: 8px; padding: 3px 0; }
    .obj .t { flex: 1; }
    .obj.done .t { text-decoration: line-through; color: var(--muted); }
    .obj .due { font-size: .75rem; color: var(--muted); }
    .obj .due.late { color: var(--danger); font-weight: 600; }
    .obj button { border: 0; padding: 2px 6px; }
    .obj-check { width: 20px; height: 20px; flex: none; border: 2px solid var(--muted); border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; cursor: pointer; font-size: .8rem; line-height: 1; color: #fff; }
    .obj-check:hover { border-color: var(--ok); }
    .obj-check.on { background: var(--ok); border-color: var(--ok); }
  `;
  document.head.appendChild(style);

  // ---------- Diálogos ----------
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="goalDlg">
      <form id="goalForm">
        <h2 id="gl-heading">Nueva meta</h2>
        <input type="hidden" id="gl-id">
        <label>Meta <input id="gl-title" required maxlength="100" placeholder="Ej. Aprobar todo en enero"></label>
        <div class="row">
          <label>Fecha límite (opcional) <input type="date" id="gl-deadline"></label>
          <label>Asignatura (opcional) <select id="gl-subj"></select></label>
        </div>
        <label>Descripción <textarea id="gl-notes" rows="2" placeholder="Opcional"></textarea></label>
        <div class="actions">
          <button type="button" class="danger" id="gl-del">Eliminar</button>
          <span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cancelar</button>
          <button type="submit" class="primary">Guardar</button>
        </div>
      </form>
    </dialog>
    <dialog id="objDlg">
      <form id="objForm">
        <h2 id="ob-heading">Nuevo objetivo</h2>
        <input type="hidden" id="ob-goal">
        <input type="hidden" id="ob-id">
        <p class="hint" id="ob-meta"></p>
        <label>Objetivo <input id="ob-text" required maxlength="120" placeholder="Ej. Terminar el resumen del tema 4"></label>
        <label>Fecha límite (opcional) <input type="date" id="ob-due"></label>
        <div class="actions">
          <button type="button" class="danger" id="ob-del">Eliminar</button>
          <span class="spacer"></span>
          <button type="button" class="ghost" data-x>Cancelar</button>
          <button type="submit" class="primary">Guardar</button>
        </div>
      </form>
    </dialog>`);
  document.querySelectorAll('#goalDlg [data-x], #objDlg [data-x]').forEach(b =>
    b.addEventListener('click', () => b.closest('dialog').close()));

  function openGoal(id) {
    const g = id ? ensure().find(x => x.id === id) : null;
    q('gl-heading').textContent = g ? 'Editar meta' : 'Nueva meta';
    q('gl-id').value = g ? g.id : '';
    q('gl-title').value = g ? g.title : '';
    q('gl-deadline').value = g ? g.deadline || '' : '';
    q('gl-subj').innerHTML = '<option value="">— Ninguna —</option>' +
      S.subjects.map(s => `<option value="${s.id}" ${g && g.subjectId === s.id ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
    q('gl-notes').value = g ? g.notes || '' : '';
    q('gl-del').style.display = g ? '' : 'none';
    q('goalDlg').showModal();
  }
  function openObj(goalId, id) {
    const g = ensure().find(x => x.id === goalId);
    if (!g) return;
    const o = id ? (g.objectives || []).find(x => x.id === id) : null;
    q('ob-heading').textContent = o ? 'Editar objetivo' : 'Nuevo objetivo';
    q('ob-goal').value = g.id;
    q('ob-id').value = o ? o.id : '';
    q('ob-meta').textContent = 'Meta: ' + g.title;
    q('ob-text').value = o ? o.text : '';
    q('ob-due').value = o ? o.due || '' : '';
    q('ob-del').style.display = o ? '' : 'none';
    q('objDlg').showModal();
  }

  q('goalForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const id = q('gl-id').value;
    const old = id ? ensure().find(x => x.id === id) : null;
    const data = {
      id: id || uid(), title: q('gl-title').value.trim(), deadline: q('gl-deadline').value,
      subjectId: q('gl-subj').value, notes: q('gl-notes').value.trim(),
      objectives: old ? old.objectives || [] : [], created: old ? old.created : Date.now()
    };
    if (old) Object.assign(old, data); else ensure().push(data);
    save(); q('goalDlg').close(); render();
    if (!old) openObj(data.id, null); // meta nueva: pedimos su primer objetivo
  });
  q('gl-del').addEventListener('click', () => {
    const g = ensure().find(x => x.id === q('gl-id').value);
    if (!g || !confirm(`¿Eliminar la meta "${g.title}" y todos sus objetivos?`)) return;
    S.goals = S.goals.filter(x => x !== g);
    save(); q('goalDlg').close(); render();
  });

  q('objForm').addEventListener('submit', ev => {
    ev.preventDefault();
    const g = ensure().find(x => x.id === q('ob-goal').value);
    if (!g) return;
    g.objectives = g.objectives || [];
    const id = q('ob-id').value;
    const o = id ? g.objectives.find(x => x.id === id) : null;
    const text = q('ob-text').value.trim(), due = q('ob-due').value;
    if (o) { o.text = text; o.due = due; } else g.objectives.push({ id: uid(), text, due, done: false });
    save(); q('objDlg').close(); render();
  });
  q('ob-del').addEventListener('click', () => {
    const g = ensure().find(x => x.id === q('ob-goal').value);
    if (!g || !confirm('¿Eliminar este objetivo?')) return;
    g.objectives = (g.objectives || []).filter(x => x.id !== q('ob-id').value);
    save(); q('objDlg').close(); render();
  });

  // ---------- Acciones (se enganchan al sistema data-act de app.js) ----------
  actions.newGoal = () => openGoal(null);
  actions.editGoal = d => openGoal(d.id);
  actions.newObj = d => openObj(d.goal, null);
  actions.editObj = d => openObj(d.goal, d.id);
  actions.toggleObj = d => {
    const g = ensure().find(x => x.id === d.goal);
    const o = g && (g.objectives || []).find(x => x.id === d.id);
    if (!o) return;
    o.done = !o.done;
    save(); render();
  };

  render(); // pinta ya la tarjeta nueva
})();