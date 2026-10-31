'use strict';

// Ajuste automático del tamaño según el ancho de la pantalla
function autoScale() {
  const z = Math.min(3, Math.max(1, window.innerWidth / 1280));
  document.documentElement.style.zoom = z.toFixed(2);
}
autoScale();
window.addEventListener('resize', autoScale);

/* =========================================================
   Planificador de estudios – todo se guarda en tu navegador
   (localStorage para datos, IndexedDB para archivos).
   ========================================================= */

// ---------- Utilidades ----------
const $ = s => document.querySelector(s);
const uid = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const pad = n => String(n).padStart(2, '0');
const fmt = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parse = s => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const toMin = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const minStr = m => `${pad(Math.floor(m / 60) % 24)}:${pad(m % 60)}`;
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const mondayOf = d => addDays(d, -((d.getDay() + 6) % 7));
const dtOf = (dateStr, min) => { const d = parse(dateStr); return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, min); };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DAYS = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado', 'Domingo'];
const MONTHS = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const CATS = {
  estudio: { n: 'Estudio', c: '#4f7cff' },
  clase: { n: 'Clase', c: '#8b5cf6' },
  examen: { n: 'Examen / Entrega', c: '#ef4444' },
  personal: { n: 'Personal', c: '#10b981' },
  ocio: { n: 'Ocio / Social', c: '#f59e0b' },
  deporte: { n: 'Deporte', c: '#06b6d4' },
  otro: { n: 'Otro', c: '#64748b' }
};
const HH = 48; // px por hora en la vista semanal (igual que --hh)

// ---------- Datos ----------
const KEY = 'planner.v1', FIRED = 'planner.fired';
let S = load();
function load() {
  try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && s.events) return s; } catch { }
  return { events: [], subjects: [], settings: { dayStart: 7, dayEnd: 23 } };
}
function save() { localStorage.setItem(KEY, JSON.stringify(S)); }
const getSubj = id => S.subjects.find(s => s.id === id);

const ui = { view: 'today', month: new Date(new Date().getFullYear(), new Date().getMonth(), 1), week: mondayOf(new Date()), subj: null, tab: 'notes' };

// ---------- IndexedDB (archivos de apuntes) ----------
const idb = new Promise((res, rej) => {
  const r = indexedDB.open('planner-files', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('files', { keyPath: 'id' });
  r.onsuccess = () => res(r.result);
  r.onerror = () => rej(r.error);
});
const tx = (mode, fn) => idb.then(db => new Promise((res, rej) => {
  const t = db.transaction('files', mode);
  const rq = fn(t.objectStore('files'));
  t.oncomplete = () => res(rq && rq.result);
  t.onerror = () => rej(t.error);
}));
const fPut = r => tx('readwrite', s => s.put(r));
const fGet = id => tx('readonly', s => s.get(id));
const fDel = id => tx('readwrite', s => s.delete(id));

// ---------- Actividades ----------
// ¿Es `ds` el aniversario (mismo mes y día) de la fecha base? El 29 de febrero se celebra el 28 en los años no bisiestos.
function sameAnniv(base, ds) {
  const [, bm, bd] = base.split('-').map(Number), [y, m, d] = ds.split('-').map(Number);
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  if (bm === 2 && bd === 29 && !leap) return m === 2 && d === 28;
  return bm === m && bd === d;
}
const isRepeating = e => e && (e.repeat === 'weekly' || e.repeat === 'yearly');
function occurrencesOn(dateStr) {
  const dow = parse(dateStr).getDay();
  return S.events
    .filter(e => (e.date === dateStr
        || (e.repeat === 'weekly' && e.date < dateStr && (!e.until || dateStr <= e.until) && parse(e.date).getDay() === dow)
        || (e.repeat === 'yearly' && e.date < dateStr && (!e.until || dateStr <= e.until) && sameAnniv(e.date, dateStr)))
      && !(e.skip || []).includes(dateStr))
    .map(e => ({ ...e, occDate: dateStr }))
    .sort((a, b) => toMin(a.start) - toMin(b.start));
}
// Color de una actividad: el suyo propio (si lo tiene) > el de su asignatura > el de su tipo
const evColor = e => e.color || (getSubj(e.subjectId)?.color) || CATS[e.cat]?.c || '#64748b';
const evStart = e => dtOf(e.occDate, toMin(e.start));
const evEnd = e => dtOf(e.occDate, toMin(e.start) + e.duration);

function upcoming(hours) {
  const now = new Date(), limit = new Date(now.getTime() + hours * 3600000), out = [];
  for (let i = 0; i <= Math.ceil(hours / 24) + 1; i++) {
    occurrencesOn(fmt(addDays(now, i))).forEach(o => { const s = evStart(o); if (s > now && s <= limit) out.push(o); });
  }
  return out.sort((a, b) => evStart(a) - evStart(b));
}
function human(ms) {
  const m = Math.max(0, Math.round(ms / 60000));
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return r ? `${h} h ${r} min` : `${h} h`;
}
function dayWord(d) {
  const t = fmt(new Date());
  if (fmt(d) === t) return 'Hoy';
  if (fmt(d) === fmt(addDays(new Date(), 1))) return 'Mañana';
  return `${DAYS[(d.getDay() + 6) % 7]} ${d.getDate()}/${d.getMonth() + 1}`;
}

// ---------- Notificaciones ----------
function fired() { try { return JSON.parse(localStorage.getItem(FIRED)) || {}; } catch { return {}; } }
function saveFired(f) { localStorage.setItem(FIRED, JSON.stringify(f)); }

function triggerTime(o, k) {
  const d = parse(o.occDate), s = evStart(o);
  if (k === 'start') return s;
  if (k === 'morning') return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 8, 0);
  if (k === 'daybefore') return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 20, 0);
  return new Date(s.getTime() - Number(k) * 60000);
}

function checkReminders() {
  const now = new Date(), f = fired();
  let changed = false;
  for (let i = 0; i <= 2; i++) {
    occurrencesOn(fmt(addDays(now, i))).forEach(o => {
      (o.remind || []).forEach(k => {
        const key = `${o.id}|${o.occDate}|${k}`;
        if (f[key]) return;
        const t = triggerTime(o, k);
        if (now >= t && now < evEnd(o)) {
          f[key] = Date.now(); changed = true;
          const s = evStart(o);
          const when = s > now
            ? `${dayWord(s)} a las ${o.start} · empieza en ${human(s - now)}`
            : `${dayWord(s)} a las ${o.start} · ¡ya ha empezado!`;
          notify(`⏰ ${o.title}`, when);
        }
      });
    });
  }
  // limpiar avisos antiguos
  Object.keys(f).forEach(k => { if (Date.now() - f[k] > 4 * 86400000) { delete f[k]; changed = true; } });
  if (changed) saveFired(f);
}

function notify(title, body) {
  toast(title, body);
  beep();
  if ('Notification' in window && Notification.permission === 'granted') {
    try { new Notification(title, { body }); } catch { }
  }
}
function toast(title, body) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `<b>${esc(title)}</b><div>${esc(body)}</div><button class="small" data-act="closeToast">Entendido</button>`;
  $('#toasts').appendChild(el);
}
function beep() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.connect(g); g.connect(ctx.destination);
    o.frequency.value = 880; g.gain.value = 0.08;
    o.start(); o.stop(ctx.currentTime + 0.25);
  } catch { }
}
function updatePermBtn() {
  const b = $('#permBtn');
  if (!('Notification' in window)) { b.classList.add('hidden'); return; }
  b.textContent = Notification.permission === 'granted' ? '🔔 Avisos activados' : '🔔 Activar avisos';
}
function updateUpNext() {
  const box = $('#upNext'), n = upcoming(3)[0];
  if (!n) { box.classList.add('hidden'); return; }
  const s = evStart(n);
  box.classList.remove('hidden');
  box.innerHTML = `⏳ <b>Próxima actividad:</b> ${esc(n.title)} — ${dayWord(s)} a las ${n.start} (en ${human(s - new Date())})`;
}

// ---------- Render general ----------
let lastMinute = -1;
function render() {
  document.querySelectorAll('#nav button').forEach(b => b.classList.toggle('active', b.dataset.view === ui.view));
  const app = $('#app');
  if (ui.view === 'today') app.innerHTML = renderToday();
  else if (ui.view === 'month') app.innerHTML = renderMonth();
  else if (ui.view === 'week') app.innerHTML = renderWeek();
  else app.innerHTML = renderSubjects();
  updateUpNext();
  updatePermBtn();
}

// ---------- Vista HOY ----------
function itemHTML(o, showDay) {
  const sub = getSubj(o.subjectId);
  return `<div class="item" style="--c:${evColor(o)}" data-act="editEvent" data-id="${o.id}" data-date="${o.occDate}">
    <div class="time">${showDay ? esc(dayWord(parse(o.occDate))) + '<br>' : ''}${o.start}–${minStr(toMin(o.start) + o.duration)}</div>
    <div><div>${esc(o.title)}</div><div class="sub">${esc(CATS[o.cat]?.n || '')}${sub ? ' · ' + esc(sub.name) : ''}</div></div>
  </div>`;
}
function renderToday() {
  const now = new Date(), today = occurrencesOn(fmt(now));
  const up = upcoming(72).slice(0, 8);
  const subs = S.subjects.map(s => {
    return `<div class="sj-card" style="--c:${s.color}" data-act="goSubject" data-id="${s.id}">
      <div class="name">${esc(s.name)}</div>
      <div>${gradeBadge(s)}</div></div>`;
  }).join('') || '<p class="muted">Aún no has creado asignaturas.</p>';
  return `
    <div class="toolbar"><h2>${DAYS[(now.getDay() + 6) % 7]} ${now.getDate()} de ${MONTHS[now.getMonth()]}</h2>
      <button class="primary" data-act="newEvent" data-date="${fmt(now)}">+ Nueva actividad</button></div>
    <div class="grid2">
      <div class="card"><h3>Agenda de hoy</h3>
        ${today.map(o => itemHTML(o)).join('') || '<p class="muted">No tienes actividades hoy. ¡Día libre!</p>'}</div>
      <div class="card"><h3>Próximas actividades</h3>
        ${up.map(o => itemHTML(o, true)).join('') || '<p class="muted">Nada programado en los próximos días.</p>'}</div>
      <div class="card"><h3>Mis asignaturas</h3>${subs}</div>
    </div>`;
}

// ---------- Vista MES ----------
// El mes es la visión general: oculta lo que se creó solo para organizar la semana.
function renderMonth() {
  const first = ui.month, offset = (first.getDay() + 6) % 7, start = addDays(first, -offset), todayS = fmt(new Date());
  let cells = '';
  for (let i = 0; i < 42; i++) {
    const d = addDays(start, i), ds = fmt(d), occ = occurrencesOn(ds).filter(o => o.scope !== 'week');
    cells += `<div class="cell ${d.getMonth() !== first.getMonth() ? 'other' : ''} ${ds === todayS ? 'today' : ''}" data-act="newEvent" data-date="${ds}">
      <span class="num">${d.getDate()}</span>
      ${occ.slice(0, 3).map(o => `<div class="chip" style="--c:${evColor(o)}" data-act="editEvent" data-id="${o.id}" data-date="${ds}">${o.start} ${esc(o.title)}</div>`).join('')}
      ${occ.length > 3 ? `<div class="more">+${occ.length - 3} más</div>` : ''}</div>`;
  }
  const y0 = first.getFullYear();
  const monthOpts = MONTHS.map((n, i) => `<option value="${i}" ${i === first.getMonth() ? 'selected' : ''}>${n}</option>`).join('');
  const yearOpts = [...Array(11)].map((_, i) => y0 - 5 + i).map(y => `<option ${y === y0 ? 'selected' : ''}>${y}</option>`).join('');
  return `
    <div class="toolbar">
      <select data-mon="m">${monthOpts}</select>
      <select data-mon="y">${yearOpts}</select>
      <span class="spacer"></span>
      <button data-act="prev">◀</button><button data-act="goToday">Hoy</button><button data-act="next">▶</button>
      <button class="primary" data-act="newEvent" data-date="${todayS}">+ Nueva actividad</button></div>
    <div class="month">${DAYS.map(d => `<div class="dow">${d}</div>`).join('')}${cells}</div>`;
}

// ---------- Vista SEMANA ----------
function layout(evs) {
  const list = evs.map(e => ({ e, s: toMin(e.start), en: Math.min(toMin(e.start) + e.duration, 1440) })).sort((a, b) => a.s - b.s);
  let cluster = [], maxEnd = -1;
  const done = [];
  const close = () => { const n = Math.max(1, ...cluster.map(c => c.lane + 1)); cluster.forEach(c => c.lanes = n); done.push(...cluster); cluster = []; };
  const laneEnds = [];
  list.forEach(it => {
    if (cluster.length && it.s >= maxEnd) { close(); laneEnds.length = 0; maxEnd = -1; }
    let lane = laneEnds.findIndex(en => en <= it.s);
    if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
    laneEnds[lane] = it.en; it.lane = lane;
    maxEnd = Math.max(maxEnd, it.en);
    cluster.push(it);
  });
  if (cluster.length) close();
  return done;
}
function renderWeek() {
  const { dayStart: hs, dayEnd: he } = S.settings, rows = he - hs;
  const days = [...Array(7)].map((_, i) => addDays(ui.week, i)), todayS = fmt(new Date());
  const now = new Date(), nowMin = now.getHours() * 60 + now.getMinutes();
  const dist = {}; let planned = 0;
  const head = days.map(d => `<div class="${fmt(d) === todayS ? 'today' : ''}">${DAYS[(d.getDay() + 6) % 7].slice(0, 3)} ${d.getDate()}</div>`).join('');
  const times = [...Array(rows)].map((_, i) => `<div>${pad(hs + i)}:00</div>`).join('');
  const cols = days.map(d => {
    const ds = fmt(d), occ = occurrencesOn(ds);
    occ.forEach(o => { dist[o.cat] = (dist[o.cat] || 0) + o.duration; planned += o.duration; });
    const evs = layout(occ).map(({ e, lane, lanes }) => {
      const s = toMin(e.start), top = (s - hs * 60) / 60 * HH, h = Math.max(18, Math.min(e.duration, 1440 - s) / 60 * HH - 2);
      if (top + h < 0 || top > rows * HH) return '';
      return `<div class="ev" style="--c:${evColor(e)};top:${top}px;height:${h}px;left:calc(${lane * 100 / lanes}% + 2px);width:calc(${100 / lanes}% - 4px)" data-act="editEvent" data-id="${e.id}" data-date="${ds}" title="${esc(e.title)}"><b>${esc(e.title)}</b>${e.start}–${minStr(s + e.duration)}</div>`;
    }).join('');
    const line = ds === todayS && nowMin >= hs * 60 && nowMin <= he * 60 ? `<div class="nowline" style="top:${(nowMin - hs * 60) / 60 * HH}px"></div>` : '';
    return `<div class="wk-col ${ds === todayS ? 'today' : ''}" style="height:${rows * HH}px" data-slot="${ds}">${evs}${line}</div>`;
  }).join('');
  const total = rows * 7 * 60, free = Math.max(0, total - planned);
  const bars = Object.entries(dist).map(([k, m]) => `<span style="width:${m / total * 100}%;background:${CATS[k]?.c}" title="${CATS[k]?.n}: ${(m / 60).toFixed(1)} h"></span>`).join('');
  const legend = Object.entries(dist).map(([k, m]) => `<span><i style="background:${CATS[k]?.c}"></i>${CATS[k]?.n}: ${(m / 60).toFixed(1)} h</span>`).join('');
  const opt = (from, to, sel) => [...Array(to - from + 1)].map((_, i) => `<option ${from + i === sel ? 'selected' : ''}>${from + i}</option>`).join('');
  const end = addDays(ui.week, 6);
  return `
    <div class="toolbar"><h2>Semana del ${ui.week.getDate()} ${MONTHS[ui.week.getMonth()].slice(0, 3)} al ${end.getDate()} ${MONTHS[end.getMonth()].slice(0, 3)} ${end.getFullYear()}</h2>
      <span class="wk-set">Horario: <select data-set="dayStart">${opt(0, 12, hs)}</select> a <select data-set="dayEnd">${opt(13, 24, he)}</select></span>
      <button data-act="prev">◀</button><button data-act="goToday">Hoy</button><button data-act="next">▶</button>
      <button class="primary" data-act="newEvent" data-date="${todayS}">+ Nueva actividad</button></div>
    <div class="week"><div class="wk-head"><div></div>${head}</div>
      <div class="wk-body"><div class="wk-times">${times}</div>${cols}</div></div>
    <div class="card dist"><h3>Reparto del tiempo de la semana</h3>
      <div class="bar">${bars}</div>
      <div class="legend">${legend || '<span class="muted">Sin actividades esta semana.</span>'}</div>
      <p class="muted">Planificado: <b>${(planned / 60).toFixed(1)} h</b> · Libre (dentro de tu horario ${hs}:00–${he}:00): <b>${(free / 60).toFixed(1)} h</b></p></div>`;
}

// ---------- Notas / estadísticas ----------
function stats(s) {
  const gs = s.grades || [];
  const graded = gs.filter(g => g.grade !== '' && g.grade != null);
  const W = graded.reduce((a, g) => a + Number(g.weight), 0);
  const pts = graded.reduce((a, g) => a + Number(g.grade) * Number(g.weight) / 100, 0);
  const total = gs.reduce((a, g) => a + Number(g.weight), 0);
  const rem = Math.max(0, 100 - W);
  const target = Number(s.target ?? 5);
  return { graded, W, pts, total, rem, target, avg: W ? pts / W * 100 : null, need: rem > 0 ? (target - pts) / (rem / 100) : null };
}
function verdict(st) {
  if (!st.graded.length) return `<div class="verdict info">Añade tus evaluaciones y notas para ver cómo vas.</div>`;
  if (st.rem === 0) return st.pts >= st.target
    ? `<div class="verdict good">🎉 Asignatura completada: nota final <b>${st.pts.toFixed(2)}</b>. ¡Aprobada!</div>`
    : `<div class="verdict bad">Asignatura completada con nota final <b>${st.pts.toFixed(2)}</b>.</div>`;
  if (st.need <= 0) return `<div class="verdict good">✅ Ya tienes asegurado el ${st.target}, pase lo que pase en el resto.</div>`;
  if (st.need > 10) return `<div class="verdict bad">⚠️ Con el ${st.rem}% restante ya no se llega al ${st.target}, ni sacando un 10.</div>`;
  return `<div class="verdict info">Para llegar al ${st.target} necesitas una media de <b>${st.need.toFixed(2)}</b> en el ${st.rem}% que queda.</div>`;
}

// Nivel de la asignatura según su media (color, etiqueta y estrella)
function gradeLevel(s) {
  const st = stats(s);
  if (s.mh) return { star: true, color: '#f5b301', fg: '#3a2a00', label: 'Matrícula de honor', avg: st.avg ?? 10, pct: 100 };
  if (st.avg == null) return null;
  const a = st.avg, pct = Math.max(0, Math.min(100, a * 10));
  if (a >= 10) return { star: true, color: '#f5b301', fg: '#3a2a00', label: '¡Un 10!', avg: a, pct };
  if (a > 8) return { color: '#2563eb', fg: '#ffffff', label: 'Sobresaliente', avg: a, pct };
  if (a > 6) return { color: '#16a34a', fg: '#ffffff', label: 'Bien', avg: a, pct };
  if (a >= 5) return { color: '#facc15', fg: '#3a2a00', label: 'Aprobado', avg: a, pct };
  if (a >= 3) return { color: '#dc2626', fg: '#ffffff', label: 'Suspenso', avg: a, pct };
  return { color: '#000000', fg: '#ffffff', label: 'Suspenso (muy bajo)', avg: a, pct };
}
function gradeBadge(s) {
  const lv = gradeLevel(s);
  if (!lv) return '<span class="muted">sin notas</span>';
  return `<span class="gbadge" style="background:${lv.color};color:${lv.fg}" title="${esc(lv.label)}">${lv.star ? '★ ' : ''}${Math.round(lv.pct)}%</span>`;
}
function gradeSummary(s) {
  const lv = gradeLevel(s), st = stats(s);
  if (!lv) return `<div class="gsum"><span class="muted">Aún no hay notas en esta asignatura.</span></div>`;
  return `<div class="gsum" style="--g:${lv.color}">
    <div class="gbig">${lv.star ? '<span class="star">★</span>' : ''}${Math.round(lv.pct)}%</div>
    <div class="gtxt"><b>${esc(lv.label)}</b>
      <span class="muted">Media ${lv.avg.toFixed(2)} / 10 · evaluado el ${st.W}% de la asignatura</span>
      <div class="progress"><span style="width:${lv.pct}%;background:${lv.color}"></span></div></div></div>`;
}

// ---------- Vista ASIGNATURAS ----------
function renderSubjects() {
  const list = S.subjects.map(s => {
    return `<div class="sj-card ${ui.subj === s.id ? 'active' : ''}" style="--c:${s.color}" data-act="openSubject" data-id="${s.id}">
      <div class="name">${esc(s.name)}</div><div>${gradeBadge(s)}</div></div>`;
  }).join('') || '<p class="muted">Crea tu primera asignatura para subir apuntes y controlar tus notas.</p>';
  const s = getSubj(ui.subj);
  let detail = '<div class="card muted">Selecciona una asignatura.</div>';
  if (s) {
    detail = `<div class="card">
      <div class="toolbar"><h2 style="color:${s.color}">${esc(s.name)}</h2><button data-act="editSubject" data-id="${s.id}">✏️ Editar</button></div>
      ${gradeSummary(s)}
      <div class="tabs"><button class="${ui.tab === 'notes' ? 'active' : ''}" data-act="tab" data-tab="notes">📄 Apuntes y resúmenes</button>
      <button class="${ui.tab === 'grades' ? 'active' : ''}" data-act="tab" data-tab="grades">📊 Mis notas</button></div>
      ${ui.tab === 'notes' ? notesTab(s) : gradesTab(s)}</div>`;
  }
  return `<div class="toolbar"><h2>Asignaturas</h2><button class="primary" data-act="newSubject">+ Nueva asignatura</button></div>
    <div class="subjects"><div>${list}</div><div>${detail}</div></div>`;
}
function notesTab(s) {
  const notes = (s.notes || []).slice().sort((a, b) => b.created - a.created);
  return `<button class="primary" data-act="newNote">+ Añadir apunte / resumen</button><div style="margin-top:14px">
    ${notes.map(n => `<div class="note"><div class="head"><b>${esc(n.title)}</b>
        <span class="muted">${new Date(n.created).toLocaleDateString('es-ES')}</span>
        <button class="small" data-act="editNote" data-id="${n.id}">Editar</button></div>
      ${n.text ? `<pre>${esc(n.text)}</pre>` : ''}
      <div class="files">${(n.files || []).map(f => `<span class="file" data-act="openFile" data-id="${f.id}">📎 ${esc(f.name)}</span>`).join('')}</div></div>`).join('')
    || '<p class="muted">Todavía no hay apuntes en esta asignatura.</p>'}</div>`;
}
function gradesTab(s) {
  const st = stats(s), gs = (s.grades || []).slice().sort((a, b) => (a.date || '9999').localeCompare(b.date || '9999'));
  const bars = gs.filter(g => g.grade !== '' && g.grade != null).map(g =>
    `<div class="col ${Number(g.grade) < st.target ? 'fail' : ''}" title="${esc(g.name)}"><span>${Number(g.grade)}</span><div style="height:${Number(g.grade) * 10}%"></div><span>${esc(g.name.slice(0, 8))}</span></div>`).join('');
  return `
    <div class="stats">
      <div class="stat">Media actual<b>${st.avg == null ? '—' : st.avg.toFixed(2)}</b></div>
      <div class="stat">Puntos conseguidos<b>${st.pts.toFixed(2)}</b></div>
      <div class="stat">Evaluado<b>${st.W}%</b><div class="progress"><span style="width:${Math.min(100, st.W)}%"></span></div></div>
      <div class="stat">Pendiente<b>${st.rem}%</b></div>
    </div>
    ${verdict(st)}
    ${st.total !== 100 && gs.length ? `<p class="hint">⚠️ Los pesos suman ${st.total}%. Para cálculos exactos deberían sumar 100%.</p>` : ''}
    <button class="primary" data-act="newGrade">+ Añadir evaluación</button>
    <table style="margin-top:12px"><tr><th>Evaluación</th><th>Fecha</th><th>Peso</th><th>Nota</th><th></th></tr>
      ${gs.map(g => `<tr><td>${esc(g.name)}</td><td>${g.date ? parse(g.date).toLocaleDateString('es-ES') : '—'}</td><td>${g.weight}%</td>
        <td>${g.grade === '' || g.grade == null ? '<span class="muted">pendiente</span>' : '<b>' + g.grade + '</b>'}</td>
        <td><button class="small" data-act="editGrade" data-id="${g.id}">Editar</button></td></tr>`).join('')}</table>
    ${bars ? `<div class="chart"><div class="pass" style="bottom:${st.target * 10}%"></div>${bars}</div>
      <p class="hint">La línea verde discontinua marca la nota de aprobado (${st.target}).</p>` : ''}`;
}

// ---------- Diálogos ----------
const dlg = id => document.getElementById(id);
document.querySelectorAll('[data-close]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));

// -- Actividad
$('#ev-cat').innerHTML = Object.entries(CATS).map(([k, v]) => `<option value="${k}">${v.n}</option>`).join('');
function refreshSubjOptions(sel) {
  $('#ev-subj').innerHTML = `<option value="">— Ninguna —</option>` + S.subjects.map(s => `<option value="${s.id}" ${s.id === sel ? 'selected' : ''}>${esc(s.name)}</option>`).join('');
}
function updateEndHint() {
  const st = $('#ev-start').value, d = Number($('#ev-dur').value);
  $('#ev-end').textContent = st && d ? `Termina a las ${minStr(toMin(st) + d)}` : '';
}
['ev-start', 'ev-dur'].forEach(id => $('#' + id).addEventListener('input', updateEndHint));
function toggleUntil() {
  $('#ev-until-wrap').style.display = ['weekly', 'yearly'].includes($('#ev-repeat').value) ? '' : 'none';
}
$('#ev-repeat').addEventListener('change', toggleUntil);

// Series: elegir si el cambio es para toda la serie o solo para el día pulsado
const applyOne = () => $('#ev-apply-wrap').style.display !== 'none' && document.querySelector('input[name=apply]:checked')?.value === 'one';
function applyChanged() {
  const e = S.events.find(x => x.id === $('#ev-id').value);
  if (!isRepeating(e)) return;
  if (applyOne()) {
    $('#ev-date').value = $('#ev-occ').value;
    $('#ev-repeat').value = 'none';
    $('#ev-repeat').disabled = true;
  } else {
    $('#ev-date').value = e.date;
    $('#ev-repeat').value = e.repeat;
    $('#ev-repeat').disabled = false;
    $('#ev-until').value = e.until || '';
  }
  toggleUntil();
}
document.querySelectorAll('input[name=apply]').forEach(r => r.addEventListener('change', applyChanged));

function openEvent(id, date, startMin, dur) {
  const e = id ? S.events.find(x => x.id === id) : null;
  $('#evHeading').textContent = e ? 'Editar actividad' : 'Nueva actividad';
  $('#ev-id').value = e?.id || '';
  $('#ev-title').value = e?.title || '';
  $('#ev-date').value = e?.date || date || fmt(new Date());
  $('#ev-start').value = e?.start || (startMin != null ? minStr(startMin) : '17:00');
  $('#ev-dur').value = e?.duration || dur || 60;
  $('#ev-cat').value = e?.cat || 'estudio';
  refreshSubjOptions(e?.subjectId);
  $('#ev-repeat').value = e?.repeat || 'none';
  $('#ev-until').value = e?.until || '';
  // Desde la Semana, una actividad nueva es solo de la semana; desde el resto, sale en Mes y Semana
  $('#ev-scope').value = e ? (e.scope || 'all') : (ui.view === 'week' ? 'week' : 'all');
  // Si es una serie, ofrecemos cambiar solo el día pulsado o toda la serie
  const isSeries = isRepeating(e);
  $('#ev-occ').value = isSeries ? (date && date >= e.date ? date : e.date) : '';
  $('#ev-occ-label').textContent = isSeries ? parse($('#ev-occ').value).toLocaleDateString('es-ES') : '';
  $('#ev-apply-wrap').style.display = isSeries ? '' : 'none';
  document.querySelector('input[name=apply][value=all]').checked = true;
  $('#ev-repeat').disabled = false;
  toggleUntil();
  $('#ev-notes').value = e?.notes || '';
  $('#ev-color-on').checked = !!e?.color;
  $('#ev-color').value = e?.color || '#8b5cf6';
  $('#ev-color-all').checked = false;
  $('#ev-color-opts').style.display = e?.color ? '' : 'none';
  const rem = e ? (e.remind || []) : ['60', 'morning'];
  document.querySelectorAll('input[name=rem]').forEach(c => c.checked = rem.includes(c.value));
  $('#ev-del').style.display = e ? '' : 'none';
  updateEndHint();
  dlg('eventDlg').showModal();
}
$('#ev-color-on').addEventListener('change', () => {
  $('#ev-color-opts').style.display = $('#ev-color-on').checked ? '' : 'none';
});
$('#eventForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const one = applyOne(); // true = cambio solo para el día pulsado de una serie
  const repeat = one ? 'none' : $('#ev-repeat').value;
  const until = (repeat === 'weekly' || repeat === 'yearly') ? $('#ev-until').value : '';
  if (until && until < $('#ev-date').value) {
    alert('La fecha final debe ser igual o posterior a la fecha de inicio.');
    return;
  }
  const baseId = $('#ev-id').value;
  const id = one ? uid() : (baseId || uid());
  const data = {
    id, title: $('#ev-title').value.trim(), date: $('#ev-date').value, start: $('#ev-start').value,
    duration: Math.max(5, Number($('#ev-dur').value) || 60), cat: $('#ev-cat').value, subjectId: $('#ev-subj').value,
    repeat, until, scope: $('#ev-scope').value, notes: $('#ev-notes').value,
    color: $('#ev-color-on').checked ? $('#ev-color').value : '',
    remind: [...document.querySelectorAll('input[name=rem]:checked')].map(c => c.value)
  };
  if (one) {
    // la serie original se salta ese día y se crea una actividad suelta con los cambios
    const series = S.events.find(x => x.id === baseId);
    if (series) {
      series.skip = series.skip || [];
      if (!series.skip.includes($('#ev-occ').value)) series.skip.push($('#ev-occ').value);
    }
    S.events.push(data);
  } else {
    const i = S.events.findIndex(x => x.id === id);
    if (i >= 0) { if (S.events[i].skip) data.skip = S.events[i].skip; S.events[i] = data; } else S.events.push(data);
  }
  // "Aplicar a todas las del mismo tipo": pinta con ese color todas las actividades de ese tipo (p. ej. todo el Estudio)
  if ($('#ev-color-on').checked && $('#ev-color-all').checked) {
    S.events.forEach(x => { if (x.cat === data.cat) x.color = data.color; });
  }
  // permitir que los avisos de una actividad editada vuelvan a saltar
  const f = fired(); Object.keys(f).forEach(k => { if (k.startsWith(id + '|')) delete f[k]; }); saveFired(f);
  save(); dlg('eventDlg').close(); render(); checkReminders();
});
$('#ev-del').addEventListener('click', () => {
  const e = S.events.find(x => x.id === $('#ev-id').value);
  if (e && applyOne()) {
    const occ = $('#ev-occ').value;
    if (!confirm(`¿Quitar solo el ${parse(occ).toLocaleDateString('es-ES')} de esta serie? Las demás semanas se mantienen.`)) return;
    e.skip = e.skip || [];
    if (!e.skip.includes(occ)) e.skip.push(occ);
  } else {
    if (!confirm('¿Eliminar esta actividad' + (isRepeating(e) ? ' (y todas sus repeticiones)' : '') + '?')) return;
    S.events = S.events.filter(x => x.id !== $('#ev-id').value);
  }
  save(); dlg('eventDlg').close(); render();
});

// -- Asignatura
function openSubject(id) {
  const s = id ? getSubj(id) : null;
  $('#sjHeading').textContent = s ? 'Editar asignatura' : 'Nueva asignatura';
  $('#sj-id').value = s?.id || '';
  $('#sj-name').value = s?.name || '';
  $('#sj-color').value = s?.color || '#4f7cff';
  $('#sj-target').value = s?.target ?? 5;
  $('#sj-mh').checked = !!s?.mh;
  $('#sj-del').style.display = s ? '' : 'none';
  dlg('subjDlg').showModal();
}
$('#subjForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const id = $('#sj-id').value;
  if (id) {
    const s = getSubj(id);
    Object.assign(s, { name: $('#sj-name').value.trim(), color: $('#sj-color').value, target: Number($('#sj-target').value), mh: $('#sj-mh').checked });
  } else {
    const s = { id: uid(), name: $('#sj-name').value.trim(), color: $('#sj-color').value, target: Number($('#sj-target').value), mh: $('#sj-mh').checked, notes: [], grades: [] };
    S.subjects.push(s); ui.subj = s.id;
  }
  save(); dlg('subjDlg').close(); render();
});
$('#sj-del').addEventListener('click', async () => {
  const s = getSubj($('#sj-id').value);
  if (!s || !confirm(`¿Eliminar "${s.name}" con todos sus apuntes y notas?`)) return;
  for (const n of s.notes || []) for (const f of n.files || []) await fDel(f.id);
  S.subjects = S.subjects.filter(x => x.id !== s.id);
  S.events.forEach(e => { if (e.subjectId === s.id) e.subjectId = ''; });
  ui.subj = null; save(); dlg('subjDlg').close(); render();
});

// -- Apuntes
let removeFiles = new Set();
function openNote(id) {
  const s = getSubj(ui.subj); if (!s) return;
  const n = id ? s.notes.find(x => x.id === id) : null;
  removeFiles = new Set();
  $('#ntHeading').textContent = n ? 'Editar apunte' : 'Nuevo apunte';
  $('#nt-id').value = n?.id || '';
  $('#nt-title').value = n?.title || '';
  $('#nt-text').value = n?.text || '';
  $('#nt-files').value = '';
  $('#nt-existing').innerHTML = (n?.files || []).map(f => `<label class="chk" style="display:flex;gap:8px;align-items:center;color:var(--text)"><input type="checkbox" style="width:auto;margin:0" data-rm="${f.id}"> Quitar 📎 ${esc(f.name)}</label>`).join('');
  $('#nt-del').style.display = n ? '' : 'none';
  dlg('noteDlg').showModal();
}
$('#nt-existing').addEventListener('change', e => { const id = e.target.dataset.rm; if (id) e.target.checked ? removeFiles.add(id) : removeFiles.delete(id); });
$('#noteForm').addEventListener('submit', async ev => {
  ev.preventDefault();
  const s = getSubj(ui.subj); s.notes = s.notes || [];
  let n = s.notes.find(x => x.id === $('#nt-id').value);
  if (!n) { n = { id: uid(), created: Date.now(), files: [] }; s.notes.push(n); }
  n.title = $('#nt-title').value.trim(); n.text = $('#nt-text').value;
  for (const id of removeFiles) await fDel(id);
  n.files = n.files.filter(f => !removeFiles.has(f.id));
  for (const file of $('#nt-files').files) {
    const id = uid();
    await fPut({ id, name: file.name, type: file.type, blob: file });
    n.files.push({ id, name: file.name });
  }
  save(); dlg('noteDlg').close(); render();
});
$('#nt-del').addEventListener('click', async () => {
  if (!confirm('¿Eliminar este apunte y sus archivos?')) return;
  const s = getSubj(ui.subj), n = s.notes.find(x => x.id === $('#nt-id').value);
  for (const f of n.files || []) await fDel(f.id);
  s.notes = s.notes.filter(x => x !== n);
  save(); dlg('noteDlg').close(); render();
});
async function openFile(id) {
  const r = await fGet(id);
  if (!r) return alert('No se encuentra el archivo.');
  const url = URL.createObjectURL(r.blob);
  const w = window.open(url, '_blank');
  if (!w) { const a = document.createElement('a'); a.href = url; a.download = r.name; a.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// -- Notas (evaluaciones)
function openGrade(id) {
  const s = getSubj(ui.subj); if (!s) return;
  const g = id ? s.grades.find(x => x.id === id) : null;
  $('#grHeading').textContent = g ? 'Editar evaluación' : 'Nueva evaluación';
  $('#gr-id').value = g?.id || '';
  $('#gr-name').value = g?.name || '';
  $('#gr-grade').value = g?.grade ?? '';
  $('#gr-weight').value = g?.weight ?? 20;
  $('#gr-date').value = g?.date || '';
  $('#gr-del').style.display = g ? '' : 'none';
  dlg('gradeDlg').showModal();
}
$('#gradeForm').addEventListener('submit', ev => {
  ev.preventDefault();
  const s = getSubj(ui.subj); s.grades = s.grades || [];
  const gv = $('#gr-grade').value;
  const data = { id: $('#gr-id').value || uid(), name: $('#gr-name').value.trim(), grade: gv === '' ? '' : Number(gv), weight: Number($('#gr-weight').value), date: $('#gr-date').value };
  const i = s.grades.findIndex(x => x.id === data.id);
  if (i >= 0) s.grades[i] = data; else s.grades.push(data);
  save(); dlg('gradeDlg').close(); render();
});
$('#gr-del').addEventListener('click', () => {
  const s = getSubj(ui.subj);
  s.grades = s.grades.filter(x => x.id !== $('#gr-id').value);
  save(); dlg('gradeDlg').close(); render();
});

// ---------- Acciones (delegación de eventos) ----------
const actions = {
  view: d => { ui.view = d.view; render(); },
  prev: () => { if (ui.view === 'month') ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() - 1, 1); else ui.week = addDays(ui.week, -7); render(); },
  next: () => { if (ui.view === 'month') ui.month = new Date(ui.month.getFullYear(), ui.month.getMonth() + 1, 1); else ui.week = addDays(ui.week, 7); render(); },
  goToday: () => { const n = new Date(); ui.month = new Date(n.getFullYear(), n.getMonth(), 1); ui.week = mondayOf(n); render(); },
  newEvent: d => openEvent(null, d.date),
  editEvent: d => openEvent(d.id, d.date),
  newSubject: () => openSubject(null),
  editSubject: d => openSubject(d.id),
  openSubject: d => { ui.subj = d.id; render(); },
  goSubject: d => { ui.subj = d.id; ui.view = 'subjects'; render(); },
  tab: d => { ui.tab = d.tab; render(); },
  newNote: () => openNote(null),
  editNote: d => openNote(d.id),
  openFile: d => openFile(d.id),
  newGrade: () => openGrade(null),
  editGrade: d => openGrade(d.id),
  closeToast: (d, e, el) => el.closest('.toast').remove(),
  perm: async () => {
    if (!('Notification' in window)) return alert('Tu navegador no admite notificaciones.');
    const r = await Notification.requestPermission();
    updatePermBtn();
    if (r === 'granted') notify('🔔 Avisos activados', 'Te avisaré antes de tus actividades mientras tengas esta pestaña abierta.');
  }
};
document.addEventListener('click', e => {
  const t = e.target.closest('[data-act]');
  if (!t) return;
  actions[t.dataset.act]?.(t.dataset, e, t);
});
document.addEventListener('change', e => {
  const k = e.target.dataset?.set;
  if (!k) return;
  S.settings[k] = Number(e.target.value);
  if (S.settings.dayEnd <= S.settings.dayStart) S.settings.dayEnd = Math.min(24, S.settings.dayStart + 1);
  save(); render();
});
document.addEventListener('change', e => {
  if (!e.target.dataset?.mon) return;
  const m = document.querySelector('[data-mon=m]').value, y = document.querySelector('[data-mon=y]').value;
  ui.month = new Date(Number(y), Number(m), 1);
  render();
});

// ---------- Selección arrastrando en la vista Semana ----------
// Pulsa en una hora, arrastra hasta otra y suelta: se crea UNA actividad con todo ese tramo.
let drag = null;
function slotFromEvent(col, e) {
  const rect = col.getBoundingClientRect();
  const y = Math.max(0, Math.min((e.clientY - rect.top) * (col.offsetHeight / rect.height), col.offsetHeight - 1)); // compensa el zoom
  return S.settings.dayStart * 60 + Math.floor(y / HH * 60 / 30) * 30; // franjas de 30 min
}
function paintDrag() {
  let el = drag.col.querySelector('.sel');
  if (!el) { el = document.createElement('div'); el.className = 'sel'; drag.col.appendChild(el); }
  const s = Math.min(drag.a, drag.b), en = Math.max(drag.a, drag.b) + 30;
  el.style.top = (s - S.settings.dayStart * 60) / 60 * HH + 'px';
  el.style.height = (en - s) / 60 * HH + 'px';
  el.textContent = `${minStr(s)} – ${minStr(en)}`;
}
document.addEventListener('mousedown', e => {
  if (e.button !== 0) return;
  const col = e.target.closest('[data-slot]');
  if (!col || e.target.closest('.ev')) return;
  const a = slotFromEvent(col, e);
  drag = { col, date: col.dataset.slot, a, b: a };
  paintDrag();
  e.preventDefault(); // evita seleccionar texto mientras se arrastra
});
document.addEventListener('mousemove', e => {
  if (!drag) return;
  drag.b = slotFromEvent(drag.col, e);
  paintDrag();
});
document.addEventListener('mouseup', () => {
  if (!drag) return;
  const d = drag; drag = null;
  d.col.querySelector('.sel')?.remove();
  const start = Math.min(d.a, d.b), end = Math.max(d.a, d.b) + 30;
  openEvent(null, d.date, start, d.a === d.b ? 60 : end - start); // clic simple = 60 min
});

// ---------- Arranque ----------
function tick() {
  checkReminders();
  updateUpNext();
  const m = new Date().getMinutes();
  if (m !== lastMinute) {
    lastMinute = m;
    if (!drag && !document.querySelector('dialog[open]') && (ui.view === 'week' || ui.view === 'today')) render();
  }
}
render();
tick();
setInterval(tick, 20000);
