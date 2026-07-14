// 공통 브랜드 About 다이얼로그 (brand-common-design 사양)
function showAbout() {
  const overlay = document.createElement('div');
  overlay.className = 'about-overlay';
  overlay.innerHTML =
    '<div class="about-dialog">' +
      '<div class="about-banner">' +
        '<svg class="logo" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">' +
          '<path d="M24 4L40 10V23C40 33 33 40.5 24 44C15 40.5 8 33 8 23V10L24 4Z" fill="#fff" fill-opacity="0.95"/>' +
          '<path d="M16.5 24.5L21.5 29.5L32 18.5" stroke="#D35400" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>' +
        '</svg>' +
        '<div>' +
          '<div class="title">BackupSafe</div>' +
          '<div class="sub">메모리카드 백업 · 무결성 검증 · 이름변경</div>' +
        '</div>' +
      '</div>' +
      '<div class="about-body">' +
        '<div class="about-row"><span class="k">프로젝트</span><span class="v accent">PROJECT 06</span></div>' +
        '<div class="about-row"><span class="k">제작</span><span class="v">Unknown</span></div>' +
        '<div class="about-row"><span class="k">연도</span><span class="v">2026</span></div>' +
        '<div class="about-row"><span class="k">버전</span><span class="v">BETA Ver-0.1</span></div>' +
        '<div class="about-row"><span class="k">유튜브</span><span class="v"><a href="https://www.youtube.com/@unknown8563" target="_blank">▶ @unknown8563</a></span></div>' +
        '<div class="about-row"><span class="k">엔진</span><span class="v">Electron · Node.js · SHA-256</span></div>' +
        '<div class="about-row"><span class="k">플랫폼</span><span class="v">Windows 10/11 64-bit</span></div>' +
        '<div class="about-desc">메모리카드 촬영본을 여러 위치로 백업하고 해시로 무결성을 검증한 뒤, 통과 시 일괄 이름 변경까지 한 번에 처리합니다.</div>' +
      '</div>' +
      '<div class="about-btnbar"><button id="aboutOk">확인</button></div>' +
    '</div>';
  document.body.appendChild(overlay);
  const close = () => overlay.remove();
  overlay.querySelector('#aboutOk').onclick = close;
  overlay.onclick = (e) => { if (e.target === overlay) close(); };
}
