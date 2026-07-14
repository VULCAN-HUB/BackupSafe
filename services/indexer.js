const path = require('path');
const fs = require('fs/promises');
const { getShotAt } = require('./exif');

// 카드에 흔히 붙는 OS 시스템/숨김 폴더 — 백업·이름변경 대상에서 제외한다.
// (촬영본이 아니라 OS가 만든 메타 파일이라 포함 시 순번을 밀고 백업을 오염시킴)
const SKIP_DIRS = new Set([
  'System Volume Information', // Windows
  '$RECYCLE.BIN',             // Windows 휴지통
  '.Trashes',                 // macOS 휴지통
  '.Spotlight-V100',          // macOS 색인
  '.fseventsd',               // macOS 파일이벤트
  '.TemporaryItems',          // macOS 임시
]);

// rootDir 아래 모든 파일을 재귀 탐색해 인덱스 엔트리 배열을 반환.
// 엔트리: { relPath, absPath, size, mtime, shotAt }
async function buildIndex(rootDir) {
  const out = [];
  async function walk(dir) {
    let entries;
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch (_) {
      // 접근 불가(보호된 시스템 폴더 등)는 조용히 건너뛴다 — 크래시 방지
      return;
    }
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (SKIP_DIRS.has(ent.name)) continue; // 시스템/숨김 폴더 제외
        await walk(abs);
      } else if (ent.isFile()) {
        const stat = await fs.stat(abs);
        out.push({
          relPath: path.relative(rootDir, abs),
          absPath: abs,
          size: stat.size,
          mtime: stat.mtime,
          shotAt: await getShotAt(abs),
        });
      }
    }
  }
  await walk(rootDir);
  return out;
}

module.exports = { buildIndex };
