import 'dotenv/config';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { createServer } from 'node:http';
import { join } from 'node:path';
import { URL } from 'node:url';
import QRCode from 'qrcode';
import qrcodeTerminal from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

const businessName = process.env.BUSINESS_NAME || 'Pakas.mx';
const advisorPhone = process.env.ADVISOR_PHONE || '5210000000000';
const catalogUrl = normalizeOptionalUrl(process.env.CATALOG_URL || '');
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || findBrowserPath();
const headless = process.env.BROWSER_HEADLESS === 'true';
const authDataPath = process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth';
const printTerminalQr = process.env.PRINT_TERMINAL_QR === 'true' || !headless;
const clearChromiumLocks = process.env.CLEAR_CHROMIUM_LOCKS !== 'false';
const qrServerEnabled = process.env.ENABLE_QR_SERVER !== 'false';
const qrAccessToken = process.env.QR_ACCESS_TOKEN || '';
const qrServerPort = Number(process.env.PORT || process.env.QR_SERVER_PORT || 3000);
const businessTimeZone = process.env.BUSINESS_TIME_ZONE || 'America/Mexico_City';
const conversationInactivityMinutes = Number(
  process.env.CONVERSATION_INACTIVITY_TIMEOUT_MINUTES || process.env.ADVISOR_INACTIVITY_TIMEOUT_MINUTES || 5
);
const conversationInactivityTimeoutMs = Number.isFinite(conversationInactivityMinutes) && conversationInactivityMinutes > 0
  ? conversationInactivityMinutes * 60 * 1000
  : 5 * 60 * 1000;
const botStartedAt = Math.floor(Date.now() / 1000);
let isShuttingDown = false;
let latestQrData = '';
let latestQrCreatedAt = 0;
let connectionStatus = 'iniciando';
const conversationStates = new Map();
const businessHoursByWeekday = {
  Mon: { start: 9 * 60, end: 18 * 60 },
  Tue: { start: 9 * 60, end: 18 * 60 },
  Wed: { start: 9 * 60, end: 18 * 60 },
  Thu: { start: 9 * 60, end: 18 * 60 },
  Fri: { start: 9 * 60, end: 15 * 60 },
  Sat: { start: 9 * 60, end: 18 * 60 }
};
const catalogReference = buildCatalogReference(catalogUrl);

const mainMenu = `¡HOLA! SOY PAKABOTS 👋
QUIERO QUE SEPAS QUE ESTOY AQUI PARA AYUDARTE A EMPRENDER TU NEGOCIO
DE PAKAS O AYUDARTE A ELEGIR TU PROXIMA PAKA ✨

¿COMO PUEDO AYUDARTE HOY?

1. ℹ️ INFORMACION GENERAL
2. 🛍️ COMPRAS
3. 🛟 SOPORTE

Escribe el numero de la opcion que necesitas 😊`;

const generalInfo = `¡HOLA! SOMOS ${businessName.toUpperCase()} 👋

TE ACOMPAÑAMOS Y ORIENTAMOS A INICIAR TU PROPIO NEGOCIO DE ROPA
AMERICANA, TENIENDO UN INGRESO EXTRA Y EMPEZAR CON UNA MINIMA
INVERSION 💼

CONTAMOS CON PAKAS DE DAMAS, CABALLERO, NIÑOS, CALZADO, MOCHILAS,
JUGUETES Y HOGAR 🛍️

TE RECORDAMOS QUE LA ROPA AMERICANA QUE VENDEMOS ES ROPA DE
SEGUNDA VIDA. NOSOTROS NO SOMOS RESPONSABLES DE LA FABRICACION DEL
PRODUCTO MENCIONADO. CADA PAKA ES UNICA ♻️

BUENA SUERTE EN ESTE EMPRENDIMIENTO ✨

Escribe "menu" para volver al inicio.`;

const salesMenu = `¡QUE PAKA QUIERES COMPRAR EL DIA DE HOY? 🛒

2.1 👗 DAMA
2.2 👕 CABALLERO
2.3 🧒 NIÑO
2.4 👟 CALZADO
2.5 🎒 MOCHILAS
2.6 🧸 JUGUETES
2.7 🏠 HOGAR

${catalogReference}

Escribe el numero de la categoria que te interesa 😊`;

const supportMenu = `¡HOLA PAKAMIGO! 👋
¿TIENES ALGUN DETALLE CON TU PAKA?

3.1 📦 SEGUIMIENTO DE ENVIO
3.2 🛍️ COMPRAS MAYOREO
3.3 👩‍💼 HABLAR CON UN ASESOR

Escribe el numero de la opcion que necesitas 😊`;

const categoryReplies = {
  '2.1': 'dama',
  '2.2': 'caballero',
  '2.3': 'niño',
  '2.4': 'calzado',
  '2.5': 'mochilas',
  '2.6': 'juguetes',
  '2.7': 'hogar'
};

const menuStepOptions = new Map([
  ['main', new Set(['1', '2', '3'])],
  ['sales', new Set(Object.keys(categoryReplies))],
  ['support', new Set(['3.1', '3.2', '3.3'])]
]);

const menuByStep = new Map([
  ['main', mainMenu],
  ['sales', salesMenu],
  ['support', supportMenu]
]);

const menuValidationMessages = new Map([
  ['main', 'Para poder ayudarte, necesito que elijas una opcion del menu escribiendo solo 1, 2 o 3.'],
  ['sales', 'Para continuar con compras, escribe solo el numero de la categoria que aparece en el menu, por ejemplo 2.1, 2.2 o 2.3.'],
  ['support', 'Para continuar con soporte, escribe solo 3.1, 3.2 o 3.3.']
]);

const trackingReply = `Para dar seguimiento a tu envio, por favor escribe tu nombre completo en el chat con un asesor 📦

Enseguida te pasaremos con un asesor para ayudarte.

Da clic aqui para abrir el chat:
${buildAdvisorLink('Hola, necesito ayuda con el seguimiento de mi envio. Mi nombre completo es: ')}`;

const wholesaleReply = `Te llevaremos a un nuevo chat con un asesor especializado en compras de mayoreo 🛍️

Da clic aqui para abrir el chat:
${buildAdvisorLink('Necesito informacion de mayoreo en pakas de: ')}`;

const advisorReply = `Con gusto te comunicamos con un asesor 👩‍💼

Da clic aqui para abrir el chat:
${buildAdvisorLink('Hola, quiero hablar con un asesor.')}`;

const unavailableReply = `👋 ¡Hola, Paka Amigo! Gracias por escribir a PAKAS.MX.
En este momento nuestro equipo puede tardar un poco en responder. Te atenderemos dentro de nuestro horario de servicio:

🕘 Lunes a jueves: 9:00 a.m. a 6:00 p.m.
🕘 Viernes: 9:00 a.m. a 3:00 p.m.
🕘 Sábados: 9:00 a.m. a 6:00 p.m.
🚫 Domingos: Cerrado.`;

const inactivityClosedReply = `Cerramos esta conversacion por inactividad.
Gracias por contactarnos. Si necesitas ayuda de nuevo, escribenos y te mostraremos el menu principal.`;

const directReplies = new Map([
  ['1', generalInfo],
  ['informacion', generalInfo],
  ['informacion general', generalInfo],
  ['2', salesMenu],
  ['compra', salesMenu],
  ['compras', salesMenu],
  ['venta', salesMenu],
  ['ventas', salesMenu],
  ['3', supportMenu],
  ['soporte', supportMenu],
  ['3.1', trackingReply],
  ['seguimiento', trackingReply],
  ['seguimiento de envio', trackingReply],
  ['3.2', wholesaleReply],
  ['mayoreo', wholesaleReply],
  ['compras mayoreo', wholesaleReply],
  ['3.3', advisorReply],
  ['asesor', advisorReply],
  ['hablar con un asesor', advisorReply],
  ['menu', mainMenu],
  ['menú', mainMenu],
  ['inicio', mainMenu],
  ['hola', mainMenu],
  ['buen dia', mainMenu],
  ['buenos dias', mainMenu],
  ['buenas tardes', mainMenu],
  ['buenas noches', mainMenu]
]);

const advisorHandoffOptions = new Set([
  '3.1',
  'seguimiento',
  'seguimiento de envio',
  '3.2',
  'mayoreo',
  'compras mayoreo',
  '3.3',
  'asesor',
  'hablar con un asesor'
]);

const restartOptions = new Set(['menu', 'inicio']);
const numericMenuOptions = new Set(['1', '2', '3', ...Object.keys(categoryReplies), '3.1', '3.2', '3.3']);
const chromiumArgs = [
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-gpu',
  '--disable-extensions',
  '--disable-default-apps',
  '--disable-background-networking',
  '--disable-sync',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--metrics-recording-only',
  '--mute-audio',
  '--hide-scrollbars'
];

if (clearChromiumLocks) {
  clearStaleChromiumLocks(authDataPath);
}

if (qrServerEnabled) {
  startQrServer();
}

const client = new Client({
  authStrategy: new LocalAuth({
    dataPath: authDataPath
  }),
  takeoverOnConflict: true,
  takeoverTimeoutMs: 3000,
  puppeteer: {
    executablePath,
    headless,
    args: chromiumArgs,
    dumpio: process.env.PUPPETEER_DUMPIO === 'true',
    protocolTimeout: 120000
  }
});

console.log(`Iniciando Pakabots con ${executablePath || 'el navegador de Puppeteer'} en modo ${headless ? 'invisible' : 'visible'}...`);
console.log(`Guardando sesion de WhatsApp en ${authDataPath}...`);
console.log(`Argumentos Chromium: ${chromiumArgs.join(' ')}`);

const qrStartupTimer = setTimeout(() => {
  if (connectionStatus === 'iniciando') {
    connectionStatus = 'WhatsApp Web no genero QR aun';
    console.warn('WhatsApp Web no genero QR despues de 60 segundos. Revisa logs de Chromium o reinicia con una sesion nueva.');
  }
}, 60 * 1000);
qrStartupTimer.unref?.();

client.on('qr', (qr) => {
  clearTimeout(qrStartupTimer);
  latestQrData = qr;
  latestQrCreatedAt = Date.now();
  connectionStatus = 'esperando escaneo';

  console.log('QR nuevo para iniciar Pakabots. Usa el QR mas reciente; expira rapido.');
  console.log(`WHATSAPP_QR_DATA=${qr}`);

  if (printTerminalQr) {
    console.log('Escanea este QR con WhatsApp para iniciar Pakabots:');
    qrcodeTerminal.generate(qr, { small: true });
  }
});

client.on('loading_screen', (percent, message) => {
  connectionStatus = `cargando WhatsApp ${percent}%`;
  console.log(`Cargando WhatsApp (${percent}%): ${message}`);
});

client.on('authenticated', () => {
  clearTimeout(qrStartupTimer);
  connectionStatus = 'autenticado';
  console.log('WhatsApp autenticado correctamente.');
});

client.on('ready', () => {
  clearTimeout(qrStartupTimer);
  latestQrData = '';
  latestQrCreatedAt = 0;
  connectionStatus = 'listo';
  console.log('Pakabots esta listo para responder mensajes.');
});

client.on('change_state', (state) => {
  connectionStatus = state;
  console.log('Estado de conexion de WhatsApp:', state);
});

client.on('message', async (message) => {
  if (shouldIgnoreMessage(message)) {
    return;
  }

  if (!isWithinBusinessHours()) {
    await message.reply(unavailableReply);
    return;
  }

  const text = normalizeMessage(message.body);
  console.log(`Mensaje entrante de ${maskChatId(message.from)}: ${text || '(vacio)'}`);

  if (shouldRestartAfterInactivity(message.from)) {
    clearConversationState(message.from);
    setMenuStep(message.from, 'main');
    await message.reply(mainMenu);
    return;
  }

  if (isAdvisorChatOpen(message.from) && !shouldBotHandleOpenChatMessage(text)) {
    touchAdvisorChat(message.from);
    console.log(`Chat abierto con asesor para ${maskChatId(message.from)}. Pakabots no respondio automatico.`);
    return;
  }

  if (!text) {
    await message.reply(mainMenu);
    setMenuStep(message.from, 'main');
    return;
  }

  if (restartOptions.has(text)) {
    closeAdvisorChat(message.from);
    setMenuStep(message.from, 'main');
    await message.reply(mainMenu);
    return;
  }

  const activeMenuStep = getMenuStep(message.from);

  if (activeMenuStep && !isValidMenuOption(activeMenuStep, text)) {
    await message.reply(buildMenuValidationReply(activeMenuStep));
    setMenuStep(message.from, activeMenuStep);
    return;
  }

  if (categoryReplies[text]) {
    await message.reply(buildCategoryReply(categoryReplies[text]));
    openAdvisorChat(message.from);
    return;
  }

  const reply = directReplies.get(text);

  if (reply) {
    await message.reply(reply);
    updateConversationState(message.from, text);
    return;
  }

  await message.reply(`No encontre esa opcion, pero con gusto te ayudo 😊

${mainMenu}`);
  setMenuStep(message.from, 'main');
});

client.on('auth_failure', (message) => {
  connectionStatus = 'fallo de autenticacion';
  console.error('No se pudo autenticar WhatsApp:', message);
});

client.on('error', (error) => {
  console.error('Error interno de Pakabots:', error);
});

client.on('disconnected', (reason) => {
  connectionStatus = `desconectado: ${reason}`;
  console.log('Pakabots se desconecto:', reason);
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

client.initialize().catch((error) => {
  clearTimeout(qrStartupTimer);
  connectionStatus = 'error al iniciar WhatsApp';
  console.error('No se pudo iniciar Pakabots:', error);
  process.exitCode = 1;
});

function normalizeMessage(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function normalizeOptionalUrl(value) {
  const trimmedValue = String(value).trim();

  if (!trimmedValue) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmedValue)) {
    return trimmedValue;
  }

  return `https://${trimmedValue}`;
}

function buildCatalogReference(url) {
  if (!url) {
    return 'Tambien puedes revisar el catalogo en el perfil de WhatsApp Business.';
  }

  return `Tambien puedes revisar el catalogo aqui:
${url}`;
}

function isWithinBusinessHours(date = new Date()) {
  const { weekday, hour, minute } = getTimeInBusinessTimeZone(date);
  const schedule = businessHoursByWeekday[weekday];

  if (!schedule) {
    return false;
  }

  const currentMinutes = hour * 60 + minute;

  return currentMinutes >= schedule.start && currentMinutes < schedule.end;
}

function getTimeInBusinessTimeZone(date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: businessTimeZone,
    weekday: 'short',
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    weekday: values.weekday,
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function getConversationState(chatId) {
  return conversationStates.get(chatId) || {};
}

function saveConversationState(chatId, state) {
  if (isConversationActive(state)) {
    restartConversationInactivityTimer(chatId, state);
    conversationStates.set(chatId, state);
    return;
  }

  clearConversationInactivityTimer(state);

  if (state.restartOnNextMessage) {
    conversationStates.set(chatId, state);
    return;
  }

  conversationStates.delete(chatId);
}

function clearConversationState(chatId) {
  const state = getConversationState(chatId);
  clearConversationInactivityTimer(state);
  conversationStates.delete(chatId);
}

function isConversationActive(state) {
  return state.advisorOpen === true || Boolean(state.menuStep);
}

function clearConversationInactivityTimer(state) {
  if (state.inactivityTimer) {
    clearTimeout(state.inactivityTimer);
    delete state.inactivityTimer;
  }
}

function restartConversationInactivityTimer(chatId, state) {
  clearConversationInactivityTimer(state);

  state.inactivityTimer = setTimeout(() => {
    closeConversationForInactivity(chatId).catch((error) => {
      console.error(`No se pudo cerrar por inactividad ${maskChatId(chatId)}:`, error);
    });
  }, conversationInactivityTimeoutMs);
  state.inactivityTimer.unref?.();
}

async function closeConversationForInactivity(chatId) {
  const state = getConversationState(chatId);

  if (!isConversationActive(state)) {
    return;
  }

  clearConversationInactivityTimer(state);
  conversationStates.set(chatId, { restartOnNextMessage: true });
  console.log(`Conversacion cerrada por inactividad para ${maskChatId(chatId)}.`);

  await client.sendMessage(chatId, inactivityClosedReply);
}

function shouldRestartAfterInactivity(chatId) {
  return getConversationState(chatId).restartOnNextMessage === true;
}

function getMenuStep(chatId) {
  return getConversationState(chatId).menuStep;
}

function setMenuStep(chatId, menuStep) {
  const state = getConversationState(chatId);
  delete state.restartOnNextMessage;

  if (menuStep) {
    state.menuStep = menuStep;
  } else {
    delete state.menuStep;
  }

  saveConversationState(chatId, state);
}

function isValidMenuOption(menuStep, text) {
  return menuStepOptions.get(menuStep)?.has(text) || false;
}

function buildMenuValidationReply(menuStep) {
  const validationMessage = menuValidationMessages.get(menuStep) || menuValidationMessages.get('main');
  const menu = menuByStep.get(menuStep) || mainMenu;

  return `${validationMessage}

Si quieres empezar de nuevo, escribe "menu".

${menu}`;
}

function isAdvisorChatOpen(chatId) {
  return getConversationState(chatId).advisorOpen === true;
}

function openAdvisorChat(chatId) {
  const state = getConversationState(chatId);
  state.advisorOpen = true;
  state.advisorLastActivityAt = Date.now();
  delete state.menuStep;
  delete state.restartOnNextMessage;
  saveConversationState(chatId, state);
}

function closeAdvisorChat(chatId) {
  const state = getConversationState(chatId);
  delete state.advisorOpen;
  delete state.advisorLastActivityAt;
  saveConversationState(chatId, state);
}

function touchAdvisorChat(chatId) {
  const state = getConversationState(chatId);

  if (state.advisorOpen) {
    state.advisorLastActivityAt = Date.now();
    saveConversationState(chatId, state);
  }
}

function updateConversationState(chatId, text) {
  if (advisorHandoffOptions.has(text)) {
    openAdvisorChat(chatId);
    return;
  }

  closeAdvisorChat(chatId);

  if (text === '2' || text === 'compra' || text === 'compras' || text === 'venta' || text === 'ventas') {
    setMenuStep(chatId, 'sales');
    return;
  }

  if (text === '3' || text === 'soporte') {
    setMenuStep(chatId, 'support');
    return;
  }

  if (restartOptions.has(text) || text === 'hola' || text === 'buen dia' || text === 'buenos dias' || text === 'buenas tardes' || text === 'buenas noches') {
    setMenuStep(chatId, 'main');
    return;
  }

  setMenuStep(chatId, null);
}

function shouldBotHandleOpenChatMessage(text) {
  return restartOptions.has(text) || numericMenuOptions.has(text);
}

function shouldIgnoreMessage(message) {
  if (message.fromMe || message.isStatus) return true;

  const chatId = message.from || '';
  const isDirectChat = chatId.endsWith('@c.us') || chatId.endsWith('@lid');
  const messageTimestamp = Number(message.timestamp || 0);

  return !isDirectChat || (messageTimestamp > 0 && messageTimestamp < botStartedAt);
}

function buildCategoryReply(category) {
  return `Perfecto, te llevaremos a un nuevo chat con un asesor para informacion de pakas de ${category} 🛍️

${catalogReference}

Da clic aqui para abrir el chat:
${buildAdvisorLink(`Necesito informacion de paka para ${category}.`)}`;
}

function buildAdvisorLink(message) {
  return `https://wa.me/${advisorPhone}?text=${encodeURIComponent(message)}`;
}

function maskChatId(value) {
  const [id, server] = value.split('@');
  const visibleDigits = id.slice(-4);
  return `***${visibleDigits}@${server || 'desconocido'}`;
}

function startQrServer() {
  const server = createServer((request, response) => {
    handleQrRequest(request, response).catch((error) => {
      console.error('Error en servidor QR:', error);
      response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      response.end('Error interno');
    });
  });

  server.listen(qrServerPort, '0.0.0.0', () => {
    console.log(`Servidor QR disponible en puerto ${qrServerPort}.`);
  });
}

async function handleQrRequest(request, response) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('ok');
    return;
  }

  if (requestUrl.pathname !== '/' && requestUrl.pathname !== '/qr') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No encontrado');
    return;
  }

  if (!qrAccessToken) {
    response.writeHead(503, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderQrPage({
      title: 'Configura QR_ACCESS_TOKEN',
      body: '<p>Falta configurar la variable <code>QR_ACCESS_TOKEN</code> en Render.</p>'
    }));
    return;
  }

  if (requestUrl.searchParams.get('token') !== qrAccessToken) {
    response.writeHead(401, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderQrPage({
      title: 'Acceso privado',
      body: '<p>Agrega <code>?token=TU_TOKEN</code> a la URL para ver el QR.</p>'
    }));
    return;
  }

  const escapedStatus = escapeHtml(connectionStatus);

  if (!latestQrData) {
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    response.end(renderQrPage({
      title: 'Pakabots',
      body: `<p>Estado: <strong>${escapedStatus}</strong></p><p>Si el bot aun no esta conectado, espera unos segundos. Esta pagina se actualiza sola.</p>`
    }));
    return;
  }

  const qrImage = await QRCode.toDataURL(latestQrData, {
    errorCorrectionLevel: 'M',
    margin: 4,
    width: 420,
    color: {
      dark: '#000000',
      light: '#ffffff'
    }
  });
  const createdAt = new Date(latestQrCreatedAt).toLocaleString('es-MX', {
    dateStyle: 'medium',
    timeStyle: 'medium',
    timeZone: 'America/Mexico_City'
  });

  response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
  response.end(renderQrPage({
    title: 'Escanea el QR',
    body: `<p>Estado: <strong>${escapedStatus}</strong></p><img src="${qrImage}" alt="QR de WhatsApp"><p>Generado: ${escapeHtml(createdAt)}</p><p>Esta pagina se refresca sola para mostrar el QR mas reciente.</p>`
  }));
}

function renderQrPage({ title, body }) {
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="8">
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; font-family: Arial, sans-serif; }
    body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f6f7f9; color: #191919; }
    main { width: min(92vw, 560px); padding: 28px; background: #fff; border: 1px solid #ddd; border-radius: 8px; text-align: center; }
    h1 { margin: 0 0 16px; font-size: 28px; }
    p { margin: 12px 0; line-height: 1.45; }
    code { background: #f0f0f0; padding: 2px 5px; border-radius: 4px; }
    img { width: min(100%, 420px); height: auto; margin: 12px auto; display: block; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${body}
  </main>
</body>
</html>`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function clearStaleChromiumLocks(rootPath) {
  const lockNames = new Set(['SingletonCookie', 'SingletonLock', 'SingletonSocket', 'DevToolsActivePort']);
  const removedLocks = [];

  removeLocks(rootPath);

  if (removedLocks.length > 0) {
    console.log(`Limpieza de Chromium: ${removedLocks.length} lock(s) removidos.`);
  }

  function removeLocks(currentPath) {
    if (!existsSync(currentPath)) return;

    let entries;

    try {
      entries = readdirSync(currentPath, { withFileTypes: true });
    } catch (error) {
      console.warn(`No se pudo revisar ${currentPath} para limpiar locks:`, error.message);
      return;
    }

    for (const entry of entries) {
      const entryPath = join(currentPath, entry.name);

      if (lockNames.has(entry.name)) {
        try {
          rmSync(entryPath, { force: true, recursive: true });
          removedLocks.push(entryPath);
        } catch (error) {
          console.warn(`No se pudo remover lock de Chromium ${entryPath}:`, error.message);
        }
        continue;
      }

      if (entry.isDirectory()) {
        removeLocks(entryPath);
      }
    }
  }
}

async function shutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log(`Recibido ${signal}. Cerrando Pakabots...`);

  try {
    await client.destroy();
  } catch (error) {
    console.error('No se pudo cerrar WhatsApp limpiamente:', error);
  } finally {
    process.exit(0);
  }
}

function findBrowserPath() {
  const browserPaths = [
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium'
  ];

  return browserPaths.find((path) => existsSync(path));
}
