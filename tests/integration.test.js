const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { buildIndex } = require('../services/indexer');
const { copyAll } = require('../services/copier');
const { verifyAll } = require('../services/verifier');
const { renamePreview, applyRename } = require('../services/renamer');

async function tmp(p) { return fs.mkdtemp(path.join(os.tmpdir(), p)); }

test('카드→2위치 복사→검증 전부정상→이름변경', async () => {
  const card = await tmp('bsf-int-card-');
  await fs.mkdir(path.join(card, 'DCIM'), { recursive: true });
  await fs.writeFile(path.join(card, 'DCIM', 'A.JPG'), 'aaa');
  await fs.writeFile(path.join(card, 'DCIM', 'B.JPG'), 'bbb');

  const d1 = await tmp('bsf-int-d1-');
  const d2 = await tmp('bsf-int-d2-');
  const folder = 'SET_2026-06-19';
  const index = await buildIndex(card);

  const { hashes, failures } = await copyAll({
    index, destinations: [d1, d2], folderName: folder, onProgress: () => {},
  });
  expect(failures).toEqual([]);

  const results = await verifyAll({ destinations: [d1, d2], folderName: folder, index, hashes });
  expect(results.every((r) => r.allOk)).toBe(true);

  const previews = renamePreview({
    pattern: '{날짜}_{순번}',
    index,
    options: { mode: 'file', dateDashed: true, seqPad: 3, seqStart: 1, sortBy: 'name' },
  });
  await applyRename({ destinations: [d1, d2], folderName: folder, mode: 'file', previews });

  const renamed1 = path.join(d1, folder, 'DCIM', previews.find((p) => p.from.endsWith('A.JPG')).to);
  expect(await fs.readFile(renamed1, 'utf8')).toBe('aaa');
});
