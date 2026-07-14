// Electron Notification 생성자를 주입받아 알림 발송(테스트 목 주입 가능).
function notifyComplete(NotificationCtor, { ok }) {
  const n = new NotificationCtor({
    title: '백업 완료',
    body: `모든 백업이 정상입니다 (정상 ${ok}장). 이제 카드를 포맷해도 안전합니다.`,
  });
  n.show();
}

function notifyProblem(NotificationCtor, { corrupt, missing }) {
  const n = new NotificationCtor({
    title: '⚠ 주의: 백업 문제 발견',
    body: `손상/누락 ${corrupt + missing}건 발견. 카드를 포맷하지 마세요.`,
    urgency: 'critical',
  });
  n.show();
}

module.exports = { notifyComplete, notifyProblem };
