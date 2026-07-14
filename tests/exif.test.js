const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { getShotAt } = require('../services/exif');

test('EXIF 없는 파일은 mtime으로 폴백', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-exif-'));
  const f = path.join(dir, 'plain.txt');
  await fs.writeFile(f, 'no exif here');
  const known = new Date('2020-01-02T03:04:05Z');
  await fs.utimes(f, known, known);

  const shotAt = await getShotAt(f);
  expect(shotAt instanceof Date).toBe(true);
  expect(Math.abs(shotAt.getTime() - known.getTime())).toBeLessThan(2000);
});
