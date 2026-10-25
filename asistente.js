'use strict';

/* =========================================================
   Asistente con IA local (Ollama)
   Barra de chat fija abajo, estilo ChatGPT / Gemini.
   Se carga DESPUÉS de app.js y usa sus funciones (S, save, render...).
   Todo corre en tu ordenador: no hace falta clave ni internet.
   ========================================================= */
(function () {
  const KEY = 'planner.ai';
  const cfg = { url: 'http://localhost:11434', model: '' };
  try { Object.assign(cfg, JSON.parse(localStorage.getItem(KEY)) || {}); } catch { }
  const saveCfg = () => { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch { } };

  const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
  const REMIND = ['daybefore', 'morning', '180', '60', '30', '15', 'start'];
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && fmt(parse(s)) === s;
  const normTime = t => {
    const m = String(t ?? '').match(/^(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const h = +m[1], mi = +m[2];
    return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` : null;
  };
  const cleanRemind = r => Array.isArray(r) ? [...new Set(r.map(String).filter(x => REMIND.includes(x)))] : ['60'];

  function findSubject(ref) {
    const r = norm(ref);
    if (!r) return null;
    return S.subjects.find(s => s.id === ref)
      || S.subjects.find(s => norm(s.name) === r)
      || S.subjects.find(s => norm(s.name).includes(r) || r.includes(norm(s.name)));
  }
  function findEvent(a) {
    return S.events.find(e => e.id === a.id)
      || (a.title ? S.events.find(e => norm(e.title) === norm(a.title)) : null);
  }
  function findGrade(sub, a) {
    const g = sub.grades || [];
    return g.find(x => x.id === a.id) || g.find(x => norm(x.name) === norm(a.name));
  }
  function needSubject(a) {
    const sub = findSubject(a.subject);
    if (!sub) throw new Error(`no encuentro la asignatura "${a.subject || ''}"`);
    return sub;
  }
  const numOrBlank = v => (v === null || v === '' || v === undefined || isNaN(Number(v))) ? '' : Math.max(0, Math.min(10, Number(v)));

  // Metas, objetivos y tareas
  const goalsArr = () => (S.goals = Array.isArray(S.goals) ? S.goals : []);
  const tasksArr = () => (S.tasks = Array.isArray(S.tasks) ? S.tasks : []);
  const like = (a, b) => { const x = norm(a), y = norm(b); return !!x && !!y && (x === y || x.includes(y) || y.includes(x)); };
  function findGoal(a) {
    const ref = a.goal || a.title;
    return goalsArr().find(g => g.id === a.id)
      || goalsArr().find(g => norm(g.title) === norm(ref))
      || goalsArr().find(g => like(g.title, ref));
  }
  function needGoal(a) {
    const g = findGoal(a);
    if (!g) throw new Error(`no encuentro la meta "${a.goal || a.title || ''}"`);
    return g;
  }
  function findTask(a) {
    return tasksArr().find(t => t.id === a.id)
      || tasksArr().find(t => norm(t.text) === norm(a.text))
      || tasksArr().find(t => like(t.text, a.text));
  }
  const cleanObjective = o => {
    const text = String(typeof o === 'string' ? o : (o && o.text) || '').trim().slice(0, 120);
    return text ? { id: uid(), text, due: o && isDate(o.due) ? o.due : '', done: false } : null;
  };

  // ---------- Ejecutar acciones ----------
  async function apply(a) {
    switch (a.type) {
      case 'add_event': {
        const title = String(a.title || '').trim().slice(0, 80);
        const start = normTime(a.start);
        if (!title || !isDate(a.date) || !start) throw new Error('faltan título, fecha u hora válidos');
        const sub = a.subject ? findSubject(a.subject) : null;
        const until = isDate(a.until) && a.until >= a.date ? a.until : '';
        const wds = Array.isArray(a.weekdays) ? [...new Set(a.weekdays.map(Number).filter(n => n >= 1 && n <= 7))] : [];
        const repeat = wds.length || a.repeat === 'weekly' ? 'weekly' : 'none';
        const dates = wds.length
          ? wds.map(w => { let d = parse(a.date); while (d.getDay() !== w % 7) d = addDays(d, 1); return fmt(d); })
          : [a.date];
        dates.forEach(ds => S.events.push({
          id: uid(), title, date: ds, start, duration: Math.max(5, Math.round(Number(a.duration) || 60)),
          cat: CATS[a.cat] ? a.cat : 'otro', subjectId: sub ? sub.id : '', repeat, until: repeat === 'weekly' ? until : '',
          notes: String(a.notes || ''), remind: cleanRemind(a.remind),
          scope: a.scope === 'week' || (a.scope !== 'all' && ui.view === 'week') ? 'week' : 'all'
        }));
        return `✅ Creada: ${title} · ${dates.map(d => DIAS[parse(d).getDay()] + ' ' + d).join(', ')} a las ${start}${repeat === 'weekly' ? ' (cada semana' + (until ? ' hasta ' + until : '') + ')' : ''}`;
      }
      case 'update_event': {
        const e = findEvent(a);
        if (!e) throw new Error('no encuentro esa actividad');
        if (a.new_title) e.title = String(a.new_title).trim().slice(0, 80);
        if (a.date !== undefined && isDate(a.date)) e.date = a.date;
        if (a.start !== undefined && normTime(a.start)) e.start = normTime(a.start);
        if (a.duration !== undefined && Number(a.duration) > 0) e.duration = Math.max(5, Math.round(Number(a.duration)));
        if (a.cat !== undefined && CATS[a.cat]) e.cat = a.cat;
        if (a.subject !== undefined) { const s = findSubject(a.subject); e.subjectId = s ? s.id : ''; }
        if (a.repeat === 'weekly' || a.repeat === 'none') e.repeat = a.repeat;
        if (a.until !== undefined) e.until = isDate(a.until) ? a.until : '';
        if (e.repeat !== 'weekly') e.until = '';
        if (a.notes !== undefined) e.notes = String(a.notes);
        if (a.scope === 'week' || a.scope === 'all') e.scope = a.scope;
        if (a.remind !== undefined) e.remind = cleanRemind(a.remind);
        const f = fired(); Object.keys(f).forEach(k => { if (k.startsWith(e.id + '|')) delete f[k]; }); saveFired(f);
        return `✏️ Modificada: ${e.title}`;
      }
      case 'delete_event': {
        const e = findEvent(a);
        if (!e) throw new Error('no encuentro esa actividad');
        if (!confirm(`¿Eliminar la actividad "${e.title}" (${e.date} ${e.start})${e.repeat === 'weekly' ? ' y todas sus repeticiones' : ''}?`)) return '⏹️ Cancelado: no se eliminó la actividad';
        S.events = S.events.filter(x => x !== e);
        return `🗑️ Eliminada: ${e.title}`;
      }
      case 'add_subject': {
        const name = String(a.name || '').trim().slice(0, 60);
        if (!name) throw new Error('falta el nombre de la asignatura');
        if (findSubject(name) && norm(findSubject(name).name) === norm(name)) throw new Error(`ya existe "${name}"`);
        const palette = ['#4f7cff', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4', '#ec4899'];
        const color = /^#[0-9a-fA-F]{6}$/.test(a.color || '') ? a.color : palette[S.subjects.length % palette.length];
        const target = Number(a.target);
        S.subjects.push({ id: uid(), name, color, target: target >= 0 && target <= 10 && a.target !== undefined ? target : 5, mh: false, notes: [], grades: [] });
        return `✅ Asignatura creada: ${name}`;
      }
      case 'delete_subject': {
        const s = needSubject(a);
        if (!confirm(`¿Eliminar la asignatura "${s.name}" con todos sus apuntes y notas?`)) return '⏹️ Cancelado: no se eliminó la asignatura';
        for (const n of s.notes || []) for (const f of n.files || []) await fDel(f.id);
        S.subjects = S.subjects.filter(x => x !== s);
        S.events.forEach(e => { if (e.subjectId === s.id) e.subjectId = ''; });
        if (ui.subj === s.id) ui.subj = null;
        return `🗑️ Asignatura eliminada: ${s.name}`;
      }
      case 'add_grade': {
        const s = needSubject(a);
        const name = String(a.name || '').trim().slice(0, 60);
        if (!name) throw new Error('falta el nombre de la evaluación');
        s.grades = s.grades || [];
        s.grades.push({ id: uid(), name, grade: numOrBlank(a.grade), weight: Math.max(0, Math.min(100, Number(a.weight) || 0)), date: isDate(a.date) ? a.date : '' });
        return `✅ Evaluación añadida en ${s.name}: ${name}`;
      }
      case 'update_grade': {
        const s = needSubject(a), g = findGrade(s, a);
        if (!g) throw new Error('no encuentro esa evaluación');
        if (a.new_name) g.name = String(a.new_name).trim().slice(0, 60);
        if (a.grade !== undefined) g.grade = numOrBlank(a.grade);
        if (a.weight !== undefined && !isNaN(Number(a.weight))) g.weight = Math.max(0, Math.min(100, Number(a.weight)));
        if (a.date !== undefined) g.date = isDate(a.date) ? a.date : '';
        return `✏️ Evaluación actualizada en ${s.name}: ${g.name}`;
      }
      case 'delete_grade': {
        const s = needSubject(a), g = findGrade(s, a);
        if (!g) throw new Error('no encuentro esa evaluación');
        if (!confirm(`¿Eliminar la evaluación "${g.name}" de ${s.name}?`)) return '⏹️ Cancelado: no se eliminó la evaluación';
        s.grades = s.grades.filter(x => x !== g);
        return `🗑️ Evaluación eliminada: ${g.name}`;
      }
      case 'add_note': {
        const s = needSubject(a);
        const title = String(a.title || '').trim().slice(0, 100);
        if (!title) throw new Error('falta el título del apunte');
        s.notes = s.notes || [];
        s.notes.push({ id: uid(), title, text: String(a.text || ''), created: Date.now(), files: [] });
        return `📄 Apunte creado en ${s.name}: ${title}`;
      }
      case 'skip_event': {
        const e = findEvent(a);
        if (!e) throw new Error('no encuentro esa actividad');
        if (!isDate(a.date)) throw new Error('falta la fecha del día que hay que quitar');
        if (e.repeat !== 'weekly') throw new Error('esa actividad no se repite (para quitarla usa delete_event)');
        e.skip = e.skip || [];
        if (!e.skip.includes(a.date)) e.skip.push(a.date);
        return `⏭️ Quitada solo del ${DIAS[parse(a.date).getDay()]} ${a.date}: ${e.title} (el resto de semanas sigue)`;
      }
      case 'add_goal': {
        const title = String(a.title || '').trim().slice(0, 100);
        if (!title) throw new Error('falta el título de la meta');
        if (findGoal({ title }) && norm(findGoal({ title }).title) === norm(title)) throw new Error(`ya existe la meta "${title}"`);
        const sub = a.subject ? findSubject(a.subject) : null;
        const objectives = (Array.isArray(a.objectives) ? a.objectives : []).map(cleanObjective).filter(Boolean);
        goalsArr().push({ id: uid(), title, deadline: isDate(a.deadline) ? a.deadline : '', subjectId: sub ? sub.id : '', notes: String(a.notes || ''), created: Date.now(), objectives });
        return `🎯 Meta creada: ${title}${objectives.length ? ' (' + objectives.length + ' objetivos)' : ''}`;
      }
      case 'add_objective': {
        const g = needGoal(a);
        const o = cleanObjective({ text: a.text, due: a.due });
        if (!o) throw new Error('falta el texto del objetivo');
        g.objectives = g.objectives || [];
        g.objectives.push(o);
        return `✅ Objetivo añadido a "${g.title}": ${o.text}`;
      }
      case 'set_objective': {
        const g = needGoal(a);
        const o = (g.objectives || []).find(x => x.id === a.id) || (g.objectives || []).find(x => like(x.text, a.text));
        if (!o) throw new Error('no encuentro ese objetivo');
        o.done = a.done !== false;
        return `${o.done ? '☑️ Objetivo hecho' : '⬜ Objetivo pendiente'} en "${g.title}": ${o.text}`;
      }
      case 'delete_goal': {
        const g = needGoal(a);
        if (!confirm(`¿Eliminar la meta "${g.title}" y todos sus objetivos?`)) return '⏹️ Cancelado: no se eliminó la meta';
        S.goals = S.goals.filter(x => x !== g);
        return `🗑️ Meta eliminada: ${g.title}`;
      }
      case 'add_task': {
        const text = String(a.text || '').trim().slice(0, 140);
        if (!text) throw new Error('falta el texto de la tarea');
        const sub = a.subject ? findSubject(a.subject) : null;
        tasksArr().push({ id: uid(), text, subjectId: sub ? sub.id : '', due: isDate(a.due) ? a.due : '', done: false, created: Date.now() });
        return `✅ Tarea añadida: ${text}${sub ? ' (' + sub.name + ')' : ''}${isDate(a.due) ? ' · hasta ' + a.due : ''}`;
      }
      case 'set_task': {
        const t = findTask(a);
        if (!t) throw new Error('no encuentro esa tarea');
        t.done = a.done !== false;
        return `${t.done ? '☑️ Tarea hecha' : '⬜ Tarea pendiente'}: ${t.text}`;
      }
      case 'delete_task': {
        const t = findTask(a);
        if (!t) throw new Error('no encuentro esa tarea');
        if (!confirm(`¿Eliminar la tarea "${t.text}"?`)) return '⏹️ Cancelado: no se eliminó la tarea';
        S.tasks = S.tasks.filter(x => x !== t);
        return `🗑️ Tarea eliminada: ${t.text}`;
      }
      case 'add_study': {
        const mins = Math.round(a.minutes != null ? Number(a.minutes) : (Number(a.hours) || 0) * 60);
        if (!(mins >= 1 && mins <= 1440)) throw new Error('falta la duración (minutos u horas)');
        const sub = a.subject ? findSubject(a.subject) : null;
        if (a.subject && !sub) throw new Error(`no encuentro la asignatura "${a.subject}"`);
        const date = isDate(a.date) ? a.date : fmt(new Date());
        S.study = Array.isArray(S.study) ? S.study : [];
        S.study.push({ id: uid(), date, subjectId: sub ? sub.id : '', min: mins, ts: Date.now() });
        const txt = mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h${mins % 60 ? ' ' + (mins % 60) + ' min' : ''}`;
        return `⏱️ Registrado: ${txt} de estudio${sub ? ' de ' + sub.name : ''} (${date})`;
      }
      case 'plan_week': {
        if (!window.Plan) throw new Error('falta cargar planificador.js');
        return window.Plan.open(a);
      }
      default:
        throw new Error(`acción desconocida "${a.type}"`);
    }
  }

  // ---------- Instrucciones para la IA ----------
  function buildSystem() {
    const now = new Date();
    const dias = [...Array(14)].map((_, i) => { const d = addDays(now, i); return `${fmt(d)} (${DIAS[d.getDay()]})`; }).join(', ');
    const evs = S.events.filter(e => e.repeat === 'weekly' || e.date >= fmt(addDays(now, -7))).slice(0, 120).map(e => {
      const sub = getSubj(e.subjectId);
      return `[${e.id}] ${e.title} | ${e.date} ${e.start} ${e.duration}min | ${e.cat}${sub ? ' | ' + sub.name : ''}${e.repeat === 'weekly' ? ' | cada semana' + (e.until ? ' hasta ' + e.until : '') : ''}`;
    }).join('\n') || '(ninguna)';
    const subs = S.subjects.map(s => {
      const t = stats(s);
      const media = t.avg == null ? '' : ` | media ${t.avg.toFixed(2)} | evaluado ${t.W}%` +
        (t.rem > 0 ? ` | para el ${t.target} necesita ${t.need <= 0 ? 'nada más (ya asegurado)' : t.need > 10 ? 'más de 10 (imposible)' : t.need.toFixed(2) + ' de media'} en el ${t.rem}% restante` : '');
      return `${s.name}${media}` + ((s.grades || []).length ? ' | evaluaciones: ' + s.grades.map(g => `${g.name} = ${g.grade === '' || g.grade == null ? 'pendiente' : g.grade} (${g.weight}%)`).join(', ') : '');
    }).join('\n') || '(ninguna)';
    const hm = m => m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`;
    const study = Array.isArray(S.study) ? S.study : [], todayS = fmt(now), wkS = fmt(mondayOf(now));
    const sumS = f => study.filter(f).reduce((a, x) => a + x.min, 0);
    const perSubj = {};
    study.filter(x => x.date >= wkS).forEach(x => { const n = (getSubj(x.subjectId) || {}).name || 'Sin asignatura'; perSubj[n] = (perSubj[n] || 0) + x.min; });
    const studyTxt = `hoy: ${hm(sumS(x => x.date === todayS))} · esta semana (desde el lunes ${wkS}): ${hm(sumS(x => x.date >= wkS))}` +
      (Object.keys(perSubj).length ? ' · por asignatura esta semana: ' + Object.entries(perSubj).map(([n, m]) => `${n} ${hm(m)}`).join(', ') : '') +
      ` · total registrado: ${hm(sumS(() => true))}`;
    const exams = S.events.filter(e => e.cat === 'examen' && e.repeat !== 'weekly' && e.date >= todayS)
      .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 10).map(e => {
        const d = Math.round((parse(e.date) - parse(todayS)) / 86400000), sub = getSubj(e.subjectId);
        return `${e.title} | ${e.date} ${e.start} | ${d === 0 ? 'HOY' : d === 1 ? 'mañana' : 'en ' + d + ' días'}${sub ? ' | ' + sub.name : ''}`;
      }).join('\n') || '(ninguno)';
    const goals = goalsArr().map(g => `${g.title}${g.deadline ? ' | hasta ' + g.deadline : ''} | objetivos: ` +
      ((g.objectives || []).map(o => `[${o.done ? 'x' : ' '}] ${o.text}`).join('; ') || '(ninguno)')).join('\n') || '(ninguna)';
    const tasks = tasksArr().map(t => {
      const sub = getSubj(t.subjectId);
      return `[${t.done ? 'x' : ' '}] ${t.text}${sub ? ' | ' + sub.name : ''}${t.due ? ' | hasta ' + t.due : ''}`;
    }).join('\n') || '(ninguna)';
    const vistas = { today: 'Hoy', month: 'Mes', week: 'Semana', subjects: 'Asignaturas' };
    const semana = [...Array(7)].map((_, i) => { const d = addDays(ui.week, i); return `${DIAS[d.getDay()]} ${fmt(d)}`; }).join(', ');
    const pantalla = `El usuario está mirando la vista "${vistas[ui.view] || ui.view}"` +
      (ui.view === 'week' ? ` de esta semana: ${semana}. Si dice un día sin fecha ("el martes"), usa ese día de ESTA semana abierta.` :
        ui.view === 'month' ? ` (${ui.month.getMonth() + 1}/${ui.month.getFullYear()}). Si dice un día sin fecha, usa el próximo que venga a partir de hoy.` :
          '. Si dice un día sin fecha, usa el próximo que venga a partir de hoy.');
    return `Eres el asistente de un planificador de estudios. Hablas en español y respondes SIEMPRE con un único objeto JSON válido, sin nada de texto fuera del JSON:
{"reply":"mensaje corto para el usuario","actions":[ ... ]}

Hoy es ${DIAS[now.getDay()]} ${fmt(now)}, y son las ${pad(now.getHours())}:${pad(now.getMinutes())}.
Próximos días: ${dias}.
${pantalla}
Usa esas fechas para "hoy", "mañana", "el viernes", etc. Las fechas van como YYYY-MM-DD y las horas como HH:MM (24 h).

ACCIONES POSIBLES (campos opcionales entre corchetes):
{"type":"add_event","title":"","date":"YYYY-MM-DD","start":"HH:MM","duration":60,"cat":"estudio|clase|examen|personal|ocio|deporte|otro","subject":"nombre de asignatura","repeat":"none|weekly","until":"YYYY-MM-DD","weekdays":[1,3],"remind":["60"],"notes":""}
   - duration son minutos. weekdays (1=lunes ... 7=domingo) crea la actividad semanal en cada uno de esos días a partir de "date". until es el último día de la repetición.
   - remind admite: "daybefore" (tarde anterior), "morning" (8:00), "180", "60", "30", "15" (minutos antes) y "start".
   - scope (también válido en update_event): "week" = la actividad solo aparece en el calendario SEMANAL (para organizar el día); "all" = aparece en el calendario del MES y también en el semanal. Si el usuario dice "en el calendario semanal", "en la semana" u "organiza mi día", usa "week". Si dice "en el mes" o "en el calendario del mes", usa "all". Si no lo dice, omite el campo.
{"type":"update_event","id":"ID","new_title":"","date":"","start":"","duration":0,"cat":"","subject":"","repeat":"","until":"","notes":"","remind":[]}  (solo los campos que cambian)
{"type":"delete_event","id":"ID"}
{"type":"skip_event","id":"ID","date":"YYYY-MM-DD"}   (quita SOLO ese día de una actividad que se repite cada semana; el resto de semanas sigue. Úsalo para "hoy no hay clase", "cancela la clase del lunes 2 de noviembre", festivos...)
{"type":"add_subject","name":"","color":"#rrggbb","target":5}
{"type":"delete_subject","subject":"nombre"}
{"type":"add_grade","subject":"nombre","name":"Parcial 1","grade":7.5,"weight":20,"date":"YYYY-MM-DD"}   (grade null si aún está pendiente)
{"type":"update_grade","subject":"nombre","name":"evaluación existente","new_name":"","grade":0,"weight":0,"date":""}
{"type":"delete_grade","subject":"nombre","name":"evaluación existente"}
{"type":"add_note","subject":"nombre","title":"","text":""}
{"type":"add_goal","title":"","deadline":"YYYY-MM-DD","subject":"nombre de asignatura","objectives":["objetivo 1","objetivo 2"]}   (una meta es lo que quiere conseguir; sus objetivos son los pasos)
{"type":"add_objective","goal":"título de la meta","text":"","due":"YYYY-MM-DD"}
{"type":"set_objective","goal":"título de la meta","text":"texto del objetivo","done":true}   (done false para desmarcarlo)
{"type":"delete_goal","goal":"título de la meta"}
{"type":"add_task","text":"","subject":"nombre de asignatura","due":"YYYY-MM-DD"}   (tarea pendiente, opcionalmente de una asignatura)
{"type":"set_task","text":"texto de la tarea","done":true}   (done false para dejarla pendiente)
{"type":"delete_task","text":"texto de la tarea"}
{"type":"add_study","subject":"nombre de asignatura","minutes":120,"date":"YYYY-MM-DD"}   (registra tiempo ya estudiado: "he estudiado 2 horas de IA" = 120 minutos; si no dice el día, omite date = hoy)
{"type":"plan_week","week":"this|next","hours":8,"from":"16:00","to":"21:00","days":[1,2,3,4,5],"subjects":[{"subject":"nombre","hours":3}]}   (prepara una PROPUESTA de bloques de estudio en los huecos libres de la semana; el usuario la revisa y confirma. Omite los campos que el usuario no haya dicho)
- Un examen o una entrega es una actividad (add_event) con "cat":"examen"; aparece en la tarjeta "Exámenes y entregas" con cuenta atrás.

REGLAS:
- Para modificar o borrar actividades usa el ID exacto de la lista de actividades. Nunca inventes IDs.
- Si falta un dato imprescindible (por ejemplo la hora), pregúntalo en "reply" y deja "actions" vacío.
- Si el usuario solo conversa o pregunta, responde en "reply" con "actions": [].
- No hagas más de lo que se pide. Una petición puede generar varias acciones.
- Si no se indica duración, usa 60. Si no se indica tipo, elige el más lógico.
- Si el usuario pregunta por sus datos (horas de estudio, exámenes, entregas, notas, tareas, metas), responde en "reply" con los datos EXACTOS de las secciones de abajo y "actions": []. Si un dato no aparece, di que no lo tienes. No inventes cifras ni hagas cuentas aproximadas.
- "Planifícame la semana", "organiza mi estudio" o "reparte mis horas de estudio": usa plan_week (solo propone; el usuario confirma). "La semana que viene" = "next".
- Si el usuario no dice cuándo empieza una actividad repetida, usa como "date" la fecha de HOY (${fmt(now)}): con "weekdays" se creará en el primer día que toque a partir de hoy. No te saltes semanas ni empieces más tarde.
- Si algo se repite en días de la semana con nombre (todos los lunes, los jueves...), pon SIEMPRE "repeat":"weekly" y "weekdays" con esos días (1=lunes ... 2=martes ... 4=jueves ... 5=viernes ... 7=domingo), y en "date" la fecha de INICIO que dijo el usuario (por ejemplo ${now.getFullYear()}-09-01 si dijo "desde el 1 de septiembre"). NUNCA calcules tú cuál es el primer lunes o jueves: la web lo calcula a partir de "weekdays".

EJEMPLO: "todos los lunes y miércoles de 15 a 17 clase de Economía hasta el 12 de diciembre" →
{"reply":"Hecho: clase de Economía los lunes y miércoles de 15:00 a 17:00 hasta el 12/12.","actions":[{"type":"add_event","title":"Clase de Economía","date":"${fmt(now)}","start":"15:00","duration":120,"cat":"clase","subject":"Economía","repeat":"weekly","until":"${now.getFullYear()}-12-12","weekdays":[1,3],"remind":["30"]}]}

ACTIVIDADES ACTUALES:
${evs}

ASIGNATURAS ACTUALES:
${subs}

HORAS DE ESTUDIO REGISTRADAS:
${studyTxt}

EXÁMENES Y ENTREGAS PRÓXIMOS:
${exams}

METAS ACTUALES:
${goals}

TAREAS ACTUALES:
${tasks}`;
  }

  function parseReply(txt) {
    try { return JSON.parse(txt); } catch { }
    const i = txt.indexOf('{'), j = txt.lastIndexOf('}');
    if (i >= 0 && j > i) { try { return JSON.parse(txt.slice(i, j + 1)); } catch { } }
    return null;
  }

  // ---------- Interfaz: barra fija abajo + conversación desplegable ----------
  const style = document.createElement('style');
  style.textContent = `
    body { padding-bottom: 100px; }
    #ai-dock { position: fixed; left: 50%; bottom: 14px; transform: translateX(-50%); width: min(780px, 94vw); z-index: 90; display: flex; flex-direction: column; gap: 8px; }
    #ai-chat { display: none; flex-direction: column; max-height: min(60vh, 520px); background: var(--card); color: var(--text); border: 1px solid var(--line); border-radius: 18px; box-shadow: 0 10px 40px rgba(0,0,0,.28); overflow: hidden; }
    #ai-chat.open { display: flex; }
    .ai-head { display: flex; align-items: center; gap: 6px; padding: 8px 12px; border-bottom: 1px solid var(--line); font-size: .85rem; }
    .ai-head .ai-title { flex: 1; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .ai-head button { border: 0; background: transparent; padding: 4px 8px; font-size: .85rem; color: var(--muted); }
    .ai-head button:hover { color: var(--text); background: var(--bg); }
    .ai-cfg { display: none; padding: 10px 14px; border-bottom: 1px solid var(--line); background: var(--bg); font-size: .85rem; }
    .ai-cfg.open { display: block; }
    .ai-cfg .ai-row { display: flex; gap: 10px; flex-wrap: wrap; align-items: flex-end; }
    .ai-cfg label { flex: 1; min-width: 180px; color: var(--muted); }
    .ai-cfg input, .ai-cfg select { display: block; width: 100%; margin-top: 3px; padding: 6px; font: inherit; border: 1px solid var(--line); border-radius: 8px; background: var(--card); color: var(--text); }
    .ai-log { flex: 1; overflow-y: auto; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
    .ai-msg { padding: 9px 13px; border-radius: 16px; max-width: 88%; white-space: pre-wrap; word-wrap: break-word; font-size: .95rem; line-height: 1.4; }
    .ai-msg.user { align-self: flex-end; background: var(--primary); color: #fff; border-bottom-right-radius: 4px; }
    .ai-msg.bot { align-self: flex-start; background: var(--bg); border-bottom-left-radius: 4px; }
    .ai-msg.sys { align-self: stretch; max-width: 100%; background: transparent; border: 1px dashed var(--line); border-radius: 10px; font-size: .85rem; }
    .ai-msg.err { align-self: stretch; max-width: 100%; background: transparent; border: 1px solid var(--danger); border-radius: 10px; color: var(--danger); font-size: .85rem; }
    .ai-welcome { text-align: center; padding: 18px 8px 6px; }
    .ai-welcome h3 { margin: 0 0 6px; font-size: 1.3rem; }
    .ai-chips { display: flex; flex-wrap: wrap; gap: 8px; justify-content: center; margin-top: 14px; }
    .ai-chip { border-radius: 999px; padding: 6px 14px; font-size: .85rem; background: var(--bg); }
    #ai-form { display: flex; align-items: flex-end; gap: 8px; padding: 8px 8px 8px 18px; background: var(--card); border: 1px solid var(--line); border-radius: 26px; box-shadow: 0 6px 24px rgba(0,0,0,.22); }
    #ai-form:focus-within { border-color: var(--primary); }
    #ai-in { flex: 1; resize: none; border: 0; outline: 0; background: transparent; color: var(--text); font: inherit; font-size: 1rem; line-height: 1.4; padding: 8px 0; max-height: 120px; }
    #ai-send { width: 40px; height: 40px; padding: 0; border-radius: 50%; border: 0; background: var(--primary); color: #fff; font-size: 1.2rem; line-height: 1; flex: none; }
    #ai-send:disabled { opacity: .45; cursor: default; }
    .ai-hint { text-align: center; font-size: .72rem; color: var(--muted); margin-top: -2px; }
  `;
  document.head.appendChild(style);

  const dock = document.createElement('div');
  dock.id = 'ai-dock';
  dock.innerHTML = `
    <div id="ai-chat">
      <div class="ai-head">
        <span class="ai-title" id="ai-title">🤖 Asistente</span>
        <button id="ai-new" type="button" title="Nueva conversación">＋ Nueva</button>
        <button id="ai-cfgbtn" type="button" title="Ajustes">⚙️ Ajustes</button>
        <button id="ai-close" type="button" title="Ocultar (Esc)">▾ Ocultar</button>
      </div>
      <div class="ai-cfg" id="ai-cfg">
        <div class="ai-row">
          <label>Dirección de Ollama <input id="ai-url"></label>
          <label>Modelo <select id="ai-model"></select></label>
          <button class="small" id="ai-refresh" type="button">Buscar modelos</button>
        </div>
        <div id="ai-status" class="muted" style="margin-top:6px"></div>
      </div>
      <div class="ai-log" id="ai-log"></div>
    </div>
    <form id="ai-form" autocomplete="off">
      <textarea id="ai-in" rows="1" placeholder="¿Qué quieres añadir hoy?"></textarea>
      <button type="submit" id="ai-send" title="Enviar (Enter)">↑</button>
    </form>`;
  document.body.appendChild(dock);

  const el = id => document.getElementById(id);
  const log = el('ai-log'), chat = el('ai-chat'), input = el('ai-in');

  function setOpen(open) { chat.classList.toggle('open', open); if (open) log.scrollTop = log.scrollHeight; }
  function say(cls, text) {
    const d = document.createElement('div');
    d.className = 'ai-msg ' + cls;
    d.textContent = text;
    log.appendChild(d);
    log.scrollTop = log.scrollHeight;
    return d;
  }
  function showWelcome() {
    const w = document.createElement('div');
    w.className = 'ai-welcome';
    w.innerHTML = `<h3>¿Qué quieres añadir hoy?</h3>
      <div class="muted">Puedo crear, modificar y borrar actividades, asignaturas, notas, metas y tareas, registrar horas de estudio, planificar tu semana y responder sobre tus datos.</div>
      <div class="ai-chips"></div>`;
    const ejemplos = [
      'Mañana a las 18:30 cumpleaños de Laura',
      'Lunes y miércoles de 15:00 a 17:00 clase de Economía hasta el 12 de diciembre',
      'Planifícame la semana de estudio',
      'He estudiado 2 horas de IA',
      '¿Cuánto he estudiado esta semana?',
      '¿Qué me queda por entregar?',
      'Añade la tarea entregar la práctica 2 de IA antes del 10 de noviembre',
      'Pon un 7,5 en el Parcial 1 de Matemáticas, peso 20%'
    ];
    ejemplos.forEach(t => {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'ai-chip'; b.textContent = t;
      b.addEventListener('click', () => { input.value = t; autosize(); input.focus(); });
      w.querySelector('.ai-chips').appendChild(b);
    });
    log.appendChild(w);
  }
  function updateTitle() { el('ai-title').textContent = '🤖 Asistente' + (cfg.model ? ' · ' + cfg.model : ''); }
  function autosize() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }

  const base = () => cfg.url.replace(/\/+$/, '');
  async function loadModels() {
    const st = el('ai-status');
    st.textContent = 'Buscando modelos…';
    try {
      const r = await fetch(base() + '/api/tags');
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const names = ((await r.json()).models || []).map(m => m.name);
      if (!names.length) { st.textContent = 'Ollama no tiene modelos instalados (usa "ollama pull qwen2.5:7b").'; return; }
      el('ai-model').innerHTML = names.map(n => `<option>${esc(n)}</option>`).join('');
      if (!names.includes(cfg.model)) cfg.model = names[0];
      el('ai-model').value = cfg.model;
      saveCfg(); updateTitle();
      st.textContent = `${names.length} modelo(s) encontrado(s).`;
    } catch {
      st.textContent = 'No se pudo conectar con Ollama. ¿Está abierto?';
    }
  }
  // Llamada reutilizable a Ollama (la usan también las herramientas de estudio con IA)
  async function askOllama(messages, opts = {}) {
    if (!cfg.model) await loadModels();
    if (!cfg.model) throw new Error('Elige un modelo en ⚙️ Ajustes del asistente (Ollama debe estar abierto).');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), opts.timeout || 240000);
    try {
      const res = await fetch(base() + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify(Object.assign({ model: cfg.model, stream: false, options: { temperature: opts.temperature ?? 0.3 }, messages }, opts.json ? { format: 'json' } : {}))
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return ((await res.json()).message?.content || '').trim();
    } catch (err) {
      throw new Error(err.name === 'AbortError' ? 'Ollama tardó demasiado. Prueba con un modelo más pequeño.' : 'No he podido hablar con Ollama (¿está abierto?): ' + err.message);
    } finally { clearTimeout(timer); }
  }
  window.AIChat = { chat: askOllama, parse: parseReply };

  el('ai-url').value = cfg.url;
  el('ai-url').addEventListener('change', e => { cfg.url = e.target.value.trim() || 'http://localhost:11434'; saveCfg(); loadModels(); });
  el('ai-model').addEventListener('change', e => { cfg.model = e.target.value; saveCfg(); updateTitle(); });
  el('ai-refresh').addEventListener('click', loadModels);
  el('ai-cfgbtn').addEventListener('click', () => { el('ai-cfg').classList.toggle('open'); if (el('ai-cfg').classList.contains('open')) loadModels(); });
  el('ai-close').addEventListener('click', () => setOpen(false));
  el('ai-new').addEventListener('click', () => { history.length = 0; log.innerHTML = ''; showWelcome(); });

  // ---------- Conversación ----------
  const history = [];
  let busy = false;
  showWelcome();
  updateTitle();

  async function send(text) {
    log.querySelector('.ai-welcome')?.remove();
    setOpen(true);
    if (!cfg.model) {
      el('ai-cfg').classList.add('open');
      await loadModels();
      if (!cfg.model) { say('err', 'Elige un modelo en ⚙️ Ajustes (Ollama debe estar abierto).'); return; }
    }
    busy = true; el('ai-send').disabled = true;
    say('user', text);
    const wait = say('sys', '⏳ Pensando…');
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 180000);
    try {
      const res = await fetch(base() + '/api/chat', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: ctrl.signal,
        body: JSON.stringify({
          model: cfg.model, stream: false, format: 'json', options: { temperature: 0.1 },
          messages: [{ role: 'system', content: buildSystem() }, ...history.slice(-8), { role: 'user', content: text }]
        })
      });
      if (!res.ok) throw new Error('HTTP ' + res.status + ' ' + (await res.text()).slice(0, 200));
      const raw = ((await res.json()).message?.content || '').trim();
      wait.remove();
      history.push({ role: 'user', content: text }, { role: 'assistant', content: raw });
      const out = parseReply(raw);
      if (!out) { say('bot', raw || '(respuesta vacía)'); return; }
      if (out.reply) say('bot', String(out.reply));
      const actions = Array.isArray(out.actions) ? out.actions : [];
      let changed = false;
      for (const a of actions) {
        try {
          const msg = await apply(a || {});
          if (!msg.startsWith('⏹️')) changed = true;
          say('sys', msg);
        } catch (err) {
          say('err', `⚠️ No se pudo hacer "${a?.type || '?'}": ${err.message}`);
        }
      }
      if (changed) { save(); render(); checkReminders(); }
    } catch (err) {
      wait.remove();
      say('err', err.name === 'AbortError'
        ? 'Ollama tardó demasiado. Prueba con un modelo más pequeño.'
        : 'No he podido hablar con Ollama. Comprueba que está abierto y la dirección en ⚙️ Ajustes. Si el navegador bloquea la conexión, define la variable OLLAMA_ORIGINS=* y reinicia Ollama.\n(' + err.message + ')');
    } finally {
      clearTimeout(timer);
      busy = false; el('ai-send').disabled = false;
      input.focus();
    }
  }

  el('ai-form').addEventListener('submit', e => {
    e.preventDefault();
    const t = input.value.trim();
    if (!t || busy) return;
    input.value = ''; autosize();
    send(t);
  });
  input.addEventListener('input', autosize);
  input.addEventListener('focus', () => { if (log.children.length) setOpen(true); });
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); el('ai-form').requestSubmit(); }
    if (e.key === 'Escape') { setOpen(false); input.blur(); }
  });
  // Ctrl+K enfoca la barra desde cualquier sitio
  document.addEventListener('keydown', e => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); input.focus(); }
  });
})();