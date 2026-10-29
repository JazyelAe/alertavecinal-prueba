/*
 * app.js - Conversión a PWA del lado de la página:
 *  - Registra el service worker (sw.js) y comparte el registro en
 *    window.AV.swListo para que push.js se lo pase a getToken().
 *  - Muestra si hay o no conexión.
 *  - Avisa cuando hay una versión nueva del service worker.
 */
window.AV = window.AV || {};

if ('serviceWorker' in navigator) {
  // register() devuelve una promesa con el ServiceWorkerRegistration.
  window.AV.swListo = navigator.serviceWorker.register('sw.js', { scope: './' })
    .then((registro) => {
      console.info('[AlertaVecinal] Service worker registrado. Alcance:', registro.scope);
      // Si se instala una versión nueva mientras la app está abierta, lo avisamos.
      registro.addEventListener('updatefound', () => {
        const nuevo = registro.installing;
        nuevo?.addEventListener('statechange', () => {
          if (nuevo.state === 'activated' && navigator.serviceWorker.controller) {
            window.AV.aviso?.('Hay una versión nueva de AlertaVecinal. Recarga la página.', 'info', 6000);
          }
        });
      });
      return registro;
    })
    .catch((error) => {
      console.error('[AlertaVecinal] No se pudo registrar el service worker:', error);
      return null;
    });
} else {
  window.AV.swListo = Promise.resolve(null);
}

/* ---------- Indicador de conexión ---------- */
function pintarRed() {
  const chip = document.getElementById('estado-red');
  if (!chip) return;
  chip.hidden = navigator.onLine;            // solo se ve cuando NO hay conexión
  chip.textContent = 'Sin conexión';
  chip.classList.toggle('chip-mal', !navigator.onLine);
}
window.addEventListener('online', () => { pintarRed(); window.AV.aviso?.('Conexión restablecida.', 'ok'); });
window.addEventListener('offline', () => { pintarRed(); window.AV.aviso?.('Estás sin conexión. La app sigue funcionando con lo guardado en caché.'); });
pintarRed();
