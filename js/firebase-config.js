/*
 * ============================================================
 *  AlertaVecinal - Configuración de Firebase (ÚNICO archivo)
 * ============================================================
 *  Este archivo es un script "clásico" (no módulo) a propósito:
 *  así lo pueden leer tanto las páginas (con <script src>) como
 *  el service worker (con importScripts). Por eso guarda todo
 *  en self.FIREBASE_CONFIG y self.FIREBASE_VAPID_KEY.
 *
 *  CÓMO OBTENER CADA VALOR (consola: https://console.firebase.google.com):
 *
 *  1) Entra a tu proyecto > ícono de engrane (Configuración del
 *     proyecto) > pestaña "General".
 *  2) Baja a "Tus apps". Si no hay una app web, pulsa el ícono </>
 *     ("Agregar app web"), ponle un nombre y regístrala.
 *  3) Firebase te muestra un bloque "const firebaseConfig = {...}".
 *     Copia cada valor en el campo con el mismo nombre de abajo:
 *       apiKey            -> clave pública de la app web
 *       authDomain        -> normalmente  <id-del-proyecto>.firebaseapp.com
 *       projectId         -> el ID del proyecto (lo ves también arriba en "General")
 *       storageBucket     -> <id-del-proyecto>.appspot.com o .firebasestorage.app
 *       messagingSenderId -> número del remitente (también en la pestaña "Cloud Messaging")
 *       appId             -> identificador de la app web (empieza con "1:")
 *
 *  4) CLAVE VAPID (para notificaciones push):
 *     Configuración del proyecto > pestaña "Cloud Messaging" >
 *     sección "Configuración web" > "Certificados push web" >
 *     botón "Generar par de claves". Copia la clave pública
 *     (empieza con "B...") en FIREBASE_VAPID_KEY.
 *
 *  Estos valores NO son secretos: cualquier app web de Firebase
 *  los expone. La seguridad real está en firestore.rules.
 *  Lo que SÍ es secreto es scripts/serviceAccountKey.json
 *  (nunca lo subas a GitHub).
 * ============================================================
 */
self.FIREBASE_CONFIG = {
  apiKey: 'TU_API_KEY',
  authDomain: 'TU_PROYECTO.firebaseapp.com',
  projectId: 'TU_PROYECTO',
  storageBucket: 'TU_PROYECTO.appspot.com',
  messagingSenderId: '000000000000',
  appId: '1:000000000000:web:0000000000000000000000'
};

// Clave pública VAPID de "Certificados push web" (ver punto 4).
self.FIREBASE_VAPID_KEY = 'TU_CLAVE_VAPID_PUBLICA';

// Versión del SDK de Firebase que se carga desde el CDN gstatic.
// Si la cambias, cámbiala también en los import de js/*.js y en sw-push.js.
self.FIREBASE_SDK_VERSION = '10.12.2';

// true mientras no hayas pegado tus claves; la app lo usa para avisarte.
self.FIREBASE_SIN_CONFIGURAR = self.FIREBASE_CONFIG.apiKey.indexOf('TU_') === 0;
