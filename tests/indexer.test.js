const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { buildIndex } = require('../services/indexer');

async function makeCard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-card-'));
  await fs.mkdir(path.join(root, 'DCIM', '100CANON'), { recursive: true });
  await fs.writeFile(path.join(root, 'DCIM', '100CANON', 'IMG_1.JPG'), 'one');
  await fs.writeFile(path.join(root, 'DCIM', '100CANON', 'IMG_2.JPG'), 'twotwo');
  return root;
}

test('buildIndex: 하위 폴더까지 재귀, 상대경로 보존', async () => {
  const root = await makeCard();
  const index = await buildIndex(root);
  const rels = index.map((e) => e.relPath).sort();
  expect(rels).toEqual([
    path.join('DCIM', '100CANON', 'IMG_1.JPG'),
    path.join('DCIM', '100CANON', 'IMG_2.JPG'),
  ]);
  const e = index.find((x) => x.relPath.endsWith('IMG_2.JPG'));
  expect(e.size).toBe(6);
  expect(e.shotAt instanceof Date).toBe(true);
});

test('buildIndex: 시스템/숨김 폴더는 제외(System Volume Information, .Trashes 등)', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-sys-'));
  await fs.mkdir(path.join(root, 'DCIM'), { recursive: true });
  await fs.writeFile(path.join(root, 'DCIM', 'REAL.JPG'), 'photo');
  // 카드에 흔히 붙는 시스템 폴더들
  await fs.mkdir(path.join(root, 'System Volume Information'), { recursive: true });
  await fs.writeFile(path.join(root, 'System Volume Information', 'WPSettings.dat'), 'junk');
  await fs.mkdir(path.join(root, '.Trashes'), { recursive: true });
  await fs.writeFile(path.join(root, '.Trashes', 'x'), 'junk');
  await fs.mkdir(path.join(root, '.Spotlight-V100'), { recursive: true });
  await fs.writeFile(path.join(root, '.Spotlight-V100', 'y'), 'junk');

  const index = await buildIndex(root);
  const rels = index.map((e) => e.relPath);
  expect(rels).toEqual([path.join('DCIM', 'REAL.JPG')]);
});
