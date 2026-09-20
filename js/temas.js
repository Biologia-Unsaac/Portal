(function () {
  var KEY = 'portalTema';
  var OPCIONES = [
    {
      id: '',
      label: 'Tema claro',
      svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/></svg>'
    },
    {
      id: 'noche',
      label: 'Noche (azul)',
      svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>'
    },
    {
      id: 'contra',
      label: 'Contraste (negro)',
      svg: '<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 3a9 9 0 0 1 0 18z" fill="currentColor" stroke="none"/></svg>'
    }
  ];

  function temaGuardado() {
    try {
      var v = localStorage.getItem(KEY);
      for (var i = 0; i < OPCIONES.length; i++) {
        if (OPCIONES[i].id === v) return v;
      }
    } catch (e) {}
    return '';
  }

  function aplicar(tema) {
    if (tema) {
      document.documentElement.setAttribute('data-tema', tema);
    } else {
      document.documentElement.removeAttribute('data-tema');
    }
    try { localStorage.setItem(KEY, tema); } catch (e) {}
  }

  function crearInterruptor() {
    if (document.getElementById('temaSwitch')) return;
    var cont = document.createElement('div');
    cont.id = 'temaSwitch';
    cont.title = 'Cambiar tema del portal';
    OPCIONES.forEach(function (op) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.setAttribute('aria-label', op.label);
      btn.title = op.label;
      btn.innerHTML = op.svg;
      btn.addEventListener('click', function () {
        aplicar(op.id);
        sync();
      });
      cont.appendChild(btn);
    });
    document.body.appendChild(cont);
  }

  function sync() {
    var actual = temaGuardado();
    var botones = document.querySelectorAll('#temaSwitch button');
    for (var i = 0; i < botones.length; i++) {
      botones[i].setAttribute('aria-pressed', String(OPCIONES[i].id === actual));
    }
  }

  aplicar(temaGuardado());
  function init() {
    if (document.body) {
      crearInterruptor();
      sync();
    } else {
      document.addEventListener('DOMContentLoaded', init);
    }
  }
  init();
})();
