import {
  ArrowRight,
  Award,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  Crown,
  Eye,
  Flame,
  Gamepad2,
  Loader2,
  Play,
  QrCode,
  RotateCcw,
  Save,
  Smartphone,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  buildLiveGameWsUrl,
  createLiveGameRoom,
  fetchHostLiveRoomState,
  kickLivePlayer,
  saveLiveGameToGradebook,
  triggerHostLiveAction,
  updateHostLiveRoomSettings,
} from '../api';
import type { LiveGameHostState, LiveGameUrls, SurveyForm } from '../types';
import {
  GAME_OPTION_THEMES,
  playCorrectChime,
  playCountdownGo,
  playJoinPop,
  playPodiumFanfare,
  playTick,
} from '../utils/gameSounds';

interface LiveGameHostViewProps {
  form: SurveyForm;
  onClose: () => void;
  onSavedToGradebook?: () => void;
}

const CONFETTI_COLORS = [
  '#f43f5e',
  '#3b82f6',
  '#eab308',
  '#22c55e',
  '#a855f7',
  '#ec4899',
  '#06b6d4',
];

export function LiveGameHostView({
  form,
  onClose,
  onSavedToGradebook,
}: LiveGameHostViewProps) {
  const [room, setRoom] = useState<LiveGameHostState | null>(null);
  const [urls, setUrls] = useState<LiveGameUrls | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionBusy, setActionBusy] = useState(false);
  const [savingGrades, setSavingGrades] = useState(false);
  const [copiedPin, setCopiedPin] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [muted, setMuted] = useState(false);

  // Smooth local countdown display
  const [displayRemainingMs, setDisplayRemainingMs] = useState(0);
  const deadlineTsRef = useRef<number>(0);
  const prevPlayerCountRef = useRef<number>(0);
  const prevStatusRef = useRef<string>('');
  const lastTickSecRef = useRef<number>(-1);
  const mutedRef = useRef<boolean>(false);
  const onSavedRef = useRef(onSavedToGradebook);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    onSavedRef.current = onSavedToGradebook;
  }, [onSavedToGradebook]);

  const applyIncomingState = useCallback((nextRoom: LiveGameHostState) => {
    // Sound triggers on transitions
    if (
      nextRoom.status === 'lobby' &&
      nextRoom.player_count > prevPlayerCountRef.current
    ) {
      playJoinPop(mutedRef.current);
    }
    prevPlayerCountRef.current = nextRoom.player_count;

    if (nextRoom.status !== prevStatusRef.current) {
      if (nextRoom.status === 'question') {
        playCountdownGo(mutedRef.current);
        lastTickSecRef.current = -1;
      } else if (nextRoom.status === 'reveal') {
        playCorrectChime(mutedRef.current);
      } else if (nextRoom.status === 'podium') {
        playPodiumFanfare(mutedRef.current);
      }
      prevStatusRef.current = nextRoom.status;
    }

    if (nextRoom.status === 'countdown' || nextRoom.status === 'question') {
      deadlineTsRef.current = Date.now() + nextRoom.remaining_ms;
      setDisplayRemainingMs(nextRoom.remaining_ms);
    } else {
      deadlineTsRef.current = 0;
      setDisplayRemainingMs(0);
    }

    setRoom(nextRoom);
  }, []);

  // Create live game room on mount
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const created = await createLiveGameRoom({
          form_id: form.id,
          question_time_seconds: 20,
          speed_bonus: true,
          show_options_on_phone: false,
        });
        if (cancelled) return;
        setUrls(created.urls);
        applyIncomingState(created.room);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Không thể mở phòng Game');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [form.id, applyIncomingState]);

  const activePin = room?.pin || null;

  // Real-time WebSocket + lightweight HTTP fallback sync
  useEffect(() => {
    if (!activePin) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connectWs = () => {
      if (closed) return;
      try {
        ws = new WebSocket(buildLiveGameWsUrl(activePin, 'host'));
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.type === 'state' && msg.data) {
              applyIncomingState(msg.data as LiveGameHostState);
            }
          } catch {
            // Ignore malformed frame
          }
        };
        ws.onclose = () => {
          if (!closed) {
            reconnectTimer = window.setTimeout(connectWs, 1800);
          }
        };
      } catch {
        // Fallback HTTP polling handles sync
      }
    };

    connectWs();

    const pollId = window.setInterval(async () => {
      if (closed) return;
      try {
        const fresh = await fetchHostLiveRoomState(activePin);
        if (!closed) {
          setUrls(fresh.urls);
          applyIncomingState(fresh.room);
        }
      } catch {
        // Ignore transient network hiccup
      }
    }, 1400);

    return () => {
      closed = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      window.clearInterval(pollId);
      if (ws) {
        try {
          ws.close();
        } catch {
          // ignore
        }
      }
    };
  }, [activePin, applyIncomingState]);

  // Smooth 60ms local timer tick + auto-sync when hitting 0
  useEffect(() => {
    if (!room || (room.status !== 'countdown' && room.status !== 'question')) {
      return;
    }
    const id = window.setInterval(() => {
      const rem = Math.max(0, deadlineTsRef.current - Date.now());
      setDisplayRemainingMs(rem);

      if (room.status === 'question') {
        const secLeft = Math.ceil(rem / 1000);
        if (secLeft >= 1 && secLeft <= 5 && secLeft !== lastTickSecRef.current) {
          lastTickSecRef.current = secLeft;
          playTick(mutedRef.current);
        }
      }

      if (rem <= 0 && activePin) {
        fetchHostLiveRoomState(activePin)
          .then((res) => applyIncomingState(res.room))
          .catch(() => {});
      }
    }, 80);

    return () => window.clearInterval(id);
  }, [room?.status, room?.current_question_index, activePin, applyIncomingState]);

  const handleHostAction = async (
    action:
      | 'start_game'
      | 'reveal_answer'
      | 'show_leaderboard'
      | 'next_question'
      | 'finish_game'
  ) => {
    if (!room || actionBusy) return;
    setActionBusy(true);
    try {
      const updated = await triggerHostLiveAction(room.pin, action);
      setUrls(updated.urls);
      applyIncomingState(updated.room);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi điều khiển Game');
    } finally {
      setActionBusy(false);
    }
  };

  const handleTogglePhoneOptions = async () => {
    if (!room) return;
    try {
      const updated = await updateHostLiveRoomSettings(room.pin, {
        show_options_on_phone: !room.show_options_on_phone,
      });
      applyIncomingState(updated.room);
    } catch {
      // ignore
    }
  };

  const handleChangeTimeLimit = async (sec: number) => {
    if (!room) return;
    try {
      const updated = await updateHostLiveRoomSettings(room.pin, {
        question_time_seconds: sec,
      });
      applyIncomingState(updated.room);
    } catch {
      // ignore
    }
  };

  const handleKick = async (playerId: string) => {
    if (!room) return;
    try {
      const updated = await kickLivePlayer(room.pin, playerId);
      applyIncomingState(updated.room);
    } catch {
      // ignore
    }
  };

  const handleSaveToGradebook = async () => {
    if (!room || savingGrades || room.saved_to_gradebook) return;
    setSavingGrades(true);
    try {
      const res = await saveLiveGameToGradebook(room.pin);
      applyIncomingState(res.room);
      onSavedRef.current?.();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể lưu vào sổ điểm');
    } finally {
      setSavingGrades(false);
    }
  };

  const copyPin = () => {
    if (!room) return;
    navigator.clipboard.writeText(room.pin);
    setCopiedPin(true);
    setTimeout(() => setCopiedPin(false), 1800);
  };

  const playUrl = urls?.play_url || `${window.location.origin}/play/${room?.pin || ''}`;

  const copyJoinLink = () => {
    navigator.clipboard.writeText(playUrl);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 1800);
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-gradient-to-br from-indigo-950 via-purple-900 to-fuchsia-950 text-white">
        <Loader2 className="w-12 h-12 animate-spin text-amber-300 mb-4" />
        <p className="text-xl font-black tracking-tight">
          Đang khởi tạo Đấu Trường Game Trực Tuyến...
        </p>
      </div>
    );
  }

  if (error || !room) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-zinc-950 text-white p-6">
        <div className="max-w-md w-full rounded-3xl bg-zinc-900 border border-zinc-800 p-6 text-center space-y-4">
          <p className="text-lg font-bold text-rose-400">
            {error || 'Không thể tải phòng Game'}
          </p>
          <button
            onClick={onClose}
            className="px-6 py-3 rounded-2xl bg-white text-zinc-900 font-bold text-sm"
          >
            Quay lại Kho Đề
          </button>
        </div>
      </div>
    );
  }

  const formattedPin = `${room.pin.slice(0, 3)} ${room.pin.slice(3)}`;
  const secondsLeft = Math.ceil(displayRemainingMs / 1000);
  const curQ = room.current_question;
  const qrImgSrc = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=${encodeURIComponent(
    playUrl
  )}`;

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-[#1e1147] via-[#2b1566] to-[#130b33] text-white select-none">
      {/* Decorative Floating Geometric Background Icons */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
        <div className="animate-float-slow absolute -top-8 left-[8%] text-7xl text-rose-400 font-black">
          ▲
        </div>
        <div
          className="animate-float-slow absolute top-[18%] right-[10%] text-6xl text-sky-400 font-black"
          style={{ animationDelay: '1.2s' }}
        >
          ◆
        </div>
        <div
          className="animate-float-slow absolute bottom-[12%] left-[12%] text-7xl text-amber-300 font-black"
          style={{ animationDelay: '2.4s' }}
        >
          ●
        </div>
        <div
          className="animate-float-slow absolute bottom-[16%] right-[8%] text-6xl text-emerald-400 font-black"
          style={{ animationDelay: '0.8s' }}
        >
          ■
        </div>
      </div>

      {/* Confetti Rain on Podium */}
      {room.status === 'podium' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
          {Array.from({ length: 34 }).map((_, i) => (
            <span
              key={i}
              className="animate-confetti-fall absolute top-0 w-3 h-4 rounded-sm"
              style={{
                left: `${(i * 2.95) % 100}%`,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 9) * 0.35}s`,
                animationDuration: `${3.2 + (i % 5) * 0.55}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* TOP HOST CONTROL BAR */}
      <header className="relative z-20 flex flex-wrap items-center justify-between gap-2 px-4 sm:px-6 py-3 bg-black/30 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-amber-400 via-orange-500 to-rose-500 flex items-center justify-center shadow-lg shadow-orange-500/30 shrink-0">
            <Gamepad2 className="w-5 h-5 text-white" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-400/20 text-amber-300 border border-amber-300/30">
                Màn hình Giáo viên
              </span>
              {room.classroom_name && (
                <span className="hidden md:inline-flex text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                  🏫 {room.classroom_name}
                </span>
              )}
            </div>
            <h1 className="text-sm sm:text-base font-extrabold truncate max-w-[220px] sm:max-w-md">
              {room.title}
            </h1>
          </div>
        </div>

        {/* Always-visible PIN Pill + Host Quick Settings */}
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={copyPin}
            title="Bấm để sao chép Mã PIN"
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-white text-indigo-950 font-black text-sm shadow-md hover:bg-amber-200 transition cursor-pointer"
          >
            <span className="text-[11px] font-bold uppercase text-indigo-600">PIN:</span>
            <span className="font-mono text-base tracking-widest">{formattedPin}</span>
            {copiedPin ? (
              <Check className="w-4 h-4 text-emerald-600" />
            ) : (
              <Copy className="w-3.5 h-3.5 text-indigo-500" />
            )}
          </button>

          <button
            onClick={copyJoinLink}
            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold transition cursor-pointer"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-300" />
                Đã chép Link!
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-amber-300" />
                Link HS
              </>
            )}
          </button>

          <button
            onClick={() => setShowQrModal(true)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold transition cursor-pointer"
            title="Hiện mã QR toàn màn hình"
          >
            <QrCode className="w-4 h-4 text-sky-300" />
            <span className="hidden lg:inline">QR</span>
          </button>

          {/* Toggle pure color buttons vs showing option text on student phone */}
          <button
            onClick={handleTogglePhoneOptions}
            title="Bật/tắt hiển thị chữ đáp án trên điện thoại học sinh"
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition cursor-pointer ${
              room.show_options_on_phone
                ? 'bg-emerald-500/25 border-emerald-400/50 text-emerald-200'
                : 'bg-white/10 border-white/15 text-white/90 hover:bg-white/20'
            }`}
          >
            <Smartphone className="w-3.5 h-3.5" />
            <span className="hidden md:inline">
              {room.show_options_on_phone ? 'ĐT hiện chữ + màu' : 'ĐT chỉ hiện nút màu A/B/C/D'}
            </span>
          </button>

          {/* Time per question */}
          {room.status === 'lobby' && (
            <div className="hidden sm:flex items-center gap-1 bg-white/10 border border-white/15 rounded-xl px-2.5 py-1">
              <Clock className="w-3.5 h-3.5 text-amber-300" />
              <select
                value={room.question_time_seconds}
                onChange={(e) => handleChangeTimeLimit(Number(e.target.value))}
                className="bg-transparent text-xs font-extrabold text-white focus:outline-none cursor-pointer"
              >
                <option value={10} className="text-zinc-900">
                  10 giây/câu
                </option>
                <option value={15} className="text-zinc-900">
                  15 giây/câu
                </option>
                <option value={20} className="text-zinc-900">
                  20 giây/câu
                </option>
                <option value={30} className="text-zinc-900">
                  30 giây/câu
                </option>
                <option value={45} className="text-zinc-900">
                  45 giây/câu
                </option>
                <option value={60} className="text-zinc-900">
                  60 giây/câu
                </option>
              </select>
            </div>
          )}

          <button
            onClick={() => setMuted((m) => !m)}
            className="p-2 rounded-xl bg-white/10 hover:bg-white/20 border border-white/15 transition cursor-pointer"
            title={muted ? 'Bật âm thanh Game' : 'Tắt âm thanh Game'}
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-rose-300" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-300" />
            )}
          </button>

          <button
            onClick={onClose}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-rose-500/20 hover:bg-rose-500/40 border border-rose-400/30 text-rose-200 text-xs font-bold transition cursor-pointer"
          >
            <X className="w-4 h-4" />
            <span className="hidden sm:inline">Thoát</span>
          </button>
        </div>
      </header>

      {/* ==================== STAGE 1: WAITING LOBBY ==================== */}
      {room.status === 'lobby' && (
        <main className="relative z-10 flex-1 overflow-y-auto px-4 sm:px-8 py-6 flex flex-col gap-6 max-w-7xl w-full mx-auto">
          {/* Giant Join Banner */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
            <div className="lg:col-span-8 rounded-3xl bg-white/10 backdrop-blur-xl border-2 border-white/20 p-6 sm:p-8 flex flex-col sm:flex-row items-center justify-between gap-6 shadow-2xl">
              <div className="space-y-3 text-center sm:text-left">
                <div className="inline-flex items-center gap-2 px-3.5 py-1 rounded-full bg-amber-400 text-indigo-950 text-xs font-black uppercase tracking-wider shadow">
                  <Sparkles className="w-3.5 h-3.5" />
                  Bước 1: Học sinh mở điện thoại vào phòng
                </div>
                <p className="text-sm sm:text-base text-indigo-100 font-medium">
                  Truy cập{' '}
                  <span className="font-mono font-bold text-amber-300 underline">
                    {urls?.lobby_url || `${window.location.origin}/play`}
                  </span>{' '}
                  và nhập Mã PIN:
                </p>
                <div
                  onClick={copyPin}
                  className="inline-flex items-center gap-4 px-6 py-3.5 rounded-3xl bg-white text-indigo-950 shadow-xl cursor-pointer hover:scale-[1.02] transition-transform"
                >
                  <span className="font-mono text-4xl sm:text-6xl font-black tracking-[0.14em] text-transparent bg-clip-text bg-gradient-to-r from-indigo-700 via-purple-700 to-rose-600">
                    {formattedPin}
                  </span>
                </div>
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                  <button
                    onClick={copyJoinLink}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-500/40 hover:bg-indigo-500/60 border border-indigo-300/30 text-xs font-bold transition cursor-pointer"
                  >
                    <Copy className="w-3.5 h-3.5" />
                    {copiedLink ? 'Đã sao chép Link trực tiếp!' : 'Sao chép Link gửi nhóm Zalo lớp'}
                  </button>
                  <span className="text-xs text-indigo-200 font-semibold">
                    • {room.total_questions} câu hỏi • {room.question_time_seconds}s / câu
                  </span>
                </div>
              </div>

              {/* QR Code Card */}
              <div
                onClick={() => setShowQrModal(true)}
                className="shrink-0 bg-white p-3 rounded-3xl shadow-2xl cursor-pointer hover:scale-105 transition-transform text-center"
              >
                <img
                  src={qrImgSrc}
                  alt="QR vào phòng Game"
                  className="w-36 h-36 sm:w-40 sm:h-40 rounded-2xl"
                />
                <p className="text-[11px] font-black text-indigo-950 mt-1.5">
                  📱 Quét QR vào thẳng phòng
                </p>
              </div>
            </div>

            {/* Start Game Launchpad */}
            <div className="lg:col-span-4 rounded-3xl bg-gradient-to-br from-emerald-500/25 via-teal-500/20 to-cyan-500/20 backdrop-blur-xl border-2 border-emerald-400/35 p-6 flex flex-col justify-between gap-4 shadow-2xl">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-extrabold text-emerald-200">
                    <Users className="w-5 h-5 text-emerald-300" />
                    Sĩ số phòng chờ
                  </span>
                  <span className="px-3 py-1 rounded-full bg-emerald-400 text-emerald-950 font-black text-lg">
                    {room.player_count} HS
                  </span>
                </div>
                <p className="text-xs text-emerald-100/85 leading-relaxed">
                  Câu hỏi sẽ chiếu lớn trên màn hình Giáo viên. Điện thoại học sinh hiển thị{' '}
                  <strong>4 nút màu Đỏ • Xanh dương • Vàng • Xanh lá (A, B, C, D)</strong> cực nhạy!
                </p>
              </div>

              <button
                onClick={() => handleHostAction('start_game')}
                disabled={actionBusy || room.player_count === 0}
                className="w-full py-4 px-6 rounded-2xl bg-gradient-to-r from-amber-400 via-orange-500 to-rose-500 hover:from-amber-300 hover:to-rose-400 text-white font-black text-lg shadow-xl border-b-[6px] border-b-rose-800 active:border-b-[2px] active:translate-y-[4px] disabled:opacity-45 disabled:pointer-events-none transition-all flex items-center justify-center gap-2.5 cursor-pointer"
              >
                <Play className="w-6 h-6 fill-current" />
                {room.player_count === 0
                  ? 'Đang chờ học sinh vào...'
                  : `BẮT ĐẦU NGAY (${room.player_count} HS)`}
              </button>
            </div>
          </div>

          {/* Animated Student Avatar Grid */}
          <div className="flex-1 rounded-3xl bg-black/25 backdrop-blur-md border border-white/15 p-5 sm:p-6">
            {room.players.length === 0 ? (
              <div className="h-full min-h-[200px] flex flex-col items-center justify-center text-center gap-3 py-8">
                <div className="flex items-center gap-3 text-4xl animate-bounce">
                  <span>🦊</span>
                  <span>🐼</span>
                  <span>🦁</span>
                  <span>🦄</span>
                  <span>🐸</span>
                </div>
                <p className="text-lg font-extrabold text-indigo-100">
                  Đang chờ các chiến binh nhập PIN <span className="text-amber-300 font-mono">{formattedPin}</span>...
                </p>
                <p className="text-xs text-indigo-200/75 max-w-md">
                  Khi học sinh chọn tên & Icon thú cưng trên điện thoại, thẻ tên sẽ bật nhảy lên màn hình này kèm âm thanh vui nhộn!
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
                {room.players.map((p) => (
                  <div
                    key={p.id}
                    className="animate-game-pop group relative flex items-center gap-3 px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 shadow-lg backdrop-blur-sm transition"
                  >
                    <span className="text-3xl shrink-0 drop-shadow">{p.avatar}</span>
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-sm text-white truncate">{p.name}</p>
                      {p.student_class && (
                        <p className="text-[11px] text-amber-200/90 font-semibold truncate">
                          {p.student_class}
                        </p>
                      )}
                    </div>
                    <button
                      onClick={() => handleKick(p.id)}
                      title="Mời ra khỏi phòng"
                      className="opacity-0 group-hover:opacity-100 p-1 rounded-lg bg-rose-500/80 hover:bg-rose-600 text-white transition cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </main>
      )}

      {/* ==================== STAGE 2: 3-2-1 COUNTDOWN ==================== */}
      {room.status === 'countdown' && (
        <main className="relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6">
          <span className="px-5 py-2 rounded-full bg-white/15 border border-white/25 text-sm sm:text-base font-black uppercase tracking-widest text-amber-300 mb-6">
            Câu hỏi {room.current_question_index + 1} / {room.total_questions}
          </span>
          <div
            key={secondsLeft}
            className="animate-game-pop w-44 h-44 sm:w-56 sm:h-56 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 flex items-center justify-center shadow-2xl border-8 border-white/30"
          >
            <span className="text-7xl sm:text-8xl font-black text-white drop-shadow-lg">
              {secondsLeft > 0 ? secondsLeft : 'GO!'}
            </span>
          </div>
          <p className="mt-8 text-2xl sm:text-3xl font-black text-white tracking-tight">
            Hãy nhìn lên màn hình & sẵn sàng bấm nút màu!
          </p>
        </main>
      )}

      {/* ==================== STAGE 3 & 4: LIVE QUESTION + REVEAL ==================== */}
      {(room.status === 'question' || room.status === 'reveal') && (
        <main className="relative z-10 flex-1 flex flex-col justify-between gap-4 px-4 sm:px-8 py-4 sm:py-6 max-w-7xl w-full mx-auto overflow-y-auto">
          {/* Top Progress + Timer + Answered Counter */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <span className="px-4 py-1.5 rounded-2xl bg-white/15 border border-white/20 text-sm font-black">
                Câu {room.current_question_index + 1} / {room.total_questions}
              </span>
              {room.status === 'question' && (
                <div
                  className={`flex items-center gap-2 px-4 py-1.5 rounded-2xl font-black text-lg shadow-lg transition-colors ${
                    secondsLeft <= 5
                      ? 'bg-rose-600 text-white animate-bounce'
                      : secondsLeft <= 10
                      ? 'bg-amber-500 text-zinc-950'
                      : 'bg-emerald-500 text-emerald-950'
                  }`}
                >
                  <Clock className="w-5 h-5" />
                  <span className="font-mono">{secondsLeft}s</span>
                </div>
              )}
              {room.status === 'reveal' && (
                <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-2xl bg-emerald-500 text-emerald-950 font-black text-sm shadow-lg">
                  <CheckCircle2 className="w-4 h-4" />
                  Đã mở đáp án đúng!
                </span>
              )}
            </div>

            {/* Live Answer Counter & Host Action Buttons */}
            <div className="flex items-center gap-3">
              <div className="px-4 py-1.5 rounded-2xl bg-white/15 border border-white/20 flex items-center gap-2">
                <Zap className="w-4 h-4 text-amber-300" />
                <span className="text-sm font-extrabold">
                  Đã chốt:{' '}
                  <strong className="text-amber-300 text-base">
                    {room.answered_count} / {room.player_count}
                  </strong>{' '}
                  HS
                </span>
              </div>

              {room.status === 'question' ? (
                <button
                  onClick={() => handleHostAction('reveal_answer')}
                  disabled={actionBusy}
                  className="px-4 py-2 rounded-2xl bg-white/20 hover:bg-white/30 border border-white/25 text-xs sm:text-sm font-extrabold transition flex items-center gap-1.5 cursor-pointer"
                >
                  <Eye className="w-4 h-4" />
                  Hiện đáp án ngay
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  {room.current_question_index + 1 < room.total_questions && (
                    <button
                      onClick={() => handleHostAction('show_leaderboard')}
                      disabled={actionBusy}
                      className="px-4 py-2.5 rounded-2xl bg-amber-400 hover:bg-amber-300 text-indigo-950 font-black text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trophy className="w-4 h-4" />
                      Bảng Xếp Hạng
                    </button>
                  )}
                  <button
                    onClick={() => handleHostAction('next_question')}
                    disabled={actionBusy}
                    className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-emerald-950 font-black text-xs sm:text-sm shadow-lg transition flex items-center gap-1.5 cursor-pointer"
                  >
                    {room.current_question_index + 1 >= room.total_questions ? (
                      <>
                        <Crown className="w-4 h-4" />
                        Tổng Kết Bục Vinh Quang
                      </>
                    ) : (
                      <>
                        Câu Tiếp Theo
                        <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Smooth Time Bar */}
          {room.status === 'question' && (
            <div className="w-full h-2.5 rounded-full bg-white/15 overflow-hidden">
              <div
                className={`h-full transition-all duration-100 rounded-full ${
                  secondsLeft <= 5
                    ? 'bg-rose-500'
                    : secondsLeft <= 10
                    ? 'bg-amber-400'
                    : 'bg-gradient-to-r from-emerald-400 via-cyan-400 to-sky-400'
                }`}
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(
                      0,
                      (displayRemainingMs / (room.question_time_seconds * 1000)) * 100
                    )
                  )}%`,
                }}
              />
            </div>
          )}

          {/* GIANT QUESTION STAGE */}
          <div className="rounded-3xl bg-white text-zinc-900 shadow-2xl p-6 sm:p-9 text-center my-auto border-4 border-white/50">
            <h2 className="text-2xl sm:text-4xl lg:text-[40px] font-black leading-tight tracking-tight text-zinc-900">
              {curQ.title}
            </h2>
            {curQ.description && (
              <p className="mt-2 text-sm sm:text-lg text-zinc-500 font-medium">
                {curQ.description}
              </p>
            )}

            {/* Answer Distribution Mini Bar Chart on Reveal */}
            {room.status === 'reveal' && (
              <div className="mt-6 pt-5 border-t border-zinc-200">
                <div className="flex items-end justify-center gap-4 sm:gap-8 h-32 max-w-xl mx-auto">
                  {curQ.options.map((_, idx) => {
                    const theme = GAME_OPTION_THEMES[idx % GAME_OPTION_THEMES.length];
                    const cnt = curQ.option_counts[idx] || 0;
                    const maxCnt = Math.max(1, ...curQ.option_counts);
                    const heightPct = Math.max(14, Math.round((cnt / maxCnt) * 100));
                    const isRight = curQ.correct_index === idx;

                    return (
                      <div
                        key={idx}
                        className="flex-1 flex flex-col items-center justify-end h-full gap-1.5"
                      >
                        <div className="flex items-center gap-1 text-sm font-black text-zinc-800">
                          {isRight && (
                            <span className="text-emerald-600 text-base">✓</span>
                          )}
                          <span>{cnt}</span>
                        </div>
                        <div
                          className={`w-full rounded-t-2xl transition-all duration-700 flex items-center justify-center text-white font-black text-sm shadow ${
                            isRight ? 'ring-4 ring-emerald-400' : 'opacity-55'
                          }`}
                          style={{
                            height: `${heightPct}%`,
                            backgroundColor: theme.barHex,
                          }}
                        >
                          {theme.shape} {theme.letter}
                        </div>
                      </div>
                    );
                  })}
                </div>
                {curQ.explanation && (
                  <div className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs sm:text-sm font-bold">
                    💡 Giải thích: {curQ.explanation}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 4 VIVID COLORED KAHOOT-STYLE ANSWER CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 sm:gap-4">
            {curQ.options.map((optText, idx) => {
              const theme = GAME_OPTION_THEMES[idx % GAME_OPTION_THEMES.length];
              const isRevealed = room.status === 'reveal';
              const isCorrect = curQ.correct_index === idx;

              return (
                <div
                  key={idx}
                  className={`relative flex items-center gap-4 px-5 sm:px-6 py-5 sm:py-7 rounded-3xl text-white border-b-[8px] shadow-xl transition-all duration-300 ${
                    theme.bgClass
                  } ${theme.borderBottomClass} ${
                    isRevealed
                      ? isCorrect
                        ? 'animate-pulse-glow ring-4 ring-white scale-[1.01] z-10'
                        : 'opacity-30 grayscale-[35%] scale-[0.98]'
                      : ''
                  }`}
                >
                  <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl bg-black/20 flex flex-col items-center justify-center shrink-0 shadow-inner">
                    <span className="text-xl sm:text-2xl leading-none">{theme.shape}</span>
                    <span className="text-xs sm:text-sm font-black tracking-wider mt-0.5">
                      {theme.letter}
                    </span>
                  </div>

                  <span className="text-lg sm:text-2xl font-extrabold leading-snug flex-1 break-words">
                    {optText}
                  </span>

                  {isRevealed && isCorrect && (
                    <div className="w-11 h-11 rounded-full bg-white text-emerald-600 flex items-center justify-center shrink-0 shadow-lg animate-bounce">
                      <Check className="w-7 h-7 stroke-[3]" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ==================== STAGE 5: MID-GAME LEADERBOARD ==================== */}
      {room.status === 'leaderboard' && (
        <main className="relative z-10 flex-1 flex flex-col justify-between max-w-4xl w-full mx-auto px-4 sm:px-8 py-6 overflow-y-auto">
          <div className="flex items-center justify-between gap-4 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-2xl bg-amber-400 text-indigo-950 flex items-center justify-center shadow-lg">
                <Trophy className="w-7 h-7" />
              </div>
              <div>
                <h2 className="text-2xl sm:text-3xl font-black">Bảng Phong Thần Tạm Thời</h2>
                <p className="text-xs sm:text-sm text-indigo-200 font-semibold">
                  Sau câu hỏi {room.current_question_index + 1} / {room.total_questions}
                </p>
              </div>
            </div>

            <button
              onClick={() => handleHostAction('next_question')}
              disabled={actionBusy}
              className="px-6 py-3 rounded-2xl bg-gradient-to-r from-emerald-400 to-teal-500 text-emerald-950 font-black text-sm sm:text-base shadow-xl flex items-center gap-2 cursor-pointer hover:scale-105 transition-transform"
            >
              Câu Tiếp Theo
              <ArrowRight className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-3 my-auto">
            {room.players.slice(0, 6).map((p, idx) => {
              const rankDelta = (p.previous_rank || p.rank) - p.rank;
              const maxScore = Math.max(1000, room.players[0]?.score || 1000);
              const widthPct = Math.max(18, Math.round((p.score / maxScore) * 100));

              return (
                <div
                  key={p.id}
                  style={{ animationDelay: `${idx * 0.08}s` }}
                  className="animate-game-pop relative overflow-hidden rounded-2xl bg-white/15 border border-white/20 p-3.5 sm:p-4 flex items-center justify-between gap-4 shadow-lg"
                >
                  <div
                    className="absolute inset-y-0 left-0 bg-gradient-to-r from-indigo-500/40 via-purple-500/35 to-fuchsia-500/35 pointer-events-none transition-all duration-700"
                    style={{ width: `${widthPct}%` }}
                  />
                  <div className="relative flex items-center gap-3.5 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center font-black text-base shrink-0 ${
                        idx === 0
                          ? 'bg-amber-400 text-indigo-950'
                          : idx === 1
                          ? 'bg-slate-200 text-slate-900'
                          : idx === 2
                          ? 'bg-amber-600 text-white'
                          : 'bg-white/15 text-white'
                      }`}
                    >
                      #{p.rank}
                    </span>
                    <span className="text-3xl shrink-0">{p.avatar}</span>
                    <div className="min-w-0">
                      <p className="font-black text-base sm:text-lg truncate">{p.name}</p>
                      <div className="flex items-center gap-2 text-xs text-indigo-200 font-bold">
                        <span>Đúng {p.correct_count} câu</span>
                        {p.streak >= 2 && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full bg-orange-500/30 text-amber-300">
                            <Flame className="w-3.5 h-3.5 fill-amber-400" />
                            Chuỗi x{p.streak}
                          </span>
                        )}
                        {rankDelta > 0 && (
                          <span className="text-emerald-300 font-extrabold">
                            ▲ +{rankDelta} bậc
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="relative text-right shrink-0">
                    <span className="font-mono text-xl sm:text-2xl font-black text-amber-300">
                      {p.score.toLocaleString()}
                    </span>
                    <span className="block text-[10px] uppercase font-bold text-indigo-200">
                      Điểm Game
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </main>
      )}

      {/* ==================== STAGE 6: FINAL PODIUM & SAVE TO GRADEBOOK ==================== */}
      {room.status === 'podium' && (
        <main className="relative z-20 flex-1 overflow-y-auto px-4 sm:px-8 py-6 max-w-6xl w-full mx-auto flex flex-col gap-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-400 text-indigo-950 text-xs font-black uppercase">
                <Crown className="w-3.5 h-3.5" />
                Kết Quả Chung Cuộc Đấu Trường
              </span>
              <h2 className="text-2xl sm:text-4xl font-black mt-1">
                Vinh Danh Chiến Binh Xuất Sắc Nhất!
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-2.5">
              <button
                onClick={handleSaveToGradebook}
                disabled={savingGrades || room.saved_to_gradebook || room.players.length === 0}
                className={`px-5 py-3 rounded-2xl font-black text-xs sm:text-sm shadow-xl flex items-center gap-2 transition cursor-pointer ${
                  room.saved_to_gradebook
                    ? 'bg-emerald-500 text-emerald-950'
                    : 'bg-gradient-to-r from-emerald-400 to-teal-500 hover:from-emerald-300 hover:to-teal-400 text-emerald-950'
                }`}
              >
                {savingGrades ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : room.saved_to_gradebook ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                {room.saved_to_gradebook
                  ? `Đã lưu ${room.saved_count} HS vào Sổ Điểm!`
                  : 'Lưu Điểm Hệ 10 Vào Sổ Điểm Lớp'}
              </button>

              <button
                onClick={() => handleHostAction('start_game')}
                className="px-4 py-3 rounded-2xl bg-white/15 hover:bg-white/25 border border-white/20 font-extrabold text-xs sm:text-sm flex items-center gap-1.5 transition cursor-pointer"
              >
                <RotateCcw className="w-4 h-4" />
                Chơi lại
              </button>
            </div>
          </div>

          {/* 3D Podium Top 3 */}
          {room.players.length > 0 && (
            <div className="grid grid-cols-3 gap-3 sm:gap-6 items-end max-w-3xl w-full mx-auto pt-6">
              {/* 2nd Place */}
              <div className="flex flex-col items-center">
                {room.players[1] ? (
                  <>
                    <span className="text-4xl sm:text-5xl mb-1 animate-bounce">
                      {room.players[1].avatar}
                    </span>
                    <p className="font-black text-xs sm:text-base text-center truncate max-w-full px-1">
                      {room.players[1].name}
                    </p>
                    <p className="text-xs font-mono font-bold text-slate-200 mb-2">
                      {room.players[1].score.toLocaleString()} pts • {room.players[1].score_10}đ
                    </p>
                    <div
                      style={{ animationDelay: '0.2s' }}
                      className="animate-podium-rise w-full h-28 sm:h-36 rounded-t-3xl bg-gradient-to-b from-slate-300 to-slate-500 text-slate-950 flex flex-col items-center justify-center shadow-2xl border-t-4 border-white"
                    >
                      <span className="text-3xl sm:text-4xl font-black">🥈 2</span>
                    </div>
                  </>
                ) : (
                  <div className="h-28" />
                )}
              </div>

              {/* 1st Place Champion */}
              <div className="flex flex-col items-center">
                {room.players[0] && (
                  <>
                    <Crown className="w-9 h-9 text-amber-300 fill-amber-300 mb-1 animate-bounce" />
                    <span className="text-5xl sm:text-6xl mb-1 drop-shadow-lg">
                      {room.players[0].avatar}
                    </span>
                    <p className="font-black text-sm sm:text-lg text-amber-300 text-center truncate max-w-full px-1">
                      {room.players[0].name}
                    </p>
                    <p className="text-xs sm:text-sm font-mono font-extrabold text-white mb-2">
                      {room.players[0].score.toLocaleString()} pts • {room.players[0].score_10}đ
                    </p>
                    <div className="animate-podium-rise w-full h-40 sm:h-52 rounded-t-3xl bg-gradient-to-b from-amber-300 via-amber-400 to-orange-500 text-indigo-950 flex flex-col items-center justify-center shadow-2xl border-t-4 border-yellow-100">
                      <span className="text-4xl sm:text-5xl font-black">🥇 1</span>
                      <span className="text-[11px] font-black uppercase tracking-wider mt-1">
                        Quán Quân
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* 3rd Place */}
              <div className="flex flex-col items-center">
                {room.players[2] ? (
                  <>
                    <span className="text-4xl sm:text-5xl mb-1 animate-bounce">
                      {room.players[2].avatar}
                    </span>
                    <p className="font-black text-xs sm:text-base text-center truncate max-w-full px-1">
                      {room.players[2].name}
                    </p>
                    <p className="text-xs font-mono font-bold text-amber-200 mb-2">
                      {room.players[2].score.toLocaleString()} pts • {room.players[2].score_10}đ
                    </p>
                    <div
                      style={{ animationDelay: '0.35s' }}
                      className="animate-podium-rise w-full h-24 sm:h-28 rounded-t-3xl bg-gradient-to-b from-amber-600 to-amber-800 text-white flex flex-col items-center justify-center shadow-2xl border-t-4 border-amber-400"
                    >
                      <span className="text-2xl sm:text-3xl font-black">🥉 3</span>
                    </div>
                  </>
                ) : (
                  <div className="h-24" />
                )}
              </div>
            </div>
          )}

          {/* Full Scoreboard Table */}
          <div className="rounded-3xl bg-black/30 backdrop-blur-md border border-white/15 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-white/10 flex items-center justify-between">
              <h3 className="font-extrabold text-sm sm:text-base flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-300" />
                Bảng Điểm Chi Tiết Cả Lớp ({room.players.length} học sinh)
              </h3>
              <span className="text-xs text-indigo-200">
                Tự động quy đổi thang điểm 10
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead className="bg-white/5 text-indigo-200 text-xs uppercase">
                  <tr>
                    <th className="px-4 py-3 font-bold">Hạng</th>
                    <th className="px-4 py-3 font-bold">Học sinh</th>
                    <th className="px-4 py-3 font-bold text-center">Số câu đúng</th>
                    <th className="px-4 py-3 font-bold text-center">Điểm hệ 10</th>
                    <th className="px-4 py-3 font-bold text-center">Chuỗi thắng</th>
                    <th className="px-4 py-3 font-bold text-right">Điểm Game</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/10">
                  {room.players.map((p) => (
                    <tr key={p.id} className="hover:bg-white/5">
                      <td className="px-4 py-3 font-black">#{p.rank}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <span className="text-2xl">{p.avatar}</span>
                          <div>
                            <p className="font-bold text-white">{p.name}</p>
                            {p.student_class && (
                              <p className="text-[11px] text-indigo-200">{p.student_class}</p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">
                        {p.correct_count} / {room.total_questions}
                      </td>
                      <td className="px-4 py-3 text-center">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30 font-black">
                          {p.score_10} đ
                        </span>
                      </td>
                      <td className="px-4 py-3 text-center font-bold text-amber-300">
                        🔥 x{p.best_streak}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-black text-amber-300">
                        {p.score.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </main>
      )}

      {/* QR FULLSCREEN MODAL */}
      {showQrModal && (
        <div
          onClick={() => setShowQrModal(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white text-zinc-900 rounded-3xl p-6 sm:p-8 max-w-md w-full text-center space-y-4 shadow-2xl animate-game-pop"
          >
            <h3 className="text-2xl font-black text-indigo-950">
              Quét Mã QR Để Vào Phòng Game
            </h3>
            <img
              src={`https://api.qrserver.com/v1/create-qr-code/?size=320x320&margin=10&data=${encodeURIComponent(
                playUrl
              )}`}
              alt="QR Join Game"
              className="w-64 h-64 mx-auto rounded-2xl border-4 border-indigo-100"
            />
            <div className="p-3 rounded-2xl bg-indigo-50">
              <p className="text-xs font-bold text-indigo-600 uppercase">Mã PIN Phòng</p>
              <p className="font-mono text-4xl font-black text-indigo-950 tracking-widest">
                {formattedPin}
              </p>
            </div>
            <p className="text-xs text-zinc-500 break-all font-mono">{playUrl}</p>
            <button
              onClick={() => setShowQrModal(false)}
              className="w-full py-3 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white font-black text-sm cursor-pointer"
            >
              Đóng cửa sổ QR
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

