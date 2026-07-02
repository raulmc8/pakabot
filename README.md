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
- `PUPPETEER_EXECUTABLE_PATH`: ruta de Edge, Chrome o Chromium si el bot no lo encuentra automaticamente.
- `BROWSER_HEADLESS`: usa `false` para abrir Edge visible o `true` para correrlo en modo invisible.
- `WWEBJS_AUTH_PATH`: ruta donde se guarda la sesion de WhatsApp. En deploy debe apuntar a un disco persistente.
- `PRINT_TERMINAL_QR`: usa `false` en Render para evitar que el QR de terminal salga cortado por los logs.
- `CLEAR_CHROMIUM_LOCKS`: usa `true` en Render para limpiar locks viejos de Chromium despues de reinicios.
- `ENABLE_QR_SERVER`: usa `true` para abrir una pagina privada con el QR actual.
- `QR_ACCESS_TOKEN`: token privado para proteger la pagina del QR.
- `BUSINESS_TIME_ZONE`: zona horaria del horario de atencion. Por defecto `America/Mexico_City`.
- `CONVERSATION_INACTIVITY_TIMEOUT_MINUTES`: minutos de inactividad para cerrar una conversacion activa. Por defecto `5`.

Fuera del horario de servicio, el bot responde que el equipo puede tardar un poco en responder. El horario configurado es lunes a jueves de 9:00 am a 6:00 pm, viernes de 9:00 am a 3:00 pm, sabados de 9:00 am a 6:00 pm y domingos cerrado. Cuando Pakabots muestra un menu, el cliente debe responder con una opcion valida de ese menu; si escribe texto libre, el bot le recuerda las opciones disponibles. Cuando un cliente ya eligio seguimiento, mayoreo, hablar con asesor o una categoria de compra, el chat queda abierto y Pakabots no vuelve a mandar el menu por mensajes libres. Si pasan 5 minutos sin actividad del cliente en un menu o con asesor, el bot envia un mensaje de cierre por inactividad y agradece el contacto. El siguiente mensaje del cliente inicia de nuevo con el menu principal. Tambien puede volver al inicio escribiendo `menu`.

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

El proyecto incluye un `Dockerfile` para correr el bot con Chromium en Linux y un `render.yaml` para desplegarlo como Web Service en Render. El Web Service mantiene el bot encendido y tambien expone una pagina privada para escanear el QR.

Requisitos para cloud:

- Repositorio GitHub/GitLab/Bitbucket con este codigo.
- Servicio tipo Web Service o proceso siempre encendido.
- Disco persistente montado en `/data` para conservar la sesion de WhatsApp.
- Variables de entorno configuradas, especialmente `ADVISOR_PHONE`.

En Render:

1. Sube el repo a GitHub.
2. Crea un Blueprint desde `render.yaml`.
3. Cuando Render lo pida, captura `ADVISOR_PHONE` en formato internacional, solo numeros.
4. Captura `QR_ACCESS_TOKEN` con una palabra o token privado.
5. Abre `https://TU-SERVICIO.onrender.com/qr?token=TU_TOKEN` y escanea el QR con WhatsApp desde `Dispositivos vinculados`.
6. Verifica en logs que aparezca `Pakabots esta listo para responder mensajes.`

Si Render muestra un QR dificil de escanear, copia el valor de la linea `WHATSAPP_QR_DATA=...` mas reciente y genera una imagen limpia localmente:

```bash
npm run qr -- "pega-aqui-el-valor-de-WHATSAPP_QR_DATA"
```

La imagen quedara en `tmp/whatsapp-qr.png`.
