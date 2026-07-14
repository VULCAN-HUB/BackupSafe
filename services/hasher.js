const crypto = require('crypto');
const fs = require('fs');

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);
    s.on('data', (chunk) => h.update(chunk));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

module.exports = { hashBuffer, hashFile };
