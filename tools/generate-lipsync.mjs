/**
 * Lip-Sync Timeline Generator
 *
 * 读取 MP3 → FFT 频谱分析 → 映射到口型 (viseme) → 输出 JSON 时间轴
 * 用于驱动 3D 模型 BlendShape 口型动画
 *
 * Usage:  node generate-lipsync.mjs [input.mp3] [output.json]
 */

import { readFileSync, writeFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import decode from 'audio-decode';

const __dirname = dirname(fileURLToPath(import.meta.url));

// ======================== 配置 ========================
const WINDOW_SIZE = 1024;         // FFT 窗口大小（采样点）
const HOP_SIZE = 512;             // 窗口滑动步长
const SILENCE_THRESHOLD = 0.008;  // RMS 低于此值视为静音
const ATTACK_RATIO = 3.5;        // 能量突增比率 → 爆破音检测
const MIN_VISEME_MS = 50;         // 最短口型持续时间（ms），消除抖动

// ======================== FFT ========================
function fft(re, im) {
  const n = re.length;
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const half = len >> 1;
    const ang = -2 * Math.PI / len;
    const wR = Math.cos(ang), wI = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cR = 1, cI = 0;
      for (let k = 0; k < half; k++) {
        const idx = i + k + half;
        const tR = cR * re[idx] - cI * im[idx];
        const tI = cR * im[idx] + cI * re[idx];
        re[idx] = re[i + k] - tR;
        im[idx] = im[i + k] - tI;
        re[i + k] += tR;
        im[i + k] += tI;
        const nR = cR * wR - cI * wI;
        cI = cR * wI + cI * wR;
        cR = nR;
      }
    }
  }
}

// Hann 窗函数
function makeHannWindow(n) {
  const w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = 0.5 * (1 - Math.cos(2 * Math.PI * i / (n - 1)));
  return w;
}

// 计算幅度谱
function spectrum(samples, win) {
  const n = samples.length;
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < n; i++) { re[i] = samples[i] * win[i]; im[i] = 0; }
  fft(re, im);
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.sqrt(re[i] * re[i] + im[i] * im[i]) / n;
  return mag;
}

// RMS 能量
function rms(samples) {
  let s = 0;
  for (let i = 0; i < samples.length; i++) s += samples[i] * samples[i];
  return Math.sqrt(s / samples.length);
}

// 频段能量
function bandE(mag, sr, lo, hi) {
  const bw = sr / (mag.length * 2);
  const a = Math.max(0, Math.floor(lo / bw));
  const b = Math.min(mag.length - 1, Math.ceil(hi / bw));
  let e = 0;
  for (let i = a; i <= b; i++) e += mag[i] * mag[i];
  return Math.sqrt(e / Math.max(1, b - a + 1));
}

// ======================== 口型映射 ========================
function classify(mag, energy, prevEnergy, sr) {
  // 1. 静音
  if (energy < SILENCE_THRESHOLD) return { v: 'sil', w: 0 };

  // 2. 爆破音检测 (PP: p/b/m)
  if (prevEnergy < SILENCE_THRESHOLD * 2 && energy > prevEnergy * ATTACK_RATIO && energy > SILENCE_THRESHOLD * 3) {
    return { v: 'PP', w: clamp(energy * 5) };
  }

  // 3. 各频段能量
  const f1    = bandE(mag, sr, 300, 900);    // 第一共振峰区 → 嘴张开度
  const f2lo  = bandE(mag, sr, 800, 1500);   // F2 低区 → 后元音
  const f2hi  = bandE(mag, sr, 1500, 2800);  // F2 高区 → 前元音
  const f3    = bandE(mag, sr, 2500, 4000);  // F3 区
  const hiF   = bandE(mag, sr, 4000, 8000);  // 高频 → 擦音/咝音

  const voiced = f1 + f2lo + f2hi + 0.0001;

  // 4. 咝音 SS (s, z)
  if (hiF > voiced * 0.7 && hiF > SILENCE_THRESHOLD) return { v: 'SS', w: clamp(hiF * 8) };

  // 5. 擦音 FF (f, v)
  if (hiF > voiced * 0.35 && f3 > f1) return { v: 'FF', w: clamp(energy * 4) };

  // 6. 元音分类
  const openness = f1 / (bandE(mag, sr, 80, 300) + f1 + 0.0001); // F1 占比 → 开口度
  const frontness = f2hi / (f2lo + f2hi + 0.0001);                // F2 高/总 → 前/后

  let v, w;

  if (openness > 0.55 && frontness < 0.6) {
    v = 'A'; w = clamp(openness * 1.4);           // 大开口: "啊"
  } else if (frontness > 0.65 && openness < 0.45) {
    v = frontness > 0.75 ? 'I' : 'E';             // 前元音: "衣/诶"
    w = clamp(frontness * 1.2);
  } else if (frontness < 0.35 && openness > 0.35) {
    v = 'O'; w = clamp((1 - frontness) * 0.9);    // 圆唇: "哦"
  } else if (frontness < 0.4 && openness < 0.4) {
    v = 'U'; w = clamp((1 - frontness) * 0.8);    // 合口: "乌"
  } else if (f3 > f1 && f3 > f2lo) {
    v = hiF > f3 * 0.5 ? 'CH' : 'TH';             // 舌齿音
    w = clamp(energy * 4);
  } else {
    v = 'DD'; w = clamp(energy * 3);               // 舌尖音 (默认辅音)
  }

  return { v, w: w * clamp(energy / 0.08) };
}

function clamp(x) { return Math.round(Math.min(1, Math.max(0, x)) * 1000) / 1000; }

// ======================== 后处理 ========================
function postProcess(frames) {
  // 1. 去抖动：合并过短片段
  const cleaned = [];
  let i = 0;
  while (i < frames.length) {
    let j = i;
    while (j < frames.length && frames[j].viseme === frames[i].viseme) j++;
    const dur = (frames[Math.min(j, frames.length) - 1].time - frames[i].time) * 1000;
    if (dur >= MIN_VISEME_MS || frames[i].viseme === 'sil' || i === 0) {
      cleaned.push(frames[i]);
    }
    i = j;
  }

  // 2. 合并连续相同口型
  const merged = [cleaned[0]];
  for (let k = 1; k < cleaned.length; k++) {
    if (cleaned[k].viseme !== merged[merged.length - 1].viseme) {
      merged.push(cleaned[k]);
    }
  }
  return merged;
}

// ======================== 主流程 ========================
async function main() {
  const args = process.argv.slice(2);
  const inputPath = args[0]
    ? resolve(args[0])
    : resolve(__dirname, '../assets/audio/SequelProQuickLook0.mp3');
  const outputPath = args[1]
    ? resolve(args[1])
    : resolve(__dirname, '../assets/config/lipsync-timeline.json');

  console.log(`[1/4] 读取: ${inputPath}`);
  const buf = readFileSync(inputPath);

  console.log('[2/4] 解码 MP3 → PCM ...');
  const audio = await decode(buf);
  const sr = audio.sampleRate;
  const pcm = audio.channelData[0]; // Float32Array
  const duration = pcm.length / sr;
  console.log(`       采样率=${sr}Hz  时长=${duration.toFixed(3)}s  采样数=${pcm.length}`);

  console.log('[3/4] FFT 频谱分析 & 口型分类 ...');
  const win = makeHannWindow(WINDOW_SIZE);
  const numFrames = Math.floor((pcm.length - WINDOW_SIZE) / HOP_SIZE);
  const raw = [];
  let prev = 0;

  for (let i = 0; i < numFrames; i++) {
    const off = i * HOP_SIZE;
    const seg = pcm.slice(off, off + WINDOW_SIZE);
    const e = rms(seg);
    const mag = spectrum(seg, win);
    const { v, w } = classify(mag, e, prev, sr);
    raw.push({
      time: Math.round((off / sr) * 1000) / 1000,
      viseme: v,
      weight: Math.round(w * 1000) / 1000,
    });
    prev = e;
  }

  const keyframes = postProcess(raw);

  console.log(`       原始帧: ${raw.length} → 关键帧: ${keyframes.length}`);

  // 4. 输出 JSON
  const result = {
    source: inputPath.split(/[/\\]/).pop(),
    duration: Math.round(duration * 1000) / 1000,
    sampleRate: sr,
    totalKeyframes: keyframes.length,
    visemeSet: ['sil', 'PP', 'FF', 'TH', 'DD', 'kk', 'CH', 'SS', 'A', 'E', 'I', 'O', 'U'],
    visemeDescription: {
      sil: '静音 - 闭嘴/静止',
      PP:  '双唇音 - p, b, m（双唇紧闭）',
      FF:  '唇齿音 - f, v（下唇抵上齿）',
      TH:  '齿间音 - th（舌尖在齿间）',
      DD:  '舌尖音 - d, t, n, l（舌尖抵上齿龈）',
      kk:  '舌根音 - k, g（舌根抬起）',
      CH:  '卷舌音 - ch, sh, j（嘴唇前突）',
      SS:  '咝音 - s, z（上下齿靠拢）',
      A:   '开口元音 - a, ah（嘴大张）',
      E:   '前元音 - e, ee（嘴角横展）',
      I:   '闭前元音 - i（微张）',
      O:   '圆唇元音 - o, oh（嘴唇圆拢）',
      U:   '闭后元音 - u, oo（小圆口）',
    },
    keyframes,
  };

  writeFileSync(outputPath, JSON.stringify(result, null, 2), 'utf-8');
  console.log(`[4/4] 已保存: ${outputPath}`);

  // 预览
  console.log('\n── 前 30 个关键帧预览 ──');
  keyframes.slice(0, 30).forEach(f =>
    console.log(`  ${f.time.toFixed(3).padStart(7)}s  ${f.viseme.padEnd(4)}  w=${f.weight}`)
  );

  // 统计
  const stats = {};
  keyframes.forEach(f => { stats[f.viseme] = (stats[f.viseme] || 0) + 1; });
  console.log('\n── 口型统计 ──');
  Object.entries(stats).sort((a, b) => b[1] - a[1]).forEach(([v, c]) =>
    console.log(`  ${v.padEnd(4)} : ${c}`)
  );
}

main().catch(e => { console.error('Error:', e); process.exit(1); });
