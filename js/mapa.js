/*
 * mapa.js - Mapa de alertas con Leaflet + OpenStreetMap y
 * geocodificación inversa (coordenadas -> dirección) con Nominatim.
 */
import { onSesion } from './auth.js';

const LEAFLET = 'https://unpkg.com/leaflet@1.9.4/dist/';
const CENTRO_INICIAL = [19.0414, -98.2063]; // Puebla, Pue.
let promesaLeaflet = null;
let mapa = null;
let capaMarcadores = null;
const marcadores = new Map();

// Carga Leaflet (CSS y JS) una sola vez, desde el CDN.
export function cargarLeaflet() {
  if (window.L) return Promise.resolve(window.L);
  if (promesaLeaflet) return promesaLeaflet;
  promesaLeaflet = new Promise((resolve, reject) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet';
    css.href = LEAFLET + 'leaflet.css';
    css.crossOrigin = '';
    document.head.appendChild(css);
    const js = document.createElement('script');
    js.src = LEAFLET + 'leaflet.js';
    js.crossOrigin = '';
    js.onload = () => resolve(window.L);
    js.onerror = () => reject(new Error('No se pudo cargar Leaflet'));
    document.head.appendChild(js);
  });
  return promesaLeaflet;
}

// Capa de mosaicos de OpenStreetMap (crossOrigin para que el service worker pueda guardarlos).
export function capaOSM(L) {
  return L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19,
    crossOrigin: true,
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
  });
}

/* ---------- Nominatim: geocodificación inversa ---------- */
const cacheDirecciones = new Map();
export async function direccionDe(lat, lng) {
  const clave = `${lat.toFixed(4)},${lng.toFixed(4)}`;
  if (cacheDirecciones.has(clave)) return cacheDirecciones.get(clave);
  const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}` +
              '&zoom=18&addressdetails=1&accept-language=es';
  const resp = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!resp.ok) throw new Error('Nominatim respondió ' + resp.status);
  const datos = await resp.json();
  const d = datos.address || {};
  // Armamos una dirección corta: calle y número, colonia y ciudad.
  const partes = [
    [d.road, d.house_number].filter(Boolean).join(' '),
    d.suburb || d.neighbourhood,
    d.city || d.town || d.village
  ].filter(Boolean);
  const direccion = partes.length ? partes.join(', ') : datos.display_name;
  cacheDirecciones.set(clave, direccion);
  return direccion;
}

window.AV = window.AV || {};
window.AV.mapa = { cargarLeaflet, capaOSM, direccionDe };

/* ---------- Tarjeta del mapa ---------- */
function crearTarjeta() {
  const contenedor = document.getElementById('panel-modulos');
  if (!contenedor || document.getElementById('tarjeta-mapa')) return null;
  const tarjeta = document.createElement('article');
  tarjeta.className = 'tarjeta ancho-completo';
  tarjeta.id = 'tarjeta-mapa';
  const tipos = window.AV.TIPOS || {};
  tarjeta.innerHTML = `
    <h2>Mapa de alertas</h2>
    <div id="mapa" class="mapa" role="region" aria-label="Mapa de alertas"></div>
    <div class="leyenda">${Object.values(tipos).map((t) =>
      `<span><span class="punto" style="background:${t.color}"></span>${t.nombre}</span>`).join('')}</div>`;
  contenedor.appendChild(tarjeta);
  return tarjeta;
}

function popup(a) {
  const tipo = window.AV.TIPOS?.[a.tipo];
  const div = document.createElement('div');
  const titulo = document.createElement('strong');
  titulo.textContent = tipo?.nombre || a.tipo;
  const texto = document.createElement('div');
  texto.textContent = a.descripcion;
  const lugar = document.createElement('small');
  lugar.textContent = a.direccion || '';
  div.append(titulo, texto, lugar);
  return div;
}

function pintarMarcadores(alertas) {
  if (!mapa) return;
  capaMarcadores.clearLayers();
  marcadores.clear();
  const puntos = [];
  for (const a of alertas) {
    if (typeof a.lat !== 'number' || typeof a.lng !== 'number') continue;
    const color = window.AV.TIPOS?.[a.tipo]?.color || '#6c757d';
    const marcador = window.L.circleMarker([a.lat, a.lng], {
      radius: 9, color: '#fff', weight: 2, fillColor: color, fillOpacity: 0.9
    }).bindPopup(popup(a));
    marcador.addTo(capaMarcadores);
    marcadores.set(a.id, marcador);
    puntos.push([a.lat, a.lng]);
  }
  if (puntos.length && !mapa._ajustado) {
    mapa.fitBounds(puntos, { padding: [30, 30], maxZoom: 16 });
    mapa._ajustado = true;
  }
}

async function iniciarMapa() {
  if (mapa || !crearTarjeta()) return;
  try {
    const L = await cargarLeaflet();
    mapa = L.map('mapa').setView(CENTRO_INICIAL, 14);
    capaOSM(L).addTo(mapa);
    capaMarcadores = L.layerGroup().addTo(mapa);
    pintarMarcadores(window.AV.alertas || []);
  } catch (error) {
    document.getElementById('mapa').textContent = 'El mapa no está disponible sin conexión.';
  }
}

document.addEventListener('av:alertas', (e) => pintarMarcadores(e.detail));
document.addEventListener('av:enfocar', (e) => {
  const a = e.detail;
  if (!mapa) return;
  document.getElementById('tarjeta-mapa').scrollIntoView({ behavior: 'smooth', block: 'center' });
  mapa.setView([a.lat, a.lng], 17);
  marcadores.get(a.id)?.openPopup();
});

onSesion(({ perfil }) => {
  if (perfil?.estado === 'aprobado') {
    iniciarMapa().then(() => mapa?.invalidateSize());
  }
});
