const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { renamePreview, applyToken, applyRename } = require('../services/renamer');

const index = [
  { relPath: 'B.JPG', shotAt: new Date('2026-06-19T10:00:00Z') },
  { relPath: 'A.JPG', shotAt: new Date('2026-06-19T09:00:00Z') },
];

test('파일 모드: 촬영일시 정렬 + 날짜(하이픈)+순번 패딩', () => {
  const out = renamePreview({
    pattern: '{날짜}_{순번}',
    index,
    options: { mode: 'file', dateDashed: true, seqPad: 3, seqStart: 1, sortBy: 'shotAt' },
  });
  expect(out).toEqual([
    { from: 'A.JPG', to: '2026-06-19_001.JPG', collision: false },
    { from: 'B.JPG', to: '2026-06-19_002.JPG', collision: false },
  ]);
});

test('날짜 미하이픈 토글', () => {
  const out = renamePreview({
    pattern: '{날짜}',
    index: [{ relPath: 'A.JPG', shotAt: new Date('2026-06-19T09:00:00Z') }],
    options: { mode: 'file', dateDashed: false, seqPad: 1, seqStart: 1, sortBy: 'name' },
  });
  expect(out[0].to).toBe('20260619.JPG');
});

test('충돌 감지: 같은 결과 이름이 둘 이상이면 collision 플래그', () => {
  const out = renamePreview({
    pattern: '{날짜}',
    index,
    options: { mode: 'file', dateDashed: true, seqPad: 1, seqStart: 1, sortBy: 'name' },
  });
  expect(out.every((x) => x.collision)).toBe(true);
});

test('폴더 모드: 파일 고유 토큰은 제거되고 클라이언트/촬영지만 반영', () => {
  const out = renamePreview({
    pattern: '{클라이언트명}_{촬영지}_{순번}{원본파일명}',
    index: [{ relPath: 'whatever.JPG', shotAt: new Date('2026-06-19T09:00:00Z') }],
    options: { mode: 'folder', dateDashed: true, seqPad: 3, seqStart: 1, sortBy: 'name',
               client: '김작가', location: '제주' },
    targetName: 'CARD_2026-06-19',
  });
  expect(out[0].to).toBe('김작가_제주_');
});

test('applyToken: 커서 위치에 토큰 삽입', () => {
  const r = applyToken('abXcd', 2, '{날짜}');
  expect(r.text).toBe('ab{날짜}Xcd');
  expect(r.cursor).toBe(2 + '{날짜}'.length);
});

test('applyRename: 모든 목적지에서 파일명 일괄 변경', async () => {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-rn-'));
  const folder = 'SET';
  await fs.mkdir(path.join(dest, folder), { recursive: true });
  await fs.writeFile(path.join(dest, folder, 'A.JPG'), 'a');
  const previews = [{ from: 'A.JPG', to: '2026-06-19_001.JPG', collision: false }];

  await applyRename({ destinations: [dest], folderName: folder, mode: 'file', previews });

  const renamed = path.join(dest, folder, '2026-06-19_001.JPG');
  expect(await fs.readFile(renamed, 'utf8')).toBe('a');
});

test('충돌 감지: 다른 하위 폴더의 같은 결과 파일명은 충돌 아님(파일 모드)', () => {
  const idx = [
    { relPath: path.join('100CANON', 'IMG_1.JPG'), shotAt: new Date('2026-06-19T09:00:00Z') },
    { relPath: path.join('101CANON', 'IMG_1.JPG'), shotAt: new Date('2026-06-19T10:00:00Z') },
  ];
  const out = renamePreview({
    pattern: '{원본파일명}',  // 둘 다 'IMG_1'이지만 서로 다른 폴더
    index: idx,
    options: { mode: 'file', dateDashed: true, seqPad: 1, seqStart: 1, sortBy: 'name' },
  });
  expect(out.every((p) => p.collision)).toBe(false);
});

test('충돌 감지: 같은 폴더 내 같은 결과 파일명은 충돌', () => {
  const idx = [
    { relPath: path.join('100CANON', 'IMG_1.JPG'), shotAt: new Date('2026-06-19T09:00:00Z') },
    { relPath: path.join('100CANON', 'IMG_2.JPG'), shotAt: new Date('2026-06-19T10:00:00Z') },
  ];
  const out = renamePreview({
    pattern: '{날짜}',  // 둘 다 같은 날짜, 같은 폴더 → 충돌
    index: idx,
    options: { mode: 'file', dateDashed: true, seqPad: 1, seqStart: 1, sortBy: 'name' },
  });
  expect(out.every((p) => p.collision)).toBe(true);
});
