# BackupSafe Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 메모리카드 촬영본을 여러 백업 위치로 복사하고 SHA-256으로 무결성을 검증한 뒤, 검증 통과 시 일괄 이름 변경까지 처리하는 Electron 크로스플랫폼 데스크탑 앱을 만든다.

**Architecture:** 메인 프로세스(Node.js: 파일시스템·해시·드라이브 감지·알림)와 렌더러 프로세스(순수 HTML/CSS/JS 마법사 UI)를 분리하고, `preload.js`의 `contextBridge` + IPC로만 통신한다. 비즈니스 로직은 전부 `services/`의 순수 모듈로 분리해 Jest로 단위 테스트하고, Electron 셸은 그 위에 IPC 핸들러로 얇게 얹는다.

**Tech Stack:** Electron, Node.js (`fs/promises`, `crypto`, `worker_threads`, `child_process`), exifr(EXIF), Jest(테스트), electron-builder(패키징).

**참조 스펙:** `docs/superpowers/specs/2026-06-19-backupsafe-design.md` (결정 D1~D16).

---

## File Structure

```
package.json                  스크립트(start/test), 의존성
main.js                       앱 부트스트랩, BrowserWindow, IPC 라우팅
preload.js                    contextBridge로 허용 IPC만 노출
services/
  driveScanner.js   이동식 드라이브 감지 (process.platform 분기: Win=PowerShell, Mac=diskutil)
  indexer.js        카드 재귀 탐색 → 파일 인덱스 {relPath,size,mtime,shotAt}
  exif.js           EXIF 촬영일시 추출 + mtime 폴백 (exifr)
  hasher.js         SHA-256 스트리밍(파일/버퍼), 검증 재해시
  copier.js         결과 폴더 생성 + 파일 단위 팬아웃 복사 + 원본 해시 동시계산 + 진행률
  verifier.js       위치별 정상/누락/손상 분류
  renamer.js        토큰 패턴 파싱 + 미리보기 + 충돌 감지 + 일괄 적용 (파일/폴더 구분)
  reporter.js       검증 결과 CSV(UTF-8 BOM) 생성
  presets.js        백업 위치 프리셋 저장/불러오기 (userData JSON)
  notifier.js       OS 알림 (완료 / 손상·누락 강조)
renderer/
  index.html        마법사 셸 + 4 스텝 컨테이너
  styles.css        브랜드 다크테마 (#111111/#D35400)
  app.js            스텝 상태머신 + IPC 호출 + 진행률 렌더
  about.js          About 다이얼로그
tests/
  *.test.js         각 service 단위 테스트 + 통합 1종
```

각 `services/` 모듈은 Electron에 의존하지 않는 순수 Node 모듈로 작성해 Jest에서 그대로 import한다. 알림(notifier)만 Electron `Notification`을 받으므로 주입식으로 설계해 테스트에서 목을 끼운다.

---

## Task 0: 프로젝트 스캐폴딩

**Files:**
- Create: `package.json`
- Create: `.gitignore` (이미 존재하면 확인만)
- Create: `jest.config.js`

- [ ] **Step 1: package.json 작성**

```json
{
  "name": "backupsafe",
  "version": "0.1.0",
  "description": "메모리카드 다중 백업 + SHA-256 무결성 검증 + 일괄 이름변경",
  "main": "main.js",
  "scripts": {
    "start": "electron .",
    "test": "jest"
  },
  "author": "Unknown",
  "license": "UNLICENSED",
  "devDependencies": {
    "electron": "^31.0.0",
    "jest": "^29.7.0"
  },
  "dependencies": {
    "exifr": "^7.1.3"
  }
}
```

- [ ] **Step 2: jest.config.js 작성**

```js
module.exports = {
  testEnvironment: 'node',
  testMatch: ['**/tests/**/*.test.js'],
};
```

- [ ] **Step 3: .gitignore 확인/보강**

내용에 아래가 포함되어야 한다 (없으면 추가):

```
node_modules/
dist/
*.log
```

- [ ] **Step 4: 의존성 설치**

Run: `npm install`
Expected: `node_modules/` 생성, exifr·electron·jest 설치 (오류 없이 종료).

- [ ] **Step 5: Jest 동작 확인용 임시 테스트**

Create `tests/smoke.test.js`:

```js
test('jest runs', () => {
  expect(1 + 1).toBe(2);
});
```

Run: `npm test`
Expected: 1 passed.

- [ ] **Step 6: 임시 테스트 삭제 후 커밋**

```bash
rm tests/smoke.test.js
git add package.json jest.config.js .gitignore
git commit -m "chore: 프로젝트 스캐폴딩 (package.json, jest)"
```

---

## Task 1: hasher.js — SHA-256

**Files:**
- Create: `services/hasher.js`
- Test: `tests/hasher.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/hasher.test.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { hashBuffer, hashFile } = require('../services/hasher');

test('hashBuffer: 알려진 입력의 SHA-256', () => {
  // echo -n "abc" | sha256sum
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/hasher.test.js`
Expected: FAIL — "Cannot find module '../services/hasher'".

- [ ] **Step 3: 구현**

`services/hasher.js`:

```js
const crypto = require('crypto');
const fs = require('fs');

function hashBuffer(buf) {
  return crypto.createHash('sha256').update(buf).digest('hex');
}

// 스트리밍 해시 (대용량 파일도 메모리 한 번에 안 올림)
function hashFile(filePath) {
  return new Promise((resolve, reject) => {
    const h = crypto.createHash('sha256');
    const s = fs.createReadStream(filePath);
    s.on('data', (chunk) => h.update(chunk));
    s.on('end', () => resolve(h.digest('hex')));
    s.on('error', reject);
  });
}

module.exports = { hashBuffer, hashFile };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/hasher.test.js`
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/hasher.js tests/hasher.test.js
git commit -m "feat: hasher SHA-256 (buffer/file streaming)"
```

---

## Task 2: exif.js — 촬영일시 추출

**Files:**
- Create: `services/exif.js`
- Test: `tests/exif.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/exif.test.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { getShotAt } = require('../services/exif');

test('EXIF 없는 파일은 mtime으로 폴백', async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-exif-'));
  const f = path.join(dir, 'plain.txt');
  await fs.writeFile(f, 'no exif here');
  const known = new Date('2020-01-02T03:04:05Z');
  await fs.utimes(f, known, known);

  const shotAt = await getShotAt(f);
  expect(shotAt instanceof Date).toBe(true);
  // mtime 폴백이므로 known과 같은 시각
  expect(Math.abs(shotAt.getTime() - known.getTime())).toBeLessThan(2000);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/exif.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/exif.js`:

```js
const fs = require('fs/promises');
const exifr = require('exifr');

// 파일의 촬영일시(EXIF DateTimeOriginal)를 반환. 없으면 파일 mtime으로 폴백.
async function getShotAt(filePath) {
  try {
    const parsed = await exifr.parse(filePath, ['DateTimeOriginal', 'CreateDate']);
    const d = parsed && (parsed.DateTimeOriginal || parsed.CreateDate);
    if (d instanceof Date && !isNaN(d.getTime())) return d;
  } catch (_) {
    // EXIF 파싱 실패는 폴백으로 처리 (조용히 무시하되 폴백 보장)
  }
  const stat = await fs.stat(filePath);
  return stat.mtime;
}

module.exports = { getShotAt };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/exif.test.js`
Expected: 1 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/exif.js tests/exif.test.js
git commit -m "feat: exif 촬영일시 추출 + mtime 폴백"
```

---

## Task 3: indexer.js — 카드 파일 인덱스

**Files:**
- Create: `services/indexer.js`
- Test: `tests/indexer.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/indexer.test.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { buildIndex } = require('../services/indexer');

async function makeCard() {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-card-'));
  await fs.mkdir(path.join(root, 'DCIM', '100CANON'), { recursive: true });
  await fs.writeFile(path.join(root, 'DCIM', '100CANON', 'IMG_1.JPG'), 'one');
  await fs.writeFile(path.join(root, 'DCIM', '100CANON', 'IMG_2.JPG'), 'twotwo');
  return root;
}

test('buildIndex: 하위 폴더까지 재귀, 상대경로 보존', async () => {
  const root = await makeCard();
  const index = await buildIndex(root);
  const rels = index.map((e) => e.relPath).sort();
  expect(rels).toEqual([
    path.join('DCIM', '100CANON', 'IMG_1.JPG'),
    path.join('DCIM', '100CANON', 'IMG_2.JPG'),
  ]);
  const e = index.find((x) => x.relPath.endsWith('IMG_2.JPG'));
  expect(e.size).toBe(6);
  expect(e.shotAt instanceof Date).toBe(true);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/indexer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/indexer.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const { getShotAt } = require('./exif');

// rootDir 아래 모든 파일을 재귀 탐색해 인덱스 엔트리 배열을 반환.
// 엔트리: { relPath, absPath, size, mtime, shotAt }
async function buildIndex(rootDir) {
  const out = [];
  async function walk(dir) {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    for (const ent of entries) {
      const abs = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        await walk(abs);
      } else if (ent.isFile()) {
        const stat = await fs.stat(abs);
        out.push({
          relPath: path.relative(rootDir, abs),
          absPath: abs,
          size: stat.size,
          mtime: stat.mtime,
          shotAt: await getShotAt(abs),
        });
      }
    }
  }
  await walk(rootDir);
  return out;
}

module.exports = { buildIndex };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/indexer.test.js`
Expected: 1 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/indexer.js tests/indexer.test.js
git commit -m "feat: indexer 카드 재귀 인덱스(상대경로·크기·촬영일)"
```

---

## Task 4: copier.js — 결과 폴더 생성 + 팬아웃 복사 + 원본 해시

구현 결정: 각 파일을 카드에서 한 번만 읽어(스트림) 버퍼로 모은 뒤 활성 위치의 결과 폴더에 기록하고 같은 버퍼로 SHA-256을 계산한다(D2/D3/D12/D13). 진행률은 콜백으로 보고한다.

**Files:**
- Create: `services/copier.js`
- Test: `tests/copier.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/copier.test.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { buildIndex } = require('../services/indexer');
const { hashBuffer } = require('../services/hasher');
const { copyAll } = require('../services/copier');

async function tmp(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test('copyAll: 결과 폴더 생성, 구조 보존, 원본 해시 반환, 진행률 보고', async () => {
  const card = await tmp('bsf-card-');
  await fs.mkdir(path.join(card, 'DCIM'), { recursive: true });
  await fs.writeFile(path.join(card, 'DCIM', 'A.JPG'), 'aaa');
  await fs.writeFile(path.join(card, 'B.JPG'), 'bbbb');

  const dest1 = await tmp('bsf-d1-');
  const dest2 = await tmp('bsf-d2-');
  const index = await buildIndex(card);

  const progress = [];
  const result = await copyAll({
    index,
    destinations: [dest1, dest2],
    folderName: 'TESTSET_2026-06-19',
    onProgress: (p) => progress.push(p),
  });

  // 두 위치 모두 결과 폴더 아래 구조 보존
  const a1 = path.join(dest1, 'TESTSET_2026-06-19', 'DCIM', 'A.JPG');
  expect(await fs.readFile(a1, 'utf8')).toBe('aaa');
  const b2 = path.join(dest2, 'TESTSET_2026-06-19', 'B.JPG');
  expect(await fs.readFile(b2, 'utf8')).toBe('bbbb');

  // 원본 해시가 인덱스 relPath별로 채워짐
  const aHash = result.hashes[path.join('DCIM', 'A.JPG')];
  expect(aHash).toBe(hashBuffer(Buffer.from('aaa')));

  // 진행률은 마지막에 2/2
  expect(progress[progress.length - 1]).toMatchObject({ done: 2, total: 2 });
  // 실패 없음
  expect(result.failures).toEqual([]);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/copier.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/copier.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const crypto = require('crypto');

// 각 파일을 1회 읽어 모든 목적지 결과 폴더에 기록하고 원본 SHA-256을 계산.
// 반환: { hashes: {relPath: sha256}, failures: [{relPath, error}] }
async function copyAll({ index, destinations, folderName, onProgress }) {
  const hashes = {};
  const failures = [];
  const total = index.length;
  let done = 0;

  for (const entry of index) {
    try {
      const buf = await fs.readFile(entry.absPath);
      hashes[entry.relPath] = crypto.createHash('sha256').update(buf).digest('hex');

      for (const dest of destinations) {
        const target = path.join(dest, folderName, entry.relPath);
        await fs.mkdir(path.dirname(target), { recursive: true });
        await fs.writeFile(target, buf);
      }
    } catch (error) {
      failures.push({ relPath: entry.relPath, error: String(error && error.message || error) });
    }
    done += 1;
    if (onProgress) onProgress({ done, total, relPath: entry.relPath });
  }

  return { hashes, failures };
}

module.exports = { copyAll };
```

> 참고: 수백 GB 카드의 메모리 안전을 위해 추후 `fs.readFile` 통째 읽기를 청크 스트리밍(읽으며 해시 update + 각 목적지 write 스트림에 분기)으로 교체할 수 있다. 1차는 파일 단위 단순 구현으로 진행하되, 단일 초대용량 파일(>2GB) 우려 시 이 단계에서 스트리밍으로 바꾼다. 인터페이스(copyAll 시그니처)는 동일하게 유지한다.

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/copier.test.js`
Expected: 1 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/copier.js tests/copier.test.js
git commit -m "feat: copier 결과폴더 팬아웃 복사 + 원본 해시 동시계산"
```

---

## Task 5: verifier.js — 위치별 정상/누락/손상 분류

**Files:**
- Create: `services/verifier.js`
- Test: `tests/verifier.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/verifier.test.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { verifyAll } = require('../services/verifier');
const { hashBuffer } = require('../services/hasher');

async function tmp(p) { return fs.mkdtemp(path.join(os.tmpdir(), p)); }

test('verifyAll: 정상/누락/손상 3분류', async () => {
  const dest = await tmp('bsf-v-');
  const folder = 'SET_2026-06-19';
  // 정상 파일
  await fs.mkdir(path.join(dest, folder), { recursive: true });
  await fs.writeFile(path.join(dest, folder, 'ok.JPG'), 'good');
  // 손상 파일 (내용 다름)
  await fs.writeFile(path.join(dest, folder, 'bad.JPG'), 'CORRUPT');
  // 'missing.JPG'는 만들지 않음 → 누락

  const index = [
    { relPath: 'ok.JPG' },
    { relPath: 'bad.JPG' },
    { relPath: 'missing.JPG' },
  ];
  const hashes = {
    'ok.JPG': hashBuffer(Buffer.from('good')),
    'bad.JPG': hashBuffer(Buffer.from('original')),
    'missing.JPG': hashBuffer(Buffer.from('x')),
  };

  const res = await verifyAll({
    destinations: [dest],
    folderName: folder,
    index,
    hashes,
  });

  const r = res[0];
  expect(r.destination).toBe(dest);
  expect(r.ok).toBe(1);
  expect(r.corrupt.map((c) => c.relPath)).toEqual(['bad.JPG']);
  expect(r.missing.map((m) => m.relPath)).toEqual(['missing.JPG']);
  expect(r.allOk).toBe(false);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/verifier.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/verifier.js`:

```js
const path = require('path');
const fsSync = require('fs');
const { hashFile } = require('./hasher');

// 각 목적지 결과 폴더의 파일을 원본 해시와 비교해 정상/누락/손상으로 분류.
// 반환: 목적지별 { destination, ok, corrupt[], missing[], allOk }
async function verifyAll({ destinations, folderName, index, hashes, onProgress }) {
  const results = [];
  const total = destinations.length * index.length;
  let done = 0;

  for (const dest of destinations) {
    let ok = 0;
    const corrupt = [];
    const missing = [];

    for (const entry of index) {
      const target = path.join(dest, folderName, entry.relPath);
      if (!fsSync.existsSync(target)) {
        missing.push({ relPath: entry.relPath });
      } else {
        const actual = await hashFile(target);
        if (actual === hashes[entry.relPath]) ok += 1;
        else corrupt.push({ relPath: entry.relPath });
      }
      done += 1;
      if (onProgress) onProgress({ done, total, destination: dest });
    }

    results.push({
      destination: dest,
      ok,
      corrupt,
      missing,
      allOk: corrupt.length === 0 && missing.length === 0,
    });
  }

  return results;
}

module.exports = { verifyAll };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/verifier.test.js`
Expected: 1 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/verifier.js tests/verifier.test.js
git commit -m "feat: verifier 위치별 정상/누락/손상 분류"
```

---

## Task 6: renamer.js — 토큰 패턴 파싱·미리보기·충돌 감지

토큰: `{날짜} {클라이언트명} {촬영지} {순번} {원본파일명}`. 옵션: `dateDashed`(D7), `seqPad`·`seqStart`(자릿수/시작번호), `sortBy`('shotAt'|'name', D9), `mode`('file'|'folder', D16), `client`·`location` 입력값. 폴더 모드에서는 `{순번}`·`{원본파일명}`을 빈 문자열로 처리(D16).

**Files:**
- Create: `services/renamer.js`
- Test: `tests/renamer.test.js`

- [ ] **Step 1: 실패 테스트 작성 (날짜·순번·정렬)**

`tests/renamer.test.js`:

```js
const { renamePreview, applyToken } = require('../services/renamer');

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
  // 촬영 빠른 A.JPG가 001
  expect(out).toEqual([
    { from: 'A.JPG', to: '2026-06-19_001.JPG' },
    { from: 'B.JPG', to: '2026-06-19_002.JPG' },
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
  // 둘 다 2026-06-19.JPG → 충돌
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
  const r = applyToken('abXcd', 2, '{날짜}'); // 커서 index 2
  expect(r.text).toBe('ab{날짜}Xcd');
  expect(r.cursor).toBe(2 + '{날짜}'.length);
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/renamer.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/renamer.js`:

```js
const path = require('path');

function fmtDate(d, dashed) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return dashed ? `${y}-${m}-${day}` : `${y}${m}${day}`;
}

function sortIndex(index, sortBy) {
  const copy = [...index];
  if (sortBy === 'name') {
    copy.sort((a, b) => a.relPath.localeCompare(b.relPath));
  } else {
    copy.sort((a, b) => a.shotAt - b.shotAt);
  }
  return copy;
}

// 커서 위치에 토큰 문자열을 삽입. 반환 {text, cursor}
function applyToken(text, cursor, token) {
  return {
    text: text.slice(0, cursor) + token + text.slice(cursor),
    cursor: cursor + token.length,
  };
}

// 패턴을 엔트리별 결과명으로 전개. 충돌(중복 결과명)은 collision:true.
function renamePreview({ pattern, index, options, targetName }) {
  const { mode, dateDashed, seqPad, seqStart, sortBy, client = '', location = '' } = options;
  const sorted = sortIndex(index, sortBy);

  const previews = sorted.map((entry, i) => {
    const ext = mode === 'file' ? path.extname(entry.relPath) : '';
    const base = mode === 'file' ? path.basename(entry.relPath, ext) : '';
    const seq = String(seqStart + i).padStart(seqPad, '0');

    let name = pattern
      .replace(/\{날짜\}/g, fmtDate(entry.shotAt, dateDashed))
      .replace(/\{클라이언트명\}/g, client)
      .replace(/\{촬영지\}/g, location);

    if (mode === 'folder') {
      // D16: 폴더 모드는 파일 고유 토큰 비활성
      name = name.replace(/\{순번\}/g, '').replace(/\{원본파일명\}/g, '');
    } else {
      name = name.replace(/\{순번\}/g, seq).replace(/\{원본파일명\}/g, base);
    }

    return { from: mode === 'file' ? entry.relPath : targetName, to: name + ext };
  });

  // 충돌 감지
  const counts = {};
  for (const p of previews) counts[p.to] = (counts[p.to] || 0) + 1;
  for (const p of previews) p.collision = counts[p.to] > 1;

  return previews;
}

module.exports = { renamePreview, applyToken, fmtDate };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/renamer.test.js`
Expected: 5 passed.

- [ ] **Step 5: 일괄 적용 함수 실패 테스트 추가**

`tests/renamer.test.js`에 추가:

```js
const fs = require('fs/promises');
const os = require('os');
const { applyRename } = require('../services/renamer');

test('applyRename: 모든 목적지에서 파일명 일괄 변경', async () => {
  const dest = await fs.mkdtemp(path.join(os.tmpdir(), 'bsf-rn-'));
  const folder = 'SET';
  await fs.mkdir(path.join(dest, folder), { recursive: true });
  await fs.writeFile(path.join(dest, folder, 'A.JPG'), 'a');
  const previews = [{ from: 'A.JPG', to: '2026-06-19_001.JPG' }];

  await applyRename({ destinations: [dest], folderName: folder, mode: 'file', previews });

  const renamed = path.join(dest, folder, '2026-06-19_001.JPG');
  expect(await fs.readFile(renamed, 'utf8')).toBe('a');
});
```

- [ ] **Step 6: 실패 확인**

Run: `npx jest tests/renamer.test.js -t applyRename`
Expected: FAIL — applyRename is not a function.

- [ ] **Step 7: applyRename 구현 추가**

`services/renamer.js`에 추가 (그리고 export에 포함):

```js
const fsp = require('fs/promises');

// previews를 모든 목적지에 적용. 충돌이 하나라도 있으면 throw(부분 적용 금지).
async function applyRename({ destinations, folderName, mode, previews }) {
  if (previews.some((p) => p.collision)) {
    throw new Error('이름 충돌이 있어 적용을 중단했습니다.');
  }
  for (const dest of destinations) {
    if (mode === 'folder') {
      const from = path.join(dest, folderName);
      const to = path.join(dest, previews[0].to);
      await fsp.rename(from, to);
    } else {
      for (const p of previews) {
        // p.from은 relPath(예: DCIM/A.JPG), p.to는 새 파일명만 → 같은 하위 폴더 안에서 rename
        const from = path.join(dest, folderName, p.from);
        const to = path.join(dest, folderName, path.dirname(p.from), p.to);
        if (from !== to) await fsp.rename(from, to);
      }
    }
  }
}

module.exports = { renamePreview, applyToken, fmtDate, applyRename };
```

- [ ] **Step 8: 통과 확인**

Run: `npx jest tests/renamer.test.js`
Expected: 6 passed.

- [ ] **Step 9: 커밋**

```bash
git add services/renamer.js tests/renamer.test.js
git commit -m "feat: renamer 토큰 패턴·미리보기·충돌감지·일괄적용(파일/폴더)"
```

---

## Task 7: reporter.js — CSV 리포트 (UTF-8 BOM)

**Files:**
- Create: `services/reporter.js`
- Test: `tests/reporter.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/reporter.test.js`:

```js
const { buildCsv } = require('../services/reporter');

test('buildCsv: UTF-8 BOM 시작 + 위치별 행', () => {
  const results = [
    { destination: 'E:/백업', ok: 320, corrupt: [{ relPath: 'x.JPG' }], missing: [] },
  ];
  const csv = buildCsv(results);
  // BOM
  expect(csv.charCodeAt(0)).toBe(0xfeff);
  expect(csv).toContain('E:/백업');
  expect(csv).toContain('320');
  expect(csv).toContain('x.JPG');
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/reporter.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/reporter.js`:

```js
const BOM = '﻿';

function esc(v) {
  const s = String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

// 검증 결과를 CSV 문자열로. 항상 UTF-8 BOM으로 시작(Excel 한글 호환, D14).
function buildCsv(results) {
  const rows = [['위치', '정상', '손상', '누락', '문제파일']];
  for (const r of results) {
    const problems = [
      ...r.corrupt.map((c) => '손상:' + c.relPath),
      ...r.missing.map((m) => '누락:' + m.relPath),
    ].join(' | ');
    rows.push([r.destination, r.ok, r.corrupt.length, r.missing.length, problems]);
  }
  return BOM + rows.map((row) => row.map(esc).join(',')).join('\r\n');
}

module.exports = { buildCsv };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/reporter.test.js`
Expected: 1 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/reporter.js tests/reporter.test.js
git commit -m "feat: reporter CSV(UTF-8 BOM) 검증 리포트"
```

---

## Task 8: presets.js — 백업 위치 프리셋

저장 위치는 호출 측이 주입(userData 경로). 테스트에서는 임시 디렉터리를 주입.

**Files:**
- Create: `services/presets.js`
- Test: `tests/presets.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/presets.test.js`:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/presets.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/presets.js`:

```js
const fs = require('fs/promises');
const path = require('path');

async function loadPresets(file) {
  try {
    const raw = await fs.readFile(file, 'utf8');
    return JSON.parse(raw);
  } catch (_) {
    return {};
  }
}

async function savePreset(file, name, locations) {
  const presets = await loadPresets(file);
  presets[name] = locations;
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, JSON.stringify(presets, null, 2), 'utf8');
  return presets;
}

module.exports = { loadPresets, savePreset };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/presets.test.js`
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/presets.js tests/presets.test.js
git commit -m "feat: presets 백업 위치 프리셋 저장/불러오기"
```

---

## Task 9: driveScanner.js — 이동식 드라이브 감지 (OS 분기)

OS 명령 호출 부분과 출력 파싱 부분을 분리해, 파싱만 단위 테스트한다(D 스펙: OS 명령은 모킹).

**Files:**
- Create: `services/driveScanner.js`
- Test: `tests/driveScanner.test.js`

- [ ] **Step 1: 실패 테스트 작성 (파서)**

`tests/driveScanner.test.js`:

```js
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

test('parseMac: diskutil plist 대신 단순화된 라인 파싱', () => {
  // 우리 명령이 돌려주는 형식: "<mount>\t<label>\t<total>\t<free>"
  const out = '/Volumes/CANON\tCANON\t64000000000\t1000000000\n';
  const drives = parseMac(out);
  expect(drives[0]).toMatchObject({
    path: '/Volumes/CANON',
    label: 'CANON',
    total: 64000000000,
    free: 1000000000,
  });
});
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/driveScanner.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/driveScanner.js`:

```js
const { execFile } = require('child_process');
const util = require('util');
const execFileP = util.promisify(execFile);

function parseWindows(jsonText) {
  let arr = JSON.parse(jsonText);
  if (!Array.isArray(arr)) arr = [arr];
  return arr
    .filter((d) => d.DriveLetter)
    .map((d) => ({
      path: `${d.DriveLetter}:\\`,
      label: d.FileSystemLabel || '',
      total: Number(d.Size) || 0,
      free: Number(d.SizeRemaining) || 0,
    }));
}

function parseMac(text) {
  return text
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => {
      const [mount, label, total, free] = l.split('\t');
      return {
        path: mount,
        label: label || '',
        total: Number(total) || 0,
        free: Number(free) || 0,
      };
    });
}

// 실제 시스템 스캔 (process.platform 분기). 테스트에서는 호출하지 않음.
async function scanDrives() {
  if (process.platform === 'win32') {
    // 이동식(USB/카드) 디스크의 파티션만: BusType USB 또는 removable
    const ps = `Get-Disk | Where-Object { $_.BusType -eq 'USB' } | Get-Partition | Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,FileSystemLabel,Size,SizeRemaining | ConvertTo-Json -Compress`;
    const { stdout } = await execFileP('powershell.exe', ['-NoProfile', '-Command', ps]);
    return stdout.trim() ? parseWindows(stdout) : [];
  } else {
    // macOS: /Volumes 마운트 중 외장(external)만, 탭 구분으로 단순화
    const script = `for v in /Volumes/*; do
  info=$(diskutil info "$v" 2>/dev/null)
  echo "$info" | grep -q "Removable Media:.*Removable\\|Device Location:.*External" || continue
  total=$(df -k "$v" | tail -1 | awk '{print $2*1024}')
  free=$(df -k "$v" | tail -1 | awk '{print $4*1024}')
  printf "%s\\t%s\\t%s\\t%s\\n" "$v" "$(basename "$v")" "$total" "$free"
done`;
    const { stdout } = await execFileP('/bin/bash', ['-c', script]);
    return parseMac(stdout);
  }
}

module.exports = { scanDrives, parseWindows, parseMac };
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/driveScanner.test.js`
Expected: 2 passed.

- [ ] **Step 5: 전체 테스트 회귀 확인**

Run: `npm test`
Expected: 모든 테스트 통과.

- [ ] **Step 6: 커밋**

```bash
git add services/driveScanner.js tests/driveScanner.test.js
git commit -m "feat: driveScanner OS 분기 감지 + 출력 파서"
```

---

## Task 10: notifier.js — OS 알림

Electron `Notification`을 주입받아 사용(테스트에서 목 주입).

**Files:**
- Create: `services/notifier.js`
- Test: `tests/notifier.test.js`

- [ ] **Step 1: 실패 테스트 작성**

`tests/notifier.test.js`:

```js
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
```

- [ ] **Step 2: 실패 확인**

Run: `npx jest tests/notifier.test.js`
Expected: FAIL — module not found.

- [ ] **Step 3: 구현**

`services/notifier.js`:

```js
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
```

- [ ] **Step 4: 통과 확인**

Run: `npx jest tests/notifier.test.js`
Expected: 2 passed.

- [ ] **Step 5: 커밋**

```bash
git add services/notifier.js tests/notifier.test.js
git commit -m "feat: notifier OS 알림(완료/문제 강조)"
```

---

## Task 11: 통합 테스트 — 전체 플로우

**Files:**
- Test: `tests/integration.test.js`

- [ ] **Step 1: 통합 테스트 작성**

`tests/integration.test.js`:

```js
const path = require('path');
const fs = require('fs/promises');
const os = require('os');
const { buildIndex } = require('../services/indexer');
const { copyAll } = require('../services/copier');
const { verifyAll } = require('../services/verifier');
const { renamePreview, applyRename } = require('../services/renamer');

async function tmp(p) { return fs.mkdtemp(path.join(os.tmpdir(), p)); }

test('카드→2위치 복사→검증 전부정상→이름변경', async () => {
  const card = await tmp('bsf-int-card-');
  await fs.mkdir(path.join(card, 'DCIM'), { recursive: true });
  await fs.writeFile(path.join(card, 'DCIM', 'A.JPG'), 'aaa');
  await fs.writeFile(path.join(card, 'DCIM', 'B.JPG'), 'bbb');

  const d1 = await tmp('bsf-int-d1-');
  const d2 = await tmp('bsf-int-d2-');
  const folder = 'SET_2026-06-19';
  const index = await buildIndex(card);

  const { hashes, failures } = await copyAll({
    index, destinations: [d1, d2], folderName: folder, onProgress: () => {},
  });
  expect(failures).toEqual([]);

  const results = await verifyAll({ destinations: [d1, d2], folderName: folder, index, hashes });
  expect(results.every((r) => r.allOk)).toBe(true);

  // 이름변경 (파일명, 촬영일 정렬)
  const previews = renamePreview({
    pattern: '{날짜}_{순번}',
    index,
    options: { mode: 'file', dateDashed: true, seqPad: 3, seqStart: 1, sortBy: 'name' },
  });
  await applyRename({ destinations: [d1, d2], folderName: folder, mode: 'file', previews });

  // d1, d2 모두 변경된 이름으로 존재 (relPath 하위 폴더 유지)
  const renamed1 = path.join(d1, folder, 'DCIM', previews.find((p) => p.from.endsWith('A.JPG')).to);
  expect(await fs.readFile(renamed1, 'utf8')).toBe('aaa');
});
```

> 참고: Task 6의 `applyRename` 파일 모드는 `to` 경로를 `path.join(dest, folderName, path.dirname(p.from), p.to)`로 만들어 하위 폴더(`DCIM/`)를 유지한 채 파일명만 바꾼다. 이 통합 테스트가 그 동작을 검증한다.

- [ ] **Step 2: 통합 테스트 실행**

Run: `npx jest tests/integration.test.js`
Expected: PASS. (실패 시 위 주의의 dirname 보정을 Task 6 `applyRename`에 적용하고 재실행.)

- [ ] **Step 3: 전체 회귀**

Run: `npm test`
Expected: 전체 통과.

- [ ] **Step 4: 커밋**

```bash
git add tests/integration.test.js services/renamer.js
git commit -m "test: 전체 플로우 통합 테스트(복사→검증→이름변경)"
```

---

## Task 12: Electron 셸 — main.js + preload.js

이 단계부터는 Jest로 자동 검증이 어려운 GUI 배선이다. 각 IPC 핸들러는 위 services를 호출만 한다. 수동 실행(`npm start`)으로 확인한다.

**Files:**
- Create: `main.js`
- Create: `preload.js`

- [ ] **Step 1: preload.js 작성**

```js
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('backupsafe', {
  scanDrives: () => ipcRenderer.invoke('scan-drives'),
  pickFolder: () => ipcRenderer.invoke('pick-folder'),
  buildIndex: (cardPath) => ipcRenderer.invoke('build-index', cardPath),
  copy: (args) => ipcRenderer.invoke('copy', args),
  verify: (args) => ipcRenderer.invoke('verify', args),
  preview: (args) => ipcRenderer.invoke('rename-preview', args),
  applyRename: (args) => ipcRenderer.invoke('apply-rename', args),
  exportCsv: (results) => ipcRenderer.invoke('export-csv', results),
  loadPresets: () => ipcRenderer.invoke('load-presets'),
  savePreset: (name, locations) => ipcRenderer.invoke('save-preset', { name, locations }),
  onProgress: (cb) => ipcRenderer.on('progress', (_e, p) => cb(p)),
});
```

- [ ] **Step 2: main.js 작성**

```js
const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs/promises');

const driveScanner = require('./services/driveScanner');
const { buildIndex } = require('./services/indexer');
const { copyAll } = require('./services/copier');
const { verifyAll } = require('./services/verifier');
const renamer = require('./services/renamer');
const { buildCsv } = require('./services/reporter');
const presets = require('./services/presets');
const notifier = require('./services/notifier');

let win;
const presetFile = () => path.join(app.getPath('userData'), 'presets.json');

function createWindow() {
  win = new BrowserWindow({
    width: 1100,
    height: 760,
    backgroundColor: '#111111',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.loadFile('renderer/index.html');
}

app.whenReady().then(() => {
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

ipcMain.handle('scan-drives', () => driveScanner.scanDrives());

ipcMain.handle('pick-folder', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openDirectory'] });
  return r.canceled ? null : r.filePaths[0];
});

ipcMain.handle('build-index', (_e, cardPath) => buildIndex(cardPath));

ipcMain.handle('copy', async (_e, { index, destinations, folderName }) => {
  return copyAll({
    index, destinations, folderName,
    onProgress: (p) => win.webContents.send('progress', { phase: 'copy', ...p }),
  });
});

ipcMain.handle('verify', async (_e, { destinations, folderName, index, hashes }) => {
  const results = await verifyAll({
    destinations, folderName, index, hashes,
    onProgress: (p) => win.webContents.send('progress', { phase: 'verify', ...p }),
  });
  const allOk = results.every((r) => r.allOk);
  if (allOk) {
    const ok = results.reduce((s, r) => s + r.ok, 0);
    notifier.notifyComplete(Notification, { ok });
  } else {
    const corrupt = results.reduce((s, r) => s + r.corrupt.length, 0);
    const missing = results.reduce((s, r) => s + r.missing.length, 0);
    notifier.notifyProblem(Notification, { corrupt, missing });
  }
  return results;
});

ipcMain.handle('rename-preview', (_e, args) => renamer.renamePreview(args));
ipcMain.handle('apply-rename', (_e, args) => renamer.applyRename(args));

ipcMain.handle('export-csv', async (_e, results) => {
  const r = await dialog.showSaveDialog(win, { defaultPath: 'backup-report.csv' });
  if (r.canceled) return null;
  await fs.writeFile(r.filePath, buildCsv(results), 'utf8');
  return r.filePath;
});

ipcMain.handle('load-presets', () => presets.loadPresets(presetFile()));
ipcMain.handle('save-preset', (_e, { name, locations }) =>
  presets.savePreset(presetFile(), name, locations));
```

- [ ] **Step 3: 실행 확인 (렌더러는 다음 Task에서 완성되므로 빈 화면이라도 부팅 확인)**

먼저 최소 `renderer/index.html`을 생성:

```html
<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><title>BackupSafe</title></head>
<body style="background:#111;color:#fff;font-family:sans-serif"><h1>BackupSafe</h1></body></html>
```

Run: `npm start`
Expected: 다크 배경 창이 뜨고 "BackupSafe" 표시. 콘솔에 preload/IPC 오류 없음. 창 닫으면 종료.

- [ ] **Step 4: 커밋**

```bash
git add main.js preload.js renderer/index.html
git commit -m "feat: Electron 셸(main/preload) + IPC 라우팅"
```

---

## Task 13: 렌더러 마법사 UI

GUI는 수동 검증한다. 스텝 상태머신 + IPC 호출 + 진행률 표시 + 검증 게이트 + 이름변경.

**Files:**
- Modify: `renderer/index.html` (전체 교체)
- Create: `renderer/styles.css`
- Create: `renderer/app.js`
- Create: `renderer/about.js`

- [ ] **Step 1: index.html — 4스텝 컨테이너**

`renderer/index.html` 전체 교체:

```html
<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8">
  <title>BackupSafe</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body>
  <header class="appbar">
    <span class="wordmark">BackupSafe</span>
    <button id="aboutBtn" class="about-q" title="정보">?</button>
  </header>
  <nav class="steps">
    <span data-step="1" class="active">1 카드</span>
    <span data-step="2">2 백업 위치</span>
    <span data-step="3">3 복사·검증</span>
    <span data-step="4">4 이름 변경</span>
  </nav>
  <main id="panel"></main>
  <footer class="navbar">
    <button id="prevBtn">이전</button>
    <button id="nextBtn">다음</button>
  </footer>
  <script src="about.js"></script>
  <script src="app.js"></script>
</body>
</html>
```

- [ ] **Step 2: styles.css — 브랜드 다크테마**

`renderer/styles.css`:

```css
:root { --bg:#111111; --accent:#D35400; --fg:#f0f0f0; --muted:#888; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--fg);
  font-family:'Pretendard','Malgun Gothic',sans-serif; }
.appbar { display:flex; align-items:center; justify-content:space-between;
  padding:12px 20px; border-bottom:1px solid #222; }
.wordmark { font-family:'Rajdhani',sans-serif; font-weight:700; font-size:22px;
  letter-spacing:1px; }
.wordmark::first-letter { color:var(--accent); }
.about-q { width:22px;height:22px;border-radius:50%;border:1px solid var(--muted);
  background:none;color:var(--fg);cursor:pointer; }
.about-q:hover { background:var(--accent); border-color:var(--accent); }
.steps { display:flex; gap:8px; padding:10px 20px; color:var(--muted); }
.steps span { padding:4px 10px; border-radius:4px; }
.steps span.active { background:var(--accent); color:#fff; }
.steps span.done { color:var(--accent); }
main { padding:20px; min-height:420px; }
.navbar { display:flex; justify-content:flex-end; gap:10px; padding:14px 20px;
  border-top:1px solid #222; }
button { background:var(--accent); color:#fff; border:none; padding:8px 18px;
  border-radius:4px; cursor:pointer; font-size:14px; }
button:disabled { background:#333; color:#666; cursor:not-allowed; }
.row { display:flex; align-items:center; gap:10px; padding:8px;
  border-bottom:1px solid #222; }
.badge { font-size:11px; padding:2px 6px; border-radius:3px; background:#333; }
.bar { height:14px; background:#222; border-radius:7px; overflow:hidden; }
.bar > i { display:block; height:100%; background:var(--accent); width:0; }
.banner-ok { background:#1d3a1d; border:1px solid #3a3; padding:12px; border-radius:6px; }
.banner-bad { background:#3a1d1d; border:1px solid #a33; padding:12px; border-radius:6px; }
.token { background:#333; margin:2px; padding:4px 8px; font-size:12px; }
.preview { color:var(--muted); font-size:13px; }
.collision { color:#f66; }
</style>
```

(주의: 위 마지막 줄 `</style>`는 오타이므로 넣지 말 것 — CSS 파일에는 `</style>` 태그가 없어야 한다.)

- [ ] **Step 3: about.js — About 다이얼로그**

`renderer/about.js`:

```js
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
```

- [ ] **Step 4: app.js — 스텝 상태머신**

`renderer/app.js`:

```js
const api = window.backupsafe;
const state = {
  step: 1,
  card: null,        // {path,label,...}
  destinations: [],  // [{path, active}]
  folderName: '',
  index: null,
  hashes: null,
  results: null,
  verifiedOk: false,
};

const panel = document.getElementById('panel');
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
document.getElementById('aboutBtn').onclick = showAbout;

function setStep(n) {
  state.step = n;
  document.querySelectorAll('.steps span').forEach((el) => {
    const s = Number(el.dataset.step);
    el.classList.toggle('active', s === n);
    el.classList.toggle('done', s < n);
  });
  render();
}

async function render() {
  if (state.step === 1) return renderCard();
  if (state.step === 2) return renderDest();
  if (state.step === 3) return renderCopy();
  if (state.step === 4) return renderRename();
}

// ---- Step 1: 카드 선택 ----
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

// ---- Step 2: 백업 위치 ----
async function renderDest() {
  prevBtn.disabled = false;
  panel.innerHTML =
    '<h2>백업 위치</h2><div id="dests"></div>' +
    '<button id="add">+ 위치 추가</button>' +
    `<div class="row">결과 폴더명: <input id="folder" value="${state.folderName}" style="flex:1"></div>` +
    '<div id="warn" class="preview"></div>';
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
}

// ---- Step 3: 복사·검증 ----
async function renderCopy() {
  prevBtn.disabled = true;
  nextBtn.disabled = true;
  panel.innerHTML =
    '<h2>복사 · 검증</h2><div class="bar"><i id="prog"></i></div>' +
    '<div id="status" class="preview">인덱스 작성 중…</div><div id="res"></div>';
  const bar = document.getElementById('prog');
  const status = document.getElementById('status');
  api.onProgress((p) => {
    bar.style.width = Math.round((p.done / p.total) * 100) + '%';
    status.textContent = `${p.phase === 'copy' ? '복사' : '검증'} ${p.done}/${p.total}`;
  });

  state.index = await api.buildIndex(state.card.path);
  const active = state.destinations.filter((d) => d.active).map((d) => d.path);
  const { hashes } = await api.copy({ index: state.index, destinations: active, folderName: state.folderName });
  state.hashes = hashes;
  const results = await api.verify({ destinations: active, folderName: state.folderName, index: state.index, hashes });
  state.results = results;
  state.verifiedOk = results.every((r) => r.allOk);

  document.getElementById('res').innerHTML =
    results.map((r) =>
      `<div class="row">${state.verifiedOk ? '✓' : (r.allOk ? '✓' : '✗')} ${r.destination} — ` +
      `정상 ${r.ok} / 누락 ${r.missing.length} / 손상 ${r.corrupt.length}</div>`).join('') +
    (state.verifiedOk
      ? '<div class="banner-ok">✓ 모든 백업이 정상입니다. 이제 메모리카드를 포맷해도 안전합니다.</div>'
      : '<div class="banner-bad">✗ 누락/손상이 있습니다. 카드를 포맷하지 마세요.</div>') +
    '<button id="csv">리포트 내보내기(CSV)</button>';
  document.getElementById('csv').onclick = () => api.exportCsv(results);
  nextBtn.disabled = !state.verifiedOk; // 검증 게이트
}

// ---- Step 4: 이름 변경 ----
async function renderRename() {
  prevBtn.disabled = false;
  nextBtn.disabled = true;
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
    const active = state.destinations.filter((d) => d.active).map((d) => d.path);
    await api.applyRename({
      destinations: active, folderName: state.folderName,
      mode: window.__lastMode, previews: window.__lastPreviews,
    });
    document.getElementById('preview').innerHTML += '<div class="banner-ok">이름 변경 완료.</div>';
  };
}

// ---- helpers ----
function fmtGB(bytes) { return (bytes / 1e9).toFixed(1) + 'GB'; }
function today() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

prevBtn.onclick = () => { if (state.step > 1) setStep(state.step - 1); };
nextBtn.onclick = () => { if (state.step < 4) setStep(state.step + 1); };
setStep(1);
```

- [ ] **Step 5: applyToken을 렌더러에 노출**

`renamer.applyToken`은 메인 프로세스 모듈이라 렌더러에서 직접 못 쓴다. preload에 추가한다.

`preload.js`의 `exposeInMainWorld('backupsafe', {...})` 객체에 한 줄 추가:

```js
  // (기존 키들 아래에 추가)
  applyToken: (text, cursor, token) => {
    // 순수 문자열 연산이라 IPC 없이 preload에서 직접 수행
    return { text: text.slice(0, cursor) + token + text.slice(cursor), cursor: cursor + token.length };
  },
```

그리고 `renderer/app.js` 상단에 브리지 추가:

```js
window.__renamerApplyToken = window.backupsafe.applyToken;
```

(app.js의 `const api = window.backupsafe;` 다음 줄에 넣는다.)

- [ ] **Step 6: 수동 실행 검증**

Run: `npm start`
Expected 체크리스트:
- Step1: 카드 목록 표시(실제 USB 카드/이동식 드라이브). 선택 시 다음 활성화.
- Step2: 폴더 추가/체크/삭제, 결과 폴더명 기본값 표시. 활성 위치 1+ 이면 다음 활성화.
- Step3: 진행 바 차오름, 위치별 결과 카드, 전부 정상 시 초록 배너 + 다음 활성화(게이트). OS 알림 표시.
- Step4: 토큰 클릭 삽입, 미리보기 갱신, 충돌 시 적용 버튼 비활성, 적용 후 실제 파일명 변경 확인.

- [ ] **Step 7: 커밋**

```bash
git add renderer/ preload.js
git commit -m "feat: 렌더러 마법사 UI 4스텝(카드/위치/복사검증/이름변경)"
```

---

## Task 14: electron-builder 패키징 설정 (빌드는 추후)

**Files:**
- Modify: `package.json` (build 설정 추가)
- Create: `build/` (아이콘 자리, 추후 .ico/.icns)

- [ ] **Step 1: package.json에 build 설정 추가**

`package.json`에 `devDependencies`로 `electron-builder` 추가하고 최상위에 `build` 블록 추가:

```json
  "build": {
    "appId": "com.unknown.backupsafe",
    "productName": "BackupSafe",
    "directories": { "output": "dist" },
    "files": ["main.js", "preload.js", "renderer/**/*", "services/**/*", "package.json"],
    "win": { "target": "nsis", "icon": "build/icon.ico" },
    "mac": { "target": "dmg", "icon": "build/icon.icns" }
  }
```

그리고 `scripts`에 추가: `"dist": "electron-builder"`.

- [ ] **Step 2: 의존성 설치**

Run: `npm install electron-builder --save-dev`
Expected: 설치 완료.

- [ ] **Step 3: Windows 빌드 (현재 PC에서 가능)**

Run: `npm run dist`
Expected: `dist/`에 NSIS 설치 파일 생성. (아이콘 미준비 시 기본 아이콘 경고는 무시 가능, 실패하면 `win.icon` 줄을 임시 제거.)

> macOS `.dmg` 빌드는 Mac 실기에서만 가능(cross-platform-prep 패턴). 코드/설정은 준비 완료 상태로 둔다.

- [ ] **Step 4: 커밋**

```bash
git add package.json
git commit -m "build: electron-builder 패키징 설정(win nsis / mac dmg)"
```

---

## Self-Review (작성자 체크 결과)

**1. 스펙 커버리지:** D1(원본 불변=카드 read만, copier가 카드에 안 씀) ✓ / D2·D3(copier 파일단위 1회 읽기+해시) ✓ / D4(클라우드 배지=Step2 badge, UI 텍스트) ✓ / D5(4스텝 마법사) ✓ / D6·D7(토큰 삽입·날짜토글) ✓ / D8(순수 JS) ✓ / D9(sortBy) ✓ / D10·D16(폴더모드 토큰 구분) ✓ / D11(여유 경고=Step2 warn, 단순 비교) ✓ / D12·D13(결과폴더·구조보존 copier) ✓ / D14(CSV BOM reporter) ✓ / D15(중단 정리 안함=실패 기록 후 검증 노출, 별도 정리 코드 없음) ✓.

**2. 플레이스홀더:** 각 코드 스텝에 완전한 코드 포함. styles.css 스텝의 `</style>` 오타는 명시적 경고로 처리.

**3. 타입/시그니처 일관성:** `copyAll`→`{hashes,failures}`, `verifyAll`→`[{destination,ok,corrupt,missing,allOk}]`, `renamePreview`→`[{from,to,collision}]`, `applyRename({destinations,folderName,mode,previews})`가 main.js·app.js·통합테스트에서 일관. `applyToken`은 renamer와 preload 양쪽에 동일 로직(렌더러는 IPC 없이 preload 사본 사용).

**버그 수정 반영:** 파일 모드 `applyRename`이 `to`를 결과폴더 루트에 두어 하위폴더(`DCIM/`)를 잃던 문제를 Task 6 코드에서 `path.dirname(p.from)` 유지로 수정. Task 11 통합테스트가 이를 회귀 검증.
