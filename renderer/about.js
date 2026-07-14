function showAbout() {
  const dlg = document.createElement('div');
  dlg.style.cssText =
    'position:fixed;inset:0;background:rgba(0,0,0,.6);display:flex;' +
    'align-items:center;justify-content:center;z-index:999';
  dlg.innerHTML =
    '<div style="background:#1a1a1a;border-radius:8px;width:420px;overflow:hidden">' +
    '<div style="background:linear-gradient(135deg,#D35400,#a33);padding:24px;font-size:20px;font-weight:700">BackupSafe</div>' +
    '<div style="padding:20px;line-height:1.8">' +
    '제작자: Unknown<br>연도: 2026<br>버전: 0.1.0<br>' +
    'YouTube: <a style="color:#D35400" href="https://www.youtube.com/@unknown8563" target="_blank">@unknown8563</a>' +
    '<p style="color:#888">메모리카드 다중 백업 + 무결성 검증 + 일괄 이름변경 도구</p>' +
    '<div style="text-align:right"><button id="aboutOk">확인</button></div>' +
    '</div></div>';
  document.body.appendChild(dlg);
  dlg.querySelector('#aboutOk').onclick = () => dlg.remove();
}
