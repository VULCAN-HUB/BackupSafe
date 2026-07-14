const fs = require('fs/promises');
const exifr = require('exifr');

// 파일의 촬영일시(EXIF DateTimeOriginal)를 반환. 없으면 파일 mtime으로 폴백.
async function getShotAt(filePath) {
  try {
    const parsed = await exifr.parse(filePath, ['DateTimeOriginal', 'CreateDate']);
    const d = parsed && (parsed.DateTimeOriginal || parsed.CreateDate);
    if (d instanceof Date && !isNaN(d.getTime())) return new Date(d.getTime());
  } catch (_) {
    // EXIF 파싱 실패는 폴백으로 처리
  }
  const stat = await fs.stat(filePath);
  return new Date(stat.mtime.getTime());
}

module.exports = { getShotAt };
