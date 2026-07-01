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
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || findBrowserPath();
const headless = process.env.BROWSER_HEADLESS === 'true';
const authDataPath = process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth';
const printTerminalQr = process.env.PRINT_TERMINAL_QR === 'true' || !headless;
const clearChromiumLocks = process.env.CLEAR_CHROMIUM_LOCKS !== 'false';
const qrServerEnabled = process.env.ENABLE_QR_SERVER !== 'false';
const qrAccessToken = process.env.QR_ACCESS_TOKEN || '';
const qrServerPort = Number(process.env.PORT || process.env.QR_SERVER_PORT || 3000);
const businessTimeZone = process.env.BUSINESS_TIME_ZONE || 'America/Mexico_City';
const businessHoursStart = parseHour(process.env.BUSINESS_HOURS_START, 9);
const businessHoursEnd = parseHour(process.env.BUSINESS_HOURS_END, 18);
const botStartedAt = Math.floor(Date.now() / 1000);
let isShuttingDown = false;
let latestQrData = '';
let latestQrCreatedAt = 0;
let connectionStatus = 'iniciando';
const openAdvisorChats = new Set();

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

Tambien puedes revisar el catalogo en el perfil de WhatsApp Business.

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

const unavailableReply = 'Pakamigo ya no estamos en la oficina. Mañana te atendemos de 9am a 6pm. Gracias por tu preferencia.';

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
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  }
});

console.log(`Iniciando Pakabots con ${executablePath || 'el navegador de Puppeteer'} en modo ${headless ? 'invisible' : 'visible'}...`);
console.log(`Guardando sesion de WhatsApp en ${authDataPath}...`);

client.on('qr', (qr) => {
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
  console.log(`Cargando WhatsApp (${percent}%): ${message}`);
});

client.on('authenticated', () => {
  connectionStatus = 'autenticado';
  console.log('WhatsApp autenticado correctamente.');
});

client.on('ready', () => {
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

  if (isAdvisorChatOpen(message.from) && !shouldBotHandleOpenChatMessage(text)) {
    console.log(`Chat abierto con asesor para ${maskChatId(message.from)}. Pakabots no respondio automatico.`);
    return;
  }

  if (!text) {
    await message.reply(mainMenu);
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
    updateAdvisorChatState(message.from, text);
    return;
  }

  await message.reply(`No encontre esa opcion, pero con gusto te ayudo 😊

${mainMenu}`);
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

function parseHour(value, fallback) {
  const hour = Number(value);

  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : fallback;
}

function isWithinBusinessHours(date = new Date()) {
  const { hour, minute } = getTimeInBusinessTimeZone(date);
  const currentMinutes = hour * 60 + minute;
  const startMinutes = businessHoursStart * 60;
  const endMinutes = businessHoursEnd * 60;

  if (startMinutes === endMinutes) {
    return true;
  }

  if (startMinutes < endMinutes) {
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes || currentMinutes < endMinutes;
}

function getTimeInBusinessTimeZone(date) {
  const parts = new Intl.DateTimeFormat('es-MX', {
    timeZone: businessTimeZone,
    hourCycle: 'h23',
    hour: '2-digit',
    minute: '2-digit'
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));

  return {
    hour: Number(values.hour),
    minute: Number(values.minute)
  };
}

function isAdvisorChatOpen(chatId) {
  return openAdvisorChats.has(chatId);
}

function openAdvisorChat(chatId) {
  openAdvisorChats.add(chatId);
}

function updateAdvisorChatState(chatId, text) {
  if (advisorHandoffOptions.has(text)) {
    openAdvisorChat(chatId);
    return;
  }

  if (restartOptions.has(text) || text === '1' || text === '2' || text === '3') {
    openAdvisorChats.delete(chatId);
  }
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

Tambien puedes revisar el catalogo en el perfil de WhatsApp Business.

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
