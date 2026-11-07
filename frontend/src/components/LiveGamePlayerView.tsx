import {
  ArrowLeft,
  ArrowRight,
  Check,
  Clock,
  Crown,
  Flame,
  Gamepad2,
  Loader2,
  Search,
  Sparkles,
  Trophy,
  Users,
  Volume2,
  VolumeX,
  XCircle,
  Zap,
} from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildLiveGameWsUrl,
  fetchPlayerLiveRoomState,
  fetchPublicLiveRoomInfo,
  joinPublicLiveRoom,
  submitPublicLiveAnswer,
} from '../api';
import type {
  LiveGameAvatar,
  LiveGamePlayerState,
  LiveGameRoomPublicInfo,
} from '../types';
import {
  DEFAULT_GAME_AVATARS,
  GAME_OPTION_THEMES,
  playAnswerTap,
  playCorrectChime,
  playPodiumFanfare,
  playWrongBuzz,
} from '../utils/gameSounds';

interface LiveGamePlayerViewProps {
  initialPin?: string | null;
  onExit: () => void;
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

function getSessionKey(pin: string): string {
  return `kromaforms_live_player_${pin.replace(/\D/g, '')}`;
}

export function LiveGamePlayerView({
  initialPin,
  onExit,
}: LiveGamePlayerViewProps) {
  const cleanInitPin = (initialPin || '').replace(/\D/g, '').slice(0, 6);

  const [pinInput, setPinInput] = useState(cleanInitPin);
  const [roomInfo, setRoomInfo] = useState<LiveGameRoomPublicInfo | null>(null);
  const [checkingPin, setCheckingPin] = useState(false);
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Student identity & cute avatar
  const [studentName, setStudentName] = useState<string>(
    () =>
      localStorage.getItem('kromaforms_saved_student_name') ||
      localStorage.getItem('kromaforms_student_name') ||
      ''
  );
  const [rosterSearch, setRosterSearch] = useState('');
  const [selectedAvatar, setSelectedAvatar] = useState<string>(
    () => localStorage.getItem('kromaforms_game_avatar') || '🦊'
  );

  // Active joined session
  const [activePin, setActivePin] = useState<string | null>(null);
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [playerToken, setPlayerToken] = useState<string | null>(null);
  const [gameState, setGameState] = useState<LiveGamePlayerState | null>(null);
  const [submittingChoice, setSubmittingChoice] = useState<number | null>(null);
  const [muted, setMuted] = useState(false);

  // Smooth countdown interpolation
  const [displayRemainingMs, setDisplayRemainingMs] = useState(0);
  const deadlineTsRef = useRef<number>(0);
  const prevStatusRef = useRef<string>('');
  const mutedRef = useRef<boolean>(false);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  const applyPlayerState = useCallback((next: LiveGamePlayerState) => {
    if (next.status !== prevStatusRef.current) {
      if (next.status === 'reveal') {
        const isCorrect = Boolean(next.me?.last_result?.is_correct);
        if (isCorrect) {
          playCorrectChime(mutedRef.current);
          navigator.vibrate?.([45, 35, 85]);
        } else {
          playWrongBuzz(mutedRef.current);
          navigator.vibrate?.(120);
        }
      } else if (next.status === 'podium') {
        playPodiumFanfare(mutedRef.current);
      }
      prevStatusRef.current = next.status;
    }

    if (next.status === 'countdown' || next.status === 'question') {
      deadlineTsRef.current = Date.now() + next.remaining_ms;
      setDisplayRemainingMs(next.remaining_ms);
    } else {
      deadlineTsRef.current = 0;
      setDisplayRemainingMs(0);
    }

    setGameState(next);
    if (next.status !== 'question') {
      setSubmittingChoice(null);
    }
  }, []);

  // Auto-lookup room if initialPin provided in URL (/play/482915)
  useEffect(() => {
    if (cleanInitPin.length === 6) {
      (async () => {
        setCheckingPin(true);
        setError(null);
        try {
          const info = await fetchPublicLiveRoomInfo(cleanInitPin);
          setRoomInfo(info);

          // Check if student already joined this PIN in this browser session
          const savedRaw = sessionStorage.getItem(getSessionKey(cleanInitPin));
          if (savedRaw) {
            const saved = JSON.parse(savedRaw) as {
              player_id: string;
              player_token: string;
              name: string;
              avatar: string;
            };
            if (saved?.player_token && saved?.name) {
              const rejoined = await joinPublicLiveRoom(cleanInitPin, {
                name: saved.name,
                avatar: saved.avatar || '🦊',
                player_token: saved.player_token,
              });
              setActivePin(cleanInitPin);
              setPlayerId(rejoined.player_id);
              setPlayerToken(rejoined.player_token);
              applyPlayerState(rejoined.state);
            }
          }
        } catch (err) {
          setError(
            err instanceof Error ? err.message : 'Mã PIN phòng Game không tồn tại'
          );
        } finally {
          setCheckingPin(false);
        }
      })();
    }
  }, [cleanInitPin, applyPlayerState]);

  // WebSocket + lightweight HTTP fallback once joined
  useEffect(() => {
    if (!activePin || !playerId) return;
    let closed = false;
    let ws: WebSocket | null = null;
    let reconnectTimer: number | null = null;

    const connectWs = () => {
      if (closed) return;
      try {
        ws = new WebSocket(buildLiveGameWsUrl(activePin, 'player', playerId));
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            if (msg?.type === 'state' && msg.data) {
              applyPlayerState(msg.data as LiveGamePlayerState);
            }
          } catch {
            // ignore
          }
        };
        ws.onclose = () => {
          if (!closed) {
            reconnectTimer = window.setTimeout(connectWs, 1800);
          }
        };
      } catch {
        // Fallback polling keeps sync
      }
    };

    connectWs();

    const pollId = window.setInterval(async () => {
      if (closed) return;
      try {
        const fresh = await fetchPlayerLiveRoomState(activePin, playerId);
        if (!closed) {
          applyPlayerState(fresh);
        }
      } catch {
        // ignore transient error
      }
    }, 1200);

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
  }, [activePin, playerId, applyPlayerState]);

  // Smooth client countdown
  useEffect(() => {
    if (
      !gameState ||
      (gameState.status !== 'countdown' && gameState.status !== 'question')
    ) {
      return;
    }
    const id = window.setInterval(() => {
      const rem = Math.max(0, deadlineTsRef.current - Date.now());
      setDisplayRemainingMs(rem);
      if (rem <= 0 && activePin && playerId) {
        fetchPlayerLiveRoomState(activePin, playerId)
          .then((st) => applyPlayerState(st))
          .catch(() => {});
      }
    }, 90);
    return () => window.clearInterval(id);
  }, [
    gameState?.status,
    gameState?.current_question_index,
    activePin,
    playerId,
    applyPlayerState,
  ]);

  const handleCheckPin = async (e: React.FormEvent) => {
    e.preventDefault();
    const digits = pinInput.replace(/\D/g, '');
    if (digits.length < 4) {
      setError('Vui lòng nhập đủ Mã PIN 6 số trên màn hình Giáo viên!');
      return;
    }
    setCheckingPin(true);
    setError(null);
    try {
      const info = await fetchPublicLiveRoomInfo(digits);
      setRoomInfo(info);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Không tìm thấy phòng Game với mã PIN này'
      );
    } finally {
      setCheckingPin(false);
    }
  };

  const handleJoinGame = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!roomInfo) return;
    const trimmed = studentName.trim();
    if (!trimmed) {
      setError('Hãy nhập tên hoặc chọn tên của bạn trong danh sách lớp nhé!');
      return;
    }
    setJoining(true);
    setError(null);
    try {
      localStorage.setItem('kromaforms_student_name', trimmed);
      localStorage.setItem('kromaforms_saved_student_name', trimmed);
      localStorage.setItem('kromaforms_game_avatar', selectedAvatar);

      const savedRaw = sessionStorage.getItem(getSessionKey(roomInfo.pin));
      const oldToken = savedRaw ? JSON.parse(savedRaw)?.player_token : null;

      const joined = await joinPublicLiveRoom(roomInfo.pin, {
        name: trimmed,
        avatar: selectedAvatar,
        student_class: roomInfo.classroom_name || '',
        player_token: oldToken,
      });

      sessionStorage.setItem(
        getSessionKey(roomInfo.pin),
        JSON.stringify({
          player_id: joined.player_id,
          player_token: joined.player_token,
          name: trimmed,
          avatar: selectedAvatar,
        })
      );

      playAnswerTap(muted);
      setActivePin(roomInfo.pin);
      setPlayerId(joined.player_id);
      setPlayerToken(joined.player_token);
      applyPlayerState(joined.state);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể vào phòng Game');
    } finally {
      setJoining(false);
    }
  };

  const handleTapAnswer = async (choiceIndex: number) => {
    if (
      !activePin ||
      !playerId ||
      !playerToken ||
      !gameState ||
      gameState.status !== 'question' ||
      gameState.me?.has_answered ||
      submittingChoice !== null
    ) {
      return;
    }

    playAnswerTap(muted);
    navigator.vibrate?.(35);
    setSubmittingChoice(choiceIndex);

    try {
      const res = await submitPublicLiveAnswer(activePin, {
        player_id: playerId,
        player_token: playerToken,
        choice_index: choiceIndex,
      });
      applyPlayerState(res.state);
    } catch (err) {
      setSubmittingChoice(null);
      alert(err instanceof Error ? err.message : 'Không thể gửi đáp án');
    }
  };

  const avatarsList: LiveGameAvatar[] =
    roomInfo?.avatars && roomInfo.avatars.length > 0
      ? roomInfo.avatars
      : DEFAULT_GAME_AVATARS;

  const filteredRoster = useMemo(() => {
    const list = roomInfo?.student_roster || [];
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return list;
    return list.filter((n) => n.toLowerCase().includes(q));
  }, [roomInfo?.student_roster, rosterSearch]);

  // ==================== VIEW A: NOT JOINED YET (PIN & AVATAR PICKER) ====================
  if (!activePin || !gameState) {
    return (
      <div className="min-h-screen relative overflow-hidden bg-gradient-to-br from-[#26145c] via-[#3c1d84] to-[#1a0d42] text-white flex flex-col">
        {/* Animated Floating Shapes */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-20">
          <div className="animate-float-slow absolute top-10 left-[8%] text-6xl text-rose-400 font-black">
            ▲
          </div>
          <div
            className="animate-float-slow absolute top-24 right-[10%] text-6xl text-sky-400 font-black"
            style={{ animationDelay: '1.3s' }}
          >
            ◆
          </div>
          <div
            className="animate-float-slow absolute bottom-16 left-[12%] text-6xl text-amber-300 font-black"
            style={{ animationDelay: '2.1s' }}
          >
            ●
          </div>
          <div
            className="animate-float-slow absolute bottom-20 right-[10%] text-6xl text-emerald-400 font-black"
            style={{ animationDelay: '0.7s' }}
          >
            ■
          </div>
        </div>

        <header className="relative z-10 flex items-center justify-between px-4 py-3.5">
          <button
            onClick={() => {
              if (roomInfo && !cleanInitPin) {
                setRoomInfo(null);
                setError(null);
              } else {
                onExit();
              }
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-2xl bg-white/10 hover:bg-white/20 border border-white/15 text-xs font-bold transition cursor-pointer"
          >
            <ArrowLeft className="w-4 h-4" />
            Quay lại
          </button>

          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-400/20 border border-amber-300/30 text-amber-200 text-xs font-black">
            <Gamepad2 className="w-4 h-4" />
            KromaGame Live
          </div>
        </header>

        <main className="relative z-10 flex-1 flex items-center justify-center p-4">
          {/* STEP 1: ENTER 6-DIGIT PIN */}
          {!roomInfo ? (
            <form
              onSubmit={handleCheckPin}
              className="animate-game-pop w-full max-w-md rounded-3xl bg-white text-zinc-900 p-6 sm:p-8 shadow-2xl space-y-5 border-4 border-white/40"
            >
              <div className="text-center space-y-2">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-indigo-600 via-purple-600 to-rose-500 text-white flex items-center justify-center mx-auto shadow-xl">
                  <Gamepad2 className="w-9 h-9" />
                </div>
                <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-indigo-950">
                  Nhập Mã PIN Phòng Game
                </h1>
                <p className="text-xs sm:text-sm text-zinc-500 font-medium">
                  Nhìn lên bảng / màn hình của Giáo viên để lấy mã 6 chữ số
                </p>
              </div>

              <div className="space-y-2">
                <input
                  type="text"
                  inputMode="numeric"
                  autoFocus
                  maxLength={7}
                  value={pinInput}
                  onChange={(e) => {
                    setError(null);
                    setPinInput(e.target.value.replace(/[^\d\s]/g, ''));
                  }}
                  placeholder="VD: 482915"
                  className="w-full py-4 px-4 rounded-2xl bg-indigo-50 border-2 border-indigo-200 focus:border-indigo-600 focus:bg-white text-center font-mono text-3xl sm:text-4xl font-black tracking-[0.2em] text-indigo-950 outline-none transition"
                />
                {error && (
                  <p className="text-xs font-bold text-rose-600 text-center bg-rose-50 py-2 px-3 rounded-xl border border-rose-200">
                    {error}
                  </p>
                )}
              </div>

              <button
                type="submit"
                disabled={checkingPin}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-indigo-600 via-purple-600 to-rose-500 hover:opacity-95 text-white font-black text-base sm:text-lg shadow-xl border-b-[6px] border-b-indigo-950 active:border-b-[2px] active:translate-y-[4px] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {checkingPin ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    TIẾP TỤC VÀO PHÒNG
                    <ArrowRight className="w-5 h-5" />
                  </>
                )}
              </button>
            </form>
          ) : (
            /* STEP 2: ENTER STUDENT NAME + PICK CUTE AVATAR ICON */
            <form
              onSubmit={handleJoinGame}
              className="animate-game-pop w-full max-w-lg rounded-3xl bg-white text-zinc-900 p-5 sm:p-7 shadow-2xl space-y-5 border-4 border-white/40 max-h-[90vh] overflow-y-auto"
            >
              <div className="text-center space-y-1.5">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-100 text-indigo-800 text-xs font-black font-mono">
                  PIN: {roomInfo.pin.slice(0, 3)} {roomInfo.pin.slice(3)} •{' '}
                  {roomInfo.player_count} bạn đang chờ
                </div>
                <h2 className="text-xl sm:text-2xl font-black text-indigo-950 leading-snug">
                  {roomInfo.title}
                </h2>
                {roomInfo.classroom_name && (
                  <p className="text-xs font-extrabold text-emerald-700">
                    🏫 Lớp: {roomInfo.classroom_name}
                  </p>
                )}
              </div>

              {/* Quick Class Roster Picker if available */}
              {roomInfo.student_roster && roomInfo.student_roster.length > 0 && (
                <div className="rounded-2xl bg-indigo-50/80 border border-indigo-100 p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-indigo-900">
                      📋 Chạm chọn nhanh tên bạn trong danh sách lớp:
                    </span>
                    <span className="text-[11px] font-bold text-indigo-600">
                      {roomInfo.student_roster.length} HS
                    </span>
                  </div>

                  {roomInfo.student_roster.length > 6 && (
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-zinc-400 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={rosterSearch}
                        onChange={(e) => setRosterSearch(e.target.value)}
                        placeholder="Tìm nhanh tên của bạn..."
                        className="w-full pl-8 pr-3 py-1.5 rounded-xl bg-white border border-indigo-200 text-xs font-semibold outline-none focus:border-indigo-500"
                      />
                    </div>
                  )}

                  <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                    {filteredRoster.map((name) => {
                      const active = studentName.trim() === name;
                      return (
                        <button
                          type="button"
                          key={name}
                          onClick={() => setStudentName(name)}
                          className={`px-3 py-1.5 rounded-xl text-xs font-bold transition cursor-pointer ${
                            active
                              ? 'bg-indigo-600 text-white shadow'
                              : 'bg-white text-zinc-700 border border-indigo-100 hover:border-indigo-400'
                          }`}
                        >
                          {active && '✓ '}
                          {name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Student Name Input */}
              <div className="space-y-1.5">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-600">
                  Họ và tên Học sinh
                </label>
                <div className="flex items-center gap-2.5">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-amber-400 to-rose-500 flex items-center justify-center text-2xl shrink-0 shadow">
                    {selectedAvatar}
                  </div>
                  <input
                    type="text"
                    value={studentName}
                    onChange={(e) => {
                      setError(null);
                      setStudentName(e.target.value);
                    }}
                    placeholder="Nhập họ tên của bạn (VD: Nguyễn Văn An)"
                    className="flex-1 py-3 px-4 rounded-2xl bg-zinc-50 border-2 border-zinc-200 focus:border-indigo-600 focus:bg-white font-bold text-sm sm:text-base outline-none transition"
                  />
                </div>
              </div>

              {/* Cute Colorful Avatar Picker */}
              <div className="space-y-2">
                <label className="block text-xs font-extrabold uppercase tracking-wider text-zinc-600">
                  Chọn Linh Vật Đại Diện Của Bạn
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-8 gap-2">
                  {avatarsList.map((av) => {
                    const isPicked = selectedAvatar === av.emoji;
                    return (
                      <button
                        type="button"
                        key={av.id}
                        onClick={() => setSelectedAvatar(av.emoji)}
                        className={`flex flex-col items-center justify-center py-2 px-1 rounded-2xl border-2 transition-all cursor-pointer ${
                          isPicked
                            ? `bg-gradient-to-br ${av.bg} text-white border-indigo-900 scale-105 shadow-md`
                            : 'bg-zinc-50 hover:bg-zinc-100 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        <span className="text-2xl leading-none">{av.emoji}</span>
                        <span className="text-[9px] font-extrabold mt-1 truncate max-w-full">
                          {av.label}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {error && (
                <p className="text-xs font-bold text-rose-600 text-center bg-rose-50 py-2 px-3 rounded-xl border border-rose-200">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={joining}
                className="w-full py-4 rounded-2xl bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-600 hover:opacity-95 text-white font-black text-base sm:text-lg shadow-xl border-b-[6px] border-b-emerald-900 active:border-b-[2px] active:translate-y-[4px] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                {joining ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <Sparkles className="w-5 h-5" />
                    VÀO ĐẤU TRƯỜNG NGAY!
                  </>
                )}
              </button>
            </form>
          )}
        </main>
      </div>
    );
  }

  // ==================== VIEW B: ACTIVE STUDENT GAME CONTROLLER ====================
  const me = gameState.me;
  const curQ = gameState.current_question;
  const secondsLeft = Math.ceil(displayRemainingMs / 1000);
  const optionCount = Math.max(2, Math.min(4, curQ.option_count || 4));

  return (
    <div className="fixed inset-0 z-50 flex flex-col overflow-hidden bg-gradient-to-br from-[#1d1145] via-[#2c1668] to-[#130a30] text-white select-none">
      {/* Confetti on Podium */}
      {gameState.status === 'podium' && (
        <div className="pointer-events-none absolute inset-0 overflow-hidden z-10">
          {Array.from({ length: 24 }).map((_, i) => (
            <span
              key={i}
              className="animate-confetti-fall absolute top-0 w-2.5 h-3.5 rounded-sm"
              style={{
                left: `${(i * 4.2) % 100}%`,
                backgroundColor: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
                animationDelay: `${(i % 7) * 0.35}s`,
              }}
            />
          ))}
        </div>
      )}

      {/* COMPACT STUDENT STATUS HEADER */}
      <header className="relative z-20 flex items-center justify-between gap-2 px-3.5 sm:px-5 py-2.5 bg-black/35 backdrop-blur-md border-b border-white/10">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-2xl shrink-0">{me?.avatar || selectedAvatar}</span>
          <div className="min-w-0">
            <p className="font-extrabold text-xs sm:text-sm truncate">
              {me?.name || studentName}
            </p>
            <p className="text-[10px] font-mono text-indigo-200">
              PIN {gameState.pin} • Hạng #{me?.rank || 1}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {(me?.streak || 0) >= 2 && (
            <span className="inline-flex items-center gap-0.5 px-2.5 py-1 rounded-full bg-orange-500/30 border border-amber-400/40 text-amber-300 text-xs font-black">
              <Flame className="w-3.5 h-3.5 fill-amber-400" />
              x{me?.streak}
            </span>
          )}

          <div className="px-3 py-1 rounded-xl bg-white/15 border border-white/20 font-mono text-xs sm:text-sm font-black text-amber-300">
            {(me?.score || 0).toLocaleString()} pts
          </div>

          <button
            onClick={() => setMuted((m) => !m)}
            className="p-1.5 rounded-xl bg-white/10 border border-white/15 cursor-pointer"
          >
            {muted ? (
              <VolumeX className="w-4 h-4 text-rose-300" />
            ) : (
              <Volume2 className="w-4 h-4 text-emerald-300" />
            )}
          </button>
        </div>
      </header>

      {/* 1. STUDENT WAITING IN LOBBY */}
      {gameState.status === 'lobby' && (
        <main className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4">
          <div className="animate-bounce w-28 h-28 rounded-3xl bg-white/15 border-2 border-white/25 flex items-center justify-center text-6xl shadow-2xl">
            {me?.avatar || selectedAvatar}
          </div>
          <div className="space-y-1.5">
            <span className="inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full bg-emerald-400/20 text-emerald-300 border border-emerald-400/30 text-xs font-black">
              ✓ Bạn đã vào phòng thành công!
            </span>
            <h2 className="text-2xl sm:text-3xl font-black">{me?.name}</h2>
            <p className="text-sm text-indigo-200 max-w-xs mx-auto leading-relaxed">
              Hãy nhìn lên màn hình của Giáo viên nhé! Khi trò chơi bắt đầu, màn hình này sẽ biến thành{' '}
              <strong className="text-amber-300">4 nút màu A • B • C • D</strong>.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-2xl bg-white/10 border border-white/15 text-xs font-bold text-indigo-100">
            <Users className="w-4 h-4 text-amber-300" />
            Đang có {gameState.player_count} bạn trong phòng
          </div>
        </main>
      )}

      {/* 2. COUNTDOWN 3 - 2 - 1 */}
      {gameState.status === 'countdown' && (
        <main className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-5">
          <span className="px-4 py-1.5 rounded-full bg-white/15 text-xs font-black uppercase tracking-widest text-amber-300">
            Câu {gameState.current_question_index + 1} / {gameState.total_questions}
          </span>
          <div
            key={secondsLeft}
            className="animate-game-pop w-36 h-36 rounded-full bg-gradient-to-br from-amber-400 via-orange-500 to-rose-600 flex items-center justify-center text-6xl font-black shadow-2xl border-4 border-white/40"
          >
            {secondsLeft > 0 ? secondsLeft : 'GO!'}
          </div>
          <p className="text-lg font-extrabold text-indigo-100">
            Sẵn sàng ngón tay chọn màu đáp án!
          </p>
        </main>
      )}

      {/* 3. ACTIVE QUESTION — 4 GIANT COLORED ARCADE BUTTONS (RED, BLUE, YELLOW, GREEN) */}
      {gameState.status === 'question' && (
        <main className="flex-1 flex flex-col p-3 sm:p-5 gap-3 overflow-hidden">
          {/* Question Counter + Countdown Bar */}
          <div className="flex items-center justify-between gap-2 px-1">
            <span className="text-xs sm:text-sm font-black text-indigo-100">
              Câu {gameState.current_question_index + 1} / {gameState.total_questions}
            </span>
            <div
              className={`inline-flex items-center gap-1.5 px-3.5 py-1 rounded-full font-mono text-sm font-black ${
                secondsLeft <= 5
                  ? 'bg-rose-600 text-white animate-pulse'
                  : 'bg-white/15 text-amber-300'
              }`}
            >
              <Clock className="w-4 h-4" />
              {secondsLeft}s
            </div>
          </div>

          {/* Optional Question Title if teacher enabled show_options_on_phone, else prompt to look at Teacher screen */}
          {gameState.show_options_on_phone && curQ.title ? (
            <div className="rounded-2xl bg-white text-zinc-900 px-4 py-3 text-center shadow-lg shrink-0">
              <p className="font-extrabold text-sm sm:text-base leading-snug">
                {curQ.title}
              </p>
            </div>
          ) : (
            <div className="rounded-2xl bg-white/10 border border-white/15 px-3 py-2 text-center shrink-0">
              <p className="text-xs sm:text-sm font-bold text-indigo-100">
                👀 Xem câu hỏi trên màn hình Giáo viên & chạm màu tương ứng!
              </p>
            </div>
          )}

          {/* EITHER LOCKED-IN WAITING STATE OR 2x2 COLOR CONTROLLER */}
          {me?.has_answered || submittingChoice !== null ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-6 gap-4 animate-game-pop">
              {(() => {
                const pickedIdx =
                  me?.choice_index ?? submittingChoice ?? 0;
                const pickedTheme =
                  GAME_OPTION_THEMES[pickedIdx % GAME_OPTION_THEMES.length];
                return (
                  <div
                    className={`w-32 h-32 rounded-3xl ${pickedTheme.bgClass} border-b-[8px] ${pickedTheme.borderBottomClass} flex flex-col items-center justify-center shadow-2xl`}
                  >
                    <span className="text-4xl leading-none">{pickedTheme.shape}</span>
                    <span className="text-3xl font-black mt-1">
                      {pickedTheme.letter}
                    </span>
                  </div>
                );
              })()}
              <h3 className="text-2xl font-black text-white">
                Đã chốt đáp án!
              </h3>
              <p className="text-sm text-indigo-200 max-w-xs">
                Hãy chờ các bạn khác trả lời và hồi hộp đón xem kết quả trên bảng nhé...
              </p>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 text-xs font-bold text-amber-300">
                <Zap className="w-4 h-4 animate-pulse" />
                Tốc độ phản xạ cực nhanh!
              </div>
            </div>
          ) : (
            <div className="flex-1 grid grid-cols-2 gap-3 sm:gap-4 min-h-0">
              {Array.from({ length: optionCount }).map((_, idx) => {
                const theme = GAME_OPTION_THEMES[idx % GAME_OPTION_THEMES.length];
                const optLabel =
                  gameState.show_options_on_phone && curQ.options[idx]
                    ? curQ.options[idx]
                    : '';

                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleTapAnswer(idx)}
                    className={`group relative rounded-3xl ${theme.bgClass} ${theme.hoverClass} border-b-[10px] ${theme.borderBottomClass} active:border-b-[2px] active:translate-y-[8px] shadow-2xl flex flex-col items-center justify-center p-4 text-white transition-all duration-75 cursor-pointer overflow-hidden`}
                  >
                    <div className="w-16 h-16 sm:w-24 sm:h-24 rounded-3xl bg-black/15 flex items-center justify-center mb-2 shadow-inner group-active:scale-95 transition-transform">
                      <span className="text-4xl sm:text-6xl leading-none drop-shadow">
                        {theme.shape}
                      </span>
                    </div>
                    <span className="text-4xl sm:text-6xl font-black tracking-wider drop-shadow">
                      {theme.letter}
                    </span>
                    <span className="text-[11px] sm:text-xs font-extrabold uppercase tracking-widest opacity-85 mt-0.5">
                      Màu {theme.colorName}
                    </span>
                    {optLabel && (
                      <span className="mt-2 text-xs sm:text-base font-extrabold line-clamp-2 px-2 text-center bg-black/20 rounded-xl py-1 max-w-full">
                        {optLabel}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </main>
      )}

      {/* 4. REVEAL / LEADERBOARD FEEDBACK ON STUDENT PHONE */}
      {(gameState.status === 'reveal' || gameState.status === 'leaderboard') && (
        <main
          className={`flex-1 flex flex-col items-center justify-center text-center p-6 gap-4 transition-colors ${
            me?.last_result?.is_correct
              ? 'bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700'
              : 'bg-gradient-to-br from-rose-600 via-red-600 to-pink-800'
          }`}
        >
          {me?.last_result?.is_correct ? (
            <div className="animate-game-pop space-y-4 max-w-sm">
              <div className="w-24 h-24 rounded-full bg-white text-emerald-600 flex items-center justify-center mx-auto shadow-2xl">
                <Check className="w-14 h-14 stroke-[3.5]" />
              </div>
              <h2 className="text-3xl sm:text-4xl font-black tracking-tight">
                CHÍNH XÁC! 🎉
              </h2>
              <div className="inline-block px-6 py-3 rounded-2xl bg-black/25 backdrop-blur-sm border border-white/25">
                <p className="font-mono text-2xl sm:text-3xl font-black text-amber-300">
                  +{me.last_result.points_earned.toLocaleString()} điểm
                </p>
                {(me.streak || 0) >= 2 && (
                  <p className="text-xs font-extrabold text-amber-200 mt-1">
                    🔥 Chuỗi trả lời đúng liên tiếp: x{me.streak}!
                  </p>
                )}
              </div>
            </div>
          ) : (
            <div className="animate-shake-wrong space-y-4 max-w-sm">
              <div className="w-24 h-24 rounded-full bg-white text-rose-600 flex items-center justify-center mx-auto shadow-2xl">
                <XCircle className="w-14 h-14 stroke-[2.5]" />
              </div>
              <h2 className="text-3xl font-black tracking-tight">
                {me?.has_answered ? 'Tiếc quá, sai mất rồi!' : 'Hết giờ mất rồi!'}
              </h2>
              {curQ.correct_index !== null && (
                <div className="px-5 py-3 rounded-2xl bg-black/25 border border-white/20 space-y-1">
                  <p className="text-xs font-bold uppercase text-rose-100">
                    Đáp án đúng là:
                  </p>
                  <p className="text-lg font-black text-amber-300">
                    {GAME_OPTION_THEMES[curQ.correct_index]?.shape}{' '}
                    {GAME_OPTION_THEMES[curQ.correct_index]?.letter}
                    {curQ.options[curQ.correct_index]
                      ? ` — ${curQ.options[curQ.correct_index]}`
                      : ''}
                  </p>
                </div>
              )}
            </div>
          )}

          {curQ.explanation && (
            <p className="max-w-md text-xs sm:text-sm bg-black/25 px-4 py-2.5 rounded-2xl border border-white/15 font-semibold">
              💡 {curQ.explanation}
            </p>
          )}

          <div className="mt-2 inline-flex items-center gap-3 px-5 py-2.5 rounded-2xl bg-white/15 border border-white/25 text-sm font-extrabold">
            <Trophy className="w-4 h-4 text-amber-300" />
            <span>
              Vị trí hiện tại: <strong>Hạng #{me?.rank}</strong> /{' '}
              {gameState.player_count}
            </span>
          </div>
        </main>
      )}

      {/* 5. FINAL PODIUM CELEBRATION ON STUDENT PHONE */}
      {gameState.status === 'podium' && (
        <main className="relative z-20 flex-1 flex flex-col items-center justify-center text-center p-6 gap-5 overflow-y-auto">
          <div className="animate-game-pop space-y-3 max-w-sm w-full">
            {me?.rank === 1 ? (
              <Crown className="w-16 h-16 text-amber-300 fill-amber-300 mx-auto animate-bounce" />
            ) : (
              <Trophy className="w-14 h-14 text-amber-300 mx-auto" />
            )}

            <div className="text-6xl">{me?.avatar || selectedAvatar}</div>
            <h2 className="text-2xl sm:text-3xl font-black">{me?.name}</h2>

            <div className="inline-flex items-center gap-2 px-5 py-2 rounded-full bg-amber-400 text-indigo-950 font-black text-lg shadow-xl">
              {me?.rank === 1
                ? '🥇 QUÁN QUÂN HẠNG #1'
                : me?.rank === 2
                ? '🥈 Á QUÂN HẠNG #2'
                : me?.rank === 3
                ? '🥉 HẠNG #3 XUẤT SẮC'
                : `HẠNG #${me?.rank} CHUNG CUỘC`}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-2xl bg-white/15 border border-white/20 p-3.5">
                <p className="text-[11px] uppercase font-bold text-indigo-200">
                  Điểm Thang 10
                </p>
                <p className="text-2xl font-black text-emerald-300 mt-0.5">
                  {me?.score_10 ?? 0} đ
                </p>
                <p className="text-[11px] text-indigo-200">
                  Đúng {me?.correct_count}/{gameState.total_questions} câu
                </p>
              </div>
              <div className="rounded-2xl bg-white/15 border border-white/20 p-3.5">
                <p className="text-[11px] uppercase font-bold text-indigo-200">
                  Tổng Điểm Game
                </p>
                <p className="text-2xl font-mono font-black text-amber-300 mt-0.5">
                  {(me?.score || 0).toLocaleString()}
                </p>
                <p className="text-[11px] text-amber-200">
                  Chuỗi cao nhất 🔥x{me?.best_streak || 0}
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={onExit}
              className="mt-4 w-full py-3.5 rounded-2xl bg-white text-indigo-950 font-black text-sm shadow-xl hover:bg-amber-200 transition cursor-pointer"
            >
              Hoàn thành & Quay về Trang chủ
            </button>
          </div>
        </main>
      )}
    </div>
  );
}
