import type { LiveGameAvatar } from '../types';

export interface GameOptionTheme {
  letter: 'A' | 'B' | 'C' | 'D';
  shape: string;
  colorName: string;
  bgClass: string;
  hoverClass: string;
  borderBottomClass: string;
  barHex: string;
  badgeBg: string;
}

export const GAME_OPTION_THEMES: GameOptionTheme[] = [
  {
    letter: 'A',
    shape: '▲',
    colorName: 'Đỏ',
    bgClass: 'bg-[#e21b3c]',
    hoverClass: 'hover:bg-[#cf1736]',
    borderBottomClass: 'border-b-[#990f26]',
    barHex: '#e21b3c',
    badgeBg: 'bg-white/20',
  },
  {
    letter: 'B',
    shape: '◆',
    colorName: 'Xanh Dương',
    bgClass: 'bg-[#1368ce]',
    hoverClass: 'hover:bg-[#105bb5]',
    borderBottomClass: 'border-b-[#0a4185]',
    barHex: '#1368ce',
    badgeBg: 'bg-white/20',
  },
  {
    letter: 'C',
    shape: '●',
    colorName: 'Vàng',
    bgClass: 'bg-[#d89e00]',
    hoverClass: 'hover:bg-[#c28e00]',
    borderBottomClass: 'border-b-[#8f6800]',
    barHex: '#d89e00',
    badgeBg: 'bg-white/20',
  },
  {
    letter: 'D',
    shape: '■',
    colorName: 'Xanh Lá',
    bgClass: 'bg-[#26890c]',
    hoverClass: 'hover:bg-[#1f730a]',
    borderBottomClass: 'border-b-[#144f06]',
    barHex: '#26890c',
    badgeBg: 'bg-white/20',
  },
];

export const DEFAULT_GAME_AVATARS: LiveGameAvatar[] = [
  { id: 'fox', emoji: '🦊', label: 'Cáo Lửa', bg: 'from-orange-400 to-rose-500' },
  { id: 'panda', emoji: '🐼', label: 'Gấu Trúc', bg: 'from-slate-500 to-zinc-700' },
  { id: 'lion', emoji: '🦁', label: 'Sư Tử', bg: 'from-amber-400 to-orange-600' },
  { id: 'frog', emoji: '🐸', label: 'Ếch Xanh', bg: 'from-emerald-400 to-green-600' },
  { id: 'unicorn', emoji: '🦄', label: 'Kỳ Lân', bg: 'from-fuchsia-400 to-purple-600' },
  { id: 'tiger', emoji: '🐯', label: 'Hổ Vàng', bg: 'from-yellow-400 to-amber-600' },
  { id: 'dino', emoji: '🦖', label: 'Khủng Long', bg: 'from-lime-400 to-emerald-600' },
  { id: 'octopus', emoji: '🐙', label: 'Bạch Tuộc', bg: 'from-pink-400 to-rose-600' },
  { id: 'cat', emoji: '🐱', label: 'Mèo Máy', bg: 'from-sky-400 to-indigo-500' },
  { id: 'dog', emoji: '🐶', label: 'Cún Cưng', bg: 'from-amber-300 to-yellow-600' },
  { id: 'eagle', emoji: '🦅', label: 'Đại Bàng', bg: 'from-indigo-500 to-violet-700' },
  { id: 'dragon', emoji: '🐲', label: 'Rồng Thần', bg: 'from-teal-400 to-cyan-600' },
  { id: 'rocket', emoji: '🚀', label: 'Tên Lửa', bg: 'from-blue-500 to-indigo-600' },
  { id: 'bolt', emoji: '⚡', label: 'Tia Chớp', bg: 'from-yellow-300 to-orange-500' },
  { id: 'crown', emoji: '👑', label: 'Hoàng Gia', bg: 'from-amber-400 to-rose-500' },
  { id: 'star', emoji: '🌟', label: 'Siêu Sao', bg: 'from-violet-400 to-fuchsia-600' },
];

let sharedCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext | null {
  try {
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AudioCtx) return null;
    if (!sharedCtx) {
      sharedCtx = new AudioCtx();
    }
    if (sharedCtx.state === 'suspended') {
      sharedCtx.resume().catch(() => {});
    }
    return sharedCtx;
  } catch {
    return null;
  }
}

function playTone(
  freq: number,
  durationSec: number,
  type: OscillatorType = 'sine',
  delaySec = 0,
  gainPeak = 0.14
): void {
  const ctx = getAudioCtx();
  if (!ctx) return;
  try {
    const now = ctx.currentTime + delaySec;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.001, now);
    gain.gain.exponentialRampToValueAtTime(gainPeak, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.001, now + durationSec);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + durationSec + 0.02);
  } catch {
    // Ignore audio errors on restricted devices
  }
}

export function playJoinPop(muted = false): void {
  if (muted) return;
  playTone(520, 0.08, 'sine', 0, 0.12);
  playTone(780, 0.12, 'triangle', 0.06, 0.14);
}

export function playTick(muted = false): void {
  if (muted) return;
  playTone(880, 0.06, 'triangle', 0, 0.09);
}

export function playCountdownGo(muted = false): void {
  if (muted) return;
  playTone(523.25, 0.12, 'triangle', 0, 0.14);
  playTone(659.25, 0.12, 'triangle', 0.1, 0.14);
  playTone(1046.5, 0.28, 'sine', 0.2, 0.18);
}

export function playAnswerTap(muted = false): void {
  if (muted) return;
  playTone(620, 0.07, 'triangle', 0, 0.15);
  playTone(840, 0.09, 'sine', 0.04, 0.12);
}

export function playCorrectChime(muted = false): void {
  if (muted) return;
  playTone(523.25, 0.11, 'triangle', 0, 0.16);
  playTone(659.25, 0.11, 'triangle', 0.09, 0.16);
  playTone(783.99, 0.12, 'triangle', 0.18, 0.16);
  playTone(1046.5, 0.32, 'sine', 0.27, 0.2);
}

export function playWrongBuzz(muted = false): void {
  if (muted) return;
  playTone(310, 0.16, 'sawtooth', 0, 0.09);
  playTone(220, 0.26, 'sawtooth', 0.14, 0.09);
}

export function playPodiumFanfare(muted = false): void {
  if (muted) return;
  const notes = [523.25, 659.25, 783.99, 1046.5, 783.99, 1046.5];
  const delays = [0, 0.12, 0.24, 0.36, 0.54, 0.68];
  const lens = [0.11, 0.11, 0.11, 0.16, 0.12, 0.45];
  notes.forEach((n, idx) => {
    playTone(n, lens[idx], 'triangle', delays[idx], 0.18);
  });
}

