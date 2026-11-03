import {
  ArrowRight,
  AudioWaveform,
  CheckCircle2,
  Download,
  FileText,
  Globe2,
  Loader2,
  LogOut,
  Moon,
  Pause,
  Play,
  Shield,
  Sparkles,
  Sun,
  Wand2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { generateSpeech, getDownloadUrl, previewVoice } from '../api';
import type { AuthUser, GenerationItem, Voice } from '../types';
import { BrandLogo } from './BrandLogo';

interface LandingHomeProps {
  darkMode: boolean;
  onToggleDarkMode: () => void;
  user: AuthUser | null;
  voices: Voice[];
  onOpenAuth: (mode: 'login' | 'register') => void;
  onEnterStudio: (initialVoiceId?: string, initialText?: string) => void;
  onLogout: () => void;
}

const HERO_PRESETS = [
  {
    id: 'km-story',
    lang: 'km',
    label: '🇰🇭 Kể chuyện Khmer',
    voiceId: 'km-KH-SreymomNeural',
    text: 'សួស្តី! ស្វាគមន៍មកកាន់ KromaLabs ដែលជាស្ទូឌីយោសំឡេងបញ្ញាសិប្បនិម្មិតជំនាន់ថ្មី។ អ្នកអាចបង្កើតសំឡេងភាសាខ្មែរដ៏ធម្មជាតិ និងច្បាស់ល្អសម្រាប់វីដេអូរបស់អ្នកដោយឥតគិតថ្លៃ។',
  },
  {
    id: 'km-news',
    lang: 'km',
    label: '🇰🇭 Thuyết minh / Tin tức Khmer',
    voiceId: 'km-KH-PisethNeural',
    text: 'ជម្រាបសួរប្រិយមិត្តទាំងអស់គ្នា! នៅក្នុងយុគសម័យឌីជីថល បច្ចេកវិទ្យាសំឡេងឆ្លាតវៃជួយឱ្យអ្នកផលិតមាតិកាព័ត៌មាន និងភាពយន្តបានលឿនជាងមុនដប់ដង។',
  },
  {
    id: 'vi-ad',
    lang: 'vi',
    label: '🇻🇳 Quảng cáo & TikTok Việt',
    voiceId: 'vi-VN-HoaiMyNeural',
    text: 'Xin chào! Chào mừng bạn đến với KromaLabs AI. Chỉ cần nhập kịch bản, hệ thống sẽ tạo ngay giọng đọc truyền cảm chuẩn phòng thu kèm phụ đề SRT hoàn toàn miễn phí.',
  },
  {
    id: 'vi-movie',
    lang: 'vi',
    label: '🇻🇳 Review Phim / Podcast Việt',
    voiceId: 'vi-VN-NamMinhNeural',
    text: 'Ít ai ngờ rằng đằng sau cánh cửa bí ẩn kia lại là một thế giới hoàn toàn khác biệt. Hãy cùng khám phá toàn bộ câu chuyện kịch tính này ngay bây giờ.',
  },
  {
    id: 'en-global',
    lang: 'en',
    label: '🇺🇸 Multilingual Global',
    voiceId: 'en-US-AvaMultilingualNeural',
    text: 'Welcome to KromaLabs Voice AI. Generate ultra-realistic speech in Khmer, Vietnamese, and over thirty languages with zero API keys required.',
  },
];

export function LandingHome({
  darkMode,
  onToggleDarkMode,
  user,
  voices,
  onOpenAuth,
  onEnterStudio,
  onLogout,
}: LandingHomeProps) {
  const [selectedPreset, setSelectedPreset] = useState(HERO_PRESETS[0].id);
  const [demoText, setDemoText] = useState(HERO_PRESETS[0].text);
  const [demoVoiceId, setDemoVoiceId] = useState(HERO_PRESETS[0].voiceId);
  const [generating, setGenerating] = useState(false);
  const [generatedDemo, setGeneratedDemo] = useState<GenerationItem | null>(null);
  const [playing, setPlaying] = useState(false);
  const [previewingCardId, setPreviewingCardId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);

  const primaryVoices = voices.slice(0, 6);

  const handleSelectPreset = (preset: (typeof HERO_PRESETS)[number]) => {
    setSelectedPreset(preset.id);
    setDemoText(preset.text);
    setDemoVoiceId(preset.voiceId);
    setGeneratedDemo(null);
    if (audioRef.current) {
      audioRef.current.pause();
      setPlaying(false);
    }
  };

  const handlePlayDemo = async () => {
    if (generatedDemo && audioRef.current) {
      if (!audioRef.current.paused) {
        audioRef.current.pause();
        setPlaying(false);
      } else {
        await audioRef.current.play();
        setPlaying(true);
      }
      return;
    }

    if (!demoText.trim() || generating) return;
    setError(null);
    setGenerating(true);

    try {
      const res = await generateSpeech({
        text: demoText,
        voice_id: demoVoiceId,
        speed: 1.0,
        pitch: 0,
        volume: 0,
        include_srt: true,
      });
      setGeneratedDemo(res);
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = res.audio_url;
      audioRef.current.onended = () => setPlaying(false);
      await audioRef.current.play();
      setPlaying(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi kết nối TTS');
    } finally {
      setGenerating(false);
    }
  };

  const handleAuditionCard = async (voiceId: string) => {
    if (previewingCardId === voiceId && audioRef.current) {
      audioRef.current.pause();
      setPreviewingCardId(null);
      return;
    }
    try {
      setPreviewingCardId(voiceId);
      const url = await previewVoice(voiceId);
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      audioRef.current.src = url;
      audioRef.current.onended = () => setPreviewingCardId(null);
      await audioRef.current.play();
    } catch {
      setPreviewingCardId(null);
    }
  };

  return (
    <div
      className={`min-h-screen transition-colors ${
        darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'
      }`}
    >
      {/* Top Sticky ElevenLabs-style Navbar */}
      <header
        className={`sticky top-0 z-40 border-b backdrop-blur-xl transition-colors ${
          darkMode
            ? 'bg-zinc-950/85 border-zinc-800/80'
            : 'bg-white/85 border-zinc-200/80'
        }`}
      >
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
          <div className="flex items-center gap-8">
            <BrandLogo darkMode={darkMode} size="md" />

            <nav className="hidden md:flex items-center gap-6 text-sm font-medium">
              <a
                href="#playground"
                className={`transition-colors ${
                  darkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                Phòng thu thử nghiệm
              </a>
              <a
                href="#voices"
                className={`transition-colors ${
                  darkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                Giọng Khmer & Việt
              </a>
              <a
                href="#features"
                className={`transition-colors ${
                  darkMode ? 'text-zinc-400 hover:text-white' : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                Tính năng AI
              </a>
            </nav>
          </div>

          <div className="flex items-center gap-2.5">
            {/* Prominent Light / Dark Theme Toggle */}
            <button
              onClick={onToggleDarkMode}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-full text-xs font-semibold border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200'
                  : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
              }`}
            >
              {darkMode ? (
                <>
                  <Sun className="w-3.5 h-3.5 text-amber-400" />
                  <span className="hidden sm:inline">Giao diện Sáng</span>
                </>
              ) : (
                <>
                  <Moon className="w-3.5 h-3.5 text-zinc-700" />
                  <span className="hidden sm:inline">Giao diện Tối</span>
                </>
              )}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onEnterStudio()}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer ${
                    darkMode
                      ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                      : 'bg-zinc-950 text-white hover:bg-zinc-800'
                  }`}
                >
                  <span>Vào Studio ({user.full_name.split(' ')[0]})</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={onLogout}
                  title="Đăng xuất"
                  className={`p-2 rounded-full border transition-colors cursor-pointer ${
                    darkMode
                      ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
                      : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <>
                <button
                  onClick={() => onOpenAuth('login')}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    darkMode
                      ? 'text-zinc-300 hover:text-white hover:bg-zinc-900'
                      : 'text-zinc-700 hover:text-zinc-950 hover:bg-zinc-100'
                  }`}
                >
                  Đăng nhập
                </button>
                <button
                  onClick={() => onOpenAuth('register')}
                  className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold transition-all cursor-pointer shadow-xs ${
                    darkMode
                      ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                      : 'bg-zinc-950 text-white hover:bg-zinc-800'
                  }`}
                >
                  Đăng ký miễn phí
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      {/* HERO SECTION (ElevenLabs Signature Clean Editorial + Interactive TTS Playground) */}
      <section
        id="playground"
        className={`relative py-16 md:py-22 px-6 border-b ${
          darkMode
            ? 'bg-dot-grid-dark border-zinc-900'
            : 'bg-dot-grid-light border-zinc-100'
        }`}
      >
        <div className="max-w-4xl mx-auto text-center">
          <div
            className={`inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border text-xs font-semibold mb-6 ${
              darkMode
                ? 'bg-zinc-900/90 border-zinc-800 text-zinc-300'
                : 'bg-white border-zinc-200 text-zinc-700 shadow-2xs'
            }`}
          >
            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            <span>Nền tảng AI Voice thế hệ mới • Khmer 🇰🇭 & Việt Nam 🇻🇳 Miễn Phí</span>
          </div>

          <h1 className="font-display text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight leading-[1.08]">
            Giọng đọc AI chân thực nhất cho{' '}
            <span className="bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 bg-clip-text text-transparent">
              Khmer & Tiếng Việt
            </span>
          </h1>

          <p
            className={`mt-5 text-base sm:text-lg max-w-2xl mx-auto leading-relaxed ${
              darkMode ? 'text-zinc-400' : 'text-zinc-600'
            }`}
          >
            Chuyển đổi văn bản thành giọng nói truyền cảm chuẩn phòng thu chỉ trong vài giây.
            Hỗ trợ xuất phụ đề <code className="font-mono font-semibold">.SRT</code> tự động,
            tinh chỉnh tốc độ, cao độ và lưu trữ đám mây cá nhân hoàn toàn miễn phí.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              onClick={() => onEnterStudio(demoVoiceId, demoText)}
              className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold transition-all cursor-pointer shadow-sm ${
                darkMode
                  ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                  : 'bg-zinc-950 text-white hover:bg-zinc-800'
              }`}
            >
              <Wand2 className="w-4 h-4" />
              Mở Phòng Thu Studio
            </button>
            {!user && (
              <button
                onClick={() => onOpenAuth('register')}
                className={`inline-flex items-center gap-2 px-6 py-3 rounded-full text-sm font-semibold border transition-all cursor-pointer ${
                  darkMode
                    ? 'border-zinc-800 bg-zinc-900/80 hover:bg-zinc-800 text-zinc-200'
                    : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800'
                }`}
              >
                Tạo tài khoản miễn phí
              </button>
            )}
          </div>
        </div>

        {/* Interactive ElevenLabs-style Live TTS Widget */}
        <div className="max-w-4xl mx-auto mt-12">
          <div
            className={`rounded-[28px] border overflow-hidden shadow-xl transition-colors ${
              darkMode
                ? 'bg-zinc-900/90 border-zinc-800 shadow-black/40'
                : 'bg-white border-zinc-200/90 shadow-zinc-200/70'
            }`}
          >
            {/* Preset Category Pills */}
            <div
              className={`px-5 py-3.5 border-b flex items-center gap-2 overflow-x-auto ${
                darkMode ? 'border-zinc-800 bg-zinc-950/60' : 'border-zinc-100 bg-zinc-50/80'
              }`}
            >
              {HERO_PRESETS.map((preset) => {
                const active = selectedPreset === preset.id;
                return (
                  <button
                    key={preset.id}
                    onClick={() => handleSelectPreset(preset)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold shrink-0 transition-all cursor-pointer ${
                      active
                        ? darkMode
                          ? 'bg-white text-zinc-950 shadow-2xs'
                          : 'bg-zinc-950 text-white shadow-2xs'
                        : darkMode
                          ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/70'
                          : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/60'
                    }`}
                  >
                    {preset.label}
                  </button>
                );
              })}
            </div>

            {/* Editable Live Textarea */}
            <div className="p-6">
              <textarea
                rows={4}
                value={demoText}
                onChange={(e) => {
                  setDemoText(e.target.value);
                  setGeneratedDemo(null);
                }}
                placeholder="Nhập văn bản tiếng Khmer hoặc tiếng Việt để nghe thử ngay..."
                className={`w-full resize-none bg-transparent outline-none text-base sm:text-lg leading-relaxed ${
                  darkMode ? 'text-zinc-100' : 'text-zinc-900'
                }`}
              />

              {error && (
                <p className="text-xs text-rose-500 mt-2 font-medium">{error}</p>
              )}
            </div>

            {/* Bottom Voice Orbs + Play CTA */}
            <div
              className={`px-6 py-4 border-t flex flex-wrap items-center justify-between gap-4 ${
                darkMode ? 'border-zinc-800 bg-zinc-950/50' : 'border-zinc-100 bg-zinc-50/60'
              }`}
            >
              <div className="flex items-center gap-2 flex-wrap">
                {voices.slice(0, 4).map((v) => {
                  const selected = demoVoiceId === v.id;
                  return (
                    <button
                      key={v.id}
                      onClick={() => {
                        setDemoVoiceId(v.id);
                        setGeneratedDemo(null);
                      }}
                      className={`inline-flex items-center gap-2 pl-1.5 pr-3 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                        selected
                          ? darkMode
                            ? 'border-white bg-zinc-800 text-white'
                            : 'border-zinc-950 bg-white text-zinc-950 shadow-2xs'
                          : darkMode
                            ? 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                            : 'border-zinc-200 bg-white/80 text-zinc-600 hover:text-zinc-950'
                      }`}
                    >
                      <span
                        className={`w-5 h-5 rounded-full bg-gradient-to-br ${v.gradient} flex items-center justify-center text-[11px]`}
                      >
                        {v.flag}
                      </span>
                      <span>{v.name}</span>
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center gap-2.5 ml-auto">
                {generatedDemo && (
                  <a
                    href={getDownloadUrl(generatedDemo.id, 'mp3')}
                    download
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-full text-xs font-semibold border transition-colors ${
                      darkMode
                        ? 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200'
                        : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800'
                    }`}
                  >
                    <Download className="w-3.5 h-3.5" />
                    Tải MP3
                  </a>
                )}

                <button
                  onClick={handlePlayDemo}
                  disabled={generating || !demoText.trim()}
                  className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 ${
                    darkMode
                      ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                      : 'bg-zinc-950 text-white hover:bg-zinc-800'
                  }`}
                >
                  {generating ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang tạo...
                    </>
                  ) : playing ? (
                    <>
                      <Pause className="w-4 h-4 fill-current" />
                      Tạm dừng
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      Nghe giọng AI
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FEATURED KHMER & VIETNAMESE VOICES SECTION */}
      <section id="voices" className="py-18 px-6 max-w-6xl mx-auto">
        <div className="flex flex-wrap items-end justify-between gap-4 mb-10">
          <div>
            <span className="text-xs font-bold uppercase tracking-wider text-emerald-500">
              Voice Library
            </span>
            <h2 className="font-display text-2xl sm:text-3xl font-bold mt-1">
              Giọng đọc bản địa tự nhiên & giàu cảm xúc
            </h2>
          </div>
          <button
            onClick={() => onEnterStudio()}
            className={`inline-flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-full border transition-colors cursor-pointer ${
              darkMode
                ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
            }`}
          >
            Xem toàn bộ 300+ giọng đọc
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
          {primaryVoices.map((voice) => {
            const isAuditioning = previewingCardId === voice.id;
            return (
              <div
                key={voice.id}
                className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all ${
                  darkMode
                    ? 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                    : 'bg-zinc-50/50 border-zinc-200/90 hover:bg-white hover:shadow-md'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${voice.gradient} flex items-center justify-center text-lg shadow-xs`}
                      >
                        {voice.flag}
                      </div>
                      <div>
                        <h3 className="font-display font-bold text-sm">{voice.native_name}</h3>
                        <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                          {voice.gender_label} • {voice.language_label}
                        </p>
                      </div>
                    </div>
                  </div>
                  <p
                    className={`text-xs leading-relaxed mt-3.5 ${
                      darkMode ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  >
                    {voice.description}
                  </p>
                </div>

                <div className="pt-3 border-t border-zinc-500/10 flex items-center justify-between">
                  <button
                    onClick={() => handleAuditionCard(voice.id)}
                    className={`inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                        : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800'
                    }`}
                  >
                    {isAuditioning ? (
                      <Pause className="w-3 h-3 fill-current" />
                    ) : (
                      <Play className="w-3 h-3 fill-current" />
                    )}
                    {isAuditioning ? 'Đang phát' : 'Nghe mẫu'}
                  </button>

                  <button
                    onClick={() => onEnterStudio(voice.id, voice.sample_text)}
                    className="text-xs font-semibold hover:underline cursor-pointer"
                  >
                    Dùng giọng này →
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ELEVENLABS BENTO FEATURES GRID */}
      <section
        id="features"
        className={`py-18 px-6 border-t ${
          darkMode ? 'border-zinc-900 bg-zinc-950' : 'border-zinc-100 bg-zinc-50/60'
        }`}
      >
        <div className="max-w-6xl mx-auto">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="font-display text-3xl font-bold">
              Mọi công cụ phòng thu bạn cần trong một nền tảng
            </h2>
            <p className={`text-sm mt-2.5 ${darkMode ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Thiết kế tối giản, tốc độ xử lý tức thì và lưu trữ tài khoản thực tế trên cơ sở dữ liệu.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5">
            {[
              {
                icon: AudioWaveform,
                title: 'Tinh chỉnh Tốc độ & Cao độ',
                desc: 'Điều khiển tốc độ đọc từ 0.5x đến 2.0x và độ trầm bổng Hz chính xác cho từng video.',
              },
              {
                icon: FileText,
                title: 'Xuất phụ đề .SRT tự động',
                desc: 'Tự động căn thời gian từng câu chuẩn xác để kéo thả trực tiếp vào CapCut & Premiere.',
              },
              {
                icon: Shield,
                title: 'Tài khoản & Database riêng',
                desc: 'Đăng ký, đăng nhập bảo mật PBKDF2, lưu trữ toàn bộ lịch sử file âm thanh theo từng user.',
              },
              {
                icon: Globe2,
                title: 'Khmer, Việt Nam & 300+ Giọng',
                desc: 'Hỗ trợ phông chữ Noto Sans Khmer sắc nét cùng kho kịch bản mẫu TikTok, Tin tức, Quảng cáo.',
              },
            ].map((feat) => {
              const Icon = feat.icon;
              return (
                <div
                  key={feat.title}
                  className={`p-6 rounded-3xl border ${
                    darkMode
                      ? 'bg-zinc-900/50 border-zinc-800'
                      : 'bg-white border-zinc-200/80 shadow-2xs'
                  }`}
                >
                  <div
                    className={`w-10 h-10 rounded-2xl flex items-center justify-center mb-4 ${
                      darkMode ? 'bg-zinc-800 text-white' : 'bg-zinc-950 text-white'
                    }`}
                  >
                    <Icon className="w-5 h-5" />
                  </div>
                  <h3 className="font-display font-bold text-base">{feat.title}</h3>
                  <p
                    className={`text-xs leading-relaxed mt-2 ${
                      darkMode ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  >
                    {feat.desc}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA & FOOTER */}
      <footer
        className={`py-12 px-6 border-t ${
          darkMode ? 'border-zinc-900 bg-zinc-950' : 'border-zinc-200 bg-white'
        }`}
      >
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <BrandLogo darkMode={darkMode} size="sm" />
            <span className={`text-xs ${darkMode ? 'text-zinc-500' : 'text-zinc-500'}`}>
              © {new Date().getFullYear()} KromaLabs Voice AI • Free Open-Source Neural Studio
            </span>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium">
            <span className="inline-flex items-center gap-1.5 text-emerald-500">
              <CheckCircle2 className="w-4 h-4" />
              Hệ thống đang hoạt động 100%
            </span>
            <button
              onClick={() => onEnterStudio()}
              className="font-semibold hover:underline cursor-pointer"
            >
              Mở Studio →
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
