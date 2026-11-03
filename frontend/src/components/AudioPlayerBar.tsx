import {
  Download,
  FileText,
  Pause,
  Play,
  RotateCcw,
  RotateCw,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { getDownloadUrl } from '../api';
import type { GenerationItem, Voice } from '../types';

interface AudioPlayerBarProps {
  currentTrack: GenerationItem | null;
  voices: Voice[];
  darkMode: boolean;
  autoPlaySignal: number;
}

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function AudioPlayerBar({
  currentTrack,
  voices,
  darkMode,
  autoPlaySignal,
}: AudioPlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [muted, setMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    audio.src = currentTrack.audio_url;
    audio.playbackRate = playbackRate;
    audio
      .play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, [currentTrack?.id, autoPlaySignal]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (audio.paused) {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const skip = (delta: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.min(Math.max(0, audio.currentTime + delta), duration || 0);
  };

  const cycleRate = () => {
    const rates = [1, 1.15, 1.25, 1.5, 0.85];
    const next = rates[(rates.indexOf(playbackRate) + 1) % rates.length];
    setPlaybackRate(next);
    if (audioRef.current) {
      audioRef.current.playbackRate = next;
    }
  };

  if (!currentTrack) return null;

  const matchedVoice = voices.find((v) => v.id === currentTrack.voice_id);
  const gradient = matchedVoice?.gradient || 'from-indigo-500 via-purple-500 to-pink-500';
  const flag =
    matchedVoice?.flag ||
    (currentTrack.language.startsWith('km')
      ? '🇰🇭'
      : currentTrack.language.startsWith('vi')
        ? '🇻🇳'
        : '🌐');

  const progressPct = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <div
      className={`h-20 border-t px-6 flex items-center justify-between gap-6 shrink-0 backdrop-blur-xl transition-colors ${
        darkMode
          ? 'bg-zinc-950/95 border-zinc-800 text-zinc-100'
          : 'bg-white/95 border-zinc-200 text-zinc-900 shadow-[0_-4px_20px_rgba(0,0,0,0.04)]'
      }`}
    >
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration)}
        onEnded={() => setIsPlaying(false)}
        onPause={() => setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        muted={muted}
      />

      {/* Left: Voice Orb & Track Info */}
      <div className="flex items-center gap-3.5 min-w-0 w-72">
        <div
          className={`w-11 h-11 rounded-full bg-gradient-to-br ${gradient} shrink-0 flex items-center justify-center shadow-md relative`}
        >
          {isPlaying && (
            <div className="flex items-end gap-0.5 h-4">
              <span className="w-0.5 h-full bg-white rounded-full animate-wave-bar" />
              <span
                className="w-0.5 h-full bg-white rounded-full animate-wave-bar"
                style={{ animationDelay: '0.2s' }}
              />
              <span
                className="w-0.5 h-full bg-white rounded-full animate-wave-bar"
                style={{ animationDelay: '0.4s' }}
              />
            </div>
          )}
        </div>
        <div className="min-w-0">
          <div className="text-sm font-semibold truncate">{currentTrack.title}</div>
          <div
            className={`text-xs flex items-center gap-1.5 truncate ${
              darkMode ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            <span>{flag}</span>
            <span className="font-medium">{currentTrack.voice_name}</span>
            <span>•</span>
            <span>{currentTrack.speed}x</span>
          </div>
        </div>
      </div>

      {/* Center: Playback Controls & Timeline */}
      <div className="flex-1 max-w-2xl flex flex-col items-center gap-1.5">
        <div className="flex items-center gap-3">
          <button
            onClick={() => skip(-5)}
            title="Lùi 5 giây"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
            }`}
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          <button
            onClick={togglePlay}
            className={`w-10 h-10 rounded-full flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-sm ${
              darkMode
                ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                : 'bg-zinc-950 text-white hover:bg-zinc-800'
            }`}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            onClick={() => skip(5)}
            title="Tua 5 giây"
            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
            }`}
          >
            <RotateCw className="w-4 h-4" />
          </button>
        </div>

        <div className="w-full flex items-center gap-3">
          <span
            className={`text-[11px] font-mono w-9 text-right ${
              darkMode ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {formatTime(currentTime)}
          </span>

          <div
            onClick={(e) => {
              if (!audioRef.current || !duration) return;
              const rect = e.currentTarget.getBoundingClientRect();
              const ratio = Math.min(1, Math.max(0, (e.clientX - rect.left) / rect.width));
              audioRef.current.currentTime = ratio * duration;
            }}
            className={`flex-1 h-2 rounded-full cursor-pointer relative overflow-hidden ${
              darkMode ? 'bg-zinc-800' : 'bg-zinc-200'
            }`}
          >
            <div
              className={`h-full rounded-full transition-[width] duration-75 ${
                darkMode ? 'bg-white' : 'bg-zinc-900'
              }`}
              style={{ width: `${progressPct}%` }}
            />
          </div>

          <span
            className={`text-[11px] font-mono w-9 ${
              darkMode ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            {formatTime(duration || currentTrack.duration_est)}
          </span>
        </div>
      </div>

      {/* Right: Rate, Mute, Download MP3 & SRT */}
      <div className="flex items-center justify-end gap-2 w-72 shrink-0">
        <button
          onClick={cycleRate}
          title="Tốc độ nghe lại"
          className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
            darkMode
              ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
              : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
          }`}
        >
          {playbackRate}x
        </button>

        <button
          onClick={() => setMuted((m) => !m)}
          className={`p-2 rounded-lg transition-colors cursor-pointer ${
            darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-600'
          }`}
        >
          {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
        </button>

        {currentTrack.srt_url && (
          <a
            href={getDownloadUrl(currentTrack.id, 'srt')}
            download
            title="Tải phụ đề .SRT cho CapCut / Premiere"
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
              darkMode
                ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200'
                : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800'
            }`}
          >
            <FileText className="w-3.5 h-3.5" />
            SRT
          </a>
        )}

        <a
          href={getDownloadUrl(currentTrack.id, 'mp3')}
          download
          className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold transition-colors ${
            darkMode
              ? 'bg-white text-zinc-950 hover:bg-zinc-200'
              : 'bg-zinc-950 text-white hover:bg-zinc-800'
          }`}
        >
          <Download className="w-3.5 h-3.5" />
          Tải MP3
        </a>
      </div>
    </div>
  );
}

