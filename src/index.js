import 'dotenv/config';
import { createHmac, timingSafeEqual } from 'node:crypto';
import { createServer } from 'node:http';
import { URL } from 'node:url';

const businessName = process.env.BUSINESS_NAME || 'Pakas.mx';
const advisorPhone = process.env.ADVISOR_PHONE || '5210000000000';
const catalogUrl = normalizeOptionalUrl(process.env.CATALOG_URL || '');
const businessTimeZone = process.env.BUSINESS_TIME_ZONE || 'America/Mexico_City';
const serverPort = Number(process.env.PORT || process.env.SERVER_PORT || 3000);
const whatsappAccessToken = process.env.WHATSAPP_ACCESS_TOKEN || '';
const whatsappPhoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID || '';
const whatsappVerifyToken = process.env.WHATSAPP_VERIFY_TOKEN || '';
const whatsappAppSecret = process.env.WHATSAPP_APP_SECRET || '';
const whatsappGraphApiVersion = process.env.WHATSAPP_GRAPH_API_VERSION || 'v23.0';
const conversationInactivityMinutes = Number(
  process.env.CONVERSATION_INACTIVITY_TIMEOUT_MINUTES || process.env.ADVISOR_INACTIVITY_TIMEOUT_MINUTES || 5
);
const conversationInactivityTimeoutMs = Number.isFinite(conversationInactivityMinutes) && conversationInactivityMinutes > 0
  ? conversationInactivityMinutes * 60 * 1000
  : 5 * 60 * 1000;
const botStartedAt = Math.floor(Date.now() / 1000);
const catalogReference = buildCatalogReference(catalogUrl);
const conversationStates = new Map();
const processedMessageIds = new Set();
const processedMessageQueue = [];
const maxProcessedMessageIds = 1000;
const apiConfigured = Boolean(whatsappAccessToken && whatsappPhoneNumberId);
let connectionStatus = apiConfigured ? 'listo' : 'configuracion incompleta';

const businessHoursByWeekday = {
  Mon: { start: 9 * 60, end: 18 * 60 },
  Tue: { start: 9 * 60, end: 18 * 60 },
  Wed: { start: 9 * 60, end: 18 * 60 },
  Thu: { start: 9 * 60, end: 18 * 60 },
  Fri: { start: 9 * 60, end: 15 * 60 },
  Sat: { start: 9 * 60, end: 18 * 60 }
};

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

const server = createServer((request, response) => {
  handleRequest(request, response).catch((error) => {
    console.error('Error interno de Pakabots:', error);
    response.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Error interno');
  });
});

server.listen(serverPort, '0.0.0.0', () => {
  console.log(`Pakabots Cloud API escuchando en puerto ${serverPort}.`);
  console.log(`Estado: ${connectionStatus}.`);

  if (!apiConfigured) {
    console.warn('Faltan WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID.');
  }

  if (!whatsappVerifyToken) {
    console.warn('Falta WHATSAPP_VERIFY_TOKEN para verificar el webhook en Meta.');
  }
});

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

async function handleRequest(request, response) {
  const requestUrl = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);

  if (requestUrl.pathname === '/health') {
    response.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({
      ok: true,
      status: connectionStatus,
      provider: 'whatsapp-cloud-api'
    }));
    return;
  }

  if (requestUrl.pathname === '/' && request.method === 'GET') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(`Pakabots Cloud API\nEstado: ${connectionStatus}\nWebhook: /webhook\n`);
    return;
  }

  if (requestUrl.pathname !== '/webhook') {
    response.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('No encontrado');
    return;
  }

  if (request.method === 'GET') {
    verifyWebhook(requestUrl, response);
    return;
  }

  if (request.method === 'POST') {
    await receiveWebhook(request, response);
    return;
  }

  response.writeHead(405, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Metodo no permitido');
}

function verifyWebhook(requestUrl, response) {
  const mode = requestUrl.searchParams.get('hub.mode');
  const token = requestUrl.searchParams.get('hub.verify_token');
  const challenge = requestUrl.searchParams.get('hub.challenge');

  if (mode === 'subscribe' && token && token === whatsappVerifyToken) {
    console.log('Webhook verificado correctamente por Meta.');
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end(challenge || '');
    return;
  }

  console.warn('Meta intento verificar el webhook con token incorrecto.');
  response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('Verificacion rechazada');
}

async function receiveWebhook(request, response) {
  const rawBody = await readRequestBody(request);

  if (!isValidWebhookSignature(rawBody, request.headers['x-hub-signature-256'])) {
    response.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('Firma invalida');
    return;
  }

  let payload;

  try {
    payload = JSON.parse(rawBody.toString('utf8'));
  } catch {
    response.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
    response.end('JSON invalido');
    return;
  }

  response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
  response.end('EVENT_RECEIVED');

  processWebhookPayload(payload).catch((error) => {
    console.error('No se pudo procesar webhook de WhatsApp:', error);
  });
}

async function processWebhookPayload(payload) {
  for (const incomingMessage of extractIncomingMessages(payload)) {
    if (shouldIgnoreIncomingMessage(incomingMessage)) {
      continue;
    }

    rememberProcessedMessage(incomingMessage.id);
    await handleIncomingText(incomingMessage);
  }
}

function extractIncomingMessages(payload) {
  const incomingMessages = [];

  for (const entry of payload.entry || []) {
    for (const change of entry.changes || []) {
      const value = change.value || {};

      for (const message of value.messages || []) {
        incomingMessages.push({
          id: message.id || '',
          from: message.from || '',
          timestamp: Number(message.timestamp || 0),
          text: extractMessageText(message)
        });
      }
    }
  }

  return incomingMessages;
}

function extractMessageText(message) {
  if (message.type === 'text') {
    return message.text?.body || '';
  }

  if (message.type === 'interactive') {
    return message.interactive?.button_reply?.id
      || message.interactive?.button_reply?.title
      || message.interactive?.list_reply?.id
      || message.interactive?.list_reply?.title
      || '';
  }

  if (message.type === 'button') {
    return message.button?.payload || message.button?.text || '';
  }

  return '';
}

function shouldIgnoreIncomingMessage(message) {
  if (!message.from) {
    return true;
  }

  if (message.id && processedMessageIds.has(message.id)) {
    return true;
  }

  return message.timestamp > 0 && message.timestamp < botStartedAt;
}

function rememberProcessedMessage(messageId) {
  if (!messageId) {
    return;
  }

  processedMessageIds.add(messageId);
  processedMessageQueue.push(messageId);

  while (processedMessageQueue.length > maxProcessedMessageIds) {
    processedMessageIds.delete(processedMessageQueue.shift());
  }
}

async function handleIncomingText(message) {
  const chatId = message.from;
  const text = normalizeMessage(message.text || '');

  console.log(`Mensaje entrante de ${maskChatId(chatId)}: ${text || '(vacio)'}`);

  if (!isWithinBusinessHours()) {
    await sendReply(chatId, unavailableReply);
    return;
  }

  if (shouldRestartAfterInactivity(chatId)) {
    clearConversationState(chatId);
    setMenuStep(chatId, 'main');
    await sendReply(chatId, mainMenu);
    return;
  }

  if (isAdvisorChatOpen(chatId) && !shouldBotHandleOpenChatMessage(text)) {
    touchAdvisorChat(chatId);
    console.log(`Chat abierto con asesor para ${maskChatId(chatId)}. Pakabots no respondio automatico.`);
    return;
  }

  if (!text) {
    await sendReply(chatId, mainMenu);
    setMenuStep(chatId, 'main');
    return;
  }

  if (restartOptions.has(text)) {
    closeAdvisorChat(chatId);
    setMenuStep(chatId, 'main');
    await sendReply(chatId, mainMenu);
    return;
  }

  const activeMenuStep = getMenuStep(chatId);

  if (activeMenuStep && !isValidMenuOption(activeMenuStep, text)) {
    await sendReply(chatId, buildMenuValidationReply(activeMenuStep));
    setMenuStep(chatId, activeMenuStep);
    return;
  }

  if (categoryReplies[text]) {
    await sendReply(chatId, buildCategoryReply(categoryReplies[text]));
    openAdvisorChat(chatId);
    return;
  }

  const reply = directReplies.get(text);

  if (reply) {
    await sendReply(chatId, reply);
    updateConversationState(chatId, text);
    return;
  }

  await sendReply(chatId, `No encontre esa opcion, pero con gusto te ayudo 😊

${mainMenu}`);
  setMenuStep(chatId, 'main');
}

async function sendReply(to, body) {
  await sendWhatsAppText(to, body);
}

async function sendWhatsAppText(to, body) {
  if (!apiConfigured) {
    throw new Error('Faltan WHATSAPP_ACCESS_TOKEN y/o WHATSAPP_PHONE_NUMBER_ID.');
  }

  const response = await fetch(`https://graph.facebook.com/${whatsappGraphApiVersion}/${whatsappPhoneNumberId}/messages`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${whatsappAccessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to,
      type: 'text',
      text: {
        preview_url: true,
        body
      }
    })
  });

  if (!response.ok) {
    const responseBody = await response.text();
    throw new Error(`WhatsApp Cloud API respondio ${response.status}: ${responseBody}`);
  }

  connectionStatus = 'listo';
}

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

  await sendReply(chatId, inactivityClosedReply);
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
  const visibleDigits = String(value || '').slice(-4);
  return `***${visibleDigits || 'desconocido'}`;
}

function readRequestBody(request, limitBytes = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let totalBytes = 0;

    request.on('data', (chunk) => {
      totalBytes += chunk.length;

      if (totalBytes > limitBytes) {
        reject(new Error('Webhook demasiado grande.'));
        request.destroy();
        return;
      }

      chunks.push(chunk);
    });

    request.on('end', () => resolve(Buffer.concat(chunks)));
    request.on('error', reject);
  });
}

function isValidWebhookSignature(rawBody, signatureHeader) {
  if (!whatsappAppSecret) {
    return true;
  }

  if (!signatureHeader || Array.isArray(signatureHeader)) {
    return false;
  }

  const expectedSignature = `sha256=${createHmac('sha256', whatsappAppSecret).update(rawBody).digest('hex')}`;
  const received = Buffer.from(signatureHeader);
  const expected = Buffer.from(expectedSignature);

  return received.length === expected.length && timingSafeEqual(received, expected);
}

async function shutdown(signal) {
  console.log(`Recibido ${signal}. Cerrando Pakabots...`);

  for (const state of conversationStates.values()) {
    clearConversationInactivityTimer(state);
  }

  server.close(() => {
    process.exit(0);
  });
}
