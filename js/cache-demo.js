/*
 * cache-demo.js - Botones de demo-cache.html. Cada función usa un método
 * de la API Cache y escribe el resultado en pantalla, para explicarlo en clase.
 */
const $ = (id) => document.getElementById(id);
const CACHE_DEMO = 'alertavecinal-demo'; // caché de pruebas (no afecta a la app)
const salida = $('demo-salida');

function mostrar(titulo, lineas, ok = true) {
  const encabezado = `<span class="${ok ? 'ok' : 'error'}">&gt; ${titulo}</span>\n`;
  const cuerpo = (Array.isArray(lineas) ? lineas : [lineas])
    .map((l) => String(l).replace(/&/g, '&amp;').replace(/</g, '&lt;')).join('\n');
  salida.innerHTML = encabezado + cuerpo;
}

// Nombre de caché elegido en la lista (o la del app shell si no hay elección).
const cacheElegida = () => $('demo-cache-nombre').value || CACHE_DEMO;
const urlElegida = () => $('demo-url').value.trim() || 'offline.html';
const rutaCorta = (url) => { const u = new URL(url); return u.origin === location.origin ? u.pathname + u.search : u.href; };

async function llenarSelector() {
  const nombres = await caches.keys();
  const selector = $('demo-cache-nombre');
  const anterior = selector.value;
  selector.innerHTML = nombres.length
    ? nombres.map((n) => `<option>${n}</option>`).join('')
    : '<option value="">(no hay cachés)</option>';
  if (nombres.includes(anterior)) selector.value = anterior;
  return nombres;
}

const metodos = {
  // caches.keys(): nombres de todas las cachés del sitio.
  async cachesKeys() {
    const nombres = await llenarSelector();
    mostrar('await caches.keys()', nombres.length
      ? nombres.map((n, i) => `[${i}] "${n}"`)
      : '[] (vacío: el service worker aún no guarda nada)');
  },

  // cache.keys(): lista las peticiones (URLs) guardadas en una caché.
  async cacheKeys() {
    const nombre = cacheElegida();
    const cache = await caches.open(nombre);
    const peticiones = await cache.keys();
    mostrar(`(await caches.open("${nombre}")).keys()  →  ${peticiones.length} entradas`,
      peticiones.map((p) => rutaCorta(p.url)));
  },

  // cache.match(): busca la respuesta guardada para una URL.
  async cacheMatch() {
    const nombre = cacheElegida();
    const cache = await caches.open(nombre);
    const respuesta = await cache.match(urlElegida());
    if (!respuesta) return mostrar(`cache.match("${urlElegida()}")`, 'undefined → no está en esta caché', false);
    const cuerpo = await respuesta.clone().blob();
    mostrar(`cache.match("${urlElegida()}") en "${nombre}"`, [
      `status:        ${respuesta.status} ${respuesta.statusText}`,
      `url:           ${rutaCorta(respuesta.url)}`,
      `content-type:  ${respuesta.headers.get('content-type')}`,
      `tamaño:        ${cuerpo.size} bytes`
    ]);
  },

  // cache.add(): descarga la URL y la guarda (fetch + put en un paso).
  async cacheAdd() {
    const cache = await caches.open(CACHE_DEMO);
    await cache.add(urlElegida());
    await llenarSelector();
    $('demo-cache-nombre').value = CACHE_DEMO;
    mostrar(`(await caches.open("${CACHE_DEMO}")).add("${urlElegida()}")`,
      ['OK: se descargó y se guardó.', 'Pulsa cache.keys() para verla en la lista.']);
  },

  // cache.put(): guarda una respuesta que nosotros creamos (no viene de la red).
  async cachePut() {
    const cache = await caches.open(CACHE_DEMO);
    const datos = { mensaje: 'Hola desde cache.put()', hora: new Date().toLocaleString('es-MX') };
    const respuesta = new Response(JSON.stringify(datos, null, 2), {
      headers: { 'Content-Type': 'application/json' }
    });
    await cache.put('demo/saludo.json', respuesta);
    await llenarSelector();
    $('demo-cache-nombre').value = CACHE_DEMO;
    $('demo-url').value = 'demo/saludo.json';
    mostrar(`cache.put("demo/saludo.json", new Response(...))`,
      ['OK: respuesta guardada sin usar la red:', JSON.stringify(datos, null, 2)]);
  },

  // cache.delete(): borra una entrada; devuelve true si existía.
  async cacheDelete() {
    const nombre = cacheElegida();
    const cache = await caches.open(nombre);
    const borrado = await cache.delete(urlElegida());
    mostrar(`(await caches.open("${nombre}")).delete("${urlElegida()}")`,
      borrado ? 'true → la entrada se eliminó' : 'false → no existía en esa caché', borrado);
  },

  // caches.has(): ¿existe una caché con ese nombre?
  async cachesHas() {
    const nombre = cacheElegida();
    const existe = await caches.has(nombre);
    mostrar(`await caches.has("${nombre}")`, String(existe), existe);
  },

  // Borrar todo: caches.keys() + caches.delete() de cada una.
  async borrarTodo() {
    if (!confirm('¿Borrar todas las cachés? La app las volverá a llenar al recargar.')) return;
    const nombres = await caches.keys();
    const resultados = await Promise.all(nombres.map((n) => caches.delete(n)));
    await llenarSelector();
    mostrar('Promise.all((await caches.keys()).map(n => caches.delete(n)))',
      nombres.length ? nombres.map((n, i) => `"${n}" → ${resultados[i]}`) : 'No había cachés.');
  }
};

document.querySelectorAll('[data-metodo]').forEach((boton) => {
  boton.addEventListener('click', async () => {
    try {
      await metodos[boton.dataset.metodo]();
    } catch (error) {
      mostrar(boton.textContent, `Error: ${error.message}`, false);
    }
  });
});

/* ---------- Estado del service worker (equivale a DevTools > Application) ---------- */
async function pintarEstadoSW() {
  $('sw-red').textContent = navigator.onLine ? 'En línea' : 'Sin conexión (offline)';
  if (!('caches' in window)) {
    $('sw-estado').textContent = 'Este navegador no soporta la API Cache';
    return;
  }
  if (!('serviceWorker' in navigator)) return;
  const registro = await (window.AV?.swListo || navigator.serviceWorker.getRegistration());
  if (!registro) { $('sw-estado').textContent = 'No registrado'; return; }
  const sw = registro.active || registro.waiting || registro.installing;
  $('sw-estado').textContent = sw ? `${sw.state === 'activated' ? 'Activado y en ejecución' : sw.state}` : '—';
  $('sw-alcance').textContent = new URL(registro.scope).pathname;
  navigator.serviceWorker.ready.then((r) => r.active?.postMessage('version'));
}
navigator.serviceWorker?.addEventListener('message', (e) => {
  if (e.data?.tipo === 'version') $('sw-version').textContent = e.data.valor;
});
window.addEventListener('online', pintarEstadoSW);
window.addEventListener('offline', pintarEstadoSW);
navigator.serviceWorker?.addEventListener('controllerchange', pintarEstadoSW);
pintarEstadoSW();
llenarSelector().then((nombres) => {
  // Selecciona por defecto la caché del app shell si ya existe.
  const shell = nombres.find((n) => /^alertavecinal-v\d+$/.test(n));
  if (shell) $('demo-cache-nombre').value = shell;
});
