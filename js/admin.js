/*
 * admin.js - Panel de administración de usuarios.
 * En index.html solo agrega el enlace "Administración" al menú (si eres admin).
 * En admin.html lista a los usuarios y permite aprobar, suspender,
 * cambiar el rol y eliminar.
 */
import {
  collection, doc, onSnapshot, updateDoc, deleteDoc, addDoc, serverTimestamp
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { db, esDemo, datosDemo, onSesion, aviso, agregarMenu } from './auth.js';

const $ = (id) => document.getElementById(id);
const enPaginaAdmin = Boolean($('tabla-usuarios'));
let usuarios = [];
let filtro = 'todos';
let dejarDeEscuchar = null;
let miUid = null;

const ETIQUETA_ESTADO = {
  aprobado: '<span class="chip chip-ok">Aprobado</span>',
  pendiente: '<span class="chip chip-espera">Pendiente</span>',
  suspendido: '<span class="chip chip-mal">Suspendido</span>'
};

/* ---------- Acciones ---------- */
async function cambiar(uid, cambios, mensaje) {
  try {
    if (esDemo) {
      usuarios = usuarios.map((u) => (u.id === uid ? { ...u, ...cambios } : u));
      pintar();
    } else {
      await updateDoc(doc(db, 'usuarios', uid), cambios);
    }
    aviso(mensaje, 'ok');
  } catch (error) {
    console.error(error);
    aviso('No tienes permiso o hubo un error.', 'error');
  }
}

async function eliminar(u) {
  if (!confirm(`¿Eliminar a ${u.nombre}? Se borrará su perfil de AlertaVecinal.`)) return;
  try {
    if (esDemo) {
      usuarios = usuarios.filter((x) => x.id !== u.id);
      pintar();
    } else {
      // Borra el perfil en Firestore. Sin perfil, la persona ya no puede entrar al panel.
      // (La cuenta de Authentication se borra a mano en la consola: no usamos Cloud Functions.)
      await deleteDoc(doc(db, 'usuarios', u.id));
    }
    aviso('Usuario eliminado.', 'ok');
  } catch (error) {
    console.error(error);
    aviso('No se pudo eliminar.', 'error');
  }
}

function boton(texto, clase, accion) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `btn btn-chico ${clase}`;
  b.textContent = texto;
  b.addEventListener('click', accion);
  return b;
}

/* ---------- Tabla ---------- */
function pintar() {
  const cuerpo = $('tabla-usuarios');
  const visibles = usuarios
    .filter((u) => filtro === 'todos' || u.estado === filtro)
    .sort((a, b) => (a.estado === 'pendiente' ? -1 : 1) - (b.estado === 'pendiente' ? -1 : 1));
  $('conteo-pendientes').textContent = usuarios.filter((u) => u.estado === 'pendiente').length;
  cuerpo.innerHTML = '';
  if (!visibles.length) {
    cuerpo.innerHTML = '<tr><td colspan="5" class="nota">No hay usuarios con este filtro.</td></tr>';
    return;
  }
  for (const u of visibles) {
    const tr = document.createElement('tr');
    const nombre = document.createElement('td');
    nombre.innerHTML = '<strong></strong><br><small class="nota"></small>';
    nombre.querySelector('strong').textContent = u.nombre;
    nombre.querySelector('small').textContent = u.correo;
    const domicilio = document.createElement('td');
    domicilio.textContent = `${u.calle || ''} ${u.numero || ''}`;
    const rol = document.createElement('td');
    rol.innerHTML = `<span class="chip">${u.rol === 'admin' ? 'Admin' : 'Vecino'}</span>`;
    const estado = document.createElement('td');
    estado.innerHTML = ETIQUETA_ESTADO[u.estado] || u.estado;

    const acciones = document.createElement('td');
    const caja = document.createElement('div');
    caja.className = 'acciones';
    const soyYo = u.id === miUid;
    if (u.estado !== 'aprobado') caja.appendChild(boton('Aprobar', 'btn-verde', () => cambiar(u.id, { estado: 'aprobado' }, `${u.nombre} fue aprobado.`)));
    if (u.estado === 'aprobado' && !soyYo) caja.appendChild(boton('Suspender', 'btn-claro', () => cambiar(u.id, { estado: 'suspendido' }, `${u.nombre} fue suspendido.`)));
    if (!soyYo) {
      const nuevoRol = u.rol === 'admin' ? 'vecino' : 'admin';
      caja.appendChild(boton(nuevoRol === 'admin' ? 'Hacer admin' : 'Quitar admin', 'btn-claro',
        () => cambiar(u.id, { rol: nuevoRol }, `Rol de ${u.nombre}: ${nuevoRol}.`)));
      caja.appendChild(boton('Eliminar', 'btn-peligro', () => eliminar(u)));
    } else {
      caja.innerHTML = '<span class="nota">(tú)</span>';
    }
    acciones.appendChild(caja);
    tr.append(nombre, domicilio, rol, estado, acciones);
    cuerpo.appendChild(tr);
  }
}

function escucharUsuarios() {
  if (esDemo) {
    usuarios = datosDemo.usuarios.map((u) => ({ ...u }));
    return pintar();
  }
  dejarDeEscuchar = onSnapshot(collection(db, 'usuarios'), (snap) => {
    usuarios = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
    pintar();
  }, (error) => {
    console.error(error);
    aviso('No se pudo leer la lista de usuarios.', 'error');
  });
}

/* ---------- Avisos a todos los vecinos ---------- */
// Se guardan en la colección "avisos"; push.js de cada vecino los escucha
// en tiempo real y muestra la notificación (no requiere servidor).
async function enviarAviso(e) {
  e.preventDefault();
  const { usuario, perfil } = window.AV.sesion || {};
  const titulo = $('aviso-titulo').value.trim();
  const mensaje = $('aviso-mensaje').value.trim();
  const boton = $('btn-enviar-aviso');
  boton.disabled = true;
  try {
    if (!esDemo) {
      await addDoc(collection(db, 'avisos'), {
        titulo, mensaje, uid: usuario.uid, autor: perfil?.nombre || usuario.email, creado: serverTimestamp()
      });
    }
    aviso(esDemo ? 'Modo demo: el aviso no se envía a nadie.' : 'Aviso enviado a todos los vecinos.', 'ok');
    e.target.reset();
  } catch (error) {
    console.error(error);
    aviso('No se pudo enviar el aviso. Revisa las reglas de Firestore.', 'error');
  } finally {
    boton.disabled = false;
  }
}

/* ---------- Arranque ---------- */
if (enPaginaAdmin) {
  $('form-aviso')?.addEventListener('submit', enviarAviso);
  document.querySelectorAll('[data-filtro]').forEach((b) => b.addEventListener('click', () => {
    filtro = b.dataset.filtro;
    document.querySelectorAll('[data-filtro]').forEach((x) => x.classList.toggle('btn-primario', x === b));
    pintar();
  }));
}

onSesion(({ usuario, perfil }) => {
  const esAdmin = perfil?.rol === 'admin' && perfil?.estado === 'aprobado';
  miUid = usuario?.uid || null;
  if (esAdmin) agregarMenu({ id: 'menu-admin', texto: 'Administración', href: 'admin.html' + (esDemo ? '?demo=1' : '') });
  else $('menu-admin')?.remove();

  if (!enPaginaAdmin) return;
  $('admin-sin-permiso').hidden = esAdmin;
  $('admin-contenido').hidden = !esAdmin;
  if ($('admin-avisos')) $('admin-avisos').hidden = !esAdmin;
  if (esAdmin && !dejarDeEscuchar && !usuarios.length) escucharUsuarios();
  if (!esAdmin && dejarDeEscuchar) { dejarDeEscuchar(); dejarDeEscuchar = null; usuarios = []; }
});
