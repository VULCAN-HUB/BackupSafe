const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { hashBuffer, hashFile } = require('../services/hasher');

test('hashBuffer: 알려진 입력의 SHA-256', () => {
  expect(hashBuffer(Buffer.from('abc'))).toBe(
    'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
  );
});

test('hashFile: 파일 내용의 SHA-256이 버퍼 해시와 일치', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-'));
  const f = path.join(dir, 'a.txt');
  await fs.writeFile(f, 'abc');
  const fileHash = await hashFile(f);
  expect(fileHash).toBe(hashBuffer(Buffer.from('abc')));
});
