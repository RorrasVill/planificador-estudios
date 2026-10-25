'use strict';

/* =========================================================
   Copia de seguridad: exportar / importar todos los datos
   (actividades, asignaturas, notas, apuntes y archivos adjuntos).
   Se carga DESPUÉS de app.js y usa sus funciones (S, tx, fPut, save, render...).
   ========================================================= */
(function () {
  const LAST = 'planner.lastBackup';
  const getLast = () => { try { return Number(localStorage.getItem(LAST)) || 0; } catch { return 0; } };
  const setLast = () => { try { localStorage.setItem(LAST, String(Date.now())); } catch { } };
  const blobToDataURL = b => new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result);
    r.onerror = () => rej(r.error);
    r.readAsDataURL(b);
  });

  // ---------- Exportar ----------
  async function exportar() {
    try {
      const files = [];
      for (const f of (await tx('readonly', s => s.getAll())) || []) {
        files.push({ id: f.id, name: f.name, type: f.type, data: await blobToDataURL(f.blob) });
      }
      const backup = { app: 'planner', version: 1, exported: new Date().toISOString(), data: S, files };
      const blob = new Blob([JSON.stringify(backup)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `planificador-copia-${fmt(new Date())}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 60000);
      setLast();
      toast('💾 Copia exportada', `Se ha guardado "${a.download}" (normalmente en tu carpeta Descargas). Guárdala en un sitio seguro.`);
    } catch (err) {
      alert('No se pudo exportar la copia: ' + err.message);
    }
  }

  // ---------- Importar ----------
  async function importar(file) {
    try {
      const b = JSON.parse(await file.text());
      if (b.app !== 'planner' || !b.data || !Array.isArray(b.data.events) || !Array.isArray(b.data.subjects)) {
        throw new Error('el archivo no es una copia de este planificador');
      }
      const dia = b.exported ? b.exported.slice(0, 10) : 'fecha desconocida';
      if (!confirm(`Vas a REEMPLAZAR todo lo que tienes ahora (${S.events.length} actividades, ${S.subjects.length} asignaturas) por la copia del ${dia} (${b.data.events.length} actividades, ${b.data.subjects.length} asignaturas).\n\n¿Continuar?`)) return;

      // 1) preparar los archivos adjuntos antes de tocar nada
      const blobs = [];
      for (const f of b.files || []) {
        blobs.push({ id: f.id, name: f.name, type: f.type, blob: await (await fetch(f.data)).blob() });
      }
      // 2) reemplazar archivos y datos
      await tx('readwrite', s => s.clear());
      for (const f of blobs) await fPut(f);
      Object.keys(S).forEach(k => delete S[k]);
      Object.assign(S, b.data);
      S.settings = Object.assign({ dayStart: 7, dayEnd: 23 }, S.settings);
      ui.subj = null;
      save();
      render();
      toast('📂 Copia importada', `Se han cargado ${S.events.length} actividades y ${S.subjects.length} asignaturas.`);
    } catch (err) {
      alert('No se pudo importar la copia: ' + err.message);
    }
  }

  // ---------- Botones en la cabecera ----------
  const bar = document.querySelector('.top');
  const bx = document.createElement('button');
  bx.className = 'ghost';
  bx.textContent = '💾 Exportar copia';
  bx.title = 'Descarga un archivo con todos tus datos';
  const bi = document.createElement('button');
  bi.className = 'ghost';
  bi.textContent = '📂 Importar copia';
  bi.title = 'Recupera tus datos desde un archivo de copia';
  const inp = document.createElement('input');
  inp.type = 'file';
  inp.accept = '.json,application/json';
  inp.style.display = 'none';
  bx.addEventListener('click', exportar);
  bi.addEventListener('click', () => inp.click());
  inp.addEventListener('change', () => {
    const f = inp.files[0];
    inp.value = '';
    if (f) importar(f);
  });
  bar.append(bx, bi, inp);

  // ---------- Recordatorio si hace tiempo que no haces copia ----------
  setTimeout(() => {
    if (!S.events.length && !S.subjects.length) return;
    const last = getLast();
    const dias = Math.floor((Date.now() - last) / 86400000);
    if (!last || dias >= 7) {
      toast('💾 Haz una copia de seguridad',
        last ? `Hace ${dias} días que no exportas una copia.` : 'Aún no has hecho ninguna copia. Pulsa "Exportar copia" arriba.');
    }
  }, 3000);
})();