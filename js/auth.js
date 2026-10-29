/*
 * auth.js - Registro, inicio/cierre de sesión y control de acceso.
 * También inicializa Firebase y ofrece utilidades que usan los demás
 * módulos: onSesion(), aviso(), agregarMenu() y los datos de ejemplo
 * del "modo demostración" (?demo=1).
 */
import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {
  getAuth, onAuthStateChanged, createUserWithEmailAndPassword,
  signInWithEmailAndPassword, signOut, updateProfile
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js';
import {
  getFirestore, doc, setDoc, onSnapshot, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';

// Espacio de nombres compartido entre módulos (cada uno agrega lo suyo).
window.AV = window.AV || {};

export const esDemo = new URLSearchParams(location.search).has('demo');
export const sinConfigurar = Boolean(self.FIREBASE_SIN_CONFIGURAR);

export const app = initializeApp(self.FIREBASE_CONFIG);
export const auth = getAuth(app);
export const db = getFirestore(app);

const $ = (id) => document.getElementById(id);

/* ---------------- Utilidades compartidas ---------------- */

// Muestra un aviso flotante (toast) que desaparece solo.
export function aviso(texto, tipo = 'info', ms = 4000) {
  let caja = $('avisos');
  if (!caja) {
    caja = document.createElement('div');
    caja.id = 'avisos';
    caja.className = 'avisos';
    document.body.appendChild(caja);
  }
  const el = document.createElement('div');
  el.className = `aviso ${tipo}`;
  el.textContent = texto;
  caja.appendChild(el);
  setTimeout(() => el.remove(), ms);
}

// Agrega un enlace al menú principal sin tener que editar el HTML.
export function agregarMenu({ id, texto, href }) {
  const menu = $('menu');
  if (!menu || document.getElementById(id)) return null;
  const li = document.createElement('li');
  li.id = id;
  const a = document.createElement('a');
  a.href = href;
  a.textContent = texto;
  if (location.pathname.endsWith('/' + href)) a.classList.add('activo');
  li.appendChild(a);
  menu.appendChild(li);
  return li;
}

// Convierte Timestamp de Firestore, Date o milisegundos a Date.
export function aFecha(valor) {
  if (!valor) return new Date();
  if (typeof valor.toDate === 'function') return valor.toDate();
  return new Date(valor);
}

/* ---------------- Sesión ---------------- */
// estado = { listo, usuario, perfil }  (perfil = documento usuarios/{uid})
let estado = { listo: false, usuario: null, perfil: null };
const oyentes = new Set();

// Los módulos se suscriben aquí; si la sesión ya se conoce, reciben el estado de inmediato.
export function onSesion(callback) {
  oyentes.add(callback);
  if (estado.listo) callback(estado);
  return () => oyentes.delete(callback);
}
export const sesionActual = () => estado;

function publicarEstado(nuevo) {
  estado = { listo: true, ...nuevo };
  window.AV.sesion = estado;
  pintarVistas();
  oyentes.forEach((cb) => { try { cb(estado); } catch (e) { console.error(e); } });
}

export async function cerrarSesion() {
  if (esDemo) { location.href = './'; return; }
  await signOut(auth);
}

/* ---------------- Interfaz (solo si la página tiene esos elementos) ---------------- */
function mostrarVista(id) {
  ['vista-acceso', 'vista-espera', 'vista-panel'].forEach((v) => {
    if ($(v)) $(v).hidden = v !== id;
  });
}

function pintarVistas() {
  const { usuario, perfil } = estado;
  if ($('usuario-nombre')) {
    $('usuario-nombre').hidden = !usuario;
    $('usuario-nombre').textContent = perfil?.nombre || usuario?.email || '';
  }
  if ($('btn-salir')) $('btn-salir').hidden = !usuario;

  if (!usuario) return mostrarVista('vista-acceso');
  if (!perfil || perfil.estado !== 'aprobado') {
    const suspendido = perfil?.estado === 'suspendido';
    if ($('espera-titulo')) {
      $('espera-titulo').textContent = suspendido ? 'Cuenta suspendida' : 'Cuenta pendiente de aprobación';
      $('espera-texto').textContent = suspendido
        ? 'Un administrador suspendió tu cuenta. Comunícate con el comité vecinal.'
        : 'Gracias por registrarte. Un administrador debe aprobar tu cuenta antes de que puedas ver y enviar alertas.';
    }
    return mostrarVista('vista-espera');
  }
  mostrarVista('vista-panel');
}

function mensajeAcceso(texto, ok = false) {
  const el = $('acceso-mensaje');
  if (!el) return;
  el.hidden = !texto;
  el.textContent = texto;
  el.classList.toggle('ok', ok);
}

// Traduce los códigos de error de Firebase Auth a mensajes claros.
function traducirError(error) {
  const mensajes = {
    'auth/invalid-email': 'El correo no es válido.',
    'auth/email-already-in-use': 'Ese correo ya está registrado.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
    'auth/invalid-credential': 'Correo o contraseña incorrectos.',
    'auth/wrong-password': 'Correo o contraseña incorrectos.',
    'auth/user-not-found': 'Correo o contraseña incorrectos.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos.',
    'auth/network-request-failed': 'Sin conexión a internet.',
    'auth/api-key-not-valid.-please-pass-a-valid-api-key.': 'Falta configurar Firebase en js/firebase-config.js.'
  };
  return mensajes[error.code] || `Ocurrió un error (${error.code || error.message}).`;
}

function conectarFormularios() {
  // Pestañas login / registro
  document.querySelectorAll('.pestana').forEach((boton) => {
    boton.addEventListener('click', () => {
      document.querySelectorAll('.pestana').forEach((b) => b.classList.toggle('activa', b === boton));
      document.querySelectorAll('[data-panel]').forEach((f) => { f.hidden = f.dataset.panel !== boton.dataset.pestana; });
      mensajeAcceso('');
    });
  });

  $('form-login')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (esDemo) return iniciarDemo();
    try {
      await signInWithEmailAndPassword(auth, $('login-correo').value.trim(), $('login-clave').value);
      mensajeAcceso('');
    } catch (error) {
      mensajeAcceso(traducirError(error));
    }
  });

  $('form-registro')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (esDemo) return mensajeAcceso('En modo demostración no se crean cuentas.', true);
    const datos = {
      nombre: $('reg-nombre').value.trim(),
      correo: $('reg-correo').value.trim().toLowerCase(),
      calle: $('reg-calle').value.trim(),
      numero: $('reg-numero').value.trim()
    };
    try {
      const cred = await createUserWithEmailAndPassword(auth, datos.correo, $('reg-clave').value);
      await updateProfile(cred.user, { displayName: datos.nombre });
      // Todo usuario nuevo nace como "vecino" y "pendiente" (las reglas lo exigen).
      await setDoc(doc(db, 'usuarios', cred.user.uid), {
        ...datos, rol: 'vecino', estado: 'pendiente', creado: serverTimestamp()
      });
    } catch (error) {
      mensajeAcceso(traducirError(error));
    }
  });

  $('btn-salir')?.addEventListener('click', cerrarSesion);
  $('btn-salir-espera')?.addEventListener('click', cerrarSesion);
}

/* ---------------- Modo demostración (?demo=1) ---------------- */
// Genera datos de ejemplo fijos (siempre los mismos) alrededor de Puebla.
function generarDatosDemo() {
  let semilla = 7;
  const azar = () => ((semilla = (semilla * 9301 + 49297) % 233280) / 233280);
  const calles = [
    ['Av. Reforma', 19.0446, -98.2009], ['Calle 5 de Mayo', 19.0437, -98.1981],
    ['Av. Juárez', 19.0505, -98.2118], ['Calle 16 de Septiembre', 19.0403, -98.1985],
    ['Blvd. 5 de Mayo', 19.0388, -98.1902], ['Calle 11 Sur', 19.0356, -98.2051],
    ['Av. 31 Poniente', 19.0331, -98.2167], ['Calle 3 Norte', 19.0479, -98.2024]
  ];
  const pesos = [0, 0, 0, 1, 1, 2, 3, 4, 5, 5, 6, 7];
  const tipos = ['robo', 'robo', 'robo', 'medica', 'gas', 'otro', 'robo', 'medica'];
  const textos = {
    robo: ['Intentaron forzar la puerta de un auto', 'Robo de celular a una señora', 'Dos sujetos revisando casas', 'Se llevaron una bicicleta del portón'],
    medica: ['Adulto mayor desmayado en la banqueta', 'Vecino con dolor en el pecho, ya viene la ambulancia', 'Niño con golpe en la cabeza'],
    gas: ['Fuerte olor a gas en el edificio', 'Fuga en tanque estacionario'],
    otro: ['Poste de luz caído', 'Perro agresivo suelto', 'Cortocircuito en transformador']
  };
  const nombres = ['María López', 'Juan Pérez', 'Ana Torres', 'Luis Ramírez', 'Sofía Hernández'];
  const ahora = Date.now();
  const alertas = [];
  for (let i = 0; i < 46; i++) {
    const [calle, lat, lng] = calles[pesos[Math.floor(azar() * pesos.length)]];
    const tipo = tipos[Math.floor(azar() * tipos.length)];
    const lista = textos[tipo];
    alertas.push({
      id: `demo-${i}`,
      tipo,
      descripcion: lista[Math.floor(azar() * lista.length)],
      lat: lat + (azar() - 0.5) * 0.004,
      lng: lng + (azar() - 0.5) * 0.004,
      direccion: `${calle} ${Math.floor(azar() * 300) + 1}, Centro, Puebla`,
      uid: 'demo',
      nombre: nombres[Math.floor(azar() * nombres.length)],
      // minutos hacia atrás: la primera es de hace 4 min y las demás se reparten en ~40 días
      creado: new Date(ahora - (i === 0 ? 4 : i * i * 28 + azar() * 500) * 60 * 1000)
    });
  }
  const usuarios = [
    { id: 'demo', nombre: 'María López (demo)', correo: 'maria@ejemplo.mx', calle: 'Av. Reforma', numero: '123', rol: 'admin', estado: 'aprobado' },
    { id: 'u2', nombre: 'Juan Pérez', correo: 'juan@ejemplo.mx', calle: 'Calle 5 de Mayo', numero: '45', rol: 'vecino', estado: 'aprobado' },
    { id: 'u3', nombre: 'Ana Torres', correo: 'ana@ejemplo.mx', calle: 'Av. Juárez', numero: '210', rol: 'vecino', estado: 'pendiente' },
    { id: 'u4', nombre: 'Luis Ramírez', correo: 'luis@ejemplo.mx', calle: 'Calle 11 Sur', numero: '9', rol: 'vecino', estado: 'pendiente' },
    { id: 'u5', nombre: 'Sofía Hernández', correo: 'sofia@ejemplo.mx', calle: 'Calle 3 Norte', numero: '77', rol: 'vecino', estado: 'suspendido' }
  ];
  return { alertas, usuarios };
}
export const datosDemo = esDemo ? generarDatosDemo() : { alertas: [], usuarios: [] };

function iniciarDemo() {
  publicarEstado({
    usuario: { uid: 'demo', email: 'maria@ejemplo.mx' },
    perfil: { ...datosDemo.usuarios[0] }
  });
}

/* ---------------- Arranque ---------------- */
conectarFormularios();
window.AV.aviso = aviso;
window.AV.agregarMenu = agregarMenu;

if (esDemo) {
  if ($('aviso-demo')) $('aviso-demo').hidden = false;
  // En modo demo, los enlaces internos conservan ?demo=1.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href]');
    if (!a || a.origin !== location.origin || a.search.includes('demo') || a.textContent.includes('Salir')) return;
    a.search = a.search ? a.search + '&demo=1' : '?demo=1';
  }, true);
  iniciarDemo();
} else {
  if (sinConfigurar && $('aviso-config')) $('aviso-config').hidden = false;
  let dejarDeEscucharPerfil = null;
  onAuthStateChanged(auth, (usuario) => {
    if (dejarDeEscucharPerfil) { dejarDeEscucharPerfil(); dejarDeEscucharPerfil = null; }
    if (!usuario) return publicarEstado({ usuario: null, perfil: null });
    // Escuchamos el perfil en tiempo real: si el admin lo aprueba, el panel se abre solo.
    dejarDeEscucharPerfil = onSnapshot(doc(db, 'usuarios', usuario.uid),
      (snap) => publicarEstado({ usuario, perfil: snap.exists() ? { id: snap.id, ...snap.data() } : null }),
      (error) => {
        console.error('No se pudo leer el perfil:', error);
        publicarEstado({ usuario, perfil: null });
      });
  });
}
