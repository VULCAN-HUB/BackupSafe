const { buildCsv } = require('../services/reporter');

test('buildCsv: UTF-8 BOM 시작 + 위치별 행', () => {
  const results = [
    { destination: 'E:/백업', ok: 320, corrupt: [{ relPath: 'x.JPG' }], missing: [] },
  ];
  const csv = buildCsv(results);
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('E:/백업');
  expect(csv).toContain('320');
  expect(csv).toContain('x.JPG');
});
