const crypto = require('crypto');
const fs = require('fs');

/**
 * Hash documental segun seccion 8 del plan v2.1:
 *   SHA256(archivo + numero_factura + fecha + proveedor)
 *
 * Para la fase de ingesta (antes de OCR/IA) usamos solo el binario del archivo,
 * lo que garantiza idempotencia por contenido. El hash se refina mas adelante
 * en `documentHashFull` una vez extraidos los campos por IA.
 */
function fileSha256(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(filePath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function bufferSha256(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function documentHashFull(fileHashHex, { numero_factura, fecha, proveedor }) {
  return crypto
    .createHash('sha256')
    .update([fileHashHex, numero_factura || '', fecha || '', proveedor || ''].join('|'))
    .digest('hex');
}

module.exports = { fileSha256, bufferSha256, documentHashFull };
