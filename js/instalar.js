/*
 * instalar.js - Botón "Instalar app" usando el evento beforeinstallprompt.
 * Chrome/Edge lanzan ese evento cuando la PWA cumple los requisitos
 * (manifest válido, service worker y HTTPS o localhost).
 */
let eventoInstalacion = null;

const yaInstalada = () =>
  window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;

function crearBoton() {
  let boton = document.getElementById('btn-instalar');
  if (boton) return boton;
  boton = document.createElement('button');
  boton.id = 'btn-instalar';
  boton.type = 'button';
  boton.className = 'btn btn-instalar btn-chico';
  boton.textContent = 'Instalar app';
  boton.hidden = true;
  boton.addEventListener('click', instalar);
  document.getElementById('barra-acciones')?.prepend(boton);
  return boton;
}

async function instalar() {
  if (!eventoInstalacion) return;
  // Muestra el diálogo nativo de instalación.
  eventoInstalacion.prompt();
  const { outcome } = await eventoInstalacion.userChoice;
  console.info('[AlertaVecinal] Instalación:', outcome);
  // El evento solo se puede usar una vez.
  eventoInstalacion = null;
  crearBoton().hidden = true;
}

window.addEventListener('beforeinstallprompt', (e) => {
  // Evita el mini aviso automático del navegador: usaremos nuestro botón.
  e.preventDefault();
  eventoInstalacion = e;
  crearBoton().hidden = false;
});

window.addEventListener('appinstalled', () => {
  eventoInstalacion = null;
  crearBoton().hidden = true;
  window.AV?.aviso?.('¡AlertaVecinal se instaló en tu dispositivo!', 'ok');
});

// iPhone/iPad no tienen beforeinstallprompt: damos la instrucción manual.
const esIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
if (esIOS && !yaInstalada()) {
  const boton = crearBoton();
  boton.hidden = false;
  boton.addEventListener('click', () => window.AV?.aviso?.(
    'En iPhone: toca Compartir y luego "Agregar a pantalla de inicio".', 'info', 7000));
}
