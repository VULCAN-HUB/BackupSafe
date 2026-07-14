const path = require('path');
const fsp = require('fs/promises');

function fmtDate(d, dashed) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return dashed ? `${y}-${m}-${day}` : `${y}${m}${day}`;
}

function sortIndex(index, sortBy) {
  const copy = [...index];
  if (sortBy === 'name') {
    copy.sort((a, b) => a.relPath.localeCompare(b.relPath));
  } else {
    copy.sort((a, b) => a.shotAt - b.shotAt);
  }
  return copy;
}

// 커서 위치에 토큰 문자열을 삽입. 반환 {text, cursor}
function applyToken(text, cursor, token) {
  return {
    text: text.slice(0, cursor) + token + text.slice(cursor),
    cursor: cursor + token.length,
  };
}

// 패턴을 엔트리별 결과명으로 전개. 충돌(중복 결과명)은 collision:true.
function renamePreview({ pattern, index, options, targetName }) {
  const { mode, dateDashed, seqPad, seqStart, sortBy, client = '', location = '' } = options;
  const sorted = sortIndex(index, sortBy);

  const previews = sorted.map((entry, i) => {
    const ext = mode === 'file' ? path.extname(entry.relPath) : '';
    const base = mode === 'file' ? path.basename(entry.relPath, ext) : '';
    const seq = String(seqStart + i).padStart(seqPad, '0');

    let name = pattern
      .replace(/\{날짜\}/g, fmtDate(entry.shotAt, dateDashed))
      .replace(/\{클라이언트명\}/g, client)
      .replace(/\{촬영지\}/g, location);

    if (mode === 'folder') {
      name = name.replace(/\{순번\}/g, '').replace(/\{원본파일명\}/g, '');
    } else {
      name = name.replace(/\{순번\}/g, seq).replace(/\{원본파일명\}/g, base);
    }

    return { from: mode === 'file' ? entry.relPath : targetName, to: name + ext };
  });

  const keyOf = (p) =>
    mode === 'file' ? path.join(path.dirname(p.from), p.to) : p.to;
  const counts = {};
  for (const p of previews) { const k = keyOf(p); counts[k] = (counts[k] || 0) + 1; }
  for (const p of previews) p.collision = counts[keyOf(p)] > 1;

  return previews;
}

// previews를 모든 목적지에 적용. 충돌이 하나라도 있으면 throw(부분 적용 금지).
async function applyRename({ destinations, folderName, mode, previews }) {
  if (previews.some((p) => p.collision)) {
    throw new Error('이름 충돌이 있어 적용을 중단했습니다.');
  }
  for (const dest of destinations) {
    if (mode === 'folder') {
      const from = path.join(dest, folderName);
      const to = path.join(dest, previews[0].to);
      await fsp.rename(from, to);
    } else {
      for (const p of previews) {
        // p.from은 relPath(예: DCIM/A.JPG), p.to는 새 파일명만 → 같은 하위 폴더 안에서 rename
        const from = path.join(dest, folderName, p.from);
        const to = path.join(dest, folderName, path.dirname(p.from), p.to);
        if (from !== to) await fsp.rename(from, to);
      }
    }
  }
}

module.exports = { renamePreview, applyToken, fmtDate, applyRename };
