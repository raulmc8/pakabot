# Pakabots WhatsApp

Chatbot de WhatsApp para Pakas.mx con menu de informacion, compras y soporte, usando la API oficial de WhatsApp Business Platform / Cloud API.

## Requisitos

- Node.js instalado para desarrollo local.
- Una app en Meta for Developers con WhatsApp configurado.
- Un numero de WhatsApp Business conectado a Cloud API.
- Un token permanente de acceso con permisos para enviar mensajes.

## Instalacion

```bash
npm install
cp .env.example .env
npm start
```

## Uso

El bot responde al saludo y a estas opciones:

- `1`: Informacion general.
- `2`: Compras.
- `2.1` a `2.7`: Categorias de pakas.
- `3`: Soporte.
- `3.1`: Seguimiento de envio.
- `3.2`: Compras mayoreo.
- `3.3`: Hablar con un asesor.
- `menu`: Volver al menu principal.

## Configuracion

Edita `.env` o las variables de Render:

- `WHATSAPP_ACCESS_TOKEN`: token de Cloud API para enviar mensajes.
- `WHATSAPP_PHONE_NUMBER_ID`: ID del numero telefonico en WhatsApp Cloud API.
- `WHATSAPP_VERIFY_TOKEN`: token privado que tambien debes capturar al configurar el webhook en Meta.
- `WHATSAPP_APP_SECRET`: secreto de la app de Meta para validar firmas de webhook. Es opcional, pero recomendado.
- `WHATSAPP_GRAPH_API_VERSION`: version de Graph API. Por defecto `v23.0`.
- `ADVISOR_PHONE`: telefono del asesor en formato internacional, solo numeros.
- `CATALOG_URL`: link publico del catalogo de WhatsApp Business para mostrarlo en el flujo de compras.
- `BUSINESS_TIME_ZONE`: zona horaria del horario de atencion. Por defecto `America/Mexico_City`.
- `CONVERSATION_INACTIVITY_TIMEOUT_MINUTES`: minutos de inactividad para cerrar una conversacion activa. Por defecto `5`.
- `SERVER_PORT`: puerto local. En Render se usa `PORT` automaticamente.

## Webhook

En Meta configura:

- Callback URL: `https://TU-SERVICIO.onrender.com/webhook`
- Verify token: el mismo valor de `WHATSAPP_VERIFY_TOKEN`
- Campo de webhook: `messages`

El endpoint `GET /health` responde el estado del servicio para Render.

## Comportamiento

Fuera del horario de servicio, el bot responde que el equipo puede tardar un poco en responder. El horario configurado es lunes a jueves de 9:00 am a 6:00 pm, viernes de 9:00 am a 3:00 pm, sabados de 9:00 am a 6:00 pm y domingos cerrado.

Cuando Pakabots muestra un menu, el cliente debe responder con una opcion valida de ese menu; si escribe texto libre, el bot le recuerda las opciones disponibles. Cuando un cliente ya eligio seguimiento, mayoreo, hablar con asesor o una categoria de compra, el chat queda abierto y Pakabots no vuelve a mandar el menu por mensajes libres. Si pasan 5 minutos sin actividad del cliente en un menu o con asesor, el bot envia un mensaje de cierre por inactividad y agradece el contacto. El siguiente mensaje del cliente inicia de nuevo con el menu principal. Tambien puede volver al inicio escribiendo `menu`.

## Deploy en Render

El proyecto incluye un `Dockerfile` y `render.yaml` para desplegarlo como Web Service. El servicio solo necesita Node.js y no usa navegador, QR ni sesion persistente de WhatsApp Web.

En Render:

1. Sube el repo a GitHub.
2. Crea o actualiza el Blueprint desde `render.yaml`.
3. Captura las variables privadas: `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `ADVISOR_PHONE` y `CATALOG_URL`.
4. Configura el webhook en Meta con `https://TU-SERVICIO.onrender.com/webhook`.
5. Verifica en logs que aparezca `Pakabots Cloud API escuchando`.
