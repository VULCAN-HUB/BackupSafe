const api = window.backupsafe;
window.__renamerApplyToken = window.backupsafe.applyToken;
const state = {
  step: 1,
  card: null,
  destinations: [],
  folderName: '',
  index: null,
  hashes: null,
  results: null,
  verifiedOk: false,
};

let progressBound = false;

const panel = document.getElementById('panel');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
document.getElementById('aboutBtn').onclick = showAbout;

function goNext() { if (state.step < 4) setStep(state.step + 1); }

function setStep(n) {
  state.step = n;
  document.querySelectorAll('.steps span').forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
  });
  // footer 기본값 (각 render가 필요 시 재정의). Step 4·완료 화면은 자체 설정.
  prevBtn.style.display = '';
  nextBtn.style.display = '';
  nextBtn.textContent = '다음';
  nextBtn.onclick = goNext;
  render();
}

async function render() {
  if (state.step === 1) return renderCard();
  if (state.step === 2) return renderDest();
  if (state.step === 3) return renderCopy();
  if (state.step === 4) return renderRename();
}

async function renderCard() {
  panel.innerHTML = '<h2>메모리카드 선택</h2><div id="drives">스캔 중…</div>';
  prevBtn.disabled = true;
  nextBtn.disabled = !state.card;
  const drives = await api.scanDrives();
  const box = document.getElementById('drives');
  if (!drives.length) { box.textContent = '연결된 메모리카드가 없습니다. 카드를 연결하고 새로고침하세요.'; }
  box.innerHTML = drives.map((d, i) =>
    `<label class="row"><input type="radio" name="drv" data-i="${i}">` +
    `${d.label || '(이름없음)'} — ${d.path} (${fmtGB(d.free)} 여유)</label>`).join('') +
    '<button id="refresh">새로고침</button>';
  document.getElementById('refresh').onclick = renderCard;
  box.querySelectorAll('input[name=drv]').forEach((r) => {
    r.onchange = () => {
      state.card = drives[Number(r.dataset.i)];
      state.folderName = `${state.card.label || 'BackupSafe'}_${today()}`;
      nextBtn.disabled = false;
    };
  });
}

async function renderDest() {
  prevBtn.disabled = false;
  panel.innerHTML =
    '<h2>백업 위치</h2><div id="dests"></div>' +
    '<button id="add">+ 위치 추가</button>' +
    `<div class="row">결과 폴더명: <input id="folder" value="${state.folderName}" style="flex:1"></div>` +
    '<div id="warn" class="preview"></div>' +
    '<div class="preview">※ 클라우드 동기화 폴더(구글드라이브/드롭박스 등)는 로컬 폴더 기준으로만 검증됩니다. 클라우드 서버 업로드 완료는 별도로 확인하세요.</div>';
  drawDests();
  document.getElementById('add').onclick = async () => {
    const p = await api.pickFolder();
    if (p) { state.destinations.push({ path: p, active: true }); drawDests(); updateNext(); }
  };
  document.getElementById('folder').oninput = (e) => { state.folderName = e.target.value; };
  updateNext();
}
function drawDests() {
  const box = document.getElementById('dests');
  box.innerHTML = state.destinations.map((d, i) =>
    `<div class="row"><input type="checkbox" data-i="${i}" ${d.active ? 'checked' : ''}>` +
    `${d.path}<button data-del="${i}">삭제</button></div>`).join('');
  box.querySelectorAll('input[type=checkbox]').forEach((c) => {
    c.onchange = () => { state.destinations[Number(c.dataset.i)].active = c.checked; updateNext(); };
  });
  box.querySelectorAll('button[data-del]').forEach((b) => {
    b.onclick = () => { state.destinations.splice(Number(b.dataset.del), 1); drawDests(); updateNext(); };
  });
}
function updateNext() {
  nextBtn.disabled = !state.destinations.some((d) => d.active) || !state.folderName.trim();
  const warn = document.getElementById('warn');
  if (warn && state.card) {
    const usedGB = ((state.card.total - state.card.free) / 1e9).toFixed(1);
    warn.textContent = `복사할 카드 사용량 약 ${usedGB}GB — 각 백업 위치에 이만큼 여유가 있는지 확인하세요.`;
  }
}

async function renderCopy() {
  prevBtn.disabled = true;
  nextBtn.disabled = true;
  panel.innerHTML =
    '<h2>복사 · 검증</h2><div class="bar"><i id="prog"></i></div>' +
    '<div id="status" class="preview">인덱스 작성 중…</div><div id="res"></div>';
  if (!progressBound) {
    progressBound = true;
    api.onProgress((p) => {
      const bar = document.getElementById('prog');
      const status = document.getElementById('status');
      if (bar) bar.style.width = Math.round((p.done / p.total) * 100) + '%';
      if (status) status.textContent = `${p.phase === 'copy' ? '복사' : '검증'} ${p.done}/${p.total}`;
    });
  }

  state.index = await api.buildIndex(state.card.path);
  const active = state.destinations.filter((d) => d.active).map((d) => d.path);
  const { hashes } = await api.copy({ index: state.index, destinations: active, folderName: state.folderName });
  state.hashes = hashes;
  const results = await api.verify({ destinations: active, folderName: state.folderName, index: state.index, hashes });
  state.results = results;
  state.verifiedOk = results.every((r) => r.allOk);

  document.getElementById('res').innerHTML =
    results.map((r) =>
      `<div class="row">${r.allOk ? '✓' : '✗'} ${r.destination} — ` +
      `정상 ${r.ok} / 누락 ${r.missing.length} / 손상 ${r.corrupt.length}</div>`).join('') +
    (state.verifiedOk
      ? '<div class="banner-ok">✓ 모든 백업이 정상입니다. 이제 메모리카드를 포맷해도 안전합니다.</div>'
      : '<div class="banner-bad">✗ 누락/손상이 있습니다. 카드를 포맷하지 마세요.</div>') +
    '<button id="csv">리포트 내보내기(CSV)</button>';
  document.getElementById('csv').onclick = () => api.exportCsv(results);
  nextBtn.disabled = !state.verifiedOk;
}

async function renderRename() {
  prevBtn.disabled = false;
  // 마지막 단계 — '다음' 대신 '이름 변경 없이 저장(완료)'
  nextBtn.disabled = false;
  nextBtn.textContent = '이름 변경 없이 저장';
  nextBtn.onclick = () => finishFlow(false);
  const tokens = ['{날짜}', '{클라이언트명}', '{촬영지}', '{순번}', '{원본파일명}'];
  panel.innerHTML =
    '<h2>이름 변경</h2>' +
    '<div>' + tokens.map((t) => `<button class="token" data-t="${t}">${t}</button>`).join('') + '</div>' +
    '<div class="row">패턴: <input id="pat" style="flex:1" value="{날짜}_{순번}"></div>' +
    '<div class="row">대상: <select id="mode"><option value="file">파일명</option><option value="folder">폴더명</option></select>' +
    ' 날짜: <select id="dash"><option value="true">2026-06-19</option><option value="false">20260619</option></select>' +
    ' 정렬: <select id="sort"><option value="shotAt">촬영일시</option><option value="name">파일명</option></select>' +
    ' 자릿수: <input id="pad" type="number" value="3" style="width:50px"> 시작: <input id="start" type="number" value="1" style="width:50px"></div>' +
    '<div class="row">클라이언트: <input id="client"> 촬영지: <input id="loc"></div>' +
    '<div id="preview" class="preview"></div>' +
    '<button id="apply">모든 백업 위치에 적용</button>';

  const pat = document.getElementById('pat');
  panel.querySelectorAll('.token').forEach((b) => {
    b.onclick = () => {
      const pos = pat.selectionStart ?? pat.value.length;
      const r = window.__renamerApplyToken(pat.value, pos, b.dataset.t);
      pat.value = r.text; pat.focus(); pat.setSelectionRange(r.cursor, r.cursor);
      refreshPreview();
    };
  });
  ['pat', 'mode', 'dash', 'sort', 'pad', 'start', 'client', 'loc'].forEach((id) =>
    document.getElementById(id).oninput = refreshPreview);

  async function refreshPreview() {
    const opts = {
      mode: document.getElementById('mode').value,
      dateDashed: document.getElementById('dash').value === 'true',
      sortBy: document.getElementById('sort').value,
      seqPad: Number(document.getElementById('pad').value),
      seqStart: Number(document.getElementById('start').value),
      client: document.getElementById('client').value,
      location: document.getElementById('loc').value,
    };
    const previews = await api.preview({
      pattern: pat.value, index: state.index, options: opts, targetName: state.folderName,
    });
    window.__lastPreviews = previews;
    window.__lastMode = opts.mode;
    const collision = previews.some((p) => p.collision);
    document.getElementById('preview').innerHTML =
      previews.slice(0, 3).map((p) =>
        `<div class="${p.collision ? 'collision' : ''}">${p.from} → ${p.to}</div>`).join('') +
      (collision ? '<div class="collision">⚠ 이름 충돌이 있습니다.</div>' : '');
    document.getElementById('apply').disabled = collision;
  }
  refreshPreview();

  document.getElementById('apply').onclick = async () => {
    const applyBtn = document.getElementById('apply');
    applyBtn.disabled = true;
    const active = state.destinations.filter((d) => d.active).map((d) => d.path);
    await api.applyRename({
      destinations: active, folderName: state.folderName,
      mode: window.__lastMode, previews: window.__lastPreviews,
    });
    finishFlow(true);
  };
}

// 마지막 완료 화면 (이름변경 적용 후 또는 '이름 변경 없이 저장' 후)
function finishFlow(renamed) {
  const summary = (state.results || []).map((r) =>
    `<div class="row">${r.allOk ? '✓' : '✗'} ${r.destination} — 정상 ${r.ok} / 누락 ${r.missing.length} / 손상 ${r.corrupt.length}</div>`
  ).join('');
  panel.innerHTML =
    '<h2>완료</h2>' +
    (renamed
      ? '<div class="banner-ok">✓ 백업과 이름 변경이 모두 완료되었습니다.</div>'
      : '<div class="banner-ok">✓ 백업이 완료되었습니다. (이름은 원본 그대로 저장)</div>') +
    summary +
    (state.verifiedOk
      ? '<div class="preview" style="margin-top:12px">모든 백업이 정상 검증되었습니다. 이제 메모리카드를 포맷해도 안전합니다.</div>'
      : '') +
    `<div class="preview" style="margin-top:6px">결과 폴더명: <b>${state.folderName}</b></div>`;
  prevBtn.style.display = 'none';
  nextBtn.textContent = '새 백업 시작';
  nextBtn.disabled = false;
  nextBtn.onclick = resetFlow;
}

function resetFlow() {
  state.card = null;
  state.destinations = [];
  state.folderName = '';
  state.index = null;
  state.hashes = null;
  state.results = null;
  state.verifiedOk = false;
  setStep(1);
}

function fmtGB(bytes) { return (bytes / 1e9).toFixed(1) + 'GB'; }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

prevBtn.onclick = () => { if (state.step > 1) setStep(state.step - 1); };
setStep(1);
