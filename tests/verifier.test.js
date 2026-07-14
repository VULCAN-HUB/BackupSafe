const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { verifyAll } = require('../services/verifier');
const { hashBuffer } = require('../services/hasher');

async function tmp(p) { return fs.mkdtemp(path.join(os.tmpdir(), p)); }

test('verifyAll: 정상/누락/손상 3분류', async () => {
  const dest = await tmp('bsf-v-');
  const folder = 'SET_2026-06-19';
  await fs.mkdir(path.join(dest, folder), { recursive: true });
  await fs.writeFile(path.join(dest, folder, 'ok.JPG'), 'good');
  await fs.writeFile(path.join(dest, folder, 'bad.JPG'), 'CORRUPT');
  // 'missing.JPG'는 만들지 않음 → 누락

  const index = [
    { relPath: 'ok.JPG' },
    { relPath: 'bad.JPG' },
    { relPath: 'missing.JPG' },
  ];
  const hashes = {
    'ok.JPG': hashBuffer(Buffer.from('good')),
    'bad.JPG': hashBuffer(Buffer.from('original')),
    'missing.JPG': hashBuffer(Buffer.from('x')),
  };

  const res = await verifyAll({
    destinations: [dest],
    folderName: folder,
    index,
    hashes,
  });

  const r = res[0];
  expect(r.destination).toBe(dest);
  expect(r.ok).toBe(1);
  expect(r.corrupt.map((c) => c.relPath)).toEqual(['bad.JPG']);
  expect(r.missing.map((m) => m.relPath)).toEqual(['missing.JPG']);
  expect(r.allOk).toBe(false);
});
