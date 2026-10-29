/*
 * estadisticas.js - Aportación "Vecino Verificado Pro" (maqueta).
 * Panel de estadísticas para comités vecinales y fraccionamientos:
 * indicadores, gráficas, calles con más incidentes y avisos a la caseta.
 * Es una pantalla de demostración: NO cobra ni envía nada real.
 * Toma las alertas que publica alertas.js con el evento "av:alertas".
 */
import { onSesion, aviso, agregarMenu, aFecha } from './auth.js';

const $ = (id) => document.getElementById(id);
const enPanel = Boolean($('pro-panel'));
const DIAS = 30;

const TIPOS_RESPALDO = {
  robo: { nombre: 'Robo', color: '#d62828' }, medica: { nombre: 'Emergencia médica', color: '#1d70b8' },
  gas: { nombre: 'Fuga de gas', color: '#f08c00' }, otro: { nombre: 'Otro', color: '#6c757d' }
};
const tipos = () => window.AV.TIPOS || TIPOS_RESPALDO;
const calleDe = (dir = '') => dir.split(',')[0].replace(/\s+\d+\w*$/, '').trim() || 'Sin calle';

function contar(lista, clave) {
  const conteo = {};
  lista.forEach((x) => { const k = clave(x); conteo[k] = (conteo[k] || 0) + 1; });
  return Object.entries(conteo).sort((a, b) => b[1] - a[1]);
}

function pintarBarrasTipo(lista) {
  const conteo = Object.fromEntries(contar(lista, (a) => a.tipo));
  const max = Math.max(1, ...Object.values(conteo));
  $('graf-tipos').innerHTML = Object.entries(tipos()).map(([k, t]) => `
    <div class="barra-h">
      <span>${t.nombre}</span>
      <div class="pista"><div class="relleno" style="width:${((conteo[k] || 0) / max) * 100}%;background:${t.color}"></div></div>
      <strong>${conteo[k] || 0}</strong>
    </div>`).join('');
}

// Gráfica de columnas en SVG (sin librerías) por franjas de 3 horas.
function pintarHoras(lista) {
  const franjas = new Array(8).fill(0);
  lista.forEach((a) => { franjas[Math.floor(aFecha(a.creado).getHours() / 3)]++; });
  const max = Math.max(1, ...franjas);
  const ancho = 320, alto = 150, col = ancho / 8;
  const barras = franjas.map((n, i) => {
    const h = (n / max) * (alto - 42);
    const color = n === max ? '#e63946' : '#457b9d';
    return `<rect x="${i * col + 6}" y="${alto - 20 - h}" width="${col - 12}" height="${h}" rx="4" fill="${color}"/>
      <text x="${i * col + col / 2}" y="${alto - 24 - h}" font-size="10" text-anchor="middle" fill="#1f2933">${n}</text>
      <text x="${i * col + col / 2}" y="${alto - 6}" font-size="9" text-anchor="middle" fill="#5f6b7a">${String(i * 3).padStart(2, '0')}h</text>`;
  }).join('');
  $('graf-horas').innerHTML = `<svg viewBox="0 0 ${ancho} ${alto}" width="100%" role="img" aria-label="Alertas por horario">${barras}</svg>`;
}

function pintarCalles(lista) {
  const top = contar(lista, (a) => calleDe(a.direccion)).slice(0, 5);
  const max = top[0]?.[1] || 1;
  $('tabla-calles').innerHTML = top.map(([calle, n]) => {
    const nivel = n / max > 0.66 ? ['Alto', 'chip-mal'] : n / max > 0.33 ? ['Medio', 'chip-espera'] : ['Bajo', 'chip-ok'];
    return `<tr><td>${calle.replace(/</g, '&lt;')}</td><td>${n}</td><td><span class="chip ${nivel[1]}">${nivel[0]}</span></td></tr>`;
  }).join('') || '<tr><td colspan="3" class="nota">Sin datos.</td></tr>';
}

function pintarCaseta(lista) {
  const urgentes = lista.filter((a) => a.tipo === 'robo' || a.tipo === 'gas').slice(0, 4);
  $('kpi-caseta').textContent = lista.filter((a) => a.tipo === 'robo' || a.tipo === 'gas').length;
  $('lista-caseta').innerHTML = urgentes.map((a) => {
    const f = aFecha(a.creado);
    return `<li><span>${tipos()[a.tipo]?.nombre || a.tipo} · ${calleDe(a.direccion).replace(/</g, '&lt;')}</span>
      <span class="nota">${f.toLocaleDateString('es-MX', { day: 'numeric', month: 'short' })} ${f.toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} · recibido</span></li>`;
  }).join('') || '<li>Sin avisos.</li>';
}

function pintar(todas) {
  const limite = Date.now() - DIAS * 864e5;
  const lista = todas.filter((a) => aFecha(a.creado).getTime() >= limite);
  const anteriores = todas.filter((a) => {
    const t = aFecha(a.creado).getTime();
    return t < limite && t >= limite - DIAS * 864e5;
  });
  $('kpi-total').textContent = lista.length;
  const cambio = anteriores.length ? Math.round(((lista.length - anteriores.length) / anteriores.length) * 100) : null;
  $('kpi-cambio').textContent = cambio === null ? 'primer periodo' : `${cambio > 0 ? '+' : ''}${cambio}% vs. periodo anterior`;
  const [tipoTop, nTop] = contar(lista, (a) => a.tipo)[0] || [];
  $('kpi-tipo').textContent = tipoTop ? tipos()[tipoTop]?.nombre.split(' ')[0] : '—';
  $('kpi-tipo-pct').textContent = tipoTop ? `${Math.round((nTop / lista.length) * 100)}% del total` : '';
  $('kpi-vecinos').textContent = new Set(lista.map((a) => a.nombre)).size;
  pintarBarrasTipo(lista);
  pintarHoras(lista);
  pintarCalles(lista);
  pintarCaseta(lista);
}

/* ---------- Arranque ---------- */
if (enPanel) {
  document.addEventListener('av:alertas', (e) => pintar(e.detail));
  $('btn-reporte').addEventListener('click', () => {
    aviso('Maqueta: en el plan de pago aquí se generaría el reporte mensual en PDF.', 'info', 5000);
    setTimeout(() => window.print(), 600);
  });
  $('btn-caseta').addEventListener('click', () =>
    aviso('Maqueta: la caseta recibiría esta alerta en su tableta al instante.', 'ok', 5000));
}

onSesion(({ perfil }) => {
  const aprobado = perfil?.estado === 'aprobado';
  if (aprobado) agregarMenu({ id: 'menu-pro', texto: 'Panel Pro', href: 'estadisticas.html' });
  if (!enPanel) return;
  $('pro-sin-sesion').hidden = aprobado;
  $('pro-panel').hidden = !aprobado;
  if (aprobado && window.AV.alertas) pintar(window.AV.alertas);
});
