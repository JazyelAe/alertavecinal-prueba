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
  apiKey: 'AIzaSyDnvwb3t6YDEEkExLOAbLgeNV8CAw_vJJY',
  authDomain: 'alertavecinal-10d.firebaseapp.com',
  projectId: 'alertavecinal-10d',
  storageBucket: 'alertavecinal-10d.firebasestorage.app',
  messagingSenderId: '111909253533',
  appId: '1:111909253533:web:b5dec4992f624134547f74'
};

// Clave pública VAPID de "Certificados push web" (ver punto 4).
self.FIREBASE_VAPID_KEY = 'BEFD_zaPqy1YzE3_q18I_C9ibz7r5GelYVdC5g7c-zNBklHPwSl_iSUGCHw-qFBG_7H1joUczpiAw4xI6TEfGdM';

// URL del intermediario de push en Google Apps Script (scripts/apps-script/Codigo.gs).
// Se obtiene en script.google.com > Implementar > Nueva implementación > Aplicación web
// y termina en "/exec". Vacío = sin push real desde la app (solo con la app abierta).
self.PUSH_ENDPOINT = 'https://script.google.com/macros/s/AKfycbxqImyfceIM-ht2TR2ngo1n-JTcGhuAjIOG3j8KqFmgaBYN3jhw-ZUA6v9E1HUg2TF9/exec';

// Versión del SDK de Firebase que se carga desde el CDN gstatic.
// Si la cambias, cámbiala también en los import de js/*.js y en sw-push.js.
self.FIREBASE_SDK_VERSION = '10.12.2';

// true mientras no hayas pegado tus claves; la app lo usa para avisarte.
self.FIREBASE_SIN_CONFIGURAR = self.FIREBASE_CONFIG.apiKey.indexOf('TU_') === 0;
