const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

// 각 파일을 1회 읽어 모든 목적지 결과 폴더에 기록하고 원본 SHA-256을 계산.
// 반환: { hashes: {relPath: sha256}, failures: [{relPath, error}] }
async function copyAll({ index, destinations, folderName, onProgress }) {
  const hashes = {};
  const failures = [];
  const total = index.length;
  let done = 0;

  for (const entry of index) {
    try {
      const buf = await fs.readFile(entry.absPath);
      hashes[entry.relPath] = crypto.createHash('sha256').update(buf).digest('hex');

      for (const dest of destinations) {
        const target = path.join(dest, folderName, entry.relPath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buf);
      }
    } catch (error) {
      failures.push({ relPath: entry.relPath, error: String(error && error.message || error) });
    }
    done += 1;
    if (onProgress) onProgress({ done, total, relPath: entry.relPath });
  }

  return { hashes, failures };
}

module.exports = { copyAll };
