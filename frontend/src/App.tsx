import {
  AlertCircle,
  ArrowUpRight,
  AudioLines,
  BookOpenText,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Download,
  Eraser,
  FileText,
  Globe2,
  History,
  Loader2,
  LogIn,
  Mic2,
  Moon,
  Play,
  Search,
  Sparkles,
  Square,
  Star,
  Sun,
  Trash2,
  Wand2,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import {
  deleteHistoryItem,
  fetchCurrentUser,
  fetchHistory,
  fetchTemplates,
  fetchVoices,
  generateSpeech,
  getDownloadUrl,
  logoutUser,
  previewVoice,
  toggleFavoriteItem,
} from './api';
import { AudioPlayerBar } from './components/AudioPlayerBar';
import { AuthModal } from './components/AuthModal';
import { LandingHome } from './components/LandingHome';
import { RightInspector } from './components/RightInspector';
import { Sidebar } from './components/Sidebar';
import { VoicePickerModal } from './components/VoicePickerModal';
import type {
  AppView,
  AuthUser,
  GenerationItem,
  NavSection,
  RightTab,
  ScriptTemplate,
  Voice,
} from './types';

const DEFAULT_SAMPLE_KHMER =
  'សួស្តី! ស្វាគមន៍មកកាន់ស្ទូឌីយោ KromaLabs ។ អ្នកអាចបង្កើតសំឡេងភាសាខ្មែរ និងភាសាវៀតណាម ដោយឥតគិតថ្លៃ ជាមួយគុណភាពច្បាស់ល្អដូចស្ទូឌីយោអាជីព។';

const DEFAULT_SAMPLE_VN =
  'Xin chào! Chào mừng bạn đến với KromaLabs AI. Hệ thống chuyển văn bản thành giọng nói tiếng Khmer và tiếng Việt tự nhiên, sắc nét, hoàn toàn miễn phí dành cho nhà sáng tạo nội dung.';

export function App() {
  // Default to crisp Light Mode like ElevenLabs, persisted in localStorage
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    const saved = localStorage.getItem('kromalabs_theme');
    return saved ? saved === 'dark' : false;
  });

  const [appView, setAppView] = useState<AppView>('landing');
  const [activeSection, setActiveSection] = useState<NavSection>('home');
  const [rightTab, setRightTab] = useState<RightTab>('settings');

  // Auth state
  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<'login' | 'register'>('login');

  // Data state
  const [voices, setVoices] = useState<Voice[]>([]);
  const [allVoicesLoaded, setAllVoicesLoaded] = useState(false);
  const [loadingAllVoices, setLoadingAllVoices] = useState(false);
  const [templates, setTemplates] = useState<ScriptTemplate[]>([]);
  const [history, setHistory] = useState<GenerationItem[]>([]);

  // Studio Editor state
  const [title, setTitle] = useState('');
  const [text, setText] = useState(DEFAULT_SAMPLE_KHMER);
  const [selectedVoiceId, setSelectedVoiceId] = useState('km-KH-SreymomNeural');
  const [speed, setSpeed] = useState(1.0);
  const [pitch, setPitch] = useState(0);
  const [volume, setVolume] = useState(0);
  const [includeSrt, setIncludeSrt] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [copied, setCopied] = useState(false);

  // Modals & Audio state
  const [voiceModalOpen, setVoiceModalOpen] = useState(false);
  const [currentTrack, setCurrentTrack] = useState<GenerationItem | null>(null);
  const [autoPlaySignal, setAutoPlaySignal] = useState(0);

  // Voice preview state
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const [previewingVoiceId, setPreviewingVoiceId] = useState<string | null>(null);
  const [loadingPreviewId, setLoadingPreviewId] = useState<string | null>(null);

  // Filters for Voice Library & History pages
  const [libraryFilter, setLibraryFilter] = useState<'all' | 'km' | 'vi' | 'other'>('all');
  const [librarySearch, setLibrarySearch] = useState('');
  const [historyFilter, setHistoryFilter] = useState<'all' | 'fav' | 'km' | 'vi'>('all');
  const [historySearch, setHistorySearch] = useState('');

  // Error Banner
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('kromalabs_theme', darkMode ? 'dark' : 'light');
  }, [darkMode]);

  useEffect(() => {
    Promise.all([fetchVoices(false), fetchTemplates(), fetchCurrentUser()])
      .then(async ([vList, tList, me]) => {
        setVoices(vList);
        setTemplates(tList);
        setUser(me);
        if (me) {
          const hList = await fetchHistory();
          setHistory(hList);
        }
      })
      .catch((err) => {
        setErrorMsg(err instanceof Error ? err.message : 'Không thể kết nối Backend API');
      });
  }, []);

  const openAuth = (mode: 'login' | 'register') => {
    setAuthModalMode(mode);
    setAuthModalOpen(true);
  };

  const handleAuthSuccess = async (loggedInUser: AuthUser) => {
    setUser(loggedInUser);
    const hList = await fetchHistory().catch(() => []);
    setHistory(hList);
    setAppView('studio');
    setActiveSection('home');
  };

  const handleLogout = async () => {
    await logoutUser();
    setUser(null);
    setHistory([]);
    setCurrentTrack(null);
  };

  const selectedVoice = voices.find((v) => v.id === selectedVoiceId) || voices[0];

  const handleLoadAllVoices = async () => {
    try {
      setLoadingAllVoices(true);
      const fullList = await fetchVoices(true);
      setVoices(fullList);
      setAllVoicesLoaded(true);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể tải danh sách giọng đầy đủ');
    } finally {
      setLoadingAllVoices(false);
    }
  };

  const handlePreviewVoice = async (voice: Voice) => {
    if (previewingVoiceId === voice.id && previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingVoiceId(null);
      return;
    }

    try {
      setErrorMsg(null);
      setLoadingPreviewId(voice.id);
      const url = await previewVoice(voice.id);
      if (!previewAudioRef.current) {
        previewAudioRef.current = new Audio();
      }
      previewAudioRef.current.src = url;
      previewAudioRef.current.onended = () => setPreviewingVoiceId(null);
      await previewAudioRef.current.play();
      setPreviewingVoiceId(voice.id);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Lỗi phát giọng mẫu');
    } finally {
      setLoadingPreviewId(null);
    }
  };

  const handleGenerate = async () => {
    if (!text.trim() || isGenerating) return;
    setErrorMsg(null);
    setIsGenerating(true);

    if (previewAudioRef.current) {
      previewAudioRef.current.pause();
      setPreviewingVoiceId(null);
    }

    try {
      const created = await generateSpeech({
        text,
        voice_id: selectedVoiceId,
        speed,
        pitch,
        volume,
        title: title.trim() || undefined,
        include_srt: includeSrt,
      });
      setHistory((prev) => [created, ...prev]);
      setCurrentTrack(created);
      setAutoPlaySignal((n) => n + 1);
      if (user) {
        const refreshed = await fetchCurrentUser();
        if (refreshed) setUser(refreshed);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Đã xảy ra lỗi khi tạo giọng nói');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleFavorite = async (id: string) => {
    try {
      const updated = await toggleFavoriteItem(id);
      setHistory((prev) => prev.map((item) => (item.id === id ? updated : item)));
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể lưu yêu thích');
    }
  };

  const handleDeleteItem = async (id: string) => {
    try {
      await deleteHistoryItem(id);
      setHistory((prev) => prev.filter((item) => item.id !== id));
      if (currentTrack?.id === id) {
        setCurrentTrack(null);
      }
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Không thể xóa bản thu');
    }
  };

  const handleQuickSwitchLang = (lang: 'km' | 'vi') => {
    if (lang === 'km') {
      setSelectedVoiceId('km-KH-SreymomNeural');
      if (!text.trim() || text === DEFAULT_SAMPLE_VN) {
        setText(DEFAULT_SAMPLE_KHMER);
      }
    } else {
      setSelectedVoiceId('vi-VN-HoaiMyNeural');
      if (!text.trim() || text === DEFAULT_SAMPLE_KHMER) {
        setText(DEFAULT_SAMPLE_VN);
      }
    }
  };

  const estimatedSeconds = Math.max(
    1,
    Math.round(text.trim().length / (13 * Math.max(0.5, speed)))
  );

  const totalChars =
    user?.stats?.total_chars ??
    history.reduce((acc, item) => acc + item.char_count, 0);

  // ==================== PUBLIC ELEVENLABS-STYLE LANDING HOME ====================
  if (appView === 'landing') {
    return (
      <div className={darkMode ? 'dark' : ''}>
        <LandingHome
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          user={user}
          voices={voices}
          onOpenAuth={openAuth}
          onEnterStudio={(initialVoiceId, initialText) => {
            if (initialVoiceId) {
              setSelectedVoiceId(initialVoiceId);
              setActiveSection('tts');
            } else {
              setActiveSection('home');
            }
            if (initialText) {
              setText(initialText);
            }
            setAppView('studio');
          }}
          onLogout={handleLogout}
        />

        <AuthModal
          open={authModalOpen}
          initialMode={authModalMode}
          darkMode={darkMode}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={handleAuthSuccess}
        />
      </div>
    );
  }

  // ==================== FULL ELEVENLABS-STYLE STUDIO WORKSPACE ====================
  return (
    <div
      className={`h-screen w-screen overflow-hidden flex flex-col ${
        darkMode ? 'dark bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'
      }`}
    >
      <div className="flex-1 flex min-h-0 overflow-hidden">
        {/* Left Navigation Sidebar */}
        <Sidebar
          activeSection={activeSection}
          onSelectSection={setActiveSection}
          onGoLanding={() => setAppView('landing')}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          historyCount={history.length}
          voiceCount={voices.length}
          user={user}
          onOpenAuth={openAuth}
          onLogout={handleLogout}
        />

        {/* Center Studio Area */}
        <main className="flex-1 flex flex-col min-w-0 overflow-hidden">
          {/* Top Bar */}
          <header
            className={`h-15 px-6 border-b flex items-center justify-between gap-4 shrink-0 ${
              darkMode ? 'border-zinc-800/80 bg-zinc-950' : 'border-zinc-200 bg-white'
            }`}
          >
            <div className="flex items-center gap-3">
              <h1 className="font-display text-base font-bold tracking-tight">
                {activeSection === 'home' && 'Trang chủ Studio'}
                {activeSection === 'tts' && 'Speech Synthesis Studio'}
                {activeSection === 'voices' && 'Thư viện Giọng đọc (Voice Library)'}
                {activeSection === 'templates' && 'Kho Mẫu Kịch Bản (Khmer & Việt Nam)'}
                {activeSection === 'history' && 'Lịch sử tạo giọng nói & Phụ đề'}
              </h1>
              <span
                className={`hidden md:inline-flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-0.5 rounded-full border ${
                  darkMode
                    ? 'border-zinc-800 bg-zinc-900 text-zinc-400'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                }`}
              >
                🇰🇭 Khmer • 🇻🇳 Tiếng Việt
              </span>
            </div>

            {/* Right Top Bar Controls: Language Mode + Theme Switch + Auth */}
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  setActiveSection('tts');
                  handleQuickSwitchLang('km');
                }}
                className={`hidden sm:inline-flex px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  selectedVoice?.language.startsWith('km')
                    ? 'bg-amber-500/15 border-amber-500/40 text-amber-600 dark:text-amber-400'
                    : darkMode
                      ? 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:text-zinc-950'
                }`}
              >
                🇰🇭 Khmer
              </button>

              <button
                onClick={() => {
                  setActiveSection('tts');
                  handleQuickSwitchLang('vi');
                }}
                className={`hidden sm:inline-flex px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                  selectedVoice?.language.startsWith('vi')
                    ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-600 dark:text-emerald-400'
                    : darkMode
                      ? 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600 hover:text-zinc-950'
                }`}
              >
                🇻🇳 Tiếng Việt
              </button>

              <button
                onClick={() => setDarkMode((d) => !d)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                  darkMode
                    ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200'
                    : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                {darkMode ? (
                  <>
                    <Sun className="w-3.5 h-3.5 text-amber-400" />
                    <span>Sáng</span>
                  </>
                ) : (
                  <>
                    <Moon className="w-3.5 h-3.5" />
                    <span>Tối</span>
                  </>
                )}
              </button>

              {!user && (
                <button
                  onClick={() => openAuth('login')}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                    darkMode
                      ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                      : 'bg-zinc-950 text-white hover:bg-zinc-800'
                  }`}
                >
                  <LogIn className="w-3.5 h-3.5" />
                  Đăng nhập
                </button>
              )}
            </div>
          </header>

          {/* Error Alert Banner */}
          {errorMsg && (
            <div className="mx-6 mt-4 px-4 py-3 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{errorMsg}</span>
              </div>
              <button
                onClick={() => setErrorMsg(null)}
                className="font-semibold hover:underline cursor-pointer"
              >
                Đóng
              </button>
            </div>
          )}

          {/* SECTION 0: ELEVENLABS-STYLE STUDIO HOME DASHBOARD */}
          {activeSection === 'home' && (
            <div className="flex-1 p-6 md:p-8 overflow-y-auto space-y-8">
              {/* Greeting Banner */}
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <span
                    className={`text-xs font-semibold uppercase tracking-wider ${
                      darkMode ? 'text-zinc-500' : 'text-zinc-400'
                    }`}
                  >
                    Không gian sáng tạo AI
                  </span>
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold mt-1">
                    {user ? `Xin chào, ${user.full_name}!` : 'Chào mừng đến với KromaLabs Studio'}
                  </h2>
                  <p className={`text-xs sm:text-sm mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Tạo giọng nói tiếng Khmer & tiếng Việt chuyên nghiệp cùng phụ đề SRT tức thì.
                  </p>
                </div>

                {!user && (
                  <button
                    onClick={() => openAuth('register')}
                    className={`px-4 py-2.5 rounded-full text-xs font-semibold cursor-pointer ${
                      darkMode
                        ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                        : 'bg-zinc-950 text-white hover:bg-zinc-800'
                    }`}
                  >
                    Đăng ký lưu trữ Database miễn phí →
                  </button>
                )}
              </div>

              {/* Quick Creation Feature Cards (ElevenLabs App Home Cards) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                {[
                  {
                    title: 'Text to Speech',
                    desc: 'Chuyển kịch bản Khmer & Việt thành giọng nói',
                    icon: AudioLines,
                    color: 'from-emerald-500 to-teal-600',
                    action: () => setActiveSection('tts'),
                  },
                  {
                    title: 'Giọng đọc Khmer 🇰🇭',
                    desc: 'Sreymom & Piseth chuẩn bản ngữ',
                    icon: Mic2,
                    color: 'from-amber-400 to-rose-500',
                    action: () => {
                      setLibraryFilter('km');
                      setActiveSection('voices');
                    },
                  },
                  {
                    title: 'Mẫu kịch bản TikTok',
                    desc: 'Kho kịch bản bán hàng & review dựng sẵn',
                    icon: BookOpenText,
                    color: 'from-indigo-500 to-purple-600',
                    action: () => setActiveSection('templates'),
                  },
                  {
                    title: 'Lịch sử & Phụ đề SRT',
                    desc: 'Quản lý file MP3 & phụ đề của bạn',
                    icon: History,
                    color: 'from-sky-400 to-blue-600',
                    action: () => setActiveSection('history'),
                  },
                ].map((card) => {
                  const Icon = card.icon;
                  return (
                    <button
                      key={card.title}
                      onClick={card.action}
                      className={`p-5 rounded-3xl border text-left transition-all group cursor-pointer ${
                        darkMode
                          ? 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900/80'
                          : 'bg-zinc-50/60 border-zinc-200/90 hover:bg-white hover:shadow-md'
                      }`}
                    >
                      <div
                        className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${card.color} text-white flex items-center justify-center mb-4 shadow-xs group-hover:scale-105 transition-transform`}
                      >
                        <Icon className="w-5 h-5" />
                      </div>
                      <div className="font-display font-bold text-sm flex items-center justify-between">
                        <span>{card.title}</span>
                        <ArrowUpRight className="w-4 h-4 opacity-50 group-hover:opacity-100" />
                      </div>
                      <p
                        className={`text-xs mt-1 leading-relaxed ${
                          darkMode ? 'text-zinc-400' : 'text-zinc-500'
                        }`}
                      >
                        {card.desc}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Account Stats Strip */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div
                  className={`p-4 rounded-2xl border ${
                    darkMode ? 'bg-zinc-900/30 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Bản thu âm đã lưu
                  </div>
                  <div className="font-display text-2xl font-bold mt-1">{history.length}</div>
                </div>
                <div
                  className={`p-4 rounded-2xl border ${
                    darkMode ? 'bg-zinc-900/30 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Tổng ký tự đã chuyển đổi
                  </div>
                  <div className="font-display text-2xl font-bold mt-1">
                    {totalChars.toLocaleString()}
                  </div>
                </div>
                <div
                  className={`p-4 rounded-2xl border ${
                    darkMode ? 'bg-zinc-900/30 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <div className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Hạn mức Neural Engine
                  </div>
                  <div className="font-display text-2xl font-bold text-emerald-500 mt-1">
                    Không giới hạn
                  </div>
                </div>
              </div>

              {/* Featured Voices Row */}
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-display font-bold text-base">
                    Giọng đọc nổi bật (Khmer & Việt Nam)
                  </h3>
                  <button
                    onClick={() => setActiveSection('voices')}
                    className="text-xs font-semibold hover:underline cursor-pointer"
                  >
                    Tất cả giọng →
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {voices.slice(0, 4).map((v) => {
                    const isPrev = previewingVoiceId === v.id;
                    const isLoad = loadingPreviewId === v.id;
                    return (
                      <div
                        key={v.id}
                        className={`p-4 rounded-2xl border flex items-center justify-between gap-3 ${
                          darkMode
                            ? 'bg-zinc-900/40 border-zinc-800'
                            : 'bg-white border-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-10 h-10 rounded-full bg-gradient-to-br ${v.gradient} flex items-center justify-center text-base shrink-0`}
                          >
                            {v.flag}
                          </div>
                          <div className="min-w-0">
                            <div className="font-semibold text-sm truncate">{v.native_name}</div>
                            <div
                              className={`text-xs truncate ${
                                darkMode ? 'text-zinc-400' : 'text-zinc-500'
                              }`}
                            >
                              {v.gender_label} • {v.style}
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            onClick={() => handlePreviewVoice(v)}
                            className={`p-2 rounded-xl border cursor-pointer ${
                              darkMode
                                ? 'border-zinc-700 bg-zinc-800 text-zinc-200'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                            }`}
                          >
                            {isLoad ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isPrev ? (
                              <Square className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedVoiceId(v.id);
                              setActiveSection('tts');
                            }}
                            className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                              darkMode
                                ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                                : 'bg-zinc-950 text-white hover:bg-zinc-800'
                            }`}
                          >
                            Dùng
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* SECTION 1: TEXT TO SPEECH STUDIO */}
          {activeSection === 'tts' && (
            <div className="flex-1 p-6 flex flex-col min-h-0 overflow-y-auto">
              {/* Quick Script Sample Chips */}
              <div className="flex items-center justify-between gap-3 mb-3 flex-wrap">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-zinc-500">Thử nhanh:</span>
                  <button
                    onClick={() => {
                      setSelectedVoiceId('km-KH-SreymomNeural');
                      setText(DEFAULT_SAMPLE_KHMER);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300'
                        : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    🇰🇭 Nữ Khmer (Sreymom)
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVoiceId('km-KH-PisethNeural');
                      setText(
                        'ជម្រាបសួរ! ខ្ញុំឈ្មោះពិសិដ្ឋ។ នេះជាសំឡេងបញ្ញាសិប្បនិម្មិតភាសាខ្មែរ សម្រាប់ធ្វើបទបង្ហាញ ព័ត៌មាន និងវីដេអូប្រកបដោយវិជ្ជាជីវៈ។'
                      );
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300'
                        : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    🇰🇭 Nam Khmer (Piseth)
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVoiceId('vi-VN-HoaiMyNeural');
                      setText(DEFAULT_SAMPLE_VN);
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300'
                        : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    🇻🇳 Nữ Việt (Hoài My)
                  </button>
                  <button
                    onClick={() => {
                      setSelectedVoiceId('vi-VN-NamMinhNeural');
                      setText(
                        'Chào mừng các bạn quay trở lại với chuyên mục tóm tắt phim hay mỗi ngày. Bộ phim hôm nay sẽ đưa chúng ta đến một hành trình đầy bất ngờ!'
                      );
                    }}
                    className={`text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 bg-zinc-900/70 hover:bg-zinc-800 text-zinc-300'
                        : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    🇻🇳 Nam Việt (Nam Minh)
                  </button>
                </div>

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(text);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
                        : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    {copied ? (
                      <Check className="w-3.5 h-3.5 text-emerald-500" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                    {copied ? 'Đã chép' : 'Sao chép'}
                  </button>
                  <button
                    onClick={() => setText('')}
                    className={`inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
                        : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                    }`}
                  >
                    <Eraser className="w-3.5 h-3.5" />
                    Xóa trắng
                  </button>
                </div>
              </div>

              {/* Studio Editor Card */}
              <div
                className={`flex-1 flex flex-col rounded-3xl border overflow-hidden transition-shadow ${
                  darkMode
                    ? 'bg-zinc-900/40 border-zinc-800 focus-within:border-zinc-700'
                    : 'bg-white border-zinc-200 shadow-xs focus-within:border-zinc-300'
                }`}
              >
                <div
                  className={`px-6 py-3 border-b flex items-center justify-between gap-4 ${
                    darkMode ? 'border-zinc-800/70' : 'border-zinc-100'
                  }`}
                >
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Đặt tên tệp âm thanh (tùy chọn, ví dụ: Quảng cáo Khmer Tập 1)..."
                    className={`w-full bg-transparent text-xs font-medium outline-none ${
                      darkMode
                        ? 'text-zinc-200 placeholder:text-zinc-500'
                        : 'text-zinc-800 placeholder:text-zinc-400'
                    }`}
                  />
                  <span
                    className={`text-[11px] font-mono shrink-0 flex items-center gap-1 ${
                      darkMode ? 'text-zinc-500' : 'text-zinc-400'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />~{estimatedSeconds}s
                  </span>
                </div>

                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                      e.preventDefault();
                      handleGenerate();
                    }
                  }}
                  placeholder="Nhập hoặc dán văn bản tiếng Khmer (ភាសាខ្មែរ), Tiếng Việt hoặc Tiếng Anh tại đây..."
                  className={`flex-1 w-full p-6 resize-none bg-transparent outline-none text-base leading-relaxed ${
                    darkMode
                      ? 'text-zinc-100 placeholder:text-zinc-600'
                      : 'text-zinc-900 placeholder:text-zinc-400'
                  }`}
                />

                <div
                  className={`px-5 py-4 border-t flex flex-wrap items-center justify-between gap-4 ${
                    darkMode
                      ? 'border-zinc-800/80 bg-zinc-950/60'
                      : 'border-zinc-100 bg-zinc-50/70'
                  }`}
                >
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <button
                      type="button"
                      onClick={() => setVoiceModalOpen(true)}
                      className={`inline-flex items-center gap-2.5 pl-2 pr-3.5 py-1.5 rounded-full border text-xs font-semibold transition-all cursor-pointer ${
                        darkMode
                          ? 'bg-zinc-900 border-zinc-700 hover:border-zinc-500 text-zinc-100'
                          : 'bg-white border-zinc-200 hover:border-zinc-400 text-zinc-900 shadow-2xs'
                      }`}
                    >
                      <span
                        className={`w-6 h-6 rounded-full bg-gradient-to-br ${
                          selectedVoice?.gradient || 'from-amber-400 to-rose-500'
                        } flex items-center justify-center text-xs`}
                      >
                        {selectedVoice?.flag || '🎙️'}
                      </span>
                      <span>{selectedVoice?.native_name || 'Chọn giọng'}</span>
                      <ChevronDown className="w-3.5 h-3.5 text-zinc-400" />
                    </button>

                    <span
                      className={`hidden md:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-xs font-medium ${
                        darkMode
                          ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400'
                          : 'border-zinc-200 bg-white text-zinc-600'
                      }`}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                      Kroma Neural v2 • Free
                    </span>
                  </div>

                  <div className="flex items-center gap-4 ml-auto">
                    <div
                      className={`text-xs font-mono ${
                        text.length > 14000 ? 'text-rose-500 font-semibold' : 'text-zinc-500'
                      }`}
                    >
                      {text.length.toLocaleString()} / 15,000
                    </div>

                    <button
                      type="button"
                      onClick={handleGenerate}
                      disabled={!text.trim() || isGenerating}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed shadow-sm ${
                        darkMode
                          ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                          : 'bg-zinc-950 text-white hover:bg-zinc-800'
                      }`}
                    >
                      {isGenerating ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin" />
                          Đang tổng hợp...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-4 h-4" />
                          Tạo giọng nói
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 2: VOICE LIBRARY */}
          {activeSection === 'voices' && (
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  {[
                    { id: 'all', label: 'Tất cả giọng' },
                    { id: 'km', label: '🇰🇭 Tiếng Khmer (Campuchia)' },
                    { id: 'vi', label: '🇻🇳 Tiếng Việt' },
                    { id: 'other', label: '🌐 Quốc tế' },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      onClick={() => setLibraryFilter(tab.id as typeof libraryFilter)}
                      className={`px-3.5 py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                        libraryFilter === tab.id
                          ? darkMode
                            ? 'bg-white text-zinc-950'
                            : 'bg-zinc-950 text-white'
                          : darkMode
                            ? 'bg-zinc-900 text-zinc-400 border border-zinc-800 hover:text-zinc-100'
                            : 'bg-zinc-100 text-zinc-600 hover:text-zinc-950'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="flex items-center gap-2.5">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                    <input
                      type="text"
                      value={librarySearch}
                      onChange={(e) => setLibrarySearch(e.target.value)}
                      placeholder="Tìm kiếm giọng đọc..."
                      className={`pl-9 pr-4 py-2 rounded-xl text-xs border outline-none ${
                        darkMode
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
                          : 'bg-white border-zinc-200 text-zinc-900'
                      }`}
                    />
                  </div>

                  {!allVoicesLoaded && (
                    <button
                      onClick={handleLoadAllVoices}
                      disabled={loadingAllVoices}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                        darkMode
                          ? 'border-zinc-700 bg-zinc-900 hover:bg-zinc-800 text-zinc-200'
                          : 'border-zinc-200 bg-white hover:bg-zinc-50 text-zinc-800'
                      }`}
                    >
                      {loadingAllVoices ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Globe2 className="w-3.5 h-3.5" />
                      )}
                      Mở rộng 300+ giọng
                    </button>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {voices
                  .filter((v) => {
                    const matchLang =
                      libraryFilter === 'all'
                        ? true
                        : libraryFilter === 'km'
                          ? v.language.startsWith('km')
                          : libraryFilter === 'vi'
                            ? v.language.startsWith('vi')
                            : !v.language.startsWith('km') && !v.language.startsWith('vi');
                    const q = librarySearch.trim().toLowerCase();
                    const matchQ =
                      !q ||
                      v.name.toLowerCase().includes(q) ||
                      v.native_name.toLowerCase().includes(q) ||
                      v.language_label.toLowerCase().includes(q);
                    return matchLang && matchQ;
                  })
                  .map((voice) => {
                    const isSelected = voice.id === selectedVoiceId;
                    const isPreviewing = previewingVoiceId === voice.id;
                    const isLoadingPreview = loadingPreviewId === voice.id;
                    return (
                      <div
                        key={voice.id}
                        className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 transition-all ${
                          isSelected
                            ? darkMode
                              ? 'border-white bg-zinc-900/80'
                              : 'border-zinc-950 bg-zinc-50'
                            : darkMode
                              ? 'border-zinc-800 bg-zinc-900/30 hover:border-zinc-700'
                              : 'border-zinc-200 bg-white hover:border-zinc-300'
                        }`}
                      >
                        <div>
                          <div className="flex items-center gap-3.5">
                            <div
                              className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${voice.gradient} flex items-center justify-center text-xl shadow-sm`}
                            >
                              {voice.flag}
                            </div>
                            <div>
                              <h3 className="font-display font-bold text-sm">
                                {voice.native_name}
                              </h3>
                              <p
                                className={`text-xs mt-0.5 ${
                                  darkMode ? 'text-zinc-400' : 'text-zinc-500'
                                }`}
                              >
                                {voice.gender_label} • {voice.style}
                              </p>
                            </div>
                          </div>

                          <p
                            className={`text-xs leading-relaxed mt-3 ${
                              darkMode ? 'text-zinc-400' : 'text-zinc-600'
                            }`}
                          >
                            {voice.description}
                          </p>
                        </div>

                        <div className="pt-3 border-t border-zinc-500/15 flex items-center justify-between gap-2">
                          <button
                            onClick={() => handlePreviewVoice(voice)}
                            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                              darkMode
                                ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                                : 'border-zinc-200 bg-zinc-50 hover:bg-zinc-100 text-zinc-700'
                            }`}
                          >
                            {isLoadingPreview ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : isPreviewing ? (
                              <Square className="w-3.5 h-3.5 fill-current" />
                            ) : (
                              <Play className="w-3.5 h-3.5 fill-current" />
                            )}
                            Nghe thử giọng
                          </button>

                          <button
                            onClick={() => {
                              setSelectedVoiceId(voice.id);
                              setActiveSection('tts');
                            }}
                            className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                              darkMode
                                ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                                : 'bg-zinc-950 text-white hover:bg-zinc-800'
                            }`}
                          >
                            <Mic2 className="w-3.5 h-3.5" />
                            Dùng trong Studio
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {/* SECTION 3: SCRIPT TEMPLATES */}
          {activeSection === 'templates' && (
            <div className="flex-1 p-6 overflow-y-auto space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {templates.map((tpl) => (
                  <div
                    key={tpl.id}
                    className={`p-5 rounded-3xl border flex flex-col justify-between gap-4 ${
                      darkMode
                        ? 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 hover:border-zinc-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span
                          className={`text-[11px] font-semibold px-2.5 py-0.5 rounded-full ${
                            tpl.language.startsWith('km')
                              ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                              : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                          }`}
                        >
                          {tpl.language.startsWith('km') ? '🇰🇭 Tiếng Khmer' : '🇻🇳 Tiếng Việt'} •{' '}
                          {tpl.category}
                        </span>
                      </div>
                      <h3 className="font-display font-bold text-sm">{tpl.title}</h3>
                      <p
                        className={`text-xs leading-relaxed mt-2.5 line-clamp-4 ${
                          darkMode ? 'text-zinc-300' : 'text-zinc-600'
                        }`}
                      >
                        “{tpl.text}”
                      </p>
                    </div>

                    <button
                      onClick={() => {
                        setTitle(tpl.title);
                        setText(tpl.text);
                        setSelectedVoiceId(tpl.voice_id);
                        setActiveSection('tts');
                      }}
                      className={`self-start inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                        darkMode
                          ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                          : 'bg-zinc-950 text-white hover:bg-zinc-800'
                      }`}
                    >
                      Mở trong Phòng thu
                      <ArrowUpRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SECTION 4: FULL HISTORY */}
          {activeSection === 'history' && (
            <div className="flex-1 p-6 overflow-y-auto space-y-5">
              {!user && history.length === 0 ? (
                <div
                  className={`p-10 rounded-3xl border text-center max-w-lg mx-auto my-8 ${
                    darkMode ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <History className="w-10 h-10 mx-auto text-zinc-400 mb-3" />
                  <h3 className="font-display font-bold text-lg">
                    Đăng nhập để lưu trữ lịch sử lâu dài
                  </h3>
                  <p className={`text-xs mt-1.5 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                    Tài khoản của bạn được lưu trực tiếp trong cơ sở dữ liệu SQLite, giúp quản lý
                    toàn bộ file âm thanh Khmer & Việt Nam an toàn.
                  </p>
                  <button
                    onClick={() => openAuth('login')}
                    className={`mt-5 px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer ${
                      darkMode
                        ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                        : 'bg-zinc-950 text-white hover:bg-zinc-800'
                    }`}
                  >
                    Đăng nhập / Đăng ký ngay
                  </button>
                </div>
              ) : (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      {[
                        { id: 'all', label: 'Tất cả' },
                        { id: 'fav', label: '⭐ Đã đánh dấu' },
                        { id: 'km', label: '🇰🇭 Tiếng Khmer' },
                        { id: 'vi', label: '🇻🇳 Tiếng Việt' },
                      ].map((f) => (
                        <button
                          key={f.id}
                          onClick={() => setHistoryFilter(f.id as typeof historyFilter)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                            historyFilter === f.id
                              ? darkMode
                                ? 'bg-white text-zinc-950'
                                : 'bg-zinc-950 text-white'
                              : darkMode
                                ? 'bg-zinc-900 text-zinc-400 border border-zinc-800'
                                : 'bg-zinc-100 text-zinc-600'
                          }`}
                        >
                          {f.label}
                        </button>
                      ))}
                    </div>

                    <div className="relative">
                      <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
                      <input
                        type="text"
                        value={historySearch}
                        onChange={(e) => setHistorySearch(e.target.value)}
                        placeholder="Tìm theo nội dung, tiêu đề..."
                        className={`pl-9 pr-4 py-1.5 rounded-xl text-xs border outline-none ${
                          darkMode
                            ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
                            : 'bg-white border-zinc-200 text-zinc-900'
                        }`}
                      />
                    </div>
                  </div>

                  <div className="space-y-3">
                    {history
                      .filter((item) => {
                        const matchTab =
                          historyFilter === 'all'
                            ? true
                            : historyFilter === 'fav'
                              ? item.is_favorite
                              : historyFilter === 'km'
                                ? item.language.startsWith('km')
                                : item.language.startsWith('vi');
                        const q = historySearch.trim().toLowerCase();
                        const matchQ =
                          !q ||
                          item.title.toLowerCase().includes(q) ||
                          item.text.toLowerCase().includes(q) ||
                          item.voice_name.toLowerCase().includes(q);
                        return matchTab && matchQ;
                      })
                      .map((item) => (
                        <div
                          key={item.id}
                          className={`p-4 rounded-2xl border flex flex-wrap items-center justify-between gap-4 ${
                            darkMode
                              ? 'bg-zinc-900/40 border-zinc-800 hover:border-zinc-700'
                              : 'bg-white border-zinc-200 hover:border-zinc-300'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-sm truncate">{item.title}</span>
                              <span
                                className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                                  item.language.startsWith('km')
                                    ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                                    : 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                                }`}
                              >
                                {item.voice_name} • {item.speed}x
                              </span>
                            </div>
                            <p
                              className={`text-xs mt-1 line-clamp-2 ${
                                darkMode ? 'text-zinc-400' : 'text-zinc-500'
                              }`}
                            >
                              {item.text}
                            </p>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              onClick={() => {
                                setCurrentTrack(item);
                                setAutoPlaySignal((n) => n + 1);
                              }}
                              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer ${
                                darkMode
                                  ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                                  : 'bg-zinc-950 text-white hover:bg-zinc-800'
                              }`}
                            >
                              <Play className="w-3.5 h-3.5 fill-current" />
                              Phát
                            </button>

                            <button
                              onClick={() => {
                                setTitle(item.title);
                                setText(item.text);
                                setSelectedVoiceId(item.voice_id);
                                setSpeed(item.speed);
                                setPitch(item.pitch);
                                setVolume(item.volume);
                                setActiveSection('tts');
                              }}
                              className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                                darkMode
                                  ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                                  : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                              }`}
                            >
                              Sửa lại
                            </button>

                            {item.srt_url && (
                              <a
                                href={getDownloadUrl(item.id, 'srt')}
                                download
                                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border ${
                                  darkMode
                                    ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                                    : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                                }`}
                              >
                                <FileText className="w-3.5 h-3.5" />
                                SRT
                              </a>
                            )}

                            <a
                              href={getDownloadUrl(item.id, 'mp3')}
                              download
                              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl text-xs font-semibold border ${
                                darkMode
                                  ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                                  : 'border-zinc-200 hover:bg-zinc-50 text-zinc-700'
                              }`}
                            >
                              <Download className="w-3.5 h-3.5" />
                              MP3
                            </a>

                            <button
                              onClick={() => handleToggleFavorite(item.id)}
                              className="p-1.5 text-zinc-400 hover:text-amber-400 cursor-pointer"
                            >
                              <Star
                                className={`w-4 h-4 ${
                                  item.is_favorite ? 'fill-amber-400 text-amber-400' : ''
                                }`}
                              />
                            </button>

                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="p-1.5 text-zinc-400 hover:text-rose-500 cursor-pointer"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </div>
          )}
        </main>

        {/* Right Settings & Recent History Panel */}
        <RightInspector
          activeTab={rightTab}
          onChangeTab={setRightTab}
          selectedVoice={selectedVoice}
          onOpenVoiceModal={() => setVoiceModalOpen(true)}
          onPreviewSelected={() => selectedVoice && handlePreviewVoice(selectedVoice)}
          isPreviewingSelected={previewingVoiceId === selectedVoice?.id}
          isLoadingPreviewSelected={loadingPreviewId === selectedVoice?.id}
          speed={speed}
          onChangeSpeed={setSpeed}
          pitch={pitch}
          onChangePitch={setPitch}
          volume={volume}
          onChangeVolume={setVolume}
          includeSrt={includeSrt}
          onChangeIncludeSrt={setIncludeSrt}
          onResetSettings={() => {
            setSpeed(1.0);
            setPitch(0);
            setVolume(0);
            setIncludeSrt(true);
          }}
          history={history}
          onPlayTrack={(item) => {
            setCurrentTrack(item);
            setAutoPlaySignal((n) => n + 1);
          }}
          onToggleFavorite={handleToggleFavorite}
          onDeleteItem={handleDeleteItem}
          darkMode={darkMode}
        />
      </div>

      {/* Bottom Persistent Studio Audio Player */}
      <AudioPlayerBar
        currentTrack={currentTrack}
        voices={voices}
        darkMode={darkMode}
        autoPlaySignal={autoPlaySignal}
      />

      {/* Voice Picker Modal */}
      <VoicePickerModal
        open={voiceModalOpen}
        onClose={() => setVoiceModalOpen(false)}
        voices={voices}
        selectedVoiceId={selectedVoiceId}
        onSelectVoice={(voice) => setSelectedVoiceId(voice.id)}
        onPreviewVoice={handlePreviewVoice}
        previewingVoiceId={previewingVoiceId}
        loadingPreviewId={loadingPreviewId}
        darkMode={darkMode}
        allLoaded={allVoicesLoaded}
        loadingAllVoices={loadingAllVoices}
        onLoadAllVoices={handleLoadAllVoices}
      />

      {/* Auth Login / Register Modal */}
      <AuthModal
        open={authModalOpen}
        initialMode={authModalMode}
        darkMode={darkMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={handleAuthSuccess}
      />
    </div>
  );
}

export default App;
