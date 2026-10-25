'use strict';

/* =========================================================
   TEMA: automático / claro / oscuro
   Botón en la cabecera que alterna entre los tres modos y recuerda la elección
   (localStorage 'planner.theme'). "Automático" sigue la configuración del sistema.
   Se carga en el <head> para aplicar el tema antes de pintar la página (sin parpadeo).
   ========================================================= */
(function () {
  const KEY = 'planner.theme';
  const MODES = ['auto', 'light', 'dark'];
  const LABEL = { auto: '🌓 Auto', light: '☀️ Claro', dark: '🌙 Oscuro' };   // el botón muestra solo el icono
  const get = () => { try { const m = localStorage.getItem(KEY); return MODES.includes(m) ? m : 'auto'; } catch { return 'auto'; } };
  const root = document.documentElement;

  function apply(mode) {
    if (mode === 'auto') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    root.style.colorScheme = mode === 'auto' ? '' : mode;   // barras de scroll y campos nativos
    const b = document.getElementById('themeBtn');
    if (b) { b.textContent = LABEL[mode].split(' ')[0]; b.title = 'Tema: ' + LABEL[mode].split(' ')[1] + ' (clic para cambiar)'; }
  }
  apply(get());

  // Colores fijos que en styles.css/extras.js solo cambiaban con el modo del sistema
  const darkVars = '--bg:#14161c;--card:#1d2029;--text:#e8eaf0;--muted:#98a0b3;--line:#2c303c;';
  const lightVars = '--bg:#f5f6fa;--card:#ffffff;--text:#1f2430;--muted:#6b7280;--line:#e4e7ee;';
  const style = document.createElement('style');
  style.textContent = `
    :root[data-theme=dark] { ${darkVars} }
    :root[data-theme=light] { ${lightVars} }
    :root[data-theme=dark] .upnext { background: #3a3114; color: #f6e2a0; border-color: #5a4b1c; }
    :root[data-theme=light] .upnext { background: #fff4d6; color: #5c4400; border-color: #f0d58a; }
    :root[data-theme=dark] .hol-banner { background: #3a2a00; color: #fde68a; }
    :root[data-theme=dark] .hol-tag, :root[data-theme=dark] .wk-head .hol { color: #fbbf24; }
    #themeBtn { margin-left: auto; white-space: nowrap; }
    #themeBtn + #permBtn { margin-left: 0; }
  `;
  document.head.appendChild(style);

  function addButton() {
    if (document.getElementById('themeBtn')) return;
    const anchor = document.getElementById('permBtn');
    if (!anchor) return;
    const b = document.createElement('button');
    b.id = 'themeBtn'; b.type = 'button'; b.className = 'ghost';
    b.addEventListener('click', () => {
      const next = MODES[(MODES.indexOf(get()) + 1) % MODES.length];
      try { localStorage.setItem(KEY, next); } catch { }
      apply(next);
    });
    anchor.parentNode.insertBefore(b, anchor);
    apply(get());
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', addButton); else addButton();

  window.Tema = { get, apply, MODES };
})();