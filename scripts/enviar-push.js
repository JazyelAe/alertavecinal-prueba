/*
 * enviar-push.js - Envía una notificación push a todos los navegadores
 * registrados en la colección "tokens" de Firestore.
 *
 * Funciona con el plan gratuito Spark (no usa Cloud Functions): se
 * ejecuta en tu computadora con firebase-admin y una clave de cuenta
 * de servicio.
 *
 * Uso:
 *   cd scripts
 *   npm install
 *   node enviar-push.js "Alerta" "Robo en calle 5"
 *   node enviar-push.js "Alerta" "Robo en calle 5" ID_DE_LA_ALERTA   (opcional: abre esa alerta)
 *
 * Necesitas el archivo scripts/serviceAccountKey.json:
 *   Consola de Firebase > Configuración del proyecto > Cuentas de servicio >
 *   "Generar nueva clave privada". ¡NUNCA lo subas a GitHub! (está en .gitignore)
 */
const path = require('path');
const fs = require('fs');
const admin = require('firebase-admin');

const [titulo, cuerpo, alertaId] = process.argv.slice(2);
if (!titulo || !cuerpo) {
  console.error('Uso: node enviar-push.js "Título" "Mensaje" [idDeAlerta]');
  process.exit(1);
}

const rutaClave = path.join(__dirname, 'serviceAccountKey.json');
if (!fs.existsSync(rutaClave)) {
  console.error('No encontré scripts/serviceAccountKey.json. Descárgalo de la consola de Firebase (ver README).');
  process.exit(1);
}

admin.initializeApp({ credential: admin.credential.cert(require(rutaClave)) });
const db = admin.firestore();

async function main() {
  // 1) Leemos todos los tokens guardados por push.js.
  const snap = await db.collection('tokens').get();
  const tokens = snap.docs.map((d) => d.id);
  if (!tokens.length) {
    console.log('No hay tokens registrados. Activa las notificaciones en la app primero.');
    return;
  }
  console.log(`Enviando a ${tokens.length} dispositivo(s)…`);

  // 2) Mensaje de solo datos ("data"): así el service worker (sw-push.js)
  //    decide cómo mostrarlo en segundo plano y onMessage lo recibe en primer plano.
  const url = alertaId ? `./?alerta=${alertaId}` : './';
  const respuesta = await admin.messaging().sendEachForMulticast({
    tokens,
    data: { titulo, cuerpo, url, alertaId: alertaId || '' },
    webpush: { headers: { Urgency: 'high', TTL: '3600' } }
  });

  console.log(`Enviadas: ${respuesta.successCount} · Fallidas: ${respuesta.failureCount}`);

  // 3) Borramos los tokens que ya no sirven (navegador desinstalado o permiso retirado).
  const invalidos = [];
  respuesta.responses.forEach((r, i) => {
    if (!r.success) {
      const codigo = r.error?.code;
      console.log(` - ${tokens[i].slice(0, 20)}…: ${codigo}`);
      if (codigo === 'messaging/registration-token-not-registered' || codigo === 'messaging/invalid-registration-token') {
        invalidos.push(db.collection('tokens').doc(tokens[i]).delete());
      }
    }
  });
  await Promise.all(invalidos);
  if (invalidos.length) console.log(`Se borraron ${invalidos.length} token(s) inválidos.`);
}

main().then(() => process.exit(0)).catch((error) => {
  console.error('Error al enviar:', error.message);
  process.exit(1);
});
