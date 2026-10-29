/*
 * alertas.js - Enviar alertas y verlas en una lista en tiempo real.
 * Publica el evento "av:alertas" (document) cada vez que cambia la lista,
 * para que el mapa, el mapa de calor y otros módulos se actualicen.
 */
import {
  collection, doc, setDoc, onSnapshot, query, orderBy, limit, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, esDemo, datosDemo, onSesion, aviso, aFecha } from './auth.js';

// Catálogo de tipos (lo reutilizan mapa.js, heatmap.js y estadisticas.js).
export const TIPOS = {
  robo: { nombre: 'Robo', color: '#d62828' },
  medica: { nombre: 'Emergencia médica', color: '#1d70b8' },
  gas: { nombre: 'Fuga de gas', color: '#f08c00' },
  otro: { nombre: 'Otro', color: '#6c757d' }
};
window.AV.TIPOS = TIPOS;

const $ = (id) => document.getElementById(id);
let alertas = [];
let ubicacion = null;          // { lat, lng, direccion }
let dejarDeEscuchar = null;
const idResaltada = new URLSearchParams(location.search).get('alerta');

/* ---------- Publicar (lo usa también offline-sync.js) ---------- */
// Guarda una alerta con un id propio; así, si se reintenta, no se duplica.
export async function publicarAlerta(datos, id = doc(collection(db, 'alertas')).id) {
  if (esDemo) {
    alertas = [{ id, ...datos, creado: new Date() }, ...alertas];
    return notificarCambio();
  }
  await setDoc(doc(db, 'alertas', id), { ...datos, creado: serverTimestamp() });
  // Si existe el módulo de push, avisa a los demás celulares (sin esperar la respuesta).
  window.AV.push?.enviarPushReal?.('alerta', id);
}
window.AV.alertasApi = { publicarAlerta, TIPOS };

function notificarCambio() {
  window.AV.alertas = alertas;
  pintarLista();
  document.dispatchEvent(new CustomEvent('av:alertas', { detail: alertas }));
}

/* ---------- Lista ---------- */
function tiempoRelativo(fecha) {
  const min = Math.round((Date.now() - fecha.getTime()) / 60000);
  if (min < 1) return 'justo ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  return fecha.toLocaleDateString('es-MX', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function pintarLista() {
  const lista = $('lista-alertas');
  if (!lista) return;
  if ($('contador-alertas')) $('contador-alertas').textContent = alertas.length;
  lista.innerHTML = '';
  if (!alertas.length) {
    lista.innerHTML = '<li class="vacio">Aún no hay alertas. ¡Ojalá siga así!</li>';
    return;
  }
  for (const a of alertas.slice(0, 50)) {
    const tipo = TIPOS[a.tipo] || TIPOS.otro;
    const li = document.createElement('li');
    li.className = `alerta ${a.tipo}`;
    li.id = `alerta-${a.id}`;
    if (a.id === idResaltada) li.classList.add('resaltada');

    const cabeza = document.createElement('div');
    cabeza.className = 'alerta-cabeza';
    const titulo = document.createElement('span');
    titulo.className = 'alerta-tipo';
    titulo.innerHTML = `<span class="punto" style="background:${tipo.color}"></span>`;
    titulo.append(tipo.nombre);
    const hora = document.createElement('span');
    hora.className = 'alerta-meta';
    hora.textContent = tiempoRelativo(aFecha(a.creado));
    cabeza.append(titulo, hora);

    const texto = document.createElement('div');
    texto.textContent = a.descripcion;
    const meta = document.createElement('div');
    meta.className = 'alerta-meta';
    meta.textContent = `${a.direccion || 'Sin dirección'} · ${a.nombre || 'Vecino'}`;
    li.append(cabeza, texto, meta);

    if (typeof a.lat === 'number') {
      const acciones = document.createElement('div');
      acciones.className = 'alerta-acciones';
      const verMapa = document.createElement('button');
      verMapa.type = 'button';
      verMapa.className = 'btn btn-claro btn-chico';
      verMapa.textContent = 'Ver en el mapa';
      verMapa.addEventListener('click', () =>
        document.dispatchEvent(new CustomEvent('av:enfocar', { detail: a })));
      acciones.appendChild(verMapa);
      li.appendChild(acciones);
    }
    lista.appendChild(li);
  }
  // Si llegamos desde una notificación (?alerta=ID), la mostramos.
  if (idResaltada) $(`alerta-${idResaltada}`)?.scrollIntoView({ block: 'center' });
}

function escucharAlertas() {
  if (esDemo) {
    alertas = [...datosDemo.alertas];
    return notificarCambio();
  }
  // onSnapshot: Firestore nos avisa cada vez que se crea o cambia una alerta.
  const consulta = query(collection(db, 'alertas'), orderBy('creado', 'desc'), limit(200));
  dejarDeEscuchar = onSnapshot(consulta, (snap) => {
    alertas = snap.docs.map((d) => ({ id: d.id, ...d.data({ serverTimestamps: 'estimate' }) }));
    notificarCambio();
  }, (error) => {
    console.error('Error al escuchar alertas:', error);
    aviso('No se pudieron cargar las alertas.', 'error');
  });
}

/* ---------- Ubicación ---------- */
function obtenerUbicacion() {
  const texto = $('alerta-ubicacion-texto');
  if (!('geolocation' in navigator)) {
    texto.textContent = 'Tu navegador no permite obtener la ubicación.';
    return;
  }
  texto.textContent = 'Buscando tu ubicación…';
  // API de geolocalización del navegador (pide permiso al usuario).
  navigator.geolocation.getCurrentPosition(async (pos) => {
    const lat = pos.coords.latitude;
    const lng = pos.coords.longitude;
    ubicacion = { lat, lng, direccion: `${lat.toFixed(5)}, ${lng.toFixed(5)}` };
    texto.textContent = ubicacion.direccion;
    // Si el módulo del mapa está cargado, convertimos coordenadas en dirección (Nominatim).
    if (window.AV.mapa?.direccionDe && navigator.onLine) {
      try {
        ubicacion.direccion = await window.AV.mapa.direccionDe(lat, lng);
        texto.textContent = ubicacion.direccion;
      } catch { /* nos quedamos con las coordenadas */ }
    }
  }, (error) => {
    texto.textContent = error.code === 1
      ? 'Permiso de ubicación denegado. Actívalo para enviar alertas.'
      : 'No se pudo obtener la ubicación. Intenta de nuevo.';
  }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
}

async function enviarAlerta(e) {
  e.preventDefault();
  const { usuario, perfil } = window.AV.sesion || {};
  if (!ubicacion) {
    aviso('Primero pulsa "Obtener mi ubicación".', 'error');
    return;
  }
  const datos = {
    tipo: $('alerta-tipo').value,
    descripcion: $('alerta-descripcion').value.trim(),
    lat: ubicacion.lat,
    lng: ubicacion.lng,
    direccion: ubicacion.direccion,
    uid: usuario.uid,
    nombre: perfil?.nombre || usuario.email
  };
  const boton = $('btn-enviar-alerta');
  boton.disabled = true;
  try {
    // Sin internet: si existe el módulo "Alerta sin señal", la guarda para enviarla después.
    if (!navigator.onLine && window.AV.offline?.encolar) {
      await window.AV.offline.encolar(datos);
    } else {
      await publicarAlerta(datos);
      aviso('Alerta enviada a tus vecinos.', 'ok');
    }
    e.target.reset();
    ubicacion = null;
    $('alerta-ubicacion-texto').textContent = 'Sin ubicación todavía';
  } catch (error) {
    console.error(error);
    aviso('No se pudo enviar la alerta. Revisa tu conexión.', 'error');
  } finally {
    boton.disabled = false;
  }
}

/* ---------- Arranque ---------- */
$('btn-ubicacion')?.addEventListener('click', obtenerUbicacion);
$('form-alerta')?.addEventListener('submit', enviarAlerta);

onSesion(({ perfil }) => {
  const aprobado = perfil?.estado === 'aprobado';
  if (aprobado && !dejarDeEscuchar && !alertas.length) escucharAlertas();
  if (!aprobado && dejarDeEscuchar) {
    dejarDeEscuchar();
    dejarDeEscuchar = null;
    alertas = [];
    notificarCambio();
  }
});
