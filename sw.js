/*
 * ============================================================
 *  sw.js - Service worker de AlertaVecinal (parte de CACHÉ)
 * ============================================================
 *  Es el ÚNICO service worker de la app (vive en la raíz para
 *  controlar todas las páginas). Hace dos cosas:
 *   a) Caché: install, activate y fetch (este archivo).
 *   b) Push: se carga desde sw-push.js con importScripts.
 *  Además carga sw-sync.js (aportación "Alerta sin señal").
 *
 *  IMPORTANTE: cada vez que cambies archivos de la app, sube
 *  el número de VERSION para que los usuarios reciban lo nuevo.
 * ============================================================
 */

// Versión de la caché. Al cambiarla, "activate" borra las cachés viejas.
const VERSION = 'v2';
// Nombre versionado de la caché principal (app shell).
const CACHE_ESTATICA = `alertavecinal-${VERSION}`;
// Caché aparte para los mosaicos (imágenes) del mapa de OpenStreetMap.
const CACHE_MAPAS = 'alertavecinal-mapas';
// Máximo de mosaicos guardados; al pasarlo se borran los más viejos.
const LIMITE_MOSAICOS = 120;

// App shell: lo mínimo para que la app abra sin internet.
// cache.addAll() es "todo o nada": si uno falla, falla la instalación.
const APP_SHELL = [
  './',
  'index.html',
  'offline.html',
  'demo-cache.html',
  'manifest.json',
  'css/estilos.css',
  'js/firebase-config.js',
  'js/auth.js',
  'js/alertas.js',
  'js/app.js',
  'js/cache-demo.js',
  'iconos/icon-192.png',
  'iconos/icon-512.png'
];

// Archivos de los demás módulos. Se guardan uno por uno con cache.add():
// si alguno todavía no existe, simplemente se omite y la instalación sigue.
const OPCIONALES = [
  'admin.html', 'demo-push.html', 'estadisticas.html',
  'js/mapa.js', 'js/admin.js', 'js/push.js', 'js/offline-sync.js',
  'js/heatmap.js', 'js/instalar.js', 'js/estadisticas.js',
  'iconos/icon-maskable-512.png', 'iconos/badge-96.png'
];

// Dominios que NUNCA se guardan en caché: Firebase los maneja por su cuenta
// (Firestore, Authentication, googleapis) y Nominatim debe consultarse en vivo.
const SIN_CACHE = [
  'firestore.googleapis.com', 'identitytoolkit.googleapis.com', 'securetoken.googleapis.com',
  'fcmregistrations.googleapis.com', 'firebaseinstallations.googleapis.com',
  'googleapis.com', 'firebaseio.com', 'nominatim.openstreetmap.org'
];

// Librerías de CDN con versión fija (Firebase SDK en gstatic, Leaflet en unpkg).
// Como su URL incluye la versión, nunca cambian: se pueden servir desde caché.
const CDN_ESTATICOS = ['www.gstatic.com', 'unpkg.com'];

/* ---- Partes de otros integrantes (opcionales) ---- */
// Si sw-push.js o sw-sync.js aún no existen, importScripts lanza un error;
// lo atrapamos para que la caché siga funcionando sin ellos.
try {
  importScripts('sw-push.js');
} catch (error) {
  console.warn('[SW] sw-push.js no disponible todavía:', error.message);
}
try {
  importScripts('sw-sync.js');
} catch (error) {
  console.warn('[SW] sw-sync.js no disponible todavía:', error.message);
}

/* ============================================================
 *  INSTALL: se ejecuta una vez por versión. Guardamos el app shell.
 * ============================================================ */
self.addEventListener('install', (event) => {
  // waitUntil: el SW no se considera instalado hasta que termine la promesa.
  event.waitUntil((async () => {
    // caches.open(): abre (o crea) la caché con el nombre versionado.
    const cache = await caches.open(CACHE_ESTATICA);
    // cache.addAll(): descarga y guarda todo el app shell de una vez.
    // { cache: 'reload' } evita usar la caché HTTP del navegador (trae lo más nuevo).
    await cache.addAll(APP_SHELL.map((url) => new Request(url, { cache: 'reload' })));
    // cache.add() uno por uno para los opcionales; los errores se ignoran.
    await Promise.all(OPCIONALES.map((url) =>
      cache.add(new Request(url, { cache: 'reload' })).catch(() => null)));
    // skipWaiting(): activa este SW de inmediato, sin esperar a cerrar pestañas.
    await self.skipWaiting();
  })());
});

/* ============================================================
 *  ACTIVATE: limpiamos las cachés de versiones anteriores.
 * ============================================================ */
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // caches.keys(): lista los nombres de todas las cachés de este origen.
    const nombres = await caches.keys();
    await Promise.all(nombres
      // Borramos solo las de la app que no sean la versión actual ni la de mapas.
      .filter((nombre) => nombre.startsWith('alertavecinal-') &&
                          nombre !== CACHE_ESTATICA && nombre !== CACHE_MAPAS &&
                          nombre !== 'alertavecinal-demo')
      // caches.delete(): elimina una caché completa por su nombre.
      .map((nombre) => caches.delete(nombre)));
    // clients.claim(): este SW toma el control de las pestañas ya abiertas.
    await self.clients.claim();
  })());
});

/* ============================================================
 *  FETCH: decide de dónde sale cada respuesta (caché o red).
 * ============================================================ */
self.addEventListener('fetch', (event) => {
  const peticion = event.request;
  // Solo se guardan peticiones GET (POST, PUT, etc. van directo a la red).
  if (peticion.method !== 'GET') return;

  const url = new URL(peticion.url);

  // 1) Firebase / googleapis / Nominatim: no intervenimos (no llamamos respondWith).
  if (SIN_CACHE.some((dominio) => url.hostname === dominio || url.hostname.endsWith('.' + dominio))) return;

  // 2) Mosaicos de OpenStreetMap: Stale-While-Revalidate en su propia caché.
  if (url.hostname === 'tile.openstreetmap.org' || url.hostname.endsWith('.tile.openstreetmap.org')) {
    event.respondWith(staleWhileRevalidate(peticion));
    return;
  }

  // 3) Páginas HTML (navegación): Network First con respaldo en caché y offline.html.
  if (peticion.mode === 'navigate' || (peticion.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(networkFirst(peticion));
    return;
  }

  // 4) Archivos estáticos propios (CSS, JS, íconos) y librerías de CDN versionadas: Cache First.
  if (url.origin === self.location.origin || CDN_ESTATICOS.includes(url.hostname)) {
    event.respondWith(cacheFirst(peticion));
  }
  // Cualquier otra cosa: el navegador la maneja normalmente.
});

/* ---------- Estrategia 1: Cache First ---------- */
// Busca primero en la caché; si no está, va a la red y guarda una copia.
async function cacheFirst(peticion) {
  // caches.match(): busca la petición en TODAS las cachés del origen.
  const enCache = await caches.match(peticion);
  if (enCache) return enCache;
  try {
    const respuesta = await fetch(peticion);
    // Solo guardamos respuestas correctas (status 200-299).
    if (respuesta.ok) {
      const cache = await caches.open(CACHE_ESTATICA);
      // cache.put(): guarda el par petición/respuesta. Usamos clone()
      // porque el cuerpo de una respuesta solo se puede leer una vez.
      cache.put(peticion, respuesta.clone());
    }
    return respuesta;
  } catch (error) {
    // Sin red y sin copia: respondemos un error controlado.
    return new Response('Sin conexión y sin copia en caché.', { status: 503, statusText: 'Offline' });
  }
}

/* ---------- Estrategia 2: Network First ---------- */
// Intenta la red (contenido más reciente); si falla, usa la caché;
// y si tampoco está en caché, muestra offline.html.
async function networkFirst(peticion) {
  const cache = await caches.open(CACHE_ESTATICA);
  try {
    const respuesta = await fetch(peticion);
    // Actualizamos la copia guardada para la próxima vez sin conexión.
    if (respuesta.ok) cache.put(peticion, respuesta.clone());
    return respuesta;
  } catch (error) {
    // ignoreSearch: "index.html?demo=1" también encuentra "index.html".
    const enCache = await cache.match(peticion, { ignoreSearch: true });
    if (enCache) return enCache;
    // Página de respaldo cuando no hay conexión ni copia.
    return cache.match('offline.html');
  }
}

/* ---------- Estrategia 3: Stale-While-Revalidate ---------- */
// Responde al instante con la copia guardada (aunque sea "vieja") y,
// en paralelo, pide la versión nueva a la red para actualizar la caché.
async function staleWhileRevalidate(peticion) {
  const cache = await caches.open(CACHE_MAPAS);
  // cache.match(): busca solo dentro de la caché de mapas.
  const enCache = await cache.match(peticion);
  const desdeRed = fetch(peticion)
    .then(async (respuesta) => {
      if (respuesta.ok || respuesta.type === 'opaque') {
        await cache.put(peticion, respuesta.clone());
        await limitarCache(CACHE_MAPAS, LIMITE_MOSAICOS);
      }
      return respuesta;
    })
    .catch(() => enCache);
  // Si ya teníamos copia, la devolvemos sin esperar a la red.
  return enCache || desdeRed;
}

// Deja la caché con un máximo de "limite" entradas, borrando las más viejas.
async function limitarCache(nombre, limite) {
  const cache = await caches.open(nombre);
  // cache.keys(): lista las peticiones guardadas, en orden de inserción.
  const claves = await cache.keys();
  // Las primeras de la lista son las más antiguas.
  for (let i = 0; i < claves.length - limite; i++) {
    // cache.delete(): elimina una entrada concreta.
    await cache.delete(claves[i]);
  }
}

/* ---------- Mensajes desde la página ---------- */
// La página puede pedir la versión de la caché (lo usa demo-cache.html).
self.addEventListener('message', (event) => {
  if (event.data === 'version') event.source?.postMessage({ tipo: 'version', valor: CACHE_ESTATICA });
});
