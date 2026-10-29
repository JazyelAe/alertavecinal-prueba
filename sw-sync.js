/*
 * sw-sync.js - Parte del service worker para la aportación "Alerta sin señal".
 * sw.js lo carga con importScripts('sw-sync.js').
 *
 * Cuando vuelve la conexión, el navegador dispara el evento "sync" con la
 * etiqueta "enviar-alertas" (aunque la app esté cerrada). Aquí leemos las
 * alertas guardadas en IndexedDB y las mandamos a Firestore usando su API
 * REST con el token de sesión del vecino.
 */
importScripts('js/firebase-config.js');

const SYNC_NOMBRE_BD = 'alertavecinal-offline';
const SYNC_ALMACEN = 'pendientes';

function syncAbrirBD() {
  return new Promise((resolve, reject) => {
    const solicitud = indexedDB.open(SYNC_NOMBRE_BD, 1);
    solicitud.onupgradeneeded = () => solicitud.result.createObjectStore(SYNC_ALMACEN, { keyPath: 'id' });
    solicitud.onsuccess = () => resolve(solicitud.result);
    solicitud.onerror = () => reject(solicitud.error);
  });
}

async function syncOperar(modo, accion) {
  const bd = await syncAbrirBD();
  return new Promise((resolve, reject) => {
    const tx = bd.transaction(SYNC_ALMACEN, modo);
    const peticion = accion(tx.objectStore(SYNC_ALMACEN));
    tx.oncomplete = () => resolve(peticion?.result);
    tx.onerror = () => reject(tx.error);
  });
}

// Convierte un objeto JS al formato de campos de la API REST de Firestore.
function aCamposFirestore(datos, fecha) {
  const campos = {};
  for (const [clave, valor] of Object.entries(datos)) {
    if (typeof valor === 'number') campos[clave] = { doubleValue: valor };
    else if (valor != null) campos[clave] = { stringValue: String(valor) };
  }
  campos.creado = { timestampValue: new Date(fecha).toISOString() };
  campos.origen = { stringValue: 'sin-senal' };
  return campos;
}

async function enviarPendientesDesdeSW() {
  const pendientes = await syncOperar('readonly', (s) => s.getAll());
  const proyecto = self.FIREBASE_CONFIG.projectId;
  let enviadas = 0;
  let sinRed = false;

  for (const p of pendientes) {
    if (!p.idToken) continue; // sin token: la enviará la página al abrirse
    const url = `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/alertas?documentId=${p.id}`;
    try {
      const respuesta = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${p.idToken}` },
        body: JSON.stringify({ fields: aCamposFirestore(p.datos, p.guardada) })
      });
      // 200 = creada; 409 = ya existía (la envió la página). En ambos casos sale de la cola.
      if (respuesta.ok || respuesta.status === 409) {
        await syncOperar('readwrite', (s) => s.delete(p.id));
        enviadas++;
      }
      // 401/403 = token vencido o sin permiso: la página la reintentará con un token nuevo.
    } catch (error) {
      sinRed = true;
    }
  }

  // Avisamos a las pestañas abiertas para que actualicen el contador.
  const ventanas = await self.clients.matchAll({ type: 'window' });
  ventanas.forEach((v) => v.postMessage({ tipo: 'av-sync', enviadas }));

  // Si seguimos sin red, lanzamos error para que el navegador reintente más tarde.
  if (sinRed) throw new Error('Sin red todavía');
}

self.addEventListener('sync', (event) => {
  if (event.tag === 'enviar-alertas') {
    event.waitUntil(enviarPendientesDesdeSW());
  }
});
