// Convertido a función invocable: el popup ya no se muestra automáticamente.
// Llama a `openEnrollStudents()` o coloca un botón con id
// `launch-enroll-students` para iniciar el proceso al pulsarlo.
(function () {
  'use strict';

  // --- Obtener CSRF token de las cookies automáticamente ---
  function getCsrf() {
    const match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
  }

  // Función que crea y muestra el popup. Se puede invocar manualmente.
  function openEnrollStudents() {
    // Evitar crear múltiples overlays
    if (document.getElementById('enroll-overlay')) {
      // si ya existe, sólo enfocamos el textarea
      const ta = document.getElementById('enroll-emails');
      if (ta) ta.focus();
      return;
    }

    // Usar la URL completa de la página actual sin fragmento (hash)
    // y asegurarse de que termine en '/' para concatenar rutas.
    // Esto preserva los parámetros de búsqueda (search) pero elimina el '#fragment'.
    const URL_BASE = window.location.href.split('#')[0].replace(/\/?$/, '/');
    // --- Estilos del popup ---
    const style = document.createElement('style');
    style.textContent = `
      #enroll-overlay {
        position: fixed; inset: 0; background: rgba(0,0,0,0.6);
        z-index: 999999; display: flex; align-items: center; justify-content: center;
        font-family: system-ui, sans-serif;
      }
      #enroll-box {
        background: #fff; border-radius: 10px; padding: 28px 32px;
        width: 520px; max-width: 95vw; box-shadow: 0 8px 32px rgba(0,0,0,0.25);
      }
      #enroll-box h2 { margin: 0 0 6px; font-size: 18px; color: #1a1a1a; }
      #enroll-box p  { margin: 0 0 14px; font-size: 13px; color: #555; }
      #enroll-emails {
        width: 100%; height: 180px; border: 1px solid #ccc; border-radius: 6px;
        padding: 10px; font-size: 13px; resize: vertical; box-sizing: border-box;
      }
      #enroll-log {
        margin-top: 14px; max-height: 140px; overflow-y: auto;
        background: #f4f4f4; border-radius: 6px; padding: 10px;
        font-size: 12px; color: #333; display: none;
      }
      .enroll-row { display: flex; gap: 10px; margin-top: 14px; }
      #enroll-btn {
        flex: 1; padding: 10px; background: #0d6efd; color: #fff;
        border: none; border-radius: 6px; font-size: 14px; cursor: pointer;
      }
      #enroll-btn:disabled { background: #6c9fd8; cursor: not-allowed; }
      #enroll-cancel {
        padding: 10px 18px; background: #e5e5e5; color: #333;
        border: none; border-radius: 6px; font-size: 14px; cursor: pointer;
      }
      .log-ok   { color: #198754; }
      .log-err  { color: #dc3545; }
      .log-info { color: #555; }
    `;
    document.head.appendChild(style);

    // --- HTML del popup ---
    const overlay = document.createElement('div');
    overlay.id = 'enroll-overlay';
    overlay.innerHTML = `
      <div id="enroll-box">
        <h2>Inscribir estudiantes</h2>
        <p>Pega la lista de correos (uno por línea o separados por coma/espacio).<br>
           Se enviarán en lotes de <strong>40</strong>.</p>
        <textarea id="enroll-emails" placeholder="alumno1@example.com&#10;alumno2@example.com&#10;..."></textarea>
        <div class="enroll-row">
          <button id="enroll-btn">Inscribir</button>
          <button id="enroll-cancel">Cancelar</button>
        </div>
        <div id="enroll-log"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const btn     = document.getElementById('enroll-btn');
    const cancel  = document.getElementById('enroll-cancel');
    const log     = document.getElementById('enroll-log');
    const textarea = document.getElementById('enroll-emails');

    function addLog(msg, type = 'info') {
      if (!log) return;
      log.style.display = 'block';
      const line = document.createElement('div');
      line.className = `log-${type}`;
      line.textContent = msg;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

    cancel.addEventListener('click', () => overlay.remove());

    btn.addEventListener('click', async () => {
      const raw = textarea.value.trim();
      if (!raw) { addLog('No hay correos para procesar.', 'err'); return; }

      // Normalizar: separar por saltos de línea, comas o espacios
      const emails = raw
        .split(/[\n,;\s]+/)
        .map(e => e.trim().toLowerCase())
        .filter(e => e.includes('@'));

      if (emails.length === 0) {
        addLog('No se encontraron correos válidos.', 'err');
        return;
      }

      const csrf = getCsrf();
      if (!csrf) {
        addLog('No se encontró csrftoken en cookies. Asegúrate de estar en la pagina correcta.', 'err');
        return;
      }

      // Partir en lotes de 40
      const batchSize = 40;
      const batches = [];
      for (let i = 0; i < emails.length; i += batchSize) {
        batches.push(emails.slice(i, i + batchSize));
      }

      addLog(`${emails.length} correos encontrados → ${batches.length} lote(s) de hasta ${batchSize}.`, 'info');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      let success = 0;
      let failed  = 0;

      for (let i = 0; i < batches.length; i++) {
        const batch = batches[i];
        const identifiers = batch.join(',');
        const body = new URLSearchParams({
          action: 'enroll',
          identifiers,
          auto_enroll: 'true',
          email_students: 'true'
        }).toString();

        try {
          const res = await fetch(URL_BASE+'api/students_update_enrollment', {
            method: 'POST',
            headers: {
              'accept': 'application/json, text/javascript, */*; q=0.01',
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'x-csrftoken': csrf,
              'x-requested-with': 'XMLHttpRequest'
            },
            body,
            credentials: 'include'
          });

          if (res.ok) {
            success += batch.length;
            addLog(`Lote ${i + 1}/${batches.length}: OK (${batch.length} correos)`, 'ok');
          } else {
            failed += batch.length;
            addLog(`Lote ${i + 1}/${batches.length}: Error HTTP ${res.status}`, 'err');
          }
        } catch (err) {
          failed += batch.length;
          addLog(`Lote ${i + 1}/${batches.length}: Excepcion → ${err.message}`, 'err');
        }

        // Pequeña pausa entre lotes para no saturar el servidor
        if (i < batches.length - 1) await sleep(45000);
      }

      addLog(`Terminado: ${success} inscritos, ${failed} fallidos.`, success > 0 ? 'ok' : 'err');
      btn.disabled = false;
      btn.textContent = 'Inscribir';
    });
  }

  // Exponer la función globalmente para uso manual: window.openEnrollStudents()
  window.openEnrollStudents = openEnrollStudents;

  // Auto-enlace: esperar a que el DOM esté listo antes de buscar el botón.
  document.addEventListener('DOMContentLoaded', function () {
    const autoBtn = document.getElementById('launch-enroll-students') || document.querySelector('[data-launch-enroll]');
    if (autoBtn) {
      autoBtn.addEventListener('click', openEnrollStudents);
    }
  });

})();

