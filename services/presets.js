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
