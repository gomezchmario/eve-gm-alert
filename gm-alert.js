// Watches EVE chat logs and sounds a loud alarm when a GM posts.
// Usage: node gm-alert.js [channel-prefix] [--isd]   (default channel: "Rookie Help")
const fs = require('fs'), path = require('path'), os = require('os'), cp = require('child_process');
const args = process.argv.slice(2);
const includeISD = args.includes('--isd');
const channel = (args.find(a => !a.startsWith('--')) || 'Rookie Help').toLowerCase();
const dirs = [path.join(os.homedir(), 'OneDrive', 'Documents', 'EVE', 'logs', 'Chatlogs'),
              path.join(os.homedir(), 'Documents', 'EVE', 'logs', 'Chatlogs')];
const dir = dirs.find(d => fs.existsSync(d));
if (!dir) { console.error('Chatlogs folder not found'); process.exit(1); }
const speakerRe = includeISD ? /^\[ [\d.: ]+ \] ((?:GM|CCP|ISD)\s[^>]+?) > (.*)$/ : /^\[ [\d.: ]+ \] ((?:GM|CCP)\s[^>]+?) > (.*)$/;

// Siren WAV (alternating 700/1100 Hz, full scale, ~2s, looped by the player)
const wav = path.join(os.tmpdir(), 'gm-siren.wav'), rate = 22050, n = rate * 2, buf = Buffer.alloc(44 + n * 2);
buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 2, 4); buf.write('WAVEfmt ', 8); buf.writeUInt32LE(16, 16);
buf.writeUInt16LE(1, 20); buf.writeUInt16LE(1, 22); buf.writeUInt32LE(rate, 24); buf.writeUInt32LE(rate * 2, 28);
buf.writeUInt16LE(2, 32); buf.writeUInt16LE(16, 34); buf.write('data', 36); buf.writeUInt32LE(n * 2, 40);
let ph = 0;
for (let i = 0; i < n; i++) { const f = Math.floor(i / (rate / 4)) % 2 ? 1100 : 700; ph += 2 * Math.PI * f / rate;
  buf.writeInt16LE(Math.round(Math.sign(Math.sin(ph)) * 32000), 44 + i * 2); }
fs.writeFileSync(wav, buf);

let alarm = null;
function startAlarm() {
  if (alarm) return;
  const ps = `$w=New-Object -ComObject WScript.Shell;1..50|%{$w.SendKeys([char]175)};` +   // volume up
             `$p=New-Object Media.SoundPlayer '${wav}';$p.PlayLooping();Start-Sleep 600`;
  alarm = cp.spawn('powershell', ['-NoProfile', '-Command', ps], { stdio: 'ignore' });
  alarm.on('exit', () => alarm = null);
}
function stopAlarm() { if (alarm) { cp.exec(`taskkill /pid ${alarm.pid} /T /F`); alarm = null; console.log('Alarm stopped.'); } }
process.stdin.setRawMode && process.stdin.setRawMode(true);
process.stdin.resume();
process.stdin.on('data', d => { if (d[0] === 3) { stopAlarm(); process.exit(); } stopAlarm(); });

const pos = new Map();   // file -> bytes read
function latestFiles() {
  return fs.readdirSync(dir).filter(f => f.toLowerCase().startsWith(channel) && f.endsWith('.txt'))
    .map(f => { const p = path.join(dir, f); return { p, m: fs.statSync(p).mtimeMs }; })
    .filter(x => Date.now() - x.m < 24 * 3600e3);
}
let lastScan = 0, files = [], started = false;
function tick() {
  try {
    if (Date.now() - lastScan > 3000) { lastScan = Date.now(); files = latestFiles();
      for (const f of files) if (!pos.has(f.p)) pos.set(f.p, started ? 0 : fs.statSync(f.p).size); }   // existing files: start at end; files created later: from start
      started = true;
    for (const f of files) {
      const size = fs.statSync(f.p).size, from = pos.get(f.p);
      if (size <= from) continue;
      const fd = fs.openSync(f.p, 'r'), b = Buffer.alloc(size - from);
      fs.readSync(fd, b, 0, b.length, from); fs.closeSync(fd);
      pos.set(f.p, from + (b.length & ~1));
      for (const line of b.slice(0, b.length & ~1).toString('utf16le').split(/\r?\n/)) {
        const m = line.replace(/﻿/g, '').match(speakerRe);
        if (m) { console.log(`\x07*** ${m[1]}: ${m[2]}`); startAlarm(); }
      }
    }
  } catch (e) { if (process.env.DEBUG) console.log(e.message); }
}
console.log(`Watching "${channel}" logs in ${dir}\nAlerting on GM/CCP${includeISD ? '/ISD' : ''} speakers. Press any key to silence alarm, Ctrl+C to quit.`);
setInterval(tick, 300);
