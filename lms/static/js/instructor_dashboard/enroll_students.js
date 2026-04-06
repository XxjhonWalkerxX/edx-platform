(function () {
  'use strict';

  function getCsrf() {
    var match = document.cookie.match(/csrftoken=([^;]+)/);
    return match ? match[1] : '';
  }

  function openEnrollStudents() {
    if (document.getElementById('enroll-overlay')) {
      var existing = document.getElementById('enroll-emails');
      if (existing) { existing.focus(); }
      return;
    }

    var triggerBtn = document.getElementById('launch-enroll-students');
    var enrollEndpoint = triggerBtn ? triggerBtn.getAttribute('data-endpoint') : null;

    if (!enrollEndpoint) {
      // eslint-disable-next-line no-console
      console.error('enroll_students.js: no se encontró data-endpoint en #launch-enroll-students');
      return;
    }

    var style = document.createElement('style');
    style.textContent = [
      '#enroll-overlay{position:fixed;inset:0;background:rgba(0,0,0,0.6);z-index:999999;',
      'display:flex;align-items:center;justify-content:center;font-family:system-ui,sans-serif;}',
      '#enroll-box{background:#fff;border-radius:10px;padding:28px 32px;width:520px;',
      'max-width:95vw;box-shadow:0 8px 32px rgba(0,0,0,0.25);}',
      '#enroll-box h2{margin:0 0 6px;font-size:18px;color:#1a1a1a;}',
      '#enroll-box p{margin:0 0 14px;font-size:13px;color:#555;}',
      '#enroll-emails{width:100%;height:180px;border:1px solid #ccc;border-radius:6px;',
      'padding:10px;font-size:13px;resize:vertical;box-sizing:border-box;}',
      '#enroll-log{margin-top:14px;max-height:140px;overflow-y:auto;background:#f4f4f4;',
      'border-radius:6px;padding:10px;font-size:12px;color:#333;display:none;}',
      '.enroll-row{display:flex;gap:10px;margin-top:14px;}',
      '#enroll-btn{flex:1;padding:10px;background:#0d6efd;color:#fff;border:none;',
      'border-radius:6px;font-size:14px;cursor:pointer;}',
      '#enroll-btn:disabled{background:#6c9fd8;cursor:not-allowed;}',
      '#enroll-cancel{padding:10px 18px;background:#e5e5e5;color:#333;border:none;',
      'border-radius:6px;font-size:14px;cursor:pointer;}',
      '.log-ok{color:#198754;}.log-err{color:#dc3545;}.log-info{color:#555;}'
    ].join('');
    document.head.appendChild(style);

    var overlay = document.createElement('div');
    overlay.id = 'enroll-overlay';
    overlay.innerHTML = '<div id="enroll-box">'
      + '<h2>Inscribir estudiantes</h2>'
      + '<p>Pega la lista de correos (uno por línea o separados por coma).<br>'
      + 'Se enviarán en lotes de <strong>40</strong>.</p>'
      + '<textarea id="enroll-emails" placeholder="alumno1@example.com&#10;alumno2@example.com&#10;..."></textarea>'
      + '<div class="enroll-row">'
      + '<button id="enroll-btn">Inscribir</button>'
      + '<button id="enroll-cancel">Cancelar</button>'
      + '</div>'
      + '<div id="enroll-log"></div>'
      + '</div>';
    document.body.appendChild(overlay);

    var btn = document.getElementById('enroll-btn');
    var cancel = document.getElementById('enroll-cancel');
    var log = document.getElementById('enroll-log');
    var textarea = document.getElementById('enroll-emails');

    function addLog(msg, type) {
      var t = type || 'info';
      if (!log) { return; }
      log.style.display = 'block';
      var line = document.createElement('div');
      line.className = 'log-' + t;
      line.textContent = msg;
      log.appendChild(line);
      log.scrollTop = log.scrollHeight;
    }

    function sleep(ms) {
      return new Promise(function (r) { return setTimeout(r, ms); });
    }

    cancel.addEventListener('click', function () { overlay.remove(); });

    btn.addEventListener('click', async function () {
      var raw = textarea.value.trim();
      if (!raw) { addLog('No hay correos para procesar.', 'err'); return; }

      var emails = raw
        .split(/[\n,;\s]+/)
        .map(function (e) { return e.trim().toLowerCase(); })
        .filter(function (e) { return e.indexOf('@') !== -1; });

      if (emails.length === 0) {
        addLog('No se encontraron correos válidos.', 'err');
        return;
      }

      var csrf = getCsrf();
      if (!csrf) {
        addLog('No se encontró csrftoken en cookies. Asegúrate de estar en la página correcta.', 'err');
        return;
      }

      var batchSize = 40;
      var batches = [];
      for (var i = 0; i < emails.length; i += batchSize) {
        batches.push(emails.slice(i, i + batchSize));
      }

      addLog(emails.length + ' correos encontrados → ' + batches.length + ' lote(s) de hasta ' + batchSize + '.', 'info');
      btn.disabled = true;
      btn.textContent = 'Enviando...';

      var success = 0;
      var failed = 0;

      for (var j = 0; j < batches.length; j++) {
        var batch = batches[j];
        var identifiers = batch.join(',');
        var body = new URLSearchParams({
          action: 'enroll',
          identifiers: identifiers,
          auto_enroll: 'true',
          email_students: 'true'
        }).toString();

        try {
          var res = await fetch(enrollEndpoint, { // eslint-disable-line no-await-in-loop
            method: 'POST',
            headers: {
              accept: 'application/json, text/javascript, */*; q=0.01',
              'content-type': 'application/x-www-form-urlencoded; charset=UTF-8',
              'x-csrftoken': csrf,
              'x-requested-with': 'XMLHttpRequest'
            },
            body: body,
            credentials: 'include'
          });

          if (res.ok) {
            success += batch.length;
            addLog('Lote ' + (j + 1) + '/' + batches.length + ': OK (' + batch.length + ' correos)', 'ok');
          } else {
            failed += batch.length;
            addLog('Lote ' + (j + 1) + '/' + batches.length + ': Error HTTP ' + res.status, 'err');
          }
        } catch (err) {
          failed += batch.length;
          addLog('Lote ' + (j + 1) + '/' + batches.length + ': Excepción → ' + err.message, 'err');
        }

        if (j < batches.length - 1) {
          await sleep(45000); // eslint-disable-line no-await-in-loop
        }
      }

      addLog('Terminado: ' + success + ' inscritos, ' + failed + ' fallidos.', success > 0 ? 'ok' : 'err');
      btn.disabled = false;
      btn.textContent = 'Inscribir';
    });
  }

  window.openEnrollStudents = openEnrollStudents;

  var autoBtn = document.getElementById('launch-enroll-students')
    || document.querySelector('[data-launch-enroll]');
  if (autoBtn) {
    autoBtn.addEventListener('click', openEnrollStudents);
  }
}());
