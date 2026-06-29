# Pakabots WhatsApp

Chatbot de WhatsApp para Pakas.mx con menu de informacion, compras y soporte.

## Requisitos

- Node.js instalado.
- Una cuenta de WhatsApp disponible para escanear el QR.

## Instalacion

```bash
npm install
cp .env.example .env
npm start
```

Al iniciar, la terminal mostrara un QR. Escanealo desde WhatsApp:

`WhatsApp > Dispositivos vinculados > Vincular un dispositivo`

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

Edita `.env` para cambiar:

- `ADVISOR_PHONE`: telefono del asesor en formato internacional, solo numeros.
- `CATALOG_URL`: enlace del catalogo.
- `WHOLESALE_URL`: enlace de compras por mayoreo.
- `TRACKING_URL`: enlace de rastreo.
- `PUPPETEER_EXECUTABLE_PATH`: ruta de Edge, Chrome o Chromium si el bot no lo encuentra automaticamente.
- `BROWSER_HEADLESS`: usa `false` para abrir Edge visible o `true` para correrlo en modo invisible.
- `WWEBJS_AUTH_PATH`: ruta donde se guarda la sesion de WhatsApp. En deploy debe apuntar a un disco persistente.
- `PRINT_TERMINAL_QR`: usa `false` en Render para evitar que el QR de terminal salga cortado por los logs.

En macOS, el bot intenta encontrar automaticamente estos navegadores:

```bash
/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge
/Applications/Google Chrome.app/Contents/MacOS/Google Chrome
/Applications/Chromium.app/Contents/MacOS/Chromium
```

## Nota importante

Este proyecto usa WhatsApp Web mediante `whatsapp-web.js`. Para produccion formal, alto volumen o integraciones empresariales, conviene usar la API oficial de WhatsApp Business.

## Como probarlo

1. Ejecuta `npm start`.
2. Edge debe abrir WhatsApp Web y la terminal tambien mostrara un QR.
3. En tu celular abre `WhatsApp > Dispositivos vinculados > Vincular un dispositivo`.
4. Escanea el QR.
5. Desde otro telefono o chat, manda `hola`, `1`, `2`, `2.1`, `3` o `3.3`.

## Deploy para pruebas

El proyecto incluye un `Dockerfile` para correr el bot con Chromium en Linux y un `render.yaml` para desplegarlo como Background Worker en Render.

Requisitos para cloud:

- Repositorio GitHub/GitLab/Bitbucket con este codigo.
- Servicio tipo worker o proceso siempre encendido.
- Disco persistente montado en `/data` para conservar la sesion de WhatsApp.
- Variables de entorno configuradas, especialmente `ADVISOR_PHONE`.

En Render:

1. Sube el repo a GitHub.
2. Crea un Blueprint desde `render.yaml`.
3. Cuando Render lo pida, captura `ADVISOR_PHONE` en formato internacional, solo numeros.
4. Abre los logs del worker y escanea el QR con WhatsApp desde `Dispositivos vinculados`.
5. Verifica en logs que aparezca `Pakabots esta listo para responder mensajes.`

Si Render muestra un QR dificil de escanear, copia el valor de la linea `WHATSAPP_QR_DATA=...` mas reciente y genera una imagen limpia localmente:

```bash
npm run qr -- "pega-aqui-el-valor-de-WHATSAPP_QR_DATA"
```

La imagen quedara en `tmp/whatsapp-qr.png`.
