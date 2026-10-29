/*
 * push.js - Notificaciones push con Firebase Cloud Messaging (FCM).
 *  - Pide permiso con un botón (nunca al cargar la página).
 *  - Obtiene el token FCM con la clave VAPID y el registro de sw.js.
 *  - Guarda el token en Firestore (colección "tokens").
 *  - Con la app abierta (primer plano) usa onMessage y muestra
 *    la notificación dentro de la página.
 *  - En demo-push.html muestra el estado del permiso, el token y
 *    lanza una notificación local de prueba.
 */
import {
  getMessaging, getToken, onMessage, isSupported
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging.js';
import { doc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { app, db, esDemo, onSesion, aviso, agregarMenu } from './auth.js';

const $ = (id) => document.getElementById(id);
const enDemoPush = document.body.dataset.pagina === 'demo-push';
let mensajeria = null;
let tokenActual = null;

// El registro del service worker lo crea app.js (window.AV.swListo).
async function registroSW() {
  const registro = await (window.AV.swListo || navigator.serviceWorker?.ready);
  if (!registro) throw new Error('No hay service worker registrado.');
  return registro;
}

async function obtenerMensajeria() {
  if (mensajeria) return mensajeria;
  // isSupported(): FCM necesita service worker, Push API e IndexedDB.
  if (!(await isSupported())) throw new Error('Este navegador no soporta notificaciones push web.');
  mensajeria = getMessaging(app);
  // Primer plano: el mensaje llega aquí y NO se muestra solo; lo pintamos en la página.
  onMessage(mensajeria, (payload) => {
    console.info('[Push] Mensaje en primer plano:', payload);
    const n = payload.notification || {};
    const d = payload.data || {};
    mostrarEnPagina(n.title || d.titulo || 'AlertaVecinal', n.body || d.cuerpo || '', d.url);
  });
  return mensajeria;
}

/* ---------- Activar notificaciones ---------- */
export async function activarNotificaciones() {
  if (!('Notification' in window)) throw new Error('Tu navegador no soporta notificaciones.');
  // 1) Permiso (el navegador muestra su diálogo).
  const permiso = await Notification.requestPermission();
  pintarEstado();
  if (permiso !== 'granted') throw new Error('No diste permiso para notificaciones.');
  if (esDemo || self.FIREBASE_SIN_CONFIGURAR) {
    throw new Error('Permiso concedido. Para obtener el token, configura Firebase y la clave VAPID.');
  }
  // 2) Token FCM: identifica a este navegador para poder enviarle mensajes.
  const token = await getToken(await obtenerMensajeria(), {
    vapidKey: self.FIREBASE_VAPID_KEY,
    serviceWorkerRegistration: await registroSW() // usamos sw.js en vez de firebase-messaging-sw.js
  });
  if (!token) throw new Error('No se pudo obtener el token.');
  tokenActual = token;
  // 3) Guardamos el token en Firestore para que scripts/enviar-push.js lo encuentre.
  const { usuario, perfil } = window.AV.sesion || {};
  await setDoc(doc(db, 'tokens', token), {
    token,
    uid: usuario?.uid || null,
    nombre: perfil?.nombre || '',
    navegador: navigator.userAgent.slice(0, 150),
    actualizado: serverTimestamp()
  });
  pintarEstado();
  return token;
}

/* ---------- Notificación dentro de la página (primer plano) ---------- */
export function mostrarEnPagina(titulo, cuerpo, url) {
  document.querySelector('.notif-pagina')?.remove();
  const caja = document.createElement('div');
  caja.className = 'notif-pagina';
  caja.setAttribute('role', 'alert');
  caja.innerHTML = `
    <div class="notif-app"><img src="iconos/icon-192.png" alt="">AlertaVecinal · ahora</div>
    <strong></strong><div class="notif-cuerpo"></div>
    <div class="notif-botones">
      <button type="button" class="btn btn-claro btn-chico" data-cerrar>Cerrar</button>
      <a class="btn btn-primario btn-chico" href="${url || './'}">Ver alerta</a>
    </div>`;
  caja.querySelector('strong').textContent = titulo;
  caja.querySelector('.notif-cuerpo').textContent = cuerpo;
  caja.querySelector('[data-cerrar]').addEventListener('click', () => caja.remove());
  document.body.appendChild(caja);
  setTimeout(() => caja.remove(), 12000);
}

/* ---------- Notificación local de prueba (sin servidor) ---------- */
export async function notificacionLocal() {
  if (Notification.permission !== 'granted') throw new Error('Primero concede el permiso.');
  const registro = await registroSW();
  // showNotification(): la muestra el service worker, igual que un push real.
  await registro.showNotification('Prueba de AlertaVecinal', {
    body: 'Robo reportado en Calle 5 de Mayo 120. Toca para ver la alerta.',
    icon: 'iconos/icon-192.png',
    badge: 'iconos/badge-96.png',
    tag: 'prueba-local',
    vibrate: [200, 100, 200],
    data: { url: './' }
  });
}

/* ---------- Interfaz ---------- */
const TEXTO_PERMISO = {
  granted: ['Concedido', 'chip-ok'],
  denied: ['Bloqueado (cámbialo en la configuración del sitio)', 'chip-mal'],
  default: ['Sin decidir', 'chip-espera']
};

function pintarEstado() {
  const permiso = 'Notification' in window ? Notification.permission : 'default';
  const [texto, clase] = TEXTO_PERMISO[permiso];
  document.querySelectorAll('[data-estado-permiso]').forEach((el) => {
    el.textContent = 'Notification' in window ? texto : 'No soportado';
    el.className = `chip ${clase}`;
  });
  if ($('push-token')) $('push-token').textContent = tokenActual || 'Aún no hay token. Pulsa "Activar notificaciones".';
  if ($('btn-copiar-token')) $('btn-copiar-token').disabled = !tokenActual;
}

async function alPulsarActivar(boton) {
  boton.disabled = true;
  try {
    await activarNotificaciones();
    aviso('Notificaciones activadas.', 'ok');
  } catch (error) {
    console.warn('[Push]', error);
    aviso(error.message, 'error', 6000);
  } finally {
    boton.disabled = false;
    pintarEstado();
  }
}

function crearTarjetaPanel() {
  const contenedor = $('panel-modulos');
  if (!contenedor || $('tarjeta-push')) return;
  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta';
  tarjeta.id = 'tarjeta-push';
  tarjeta.innerHTML = `
    <h2>Notificaciones</h2>
    <p class="nota">Recibe un aviso en tu celular cuando un vecino envíe una alerta, aunque tengas la app cerrada.</p>
    <div class="dato"><strong>Permiso</strong><span data-estado-permiso class="chip"></span></div>
    <div class="botonera">
      <button type="button" id="btn-activar-push" class="btn btn-primario">Activar notificaciones</button>
      <a class="btn btn-claro" href="demo-push.html">Ver demo push</a>
    </div>`;
  // Va debajo de "Enviar alerta" (la lista ocupa dos filas a la derecha).
  const lista = $('tarjeta-lista');
  if (lista) lista.after(tarjeta); else contenedor.appendChild(tarjeta);
  $('btn-activar-push').addEventListener('click', (e) => alPulsarActivar(e.currentTarget));
  pintarEstado();
}

function conectarDemoPush() {
  $('btn-permiso')?.addEventListener('click', (e) => alPulsarActivar(e.currentTarget));
  $('btn-copiar-token')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(tokenActual);
    aviso('Token copiado. Pégalo en la consola de Firebase.', 'ok');
  });
  $('btn-local')?.addEventListener('click', async () => {
    try { await notificacionLocal(); aviso('Notificación local enviada.', 'ok'); }
    catch (error) { aviso(error.message, 'error'); }
  });
  $('btn-pagina')?.addEventListener('click', () =>
    mostrarEnPagina('Robo en Calle 5', 'Dos personas forzaron un auto frente al número 120.', './'));
  // Estado del service worker
  registroSW().then((r) => {
    if ($('estado-sw')) $('estado-sw').textContent = r.active ? `Activo (alcance ${new URL(r.scope).pathname})` : 'Instalándose…';
  }).catch(() => { if ($('estado-sw')) $('estado-sw').textContent = 'No registrado'; });
  if ($('soporte-push')) $('soporte-push').textContent = 'PushManager' in window ? 'Sí' : 'No';
  pintarEstado();
}

/* ---------- Arranque ---------- */
window.AV = window.AV || {};
window.AV.push = { activarNotificaciones, mostrarEnPagina, notificacionLocal };

if (enDemoPush) conectarDemoPush();

onSesion(async ({ perfil }) => {
  if (perfil?.estado !== 'aprobado') return;
  agregarMenu({ id: 'menu-push', texto: 'Demo push', href: 'demo-push.html' });
  crearTarjetaPanel();
  // Si ya había permiso, renovamos el token y activamos onMessage en silencio.
  if (!esDemo && !self.FIREBASE_SIN_CONFIGURAR && 'Notification' in window && Notification.permission === 'granted') {
    activarNotificaciones().catch((e) => console.warn('[Push]', e.message));
  }
});
