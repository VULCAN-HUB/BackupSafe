const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { buildIndex } = require('../services/indexer');
const { hashBuffer } = require('../services/hasher');
const { copyAll } = require('../services/copier');

async function tmp(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('copyAll: 결과 폴더 생성, 구조 보존, 원본 해시 반환, 진행률 보고', async () => {
  const card = await tmp('bsf-card-');
  await fs.mkdir(path.join(card, 'DCIM'), { recursive: true });
  await fs.writeFile(path.join(card, 'DCIM', 'A.JPG'), 'aaa');
  await fs.writeFile(path.join(card, 'B.JPG'), 'bbbb');

  const dest1 = await tmp('bsf-d1-');
  const dest2 = await tmp('bsf-d2-');
  const index = await buildIndex(card);

  const progress = [];
  const result = await copyAll({
    index,
    destinations: [dest1, dest2],
    folderName: 'TESTSET_2026-06-19',
    onProgress: (p) => progress.push(p),
  });

  const a1 = path.join(dest1, 'TESTSET_2026-06-19', 'DCIM', 'A.JPG');
  expect(await fs.readFile(a1, 'utf8')).toBe('aaa');
  const b2 = path.join(dest2, 'TESTSET_2026-06-19', 'B.JPG');
  expect(await fs.readFile(b2, 'utf8')).toBe('bbbb');

  const aHash = result.hashes[path.join('DCIM', 'A.JPG')];
  expect(aHash).toBe(hashBuffer(Buffer.from('aaa')));

  expect(progress[progress.length - 1]).toMatchObject({ done: 2, total: 2 });
  expect(result.failures).toEqual([]);
});
