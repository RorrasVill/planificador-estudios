'use strict';

/* =========================================================
   ESTUDIAR UN APUNTE CON IA
   En Asignaturas > Apuntes, cada apunte tiene un botón "✨ Estudiar con IA":
   - 📝 Resumen (se puede guardar como apunte nuevo)
   - ❓ Test de preguntas con corrección
   - 🃏 Tarjetas (flashcards) que se pueden guardar y repasar con repetición espaciada
   Usa Ollama a través de window.AIChat (asistente.js). La IA solo lee el TEXTO del apunte,
   no los archivos adjuntos (PDF, Word...).
   Se carga DESPUÉS de planificador.js.
   Datos: S.cards = [{ id, subjectId, noteId, front, back, box, due, created }]
   ========================================================= */
(function () {
  const q = id => document.getElementById(id);
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const cardsArr = () => (S.cards = Array.isArray(S.cards) ? S.cards : []);
  const shuffle = a => { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; };
  const MAXCH = 7000;            // máximo de caracteres del apunte que se envían a la IA
  const INTERVALS = [1, 2, 4, 8, 16]; // días hasta el próximo repaso según la caja (1-5)
  let cur = null;                // { subject, note }
  let busy = false, quiz = null, deck = null, summary = '';

  // ---------- Peticiones a la IA ----------
  const PROMPTS = {
    summary: () => 'Eres un tutor. Resume en español los apuntes del estudiante con este formato: "RESUMEN" (5-8 líneas), "IDEAS CLAVE" (viñetas con guiones) y "DEFINICIONES Y FÓRMULAS" (solo si las hay). Sé fiel al texto: no inventes datos que no aparezcan en él.',
    quiz: n => `Eres un tutor. Genera ${n} preguntas tipo test en español basadas SOLO en los apuntes. Responde con un único JSON: {"questions":[{"q":"pregunta","options":["A","B","C","D"],"answer":0,"explanation":"por qué es correcta"}]}. "answer" es el índice (0 a 3) de la única opción correcta; las otras tres deben ser distractores plausibles.`,
    cards: n => `Eres un tutor. Crea ${n} tarjetas de estudio (flashcards) en español basadas SOLO en los apuntes. Responde con un único JSON: {"cards":[{"front":"pregunta o concepto","back":"respuesta breve y clara"}]}.`
  };
  function cleanQuiz(data, n) {
    const list = Array.isArray(data) ? data : (data && (data.questions || data.preguntas)) || [];
    const out = [];
    list.forEach(it => {
      if (!it || typeof it.q !== 'string' || !it.q.trim() || !Array.isArray(it.options)) return;
      const opts = it.options.map(o => String(o ?? '').trim()).filter(Boolean).slice(0, 4);
      if (opts.length < 2) return;
      let ans = it.answer;
      if (typeof ans === 'string') {
        if (/^[A-D]$/i.test(ans.trim())) ans = ans.trim().toUpperCase().charCodeAt(0) - 65;
        else { const k = opts.findIndex(o => norm(o) === norm(ans)); ans = k >= 0 ? k : Number(ans); }
      }
      if (!Number.isInteger(ans) || ans < 0 || ans >= opts.length) return;
      out.push({ q: it.q.trim(), options: shuffle(opts.map((t, i) => ({ t, ok: i === ans }))), explanation: String(it.explanation || '').trim() });
    });
    return out.slice(0, n);
  }
  function cleanCards(data, n) {
    const list = Array.isArray(data) ? data : (data && (data.cards || data.tarjetas)) || [];
    return list.filter(c => c && typeof c.front === 'string' && typeof c.back === 'string' && c.front.trim() && c.back.trim())
      .map(c => ({ front: c.front.trim(), back: c.back.trim() })).slice(0, n);
  }
  async function generate(kind, n) {
    if (!window.AIChat) throw new Error('El asistente de IA no está cargado.');
    const text = `${cur.note.title}\n\n${cur.note.text}`.slice(0, MAXCH);
    for (let attempt = 0; attempt < 2; attempt++) {
      const raw = await window.AIChat.chat(
        [{ role: 'system', content: PROMPTS[kind](n) }, { role: 'user', content: text }],
        { json: kind !== 'summary', temperature: kind === 'summary' ? 0.3 : 0.4 });
      if (kind === 'summary') { if (raw) return raw; continue; }
      const data = window.AIChat.parse(raw);
      const out = kind === 'quiz' ? cleanQuiz(data, n) : cleanCards(data, n);
      if (out.length) return out;
    }
    throw new Error('La IA no devolvió un formato válido. Inténtalo otra vez (con un modelo más grande suele ir mejor).');
  }

  // ---------- Tarjetas guardadas (repetición espaciada) ----------
  const today = () => fmt(new Date());
  const dueCards = sid => cardsArr().filter(c => c.subjectId === sid && c.due <= today());
  function saveCards(items, subjectId, noteId) {
    let n = 0;
    items.forEach(it => {
      if (cardsArr().some(c => c.subjectId === subjectId && norm(c.front) === norm(it.front))) return;
      const known = it.known === true;
      cardsArr().push({
        id: uid(), subjectId, noteId, front: it.front, back: it.back, created: Date.now(),
        box: known ? 2 : 1, due: known ? fmt(addDays(new Date(), INTERVALS[1])) : today()
      });
      n++;
    });
    if (n) save();
    return n;
  }
  function gradeCard(card, known) {
    card.box = known ? Math.min(5, (card.box || 1) + 1) : 1;
    card.due = known ? fmt(addDays(new Date(), INTERVALS[card.box - 1])) : today();
    save();
  }

  // ---------- Pantallas del diálogo ----------
  const out = () => q('ain-out');
  const html = h => { out().innerHTML = h; };
  const nSel = () => Number(q('ain-n').value) || 5;
  function refreshReviewBtn() {
    const n = cur ? dueCards(cur.subject.id).length : 0;
    q('ain-rev').textContent = `🃏 Repasar mis tarjetas (${n})`;
    q('ain-rev').disabled = !n;
  }

  function showSummary() {
    html(`<pre class="ain-pre">${esc(summary)}</pre>
      <div class="ain-btns"><button type="button" data-sv="note">💾 Guardar como apunte</button><button type="button" class="ghost" data-sv="copy">📋 Copiar</button></div>`);
  }
  function showQuiz() {
    const it = quiz.items[quiz.i];
    if (!it) {
      const pct = Math.round(quiz.score / quiz.items.length * 100);
      html(`<div class="ain-end"><b>Has acertado ${quiz.score} de ${quiz.items.length} (${pct}%)</b>
        <p class="muted">${pct >= 80 ? '¡Muy bien! Tienes el tema dominado.' : pct >= 50 ? 'Vas bien; repasa lo que has fallado.' : 'Toca repasar este apunte con calma.'}</p>
        <div class="ain-btns"><button type="button" data-qr="1">🔁 Repetir el test</button><button type="button" data-ain="quiz">❓ Otro test nuevo</button></div></div>`);
      return;
    }
    html(`<div class="ain-q"><div class="muted">Pregunta ${quiz.i + 1} de ${quiz.items.length}</div><h3>${esc(it.q)}</h3>
      ${it.options.map((o, k) => `<button type="button" class="ain-opt" data-qo="${k}">${esc(o.t)}</button>`).join('')}
      <div id="ain-fb"></div></div>`);
  }
  function answerQuiz(k) {
    if (!quiz || quiz.answered) return;
    const it = quiz.items[quiz.i];
    quiz.answered = true;
    const ok = it.options[k] && it.options[k].ok;
    if (ok) quiz.score++;
    out().querySelectorAll('.ain-opt').forEach((b, idx) => {
      b.disabled = true;
      if (it.options[idx].ok) b.classList.add('ok'); else if (idx === k) b.classList.add('bad');
    });
    q('ain-fb').innerHTML = `<p class="${ok ? 'ain-good' : 'ain-wrong'}"><b>${ok ? '✅ ¡Correcto!' : '❌ Incorrecto.'}</b> ${esc(it.explanation)}</p>
      <button type="button" class="primary" data-qn="1">${quiz.i + 1 < quiz.items.length ? 'Siguiente →' : 'Ver resultado'}</button>`;
  }

  function showCard() {
    const c = deck.items[deck.i];
    if (!c) {
      const total = deck.items.length;
      html(`<div class="ain-end"><b>Sesión terminada: sabías ${deck.known} de ${total}</b>
        ${deck.mode === 'new' ? `<p class="muted">Guarda las tarjetas para repasarlas otro día: las que fallaste volverán antes.</p>
          <div class="ain-btns"><button type="button" class="primary" data-sv="cards">💾 Guardar ${total} tarjetas</button></div>`
          : '<p class="muted">Las que fallaste se repetirán hoy; las que sabías, más adelante.</p>'}</div>`);
      refreshReviewBtn();
      return;
    }
    html(`<div class="ain-card"><div class="muted">Tarjeta ${deck.i + 1} de ${deck.items.length}</div>
      <div class="ain-front">${esc(c.front)}</div>
      ${deck.show ? `<div class="ain-back">${esc(c.back)}</div>
        <div class="ain-btns"><button type="button" data-ck="no">😕 Repasar</button><button type="button" class="primary" data-ck="yes">✅ Lo sabía</button></div>`
        : '<div class="ain-btns"><button type="button" class="primary" data-ck="show">Mostrar respuesta</button></div>'}</div>`);
  }

  // ---------- Controlador de clics del diálogo ----------
  async function handle(d) {
    if (d.ain) {
      if (busy) return;
      if (!cur.note.text || !cur.note.text.trim()) { html('<p class="ain-wrong">Este apunte no tiene texto escrito. La IA no lee los archivos adjuntos: pega el contenido en el apunte (✏️ Editar) y vuelve a probar.</p>'); return; }
      busy = true;
      html('<p class="muted">⏳ La IA está trabajando… puede tardar un poco con modelos grandes.</p>');
      try {
        const n = nSel();
        if (d.ain === 'summary') { summary = await generate('summary'); showSummary(); }
        else if (d.ain === 'quiz') { quiz = { items: await generate('quiz', n), i: 0, score: 0, answered: false }; showQuiz(); }
        else if (d.ain === 'cards') { deck = { items: await generate('cards', n), i: 0, show: false, known: 0, mode: 'new' }; showCard(); }
      } catch (err) { html(`<p class="ain-wrong">⚠️ ${esc(err.message)}</p>`); }
      finally { busy = false; }
    } else if (d.qo !== undefined) answerQuiz(Number(d.qo));
    else if (d.qn) { quiz.i++; quiz.answered = false; showQuiz(); }
    else if (d.qr) { quiz.items = quiz.items.map(it => ({ ...it, options: shuffle(it.options) })); quiz.i = 0; quiz.score = 0; quiz.answered = false; showQuiz(); }
    else if (d.ck) {
      const c = deck.items[deck.i];
      if (d.ck === 'show') { deck.show = true; }
      else {
        const known = d.ck === 'yes';
        if (known) deck.known++;
        if (deck.mode === 'review') gradeCard(c, known); else c.known = known;
        deck.i++; deck.show = false;
      }
      showCard();
    } else if (d.sv === 'note') {
      cur.subject.notes = cur.subject.notes || [];
      cur.subject.notes.push({ id: uid(), title: 'Resumen: ' + cur.note.title, text: summary, created: Date.now(), files: [] });
      save(); render();
      html(`<p class="ain-good">✅ Guardado como apunte nuevo: «Resumen: ${esc(cur.note.title)}».</p>`);
    } else if (d.sv === 'copy') {
      try { await navigator.clipboard.writeText(summary); toast('📋 Copiado', 'El resumen está en el portapapeles.'); } catch { toast('📋 No se pudo copiar', 'Selecciona el texto y cópialo con Ctrl+C.'); }
    } else if (d.sv === 'cards') {
      const n = saveCards(deck.items, cur.subject.id, cur.note.id);
      render(); refreshReviewBtn();
      html(`<p class="ain-good">✅ ${n} tarjeta(s) guardadas${n < deck.items.length ? ' (las repetidas no se duplican)' : ''}. Repásalas con «Repasar mis tarjetas».</p>`);
    } else if (d.rev) {
      const items = dueCards(cur.subject.id);
      if (!items.length) { html('<p class="muted">No tienes tarjetas pendientes de repaso hoy. 🎉</p>'); return; }
      deck = { items: shuffle(items), i: 0, show: false, known: 0, mode: 'review' };
      showCard();
    }
  }

  // ---------- Diálogo, estilos y botón en cada apunte ----------
  document.body.insertAdjacentHTML('beforeend', `
    <dialog id="aiNoteDlg">
      <h2 id="ain-title">✨ Estudiar con IA</h2>
      <p class="hint" id="ain-sub"></p>
      <div class="ain-btns">
        <button type="button" data-ain="summary">📝 Resumen</button>
        <button type="button" data-ain="quiz">❓ Test</button>
        <button type="button" data-ain="cards">🃏 Tarjetas</button>
        <label class="ain-n">Cantidad <select id="ain-n"><option>5</option><option>8</option><option>10</option></select></label>
      </div>
      <div class="ain-btns"><button type="button" class="ghost" id="ain-rev" data-rev="1">🃏 Repasar mis tarjetas (0)</button></div>
      <div id="ain-out" class="ain-out"></div>
      <div class="actions"><span class="spacer"></span><button type="button" class="ghost" data-x>Cerrar</button></div>
    </dialog>`);
  document.querySelectorAll('#aiNoteDlg [data-x]').forEach(b => b.addEventListener('click', () => b.closest('dialog').close()));
  q('aiNoteDlg').addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('[data-ain],[data-qo],[data-qn],[data-qr],[data-ck],[data-sv],[data-rev]');
    if (b && !b.disabled) handle(b.dataset);
  });

  const style = document.createElement('style');
  style.textContent = `
    #aiNoteDlg { width: min(680px, 94vw); }
    .ain-btns { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin: 8px 0; }
    .ain-n { display: flex !important; align-items: center; gap: 6px; margin: 0 0 0 auto !important; }
    .ain-n select { width: auto !important; margin: 0 !important; }
    .ain-out { margin-top: 10px; max-height: 52vh; overflow: auto; }
    .ain-pre { white-space: pre-wrap; font-family: inherit; background: var(--bg); border-radius: 10px; padding: 12px; margin: 0 0 8px; }
    .ain-q h3 { margin: 4px 0 12px; }
    .ain-opt { display: block; width: 100%; text-align: left; margin-bottom: 8px; }
    .ain-opt.ok { background: var(--ok); border-color: var(--ok); color: #fff; }
    .ain-opt.bad { background: var(--danger); border-color: var(--danger); color: #fff; }
    .ain-good { color: var(--ok); } .ain-wrong { color: var(--danger); }
    .ain-card { text-align: center; }
    .ain-front { font-size: 1.3rem; font-weight: 700; padding: 22px 12px; background: var(--bg); border-radius: 12px; margin: 8px 0; }
    .ain-back { font-size: 1.1rem; padding: 16px 12px; border: 2px dashed var(--ok); border-radius: 12px; margin: 8px 0; }
    .ain-card .ain-btns { justify-content: center; }
    .ain-end { text-align: center; padding: 10px; }
  `;
  document.head.appendChild(style);

  // Botón "✨ Estudiar con IA" junto a "Editar" de cada apunte
  const prevNotes = notesTab;
  notesTab = function (s) {
    return prevNotes(s).replace(/(<button class="small" data-act="editNote" data-id="([^"]+)">Editar<\/button>)/g,
      (m, btn, id) => btn + `<button class="small ghost" data-act="aiNote" data-id="${id}" title="Resumen, test y tarjetas con IA">✨ Estudiar con IA</button>`);
  };

  function open(subject, note) {
    cur = { subject, note }; quiz = null; deck = null; summary = ''; busy = false;
    q('ain-title').textContent = '✨ ' + note.title;
    q('ain-sub').textContent = `${subject.name} · La IA usa el texto del apunte (no los archivos adjuntos).`;
    html('');
    refreshReviewBtn();
    q('aiNoteDlg').showModal();
  }
  actions.aiNote = d => {
    const s = getSubj(ui.subj), n = s && (s.notes || []).find(x => x.id === d.id);
    if (n) open(s, n);
  };

  window.Repaso = { open, handle, cleanQuiz, cleanCards, saveCards, gradeCard, dueCards, state: () => ({ quiz, deck, summary }) };
})();