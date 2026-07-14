const path = require('path');
const fsSync = require('fs');
const { hashFile } = require('./hasher');

// 각 목적지 결과 폴더의 파일을 원본 해시와 비교해 정상/누락/손상으로 분류.
// 반환: 목적지별 { destination, ok, corrupt[], missing[], allOk }
async function verifyAll({ destinations, folderName, index, hashes, onProgress }) {
  const results = [];
  const total = destinations.length * index.length;
  let done = 0;

  for (const dest of destinations) {
    let ok = 0;
    const corrupt = [];
    const missing = [];

    for (const entry of index) {
      const target = path.join(dest, folderName, entry.relPath);
      if (!fsSync.existsSync(target)) {
        missing.push({ relPath: entry.relPath });
      } else {
        const actual = await hashFile(target);
        if (actual === hashes[entry.relPath]) ok += 1;
        else corrupt.push({ relPath: entry.relPath });
      }
      done += 1;
      if (onProgress) onProgress({ done, total, destination: dest });
    }

    results.push({
      destination: dest,
      ok,
      corrupt,
      missing,
      allOk: corrupt.length === 0 && missing.length === 0,
    });
  }

  return results;
}

module.exports = { verifyAll };
