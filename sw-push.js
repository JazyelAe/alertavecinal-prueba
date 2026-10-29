/*
 * ============================================================
 *  sw-push.js - Parte de NOTIFICACIONES PUSH del service worker
 * ============================================================
 *  No se registra por separado: sw.js lo carga con
 *  importScripts('sw-push.js'), así que corre dentro del mismo
 *  service worker y comparte su alcance.
 *
 *  Usa la versión "compat" del SDK de Firebase porque los
 *  service workers cargan scripts con importScripts (no con import).
 * ============================================================
 */

/* ---- 1) Clic en la notificación ----
 * Se registra ANTES de cargar Firebase para que nuestro manejador corra
 * primero: abre la app en la alerta o enfoca la pestaña si ya estaba abierta. */
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  // Firebase guarda los datos del mensaje en data.FCM_MSG cuando él muestra la notificación.
  const datos = event.notification.data || {};
  const fcm = datos.FCM_MSG || {};
  const destino = datos.url || fcm.data?.url || fcm.fcmOptions?.link ||
                  fcm.notification?.click_action || './';
  const urlFinal = new URL(destino, self.location.origin).href;

  // Evita que el manejador interno de Firebase abra otra pestaña.
  event.stopImmediatePropagation();

  event.waitUntil((async () => {
    // clients.matchAll(): todas las pestañas/ventanas de la app.
    const ventanas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const ventana of ventanas) {
      if (new URL(ventana.url).origin === self.location.origin && 'focus' in ventana) {
        // Ya hay una ventana abierta: la llevamos a la alerta y la enfocamos.
        await ventana.navigate(urlFinal).catch(() => null);
        return ventana.focus();
      }
    }
    // No había ninguna: abrimos una nueva.
    return self.clients.openWindow(urlFinal);
  })());
});

/* ---- 2) Firebase Cloud Messaging en segundo plano ---- */
importScripts('js/firebase-config.js');
importScripts(`https://www.gstatic.com/firebasejs/${self.FIREBASE_SDK_VERSION}/firebase-app-compat.js`);
importScripts(`https://www.gstatic.com/firebasejs/${self.FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`);

firebase.initializeApp(self.FIREBASE_CONFIG);
const messaging = firebase.messaging();

// onBackgroundMessage: llega un push y la app está cerrada o en otra pestaña.
messaging.onBackgroundMessage((payload) => {
  console.info('[SW] Push recibido en segundo plano:', payload);
  // Si el mensaje trae "notification" (por ejemplo, el de la consola de Firebase),
  // el SDK ya muestra la notificación solo; no la duplicamos.
  if (payload.notification) return;

  const datos = payload.data || {};
  const titulo = datos.titulo || 'AlertaVecinal';
  return self.registration.showNotification(titulo, {
    body: datos.cuerpo || 'Hay una nueva alerta en tu colonia.',
    icon: 'iconos/icon-192.png',
    badge: 'iconos/badge-96.png',
    tag: datos.alertaId || 'alertavecinal',  // reemplaza notificaciones repetidas
    renotify: true,
    vibrate: [200, 100, 200],
    data: { url: datos.url || (datos.alertaId ? `./?alerta=${datos.alertaId}` : './') }
  });
});
