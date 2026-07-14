const BOM = String.fromCharCode(0xFEFF);

function esc(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 검증 결과를 CSV 문자열로. 항상 UTF-8 BOM으로 시작(Excel 한글 호환, D14).
function buildCsv(results) {
  const rows = [['위치', '정상', '손상', '누락', '문제파일']];
  for (const r of results) {
    const problems = [
      ...r.corrupt.map((c) => '손상:' + c.relPath),
      ...r.missing.map((m) => '누락:' + m.relPath),
    ].join(' | ');
    rows.push([r.destination, r.ok, r.corrupt.length, r.missing.length, problems]);
  }
  return BOM + rows.map((row) => row.map(esc).join(',')).join('\r\n');
}

module.exports = { buildCsv };
