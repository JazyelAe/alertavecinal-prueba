# AlertaVecinal

Red de seguridad vecinal hecha como **Aplicación Web Progresiva (PWA)**. Los vecinos se registran, un
administrador los aprueba y cualquier vecino aprobado puede enviar una alerta (robo, emergencia médica,
fuga de gas u otro) con su ubicación. Las alertas aparecen en tiempo real en una lista, en un mapa y como
notificación push.

- Frontend: HTML, CSS y JavaScript puro (sin frameworks ni compilación).
- Backend: Firebase plan gratuito **Spark**: Authentication, Firestore, Cloud Messaging y Hosting (sin Cloud Functions).
- Mapas: Leaflet + OpenStreetMap. Direcciones: Nominatim.

> ¿Quieres verla sin configurar nada? Abre la app con `?demo=1` al final de la dirección
> (por ejemplo `http://localhost:3000/?demo=1`). Usa datos de ejemplo y no guarda nada en Firebase.

---

## Índice

1. [Estructura del proyecto](#1-estructura-del-proyecto)
2. [Crear el proyecto en Firebase](#2-crear-el-proyecto-en-firebase)
3. [Poner tus claves en la app](#3-poner-tus-claves-en-la-app)
4. [Correr la app en tu computadora](#4-correr-la-app-en-tu-computadora)
5. [Crear el primer administrador](#5-crear-el-primer-administrador)
6. [Publicar en internet (deploy)](#6-publicar-en-internet-deploy)
7. [Notificaciones push de prueba](#7-notificaciones-push-de-prueba)
8. [Probar en clase la caché y el modo offline](#8-probar-en-clase-la-caché-y-el-modo-offline)
9. [Regenerar los reportes PDF](#9-regenerar-los-reportes-pdf)
10. [Problemas comunes](#10-problemas-comunes)

---

## 1. Estructura del proyecto

```
PWA/
├── index.html            Página principal (acceso, panel, lista y mapas)
├── admin.html            Panel de administración de usuarios
├── demo-cache.html       Demostración de los métodos de la API Cache
├── demo-push.html        Demostración de notificaciones push
├── estadisticas.html     Maqueta del panel "Vecino Verificado Pro"
├── offline.html          Página de respaldo sin conexión
├── manifest.json         Manifiesto de la PWA
├── sw.js                 Service worker: caché (install, activate, fetch)
├── sw-push.js            Service worker: push (lo carga sw.js)
├── sw-sync.js            Service worker: Background Sync de "Alerta sin señal"
├── firebase.json         Configuración de Firebase Hosting y Firestore
├── firestore.rules       Reglas de seguridad
├── css/estilos.css
├── iconos/               Íconos 192, 512, maskable y badge
├── js/
│   ├── firebase-config.js   ← AQUÍ VAN TUS CLAVES
│   ├── auth.js              Registro, login, roles, utilidades
│   ├── app.js               Registra el service worker
│   ├── alertas.js           Enviar alertas y lista en tiempo real
│   ├── mapa.js              Mapa Leaflet + Nominatim
│   ├── admin.js             Gestión de usuarios
│   ├── push.js              Permiso, token FCM y onMessage
│   ├── cache-demo.js        Botones de demo-cache.html
│   ├── offline-sync.js      Aportación "Alerta sin señal"
│   ├── heatmap.js           Aportación "Mapa de calor"
│   ├── instalar.js          Botón "Instalar app"
│   └── estadisticas.js      Aportación "Vecino Verificado Pro"
├── scripts/
│   ├── enviar-push.js    Envía push a todos los tokens (firebase-admin)
│   └── package.json
├── entregables/          Los 3 PDF y la guía del repositorio
└── reportes/             Herramientas locales (pruebas y PDF). No se suben a GitHub.
```

Cada módulo de `js/` es independiente: si uno falta, la app sigue funcionando.

---

## 2. Crear el proyecto en Firebase

Necesitas una cuenta de Google.

### 2.1 Crear el proyecto
1. Entra a <https://console.firebase.google.com> y pulsa **Crear un proyecto** (o "Agregar proyecto").
2. Escribe un nombre, por ejemplo `alertavecinal-equipo`. Anota el **ID del proyecto** que aparece debajo.
3. Google Analytics: puedes desactivarlo. Pulsa **Crear proyecto** y espera.
4. Verifica que el plan sea **Spark (gratis)** (abajo a la izquierda).

### 2.2 Activar Authentication (correo y contraseña)
1. Menú izquierdo > **Compilación** > **Authentication** > **Comenzar**.
2. Pestaña **Método de acceso** > **Correo electrónico/contraseña** > activa el primer interruptor > **Guardar**.

### 2.3 Activar Firestore
1. Menú izquierdo > **Compilación** > **Firestore Database** > **Crear base de datos**.
2. Ubicación: elige la más cercana (por ejemplo `nam5 (United States)`). Pulsa **Siguiente**.
3. Elige **Comenzar en modo de producción** > **Crear**. (Las reglas reales se suben después con `firebase deploy`.)

### 2.4 Obtener la configuración web
1. Ícono de engrane ⚙ > **Configuración del proyecto** > pestaña **General**.
2. En **Tus apps** pulsa el ícono **`</>`** (Web). Ponle un apodo (`AlertaVecinal web`).
   No marques "Firebase Hosting" aquí (lo haremos con la terminal). Pulsa **Registrar app**.
3. Copia el bloque `firebaseConfig` que aparece. Lo usarás en el paso 3.

### 2.5 Generar la clave VAPID (para push)
1. **Configuración del proyecto** > pestaña **Cloud Messaging**.
2. Si dice que la "API de Firebase Cloud Messaging (V1)" está habilitada, todo bien.
3. Baja a **Configuración web** > **Certificados push web** > **Generar par de claves**.
4. Copia la **clave pública** (una cadena larga que empieza con `B`).

### 2.6 Descargar la cuenta de servicio (solo para `scripts/enviar-push.js`)
1. **Configuración del proyecto** > pestaña **Cuentas de servicio**.
2. Pulsa **Generar nueva clave privada** > **Generar clave**. Se descarga un archivo `.json`.
3. Cámbiale el nombre a `serviceAccountKey.json` y muévelo a la carpeta `scripts/`.

> ⚠️ Este archivo da control total de tu proyecto. **Nunca lo subas a GitHub** ni lo compartas.
> Ya está en `.gitignore`.

---

## 3. Poner tus claves en la app

Abre `js/firebase-config.js` y reemplaza los valores de ejemplo:

```js
self.FIREBASE_CONFIG = {
  apiKey: 'AIza...',                       // de firebaseConfig
  authDomain: 'alertavecinal-equipo.firebaseapp.com',
  projectId: 'alertavecinal-equipo',
  storageBucket: 'alertavecinal-equipo.appspot.com',
  messagingSenderId: '1234567890',
  appId: '1:1234567890:web:abc123'
};
self.FIREBASE_VAPID_KEY = 'BOx...';         // clave pública del paso 2.5
```

Es el **único** archivo con claves: lo usan las páginas y también el service worker.

> Cada vez que cambies archivos de la app, abre `sw.js` y sube la versión
> (`const VERSION = 'v1'` → `'v2'`). Así los navegadores descargan lo nuevo en lugar de usar la caché.

---

## 4. Correr la app en tu computadora

Las PWA solo funcionan en **localhost** o con **HTTPS** (el service worker no se registra en `file://`).
Necesitas **Node.js LTS**: descárgalo de <https://nodejs.org> e instálalo con las opciones por defecto.

Abre una terminal (PowerShell) **en la carpeta del proyecto** y elige una opción:

**Opción A: `npx serve`**
```bash
npx serve -l 3000
```
Abre <http://localhost:3000>. (Si pregunta "Need to install serve?", responde `y`.)

**Opción B: Firebase CLI**
```bash
npm install -g firebase-tools
firebase serve --only hosting
```
Abre <http://localhost:5000>.

Para detenerlo, pulsa `Ctrl + C` en la terminal.

---

## 5. Crear el primer administrador

Las reglas no dejan que nadie se haga admin solo. El primero se asigna a mano:

1. Abre la app y **regístrate** con tu correo. Verás "Cuenta pendiente de aprobación".
2. Ve a la consola de Firebase > **Firestore Database** > colección **usuarios**.
3. Abre el documento cuyo ID es tu UID (verás tu nombre y correo dentro).
4. Haz clic en el campo **rol** > cambia `vecino` por `admin` > **Actualizar**.
5. Haz clic en el campo **estado** > cambia `pendiente` por `aprobado` > **Actualizar**.
6. Vuelve a la app: el panel se abre solo y en el menú aparece **Administración**.

Desde **Administración** ya puedes aprobar, suspender, cambiar de rol o eliminar a los demás vecinos.

> "Eliminar" borra el perfil en Firestore (la persona ya no puede entrar al panel). La cuenta de acceso
> se borra en **Authentication > Usuarios** porque en el plan Spark no usamos Cloud Functions.

---

## 6. Publicar en internet (deploy)

Así obtienes la URL pública (`https://TU_PROYECTO.web.app`) que se entrega.

```bash
npm install -g firebase-tools
```
```bash
firebase login
```
Se abre el navegador: entra con la misma cuenta de Google del proyecto.

```bash
firebase init
```
Responde así (muévete con las flechas, marca con **espacio** y confirma con **Enter**):

| Pregunta | Respuesta |
|---|---|
| Which Firebase features do you want to set up? | Marca **Firestore** y **Hosting: Configure files for Firebase Hosting** |
| Please select an option | **Use an existing project** → elige tu proyecto |
| What file should be used for Firestore Rules? | `firestore.rules` (Enter) |
| File firestore.rules already exists. Overwrite? | **No** |
| What file should be used for Firestore indexes? | Enter |
| What do you want to use as your public directory? | escribe un punto: **`.`** |
| Configure as a single-page app? | **No** |
| Set up automatic builds and deploys with GitHub? | **No** |
| File ./index.html already exists. Overwrite? | **No** |

`firebase init` puede reescribir `firebase.json`. Al terminar, ábrelo y, si cambió, deja exactamente esto
(lo importante es `"public": "."` y que se ignore la carpeta `scripts/`, donde está tu clave privada):

```json
{
  "hosting": {
    "public": ".",
    "ignore": ["firebase.json", "firestore.rules", "README.md", "**/.*", "**/node_modules/**",
               "scripts/**", "reportes/**", "entregables/**"],
    "headers": [
      { "source": "**/@(sw|sw-push|sw-sync).js", "headers": [{ "key": "Cache-Control", "value": "no-cache" }] },
      { "source": "/manifest.json", "headers": [{ "key": "Content-Type", "value": "application/manifest+json" }] }
    ]
  },
  "firestore": { "rules": "firestore.rules" }
}
```

Publica la app y las reglas:
```bash
firebase deploy
```
Al final verás `Hosting URL: https://TU_PROYECTO.web.app`. **Esa es la URL que se entrega.**

Último paso: en la consola de Firebase > **Authentication** > **Configuración** > **Dominios autorizados**,
verifica que aparezcan `TU_PROYECTO.web.app` y `TU_PROYECTO.firebaseapp.com` (normalmente ya están).

---

## 7. Notificaciones push de prueba

Primero, en la app (con tu sesión iniciada), pulsa **Activar notificaciones** y acepta el permiso.
El token se guarda en la colección **tokens**. En **Demo push** (`demo-push.html`) puedes verlo y copiarlo.

### 7.1 Desde la consola de Firebase (sin programar)
1. Consola > menú **Ejecutar** (o "Interactuar") > **Messaging** > **Crear tu primera campaña** (o "Nueva campaña").
2. Elige **Mensajes de Firebase Notifications** > **Crear**.
3. Escribe un **título** y un **texto** de notificación.
4. Pulsa **Enviar mensaje de prueba** (a la derecha).
5. Pega el **token** copiado de `demo-push.html` > pulsa **+** > **Probar**.
6. Con la app en otra pestaña o cerrada, aparece la notificación del sistema. Con la app al frente,
   aparece dentro de la página (onMessage).

### 7.2 Desde la terminal con `scripts/enviar-push.js`
Requiere `scripts/serviceAccountKey.json` (paso 2.6).
```bash
cd scripts
npm install
node enviar-push.js "Alerta" "Robo en calle 5"
```
El script lee **todos** los tokens de Firestore, envía la notificación y borra los tokens que ya no sirven.

> En iPhone/iPad las push web solo funcionan si la PWA está **instalada en la pantalla de inicio**
> (Compartir > Agregar a inicio) y con **iOS 16.4 o posterior**.

---

## 8. Probar en clase la caché y el modo offline

Usa **Chrome** o **Edge** y pulsa `F12` para abrir DevTools.

1. **Service worker:** DevTools > **Application** > **Service workers**. Debe verse `sw.js` como
   *activated and is running*.
2. **Cache Storage:** **Application** > **Cache Storage**. Verás:
   - `alertavecinal-v1`: el app shell (HTML, CSS, JS, íconos, offline.html).
   - `alertavecinal-mapas`: mosaicos del mapa (aparece después de ver el mapa).
3. **Modo offline:** en **Application > Service workers** marca **Offline** (o en la pestaña **Network**
   elige *Offline*). Recarga: la app abre igual desde la caché.
4. **offline.html:** sin conexión, escribe en la barra una página que no visitaste, por ejemplo
   `/no-existe.html`: aparece la página "Estás sin conexión".
5. **Alerta sin señal:** sin conexión, envía una alerta: queda "esperando señal". Quita *Offline* y se envía sola.
6. **Demo caché:** abre **Demo caché** en el menú y pulsa cada botón (`caches.keys()`, `cache.keys()`,
   `cache.match()`, `cache.add()`, `cache.put()`, `cache.delete()`, *Borrar toda la caché*).
7. **Instalar:** en la barra aparece **Instalar app** (o el ícono de instalar en la barra de direcciones).

---

## 9. Regenerar los reportes PDF

Los PDF de `entregables/` se generan con Playwright desde la carpeta `reportes/`.

1. Abre `reportes/datos.json` y pega la URL pública en `"url"` (y corrige cualquier dato del equipo).
2. Ejecuta:
```bash
cd reportes
npm install
npx playwright install chromium
npm run pdf
```
Para volver a tomar las capturas de pantalla y probar la PWA: `npm run todo`.

---

## 10. Problemas comunes

| Problema | Solución |
|---|---|
| "Falta configurar Firebase" | Pega tus claves en `js/firebase-config.js` (paso 3). |
| Cambié algo y no se ve | Sube `VERSION` en `sw.js`, o en DevTools > Application > Service workers marca *Update on reload*. |
| `Missing or insufficient permissions` | Ejecuta `firebase deploy --only firestore:rules` y revisa que tu usuario esté **aprobado**. |
| El botón "Instalar app" no aparece | Ya está instalada, o el navegador no lo permite (Firefox/Safari). En iPhone: Compartir > Agregar a inicio. |
| No llega el push | Revisa el permiso del sitio, que la clave VAPID sea la correcta y que el token exista en **tokens**. |
| `auth/unauthorized-domain` | Agrega tu dominio en Authentication > Configuración > Dominios autorizados. |
