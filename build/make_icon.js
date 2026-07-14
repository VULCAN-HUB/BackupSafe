// 방패+체크 로고 SVG → 멀티사이즈 PNG → .ico (앱/exe 아이콘)
const path = require('path');
const fs = require('fs');
const sharp = require('sharp');
const pngToIco = require('png-to-ico').default;

// 아이콘용 SVG: 어두운 라운드 배경 + 오렌지 방패 + 흰 체크 (작은 크기에서도 식별)
const svg = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
  <rect width="256" height="256" rx="52" fill="#111111"/>
  <path d="M128 34L206 62V128C206 178 172 214 128 232C84 214 50 178 50 128V62L128 34Z" fill="#D35400"/>
  <path d="M92 130L116 154L172 96" fill="none" stroke="#ffffff" stroke-width="17" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

(async () => {
  const outDir = __dirname;
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngBuffers = [];
  for (const s of sizes) {
    const buf = await sharp(Buffer.from(svg)).resize(s, s).png().toBuffer();
    pngBuffers.push(buf);
    if (s === 256) fs.writeFileSync(path.join(outDir, 'icon.png'), buf);
  }
  const ico = await pngToIco(pngBuffers);
  fs.writeFileSync(path.join(outDir, 'icon.ico'), ico);
  console.log('icon.ico 생성:', fs.statSync(path.join(outDir, 'icon.ico')).size, 'bytes');
})();
