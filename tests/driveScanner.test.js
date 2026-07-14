const { parseWindows, parseMac } = require('../services/driveScanner');

test('parseWindows: PowerShell JSON 출력 → 드라이브 목록', () => {
  const json = JSON.stringify([
    { DriveLetter: 'E', FileSystemLabel: 'CANON', Size: 64000000000, SizeRemaining: 1000000000 },
  ]);
  const drives = parseWindows(json);
  expect(drives[0]).toMatchObject({
    path: 'E:\\',
    label: 'CANON',
    total: 64000000000,
    free: 1000000000,
  });
});

test('parseMac: 탭 구분 라인 파싱', () => {
  const out = '/Volumes/CANON\tCANON\t64000000000\t1000000000\n';
  const drives = parseMac(out);
  expect(drives[0]).toMatchObject({
    path: '/Volumes/CANON',
    label: 'CANON',
    total: 64000000000,
    free: 1000000000,
  });
});
