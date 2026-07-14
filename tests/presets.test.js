const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { savePreset, loadPresets } = require('../services/presets');

test('savePreset/loadPresets 라운드트립', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-ps-'));
  const file = path.join(dir, 'presets.json');

  await savePreset(file, '기본 백업 세트', ['E:/백업', 'F:/외장']);
  const presets = await loadPresets(file);

  expect(presets['기본 백업 세트']).toEqual(['E:/백업', 'F:/외장']);
});

test('loadPresets: 파일 없으면 빈 객체', async () => {
  const presets = await loadPresets('/nonexistent/path/presets.json');
  expect(presets).toEqual({});
});
