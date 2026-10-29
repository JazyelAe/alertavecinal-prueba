/**
 * ============================================================
 *  AlertaVecinal - Intermediario de notificaciones push
 *  (Google Apps Script, gratis y sin tarjeta)
 * ============================================================
 *  Por qué existe: enviar un push real exige la clave privada
 *  de la cuenta de servicio de Firebase, y esa clave NO puede ir
 *  en la app (en GitHub Pages todo el código es público). Este
 *  script la guarda en secreto en "Propiedades del script".
 *
 *  Qué hace cuando la app lo llama:
 *   1. Recibe { idToken, tipo: 'aviso' | 'alerta', id }.
 *      Nunca recibe el texto: lo lee él mismo de Firestore.
 *   2. Comprueba con Firestore que el token de sesión es real y
 *      que el usuario está aprobado (y es admin si es un aviso).
 *   3. Comprueba que el aviso o la alerta existe, es suya, es
 *      reciente (15 min) y que no se envió antes.
 *   4. Envía el push con Firebase Cloud Messaging (API v1) a
 *      todos los tokens de la colección "tokens", menos los del autor.
 *   5. Borra los tokens que ya no sirven.
 *
 *  Configuración (ver README, sección 7.4):
 *   - Propiedad del script SERVICE_ACCOUNT = contenido completo
 *     de serviceAccountKey.json.
 *   - Implementar > Nueva implementación > Aplicación web,
 *     Ejecutar como: "Yo", Acceso: "Cualquier usuario".
 * ============================================================
 */

const MINUTOS_MAXIMOS = 15;

function doPost(e) {
  try {
    const peticion = JSON.parse(e.postData.contents);
    return responder(enviar(peticion));
  } catch (error) {
    return responder({ ok: false, error: String(error.message || error) });
  }
}

// Permite abrir la URL en el navegador para comprobar que está publicada.
function doGet() {
  return responder({ ok: true, servicio: 'AlertaVecinal push', listo: Boolean(cuentaDeServicio_(true)) });
}

function enviar({ idToken, tipo, id }) {
  if (!idToken || !id || (tipo !== 'aviso' && tipo !== 'alerta')) throw new Error('Petición incompleta');
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) throw new Error('Id inválido');
  const cuenta = cuentaDeServicio_();
  const proyecto = cuenta.project_id;

  // 1) El token de sesión es real si Firestore acepta leer el perfil con él.
  const uid = uidDelToken_(idToken);
  const perfil = leerDocumento_(proyecto, `usuarios/${uid}`, idToken);
  if (!perfil) throw new Error('Sesión inválida o sin perfil');
  if (perfil.estado !== 'aprobado') throw new Error('Usuario no aprobado');
  if (tipo === 'aviso' && perfil.rol !== 'admin') throw new Error('Solo el admin envía avisos');

  // 2) Leemos el aviso o la alerta con la cuenta de servicio.
  const acceso = tokenDeAcceso_(cuenta);
  const coleccion = tipo === 'aviso' ? 'avisos' : 'alertas';
  const doc = leerDocumento_(proyecto, `${coleccion}/${id}`, acceso);
  if (!doc) throw new Error('No existe el documento');
  if (doc.uid !== uid) throw new Error('El documento no es del usuario');
  if (Date.now() - new Date(doc.creado).getTime() > MINUTOS_MAXIMOS * 60 * 1000) throw new Error('Demasiado antiguo');

  // 3) Marca "enviado" que solo se puede crear una vez (evita repetir el mismo push).
  if (!crearSiNoExiste_(proyecto, `envios/${tipo}-${id}`, acceso, { uid, fecha: new Date().toISOString() })) {
    return { ok: true, repetido: true, enviadas: 0 };
  }

  // 4) Armamos el mensaje con los datos de Firestore.
  const tipos = { robo: 'Robo', medica: 'Emergencia médica', gas: 'Fuga de gas', otro: 'Alerta' };
  const datos = tipo === 'aviso'
    ? { titulo: `Aviso: ${doc.titulo}`, cuerpo: doc.mensaje || `Enviado por ${doc.autor || 'el administrador'}`, url: './', tag: `aviso-${id}` }
    : { titulo: `${tipos[doc.tipo] || 'Alerta'} · AlertaVecinal`, cuerpo: [doc.descripcion, doc.direccion].filter(Boolean).join(' · '),
        url: `./?alerta=${id}`, tag: `alerta-${id}`, alertaId: id };

  // 5) Enviamos a todos los tokens, menos a los del propio autor.
  const tokens = listarTokens_(proyecto, acceso).filter((t) => t.uid !== uid);
  if (!tokens.length) return { ok: true, enviadas: 0, nota: 'No hay otros dispositivos registrados' };

  const url = `https://fcm.googleapis.com/v1/projects/${proyecto}/messages:send`;
  const respuestas = UrlFetchApp.fetchAll(tokens.map((t) => ({
    url, method: 'post', contentType: 'application/json', muteHttpExceptions: true,
    headers: { Authorization: `Bearer ${acceso}` },
    payload: JSON.stringify({ message: { token: t.token, data: datos, webpush: { headers: { Urgency: 'high', TTL: '3600' } } } })
  })));

  let enviadas = 0;
  const invalidos = [];
  respuestas.forEach((r, i) => {
    if (r.getResponseCode() === 200) enviadas++;
    else if (/UNREGISTERED|registration-token-not-registered|INVALID_ARGUMENT/.test(r.getContentText())) invalidos.push(tokens[i].id);
  });
  // 6) Limpiamos los tokens que FCM dice que ya no existen.
  invalidos.forEach((docId) => UrlFetchApp.fetch(
    `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/tokens/${encodeURIComponent(docId)}`,
    { method: 'delete', headers: { Authorization: `Bearer ${acceso}` }, muteHttpExceptions: true }));

  return { ok: true, enviadas, fallidas: tokens.length - enviadas, tokensBorrados: invalidos.length };
}

/* ---------------- Ayudantes ---------------- */

function responder(objeto) {
  return ContentService.createTextOutput(JSON.stringify(objeto)).setMimeType(ContentService.MimeType.JSON);
}

function cuentaDeServicio_(silencioso) {
  const texto = PropertiesService.getScriptProperties().getProperty('SERVICE_ACCOUNT');
  if (!texto) {
    if (silencioso) return null;
    throw new Error('Falta la propiedad SERVICE_ACCOUNT');
  }
  return JSON.parse(texto);
}

// Lee el uid del token de sesión. La firma la valida Firestore en leerDocumento_().
function uidDelToken_(idToken) {
  const partes = idToken.split('.');
  if (partes.length !== 3) throw new Error('Token mal formado');
  const conRelleno = partes[1] + '==='.slice((partes[1].length + 3) % 4);
  const datos = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(conRelleno)).getDataAsString());
  if (!/^[A-Za-z0-9]{1,128}$/.test(datos.user_id || '')) throw new Error('Token sin usuario');
  return datos.user_id;
}

// Token OAuth de la cuenta de servicio (se guarda 50 minutos en caché).
function tokenDeAcceso_(cuenta) {
  const cache = CacheService.getScriptCache();
  const guardado = cache.get('token-acceso');
  if (guardado) return guardado;
  const ahora = Math.floor(Date.now() / 1000);
  const b64 = (obj) => Utilities.base64EncodeWebSafe(JSON.stringify(obj)).replace(/=+$/, '');
  const sinFirma = b64({ alg: 'RS256', typ: 'JWT' }) + '.' + b64({
    iss: cuenta.client_email,
    scope: 'https://www.googleapis.com/auth/firebase.messaging https://www.googleapis.com/auth/datastore',
    aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600
  });
  const firma = Utilities.base64EncodeWebSafe(Utilities.computeRsaSha256Signature(sinFirma, cuenta.private_key)).replace(/=+$/, '');
  const r = UrlFetchApp.fetch('https://oauth2.googleapis.com/token', {
    method: 'post', muteHttpExceptions: true,
    payload: { grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: `${sinFirma}.${firma}` }
  });
  if (r.getResponseCode() !== 200) throw new Error('No se pudo autenticar la cuenta de servicio');
  const token = JSON.parse(r.getContentText()).access_token;
  cache.put('token-acceso', token, 50 * 60);
  return token;
}

// Convierte los campos de la API REST de Firestore en un objeto normal.
function aObjeto_(campos) {
  const obj = {};
  Object.keys(campos || {}).forEach((k) => {
    const v = campos[k];
    obj[k] = v.stringValue ?? v.timestampValue ?? v.booleanValue ?? (v.doubleValue ?? (v.integerValue != null ? Number(v.integerValue) : null));
  });
  return obj;
}

function leerDocumento_(proyecto, ruta, bearer) {
  const r = UrlFetchApp.fetch(`https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/${ruta}`,
    { headers: { Authorization: `Bearer ${bearer}` }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return null;
  return aObjeto_(JSON.parse(r.getContentText()).fields);
}

function crearSiNoExiste_(proyecto, ruta, acceso, datos) {
  const fields = {};
  Object.keys(datos).forEach((k) => { fields[k] = { stringValue: String(datos[k]) }; });
  const r = UrlFetchApp.fetch(
    `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/${ruta}?currentDocument.exists=false`,
    { method: 'patch', contentType: 'application/json', headers: { Authorization: `Bearer ${acceso}` },
      payload: JSON.stringify({ fields }), muteHttpExceptions: true });
  return r.getResponseCode() === 200;
}

function listarTokens_(proyecto, acceso) {
  const tokens = [];
  let pagina = '';
  do {
    const r = UrlFetchApp.fetch(
      `https://firestore.googleapis.com/v1/projects/${proyecto}/databases/(default)/documents/tokens?pageSize=300${pagina ? '&pageToken=' + pagina : ''}`,
      { headers: { Authorization: `Bearer ${acceso}` }, muteHttpExceptions: true });
    if (r.getResponseCode() !== 200) throw new Error('No se pudieron leer los tokens');
    const json = JSON.parse(r.getContentText());
    (json.documents || []).forEach((d) => {
      const datos = aObjeto_(d.fields);
      tokens.push({ id: d.name.split('/').pop(), token: datos.token || d.name.split('/').pop(), uid: datos.uid });
    });
    pagina = json.nextPageToken || '';
  } while (pagina);
  return tokens;
}

/* Prueba manual desde el editor: Ejecutar > probarConfiguracion */
function probarConfiguracion() {
  const cuenta = cuentaDeServicio_();
  const acceso = tokenDeAcceso_(cuenta);
  const tokens = listarTokens_(cuenta.project_id, acceso);
  Logger.log(`Proyecto ${cuenta.project_id}: ${tokens.length} token(s) registrados. Todo listo.`);
}
