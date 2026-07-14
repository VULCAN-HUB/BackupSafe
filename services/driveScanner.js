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
    const ps = `Get-Disk | Where-Object { $_.BusType -eq 'USB' } | Get-Partition | Get-Volume | Where-Object DriveLetter | Select-Object DriveLetter,FileSystemLabel,Size,SizeRemaining | ConvertTo-Json -Compress`;
    const { stdout } = await execFileP('powershell.exe', ['-NoProfile', '-Command', ps]);
    return stdout.trim() ? parseWindows(stdout) : [];
  } else {
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
