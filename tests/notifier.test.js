const { notifyComplete, notifyProblem } = require('../services/notifier');

test('notifyComplete: 일반 알림 생성', () => {
  const created = [];
  const FakeNotification = function (opts) { created.push(opts); this.show = () => {}; };
  notifyComplete(FakeNotification, { ok: 320 });
  expect(created[0].title).toContain('완료');
});

test('notifyProblem: 강조 알림(문제 수 포함)', () => {
  const created = [];
  const FakeNotification = function (opts) { created.push(opts); this.show = () => {}; };
  notifyProblem(FakeNotification, { corrupt: 2, missing: 1 });
  expect(created[0].title).toContain('주의');
  expect(created[0].body).toContain('3');
});
