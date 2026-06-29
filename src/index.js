import 'dotenv/config';
import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import qrcode from 'qrcode-terminal';
import pkg from 'whatsapp-web.js';

const { Client, LocalAuth } = pkg;

const businessName = process.env.BUSINESS_NAME || 'Pakas.mx';
const advisorPhone = process.env.ADVISOR_PHONE || '5210000000000';
const catalogUrl = process.env.CATALOG_URL || 'https://pakas.mx';
const wholesaleUrl = process.env.WHOLESALE_URL || 'https://pakas.mx/mayoreo';
const trackingUrl = process.env.TRACKING_URL || 'https://pakas.mx/rastreo';
const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || findBrowserPath();
const headless = process.env.BROWSER_HEADLESS === 'true';
const authDataPath = process.env.WWEBJS_AUTH_PATH || '.wwebjs_auth';
const printTerminalQr = process.env.PRINT_TERMINAL_QR === 'true' || !headless;
const clearChromiumLocks = process.env.CLEAR_CHROMIUM_LOCKS !== 'false';
const botStartedAt = Math.floor(Date.now() / 1000);
let isShuttingDown = false;

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

Tambien puedes ver el catalogo aqui 👇
${catalogUrl}

Escribe el numero de la categoria que te interesa 😊`;

const supportMenu = `¡HOLA PAKAMIGO! 👋
¿TIENES ALGUN DETALLE CON TU PAKA?

3.1 📦 SEGUIMIENTO DE ENVIO
3.2 🛍️ COMPRAS MAYOREO
3.3 👩‍💼 HABLAR CON UN ASESOR

Escribe el numero de la opcion que necesitas 😊`;

const categoryReplies = {
  '2.1': 'DAMAS',
  '2.2': 'CABALLERO',
  '2.3': 'NIÑOS',
  '2.4': 'CALZADO',
  '2.5': 'MOCHILAS',
  '2.6': 'JUGUETES',
  '2.7': 'HOGAR'
};

const trackingReply = `Puedes consultar el seguimiento de tu envio aqui 📦
${trackingUrl}

Si necesitas ayuda adicional escribe 3.3 para hablar con un asesor 😊`;

const wholesaleReply = `Para compras de mayoreo revisa la informacion aqui 🛍️
${wholesaleUrl}

Tambien puedes escribir 3.3 para hablar con un asesor 😊`;

const advisorReply = `Con gusto te comunicamos con un asesor 👩‍💼

Da clic aqui: https://wa.me/${advisorPhone}`;

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

if (clearChromiumLocks) {
  clearStaleChromiumLocks(authDataPath);
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
  console.log('QR nuevo para iniciar Pakabots. Usa el QR mas reciente; expira rapido.');
  console.log(`WHATSAPP_QR_DATA=${qr}`);

  if (printTerminalQr) {
    console.log('Escanea este QR con WhatsApp para iniciar Pakabots:');
    qrcode.generate(qr, { small: true });
  }
});

client.on('loading_screen', (percent, message) => {
  console.log(`Cargando WhatsApp (${percent}%): ${message}`);
});

client.on('authenticated', () => {
  console.log('WhatsApp autenticado correctamente.');
});

client.on('ready', () => {
  console.log('Pakabots esta listo para responder mensajes.');
});

client.on('change_state', (state) => {
  console.log('Estado de conexion de WhatsApp:', state);
});

client.on('message', async (message) => {
  if (shouldIgnoreMessage(message)) {
    return;
  }

  const text = normalizeMessage(message.body);
  console.log(`Mensaje entrante de ${maskChatId(message.from)}: ${text || '(vacio)'}`);

  if (!text) {
    await message.reply(mainMenu);
    return;
  }

  if (categoryReplies[text]) {
    await message.reply(buildCategoryReply(categoryReplies[text]));
    return;
  }

  const reply = directReplies.get(text);

  if (reply) {
    await message.reply(reply);
    return;
  }

  await message.reply(`No encontre esa opcion, pero con gusto te ayudo 😊

${mainMenu}`);
});

client.on('auth_failure', (message) => {
  console.error('No se pudo autenticar WhatsApp:', message);
});

client.on('error', (error) => {
  console.error('Error interno de Pakabots:', error);
});

client.on('disconnected', (reason) => {
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

function shouldIgnoreMessage(message) {
  if (message.fromMe || message.isStatus) return true;

  const chatId = message.from || '';
  const isDirectChat = chatId.endsWith('@c.us') || chatId.endsWith('@lid');
  const messageTimestamp = Number(message.timestamp || 0);

  return !isDirectChat || (messageTimestamp > 0 && messageTimestamp < botStartedAt);
}

function buildCategoryReply(category) {
  return `Perfecto, te compartimos informacion de pakas de ${category} 🛍️

Catalogo 👇
${catalogUrl}

Para confirmar disponibilidad, precios y envio, escribe 3.3 y un asesor te atendera 😊`;
}

function maskChatId(value) {
  const [id, server] = value.split('@');
  const visibleDigits = id.slice(-4);
  return `***${visibleDigits}@${server || 'desconocido'}`;
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
