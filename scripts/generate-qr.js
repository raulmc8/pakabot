import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import QRCode from 'qrcode';

const qrData = process.argv.slice(2).join(' ').trim();

if (!qrData) {
  console.error('Uso: npm run qr -- "valor-de-WHATSAPP_QR_DATA"');
  process.exit(1);
}

mkdirSync('tmp', { recursive: true });

const outputPath = resolve('tmp/whatsapp-qr.png');

await QRCode.toFile(outputPath, qrData, {
  errorCorrectionLevel: 'M',
  margin: 4,
  width: 640,
  color: {
    dark: '#000000',
    light: '#ffffff'
  }
});

console.log(`QR generado: ${outputPath}`);
