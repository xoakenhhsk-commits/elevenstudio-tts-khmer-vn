import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  BarChart3,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  Maximize2,
  Moon,
  Play,
  RotateCcw,
  Search,
  Send,
  ShieldAlert,
  ShieldCheck,
  Star,
  Sun,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchPublicSummary, fetchPublicSurvey, submitPublicSurvey } from '../api';
import type { FormAnalytics, QuizSubmissionResult, SurveyForm } from '../types';
import { BrandLogo } from './BrandLogo';
import {
  SAVED_STUDENT_CLASS_KEY,
  SAVED_STUDENT_NAME_KEY,
} from './PublicClassroomView';

interface PublicSurveyViewProps {
  identifier: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onBackHome: () => void;
}

const THEME_ACCENTS: Record<
  string,
  { banner: string; ring: string; btn: string; bar: string; badge: string }
> = {
  indigo: {
    banner: 'from-indigo-500 via-indigo-600 to-violet-600',
    ring: 'focus:border-indigo-500',
    btn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    bar: 'bg-indigo-600',
    badge: 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400',
  },
  emerald: {
    banner: 'from-emerald-500 via-teal-500 to-cyan-600',
    ring: 'focus:border-emerald-500',
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    bar: 'bg-emerald-500',
    badge: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  },
  violet: {
    banner: 'from-violet-500 via-purple-600 to-fuchsia-600',
    ring: 'focus:border-violet-500',
    btn: 'bg-violet-600 hover:bg-violet-700 text-white',
    bar: 'bg-violet-600',
    badge: 'bg-violet-500/15 text-violet-600 dark:text-violet-400',
  },
  rose: {
    banner: 'from-rose-500 via-pink-600 to-orange-500',
    ring: 'focus:border-rose-500',
    btn: 'bg-rose-600 hover:bg-rose-700 text-white',
    bar: 'bg-rose-500',
    badge: 'bg-rose-500/15 text-rose-600 dark:text-rose-400',
  },
  amber: {
    banner: 'from-amber-400 via-orange-500 to-red-500',
    ring: 'focus:border-amber-500',
    btn: 'bg-amber-600 hover:bg-amber-700 text-white',
    bar: 'bg-amber-500',
    badge: 'bg-amber-500/15 text-amber-600 dark:text-amber-400',
  },
  zinc: {
    banner: 'from-zinc-800 via-zinc-900 to-black',
    ring: 'focus:border-zinc-900 dark:focus:border-white',
    btn: 'bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950',
    bar: 'bg-zinc-900 dark:bg-white',
    badge: 'bg-zinc-500/15 text-zinc-700 dark:text-zinc-300',
  },
};

function formatClock(totalSec: number): string {
  const s = Math.max(0, totalSec);
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function PublicSurveyView({
  identifier,
  darkMode,
  onToggleDarkMode,
  onBackHome,
}: PublicSurveyViewProps) {
  const [form, setForm] = useState<SurveyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Student / Respondent identity
  const [respondentName, setRespondentName] = useState('');
  const [studentClass, setStudentClass] = useState('');
  const [respondentEmail, setRespondentEmail] = useState('');
  const [customNameMode, setCustomNameMode] = useState(false);
  const [rosterSearch, setRosterSearch] = useState('');

  // Exam Lobby & Proctoring Anti-Cheat state
  const [examStarted, setExamStarted] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState<number | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [cheatCount, setCheatCount] = useState(0);
  const [cheatLogs, setCheatLogs] = useState<string[]>([]);
  const [cheatWarningModal, setCheatWarningModal] = useState<string | null>(null);

  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [quizResult, setQuizResult] = useState<QuizSubmissionResult | null>(null);
  const [canViewSummary, setCanViewSummary] = useState(false);
  const [publicSummary, setPublicSummary] = useState<FormAnalytics | null>(null);
  const [showingSummary, setShowingSummary] = useState(false);

  const lastViolationTsRef = useRef<number>(0);
  const autoSubmittedRef = useRef<boolean>(false);
  const answersRef = useRef(answers);
  answersRef.current = answers;
  const cheatLogsRef = useRef(cheatLogs);
  cheatLogsRef.current = cheatLogs;
  const cheatCountRef = useRef(cheatCount);
  cheatCountRef.current = cheatCount;
  const elapsedRef = useRef(elapsedSeconds);
  elapsedRef.current = elapsedSeconds;

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPublicSurvey(identifier)
      .then((f) => {
        setForm(f);
        const savedName = localStorage.getItem(SAVED_STUDENT_NAME_KEY) || '';
        const savedClass = localStorage.getItem(SAVED_STUDENT_CLASS_KEY) || '';
        setStudentClass(f.classroom_name || savedClass);
        if (savedName) {
          if (
            !f.student_roster ||
            f.student_roster.length === 0 ||
            f.student_roster.includes(savedName)
          ) {
            setRespondentName(savedName);
          }
        }
        const needsLobby = Boolean(
          f.is_quiz ||
            f.anti_cheat_enabled ||
            f.time_limit_minutes > 0 ||
            (f.student_roster && f.student_roster.length > 0)
        );
        setExamStarted(!needsLobby);
        if (f.time_limit_minutes > 0) {
          setRemainingSeconds(f.time_limit_minutes * 60);
        }
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Không thể tải biểu mẫu')
      )
      .finally(() => setLoading(false));
  }, [identifier]);

  const performSubmit = useCallback(
    async (autoForce = false, overrideCheatCount?: number, overrideLogs?: string[]) => {
      if (!form || autoSubmittedRef.current) return;
      if (autoForce) {
        autoSubmittedRef.current = true;
      }
      setSubmitError(null);
      setSubmitting(true);
      try {
        const res = await submitPublicSurvey(form.slug, {
          respondent_name: respondentName || (autoForce ? 'Học sinh (Tự thu bài)' : ''),
          respondent_email: respondentEmail,
          student_class: studentClass,
          answers: answersRef.current,
          cheat_count: overrideCheatCount ?? cheatCountRef.current,
          cheat_logs: overrideLogs ?? cheatLogsRef.current,
          auto_submitted_cheat: autoForce,
          duration_seconds: elapsedRef.current,
        });
        setSubmittedMessage(
          autoForce
            ? 'Bài làm đã được hệ thống TỰ ĐỘNG THU do hết thời gian hoặc vượt quá giới hạn thoát màn hình!'
            : res.thank_you_message
        );
        setQuizResult(res.quiz_result || null);
        setCanViewSummary(res.allow_public_summary);
        setCheatWarningModal(null);
        if (document.fullscreenElement) {
          document.exitFullscreen?.().catch(() => {});
        }
      } catch (err) {
        autoSubmittedRef.current = false;
        setSubmitError(err instanceof Error ? err.message : 'Không thể gửi bài làm');
      } finally {
        setSubmitting(false);
      }
    },
    [form, respondentName, respondentEmail, studentClass]
  );

  // Live Exam Timer
  useEffect(() => {
    if (!form || !examStarted || submittedMessage) return;
    const timer = window.setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
      if (form.time_limit_minutes > 0) {
        setRemainingSeconds((prev) => {
          if (prev === null) return null;
          if (prev <= 1) {
            window.clearInterval(timer);
            performSubmit(true);
            return 0;
          }
          return prev - 1;
        });
      }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [form, examStarted, submittedMessage, performSubmit]);

  // Real-time Anti-Cheat Tab/App Switch Detector
  useEffect(() => {
    if (!form || !form.anti_cheat_enabled || !examStarted || submittedMessage) return;

    const recordViolation = (reason: string) => {
      const now = Date.now();
      // 1.5s debounce so blur + visibilitychange for the same switch only count once
      if (now - lastViolationTsRef.current < 1500) return;
      lastViolationTsRef.current = now;

      const timeStr = new Date().toLocaleTimeString('vi-VN');
      const entry = `${timeStr} — ${reason}`;
      const nextCount = cheatCountRef.current + 1;
      const nextLogs = [...cheatLogsRef.current, entry];

      setCheatCount(nextCount);
      setCheatLogs(nextLogs);

      const maxV = form.max_violations || 3;
      if (nextCount >= maxV) {
        performSubmit(true, nextCount, nextLogs);
      } else {
        setCheatWarningModal(
          `Hệ thống phát hiện em vừa ${reason.toLowerCase()} (Vi phạm lần ${nextCount}/${maxV}). Nếu vi phạm đủ ${maxV} lần, bài làm sẽ TỰ ĐỘNG BỊ THU và ghi nhận vào Bảng điểm Giáo viên!`
        );
      }
    };

    const onVisibilityChange = () => {
      if (document.hidden) {
        recordViolation('Thoát ứng dụng / Chuyển sang Tab khác');
      }
    };

    const onWindowBlur = () => {
      // Ignore focus changes inside same document (e.g. native select dropdown)
      window.setTimeout(() => {
        if (!document.hasFocus() && !document.hidden) {
          recordViolation('Rời khỏi cửa sổ làm bài (Chia đôi màn hình / Mở App nổi)');
        }
      }, 200);
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('blur', onWindowBlur);
    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('blur', onWindowBlur);
    };
  }, [form, examStarted, submittedMessage, performSubmit]);

  const theme = THEME_ACCENTS[form?.theme_color || 'indigo'] || THEME_ACCENTS.indigo;

  const totalMaxPoints = form
    ? form.questions.reduce((acc, q) => acc + Number(q.points || 0), 0)
    : 0;

  const isQuestionAnswered = (qid: string) => {
    const v = answers[qid];
    return (
      v !== undefined &&
      v !== null &&
      v !== '' &&
      !(Array.isArray(v) && v.length === 0)
    );
  };

  const answeredCount = form
    ? form.questions.filter((q) => isQuestionAnswered(q.id)).length
    : 0;

  const progressPct =
    form && form.questions.length > 0
      ? Math.round((answeredCount / form.questions.length) * 100)
      : 0;

  const handleToggleCheckbox = (qid: string, opt: string) => {
    const prev = Array.isArray(answers[qid]) ? (answers[qid] as string[]) : [];
    const next = prev.includes(opt) ? prev.filter((x) => x !== opt) : [...prev, opt];
    setAnswers({ ...answers, [qid]: next });
  };

  const handleStartExam = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form) return;
    if ((form.is_quiz || form.strict_roster) && !respondentName.trim()) {
      alert('Vui lòng chọn hoặc nhập Họ và tên Học sinh trước khi vào làm bài!');
      return;
    }
    if (form.anti_cheat_enabled) {
      try {
        await document.documentElement.requestFullscreen?.();
      } catch {
        // Mobile browsers without Fullscreen API still use visibilitychange + blur proctoring
      }
    }
    setExamStarted(true);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || submitting) return;
    await performSubmit(false);
  };

  const handleLoadPublicSummary = async () => {
    if (!form) return;
    const stats = await fetchPublicSummary(form.slug);
    setPublicSummary(stats);
    setShowingSummary(true);
  };

  const rosterList = form?.student_roster || [];

  return (
    <div
      onCopy={(e) => {
        if (form?.anti_cheat_enabled && examStarted && !submittedMessage) {
          e.preventDefault();
        }
      }}
      onCut={(e) => {
        if (form?.anti_cheat_enabled && examStarted && !submittedMessage) {
          e.preventDefault();
        }
      }}
      onContextMenu={(e) => {
        if (form?.anti_cheat_enabled && examStarted && !submittedMessage) {
          e.preventDefault();
        }
      }}
      className={`min-h-screen transition-colors pb-20 ${
        form?.anti_cheat_enabled && examStarted && !submittedMessage ? 'select-none' : ''
      } ${
        darkMode
          ? 'bg-zinc-950 text-zinc-100 bg-dot-grid-dark'
          : 'bg-zinc-50/90 text-zinc-900 bg-dot-grid-light'
      }`}
    >
      {/* Top Sticky Responsive Header + Live Exam Timer + Anti-Cheat Pill */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          darkMode ? 'bg-zinc-950/90 border-zinc-800' : 'bg-white/90 border-zinc-200'
        }`}
      >
        <div className="max-w-3xl mx-auto px-3 sm:px-4 h-14 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {!(form?.anti_cheat_enabled && examStarted && !submittedMessage) && (
              <button
                onClick={onBackHome}
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                  darkMode
                    ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                    : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">Trang chủ</span>
              </button>
            )}
            <div className="shrink-0">
              <BrandLogo darkMode={darkMode} size="sm" />
            </div>
          </div>

          {/* Live Exam Status Badges */}
          <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
            {form && examStarted && !submittedMessage && form.anti_cheat_enabled && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold ${
                  cheatCount === 0
                    ? 'bg-emerald-500/15 text-emerald-500'
                    : 'bg-rose-500/20 text-rose-500 animate-pulse'
                }`}
              >
                {cheatCount === 0 ? (
                  <ShieldCheck className="w-3.5 h-3.5" />
                ) : (
                  <ShieldAlert className="w-3.5 h-3.5" />
                )}
                <span>
                  {cheatCount}/{form.max_violations} <span className="hidden sm:inline">vi phạm</span>
                </span>
              </span>
            )}

            {form && examStarted && !submittedMessage && remainingSeconds !== null && (
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-mono text-xs font-extrabold border ${
                  remainingSeconds <= 60
                    ? 'bg-rose-600 text-white border-rose-600 animate-pulse'
                    : remainingSeconds <= 180
                      ? 'bg-amber-500/15 text-amber-500 border-amber-500/40'
                      : darkMode
                        ? 'bg-zinc-900 text-zinc-100 border-zinc-700'
                        : 'bg-zinc-100 text-zinc-900 border-zinc-200'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                {formatClock(remainingSeconds)}
              </span>
            )}

            {form && examStarted && !submittedMessage && (
              <span className="hidden xs:inline text-xs font-mono font-semibold text-zinc-500">
                {answeredCount}/{form.questions.length}
              </span>
            )}

            <button
              onClick={onToggleDarkMode}
              className={`p-2 rounded-xl border cursor-pointer ${
                darkMode
                  ? 'border-zinc-800 bg-zinc-900 text-amber-400'
                  : 'border-zinc-200 bg-white text-zinc-700'
              }`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Live Progress Bar */}
        {form && examStarted && !submittedMessage && (
          <div className={`h-1 w-full ${darkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
            <div
              className={`h-full transition-all duration-300 ${theme.bar}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </header>

      {/* FULL-SCREEN ANTI-CHEAT WARNING MODAL */}
      {cheatWarningModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-rose-950/80 backdrop-blur-sm p-4">
          <div
            className={`w-full max-w-md rounded-3xl border-2 border-rose-500 p-6 text-center shadow-2xl ${
              darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-white text-zinc-900'
            }`}
          >
            <div className="w-14 h-14 rounded-2xl bg-rose-500/20 text-rose-500 flex items-center justify-center mx-auto mb-3">
              <AlertTriangle className="w-8 h-8" />
            </div>
            <h3 className="font-display text-xl font-extrabold text-rose-500">
              CẢNH BÁO RỜI MÀN HÌNH LÀM BÀI!
            </h3>
            <p className="text-sm mt-2.5 leading-relaxed opacity-90">{cheatWarningModal}</p>
            <button
              type="button"
              onClick={async () => {
                setCheatWarningModal(null);
                try {
                  await document.documentElement.requestFullscreen?.();
                } catch {
                  // ignore
                }
              }}
              className="mt-6 w-full py-3 rounded-2xl text-sm font-bold bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              Tôi đã hiểu — Quay lại làm bài ngay
            </button>
          </div>
        </div>
      )}

      <div className="max-w-2xl mx-auto px-3.5 sm:px-4 pt-6 sm:pt-8">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
            <p className="text-sm text-zinc-500">Đang tải đề bài / biểu mẫu...</p>
          </div>
        ) : error || !form ? (
          <div
            className={`p-8 sm:p-10 rounded-3xl border text-center ${
              darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <h2 className="font-display text-xl font-bold">Không thể mở liên kết này</h2>
            <p className="text-sm text-zinc-500 mt-2">{error}</p>
            <button
              onClick={onBackHome}
              className="mt-6 px-5 py-2.5 rounded-full text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
            >
              Quay về Trang chủ
            </button>
          </div>
        ) : !examStarted && !submittedMessage ? (
          /* ==================== EXAM LOBBY START GATE ==================== */
          <form
            onSubmit={handleStartExam}
            className={`rounded-3xl border overflow-hidden shadow-lg ${
              darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
            }`}
          >
            <div className={`h-3.5 bg-gradient-to-r ${theme.banner}`} />
            <div className="p-6 sm:p-8 space-y-6">
              <div>
                <div className="flex flex-wrap items-center gap-2 mb-2.5">
                  <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${theme.badge}`}>
                    <GraduationCap className="w-4 h-4" />
                    {form.is_quiz ? 'Bài Tập / Kiểm Tra Chấm Điểm' : 'Biểu Mẫu Có Giám Sát'}
                  </span>
                  <span className="px-2.5 py-1 rounded-full text-xs font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                    {form.access_code}
                  </span>
                  {form.classroom_name && (
                    <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400">
                      🏫 Giao cho: {form.classroom_name}
                    </span>
                  )}
                  {(form.max_attempts ?? 0) > 0 && (
                    <span className="px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-600 dark:text-amber-400">
                      Tối đa {form.max_attempts} lần nộp
                    </span>
                  )}
                </div>

                <h1 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight">
                  {form.title}
                </h1>
                {form.description && (
                  <p className="text-sm text-zinc-500 mt-2 leading-relaxed">
                    {form.description}
                  </p>
                )}
              </div>

              {/* Exam Info Pills */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                <div
                  className={`p-3.5 rounded-2xl border ${
                    darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div className="text-[11px] text-zinc-500">Số lượng câu</div>
                  <div className="font-display font-extrabold text-lg mt-0.5">
                    {form.questions.length} câu
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-2xl border ${
                    darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <div className="text-[11px] text-zinc-500">Thời gian làm bài</div>
                  <div className="font-display font-extrabold text-lg mt-0.5">
                    {form.time_limit_minutes > 0
                      ? `${form.time_limit_minutes} phút`
                      : 'Tự do'}
                  </div>
                </div>

                {form.is_quiz && (
                  <div
                    className={`p-3.5 rounded-2xl border col-span-2 sm:col-span-1 ${
                      darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <div className="text-[11px] text-zinc-500">Tổng điểm đề</div>
                    <div className="font-display font-extrabold text-lg text-emerald-500 mt-0.5">
                      {totalMaxPoints > 0 ? `${totalMaxPoints} điểm` : 'Thang 10'}
                    </div>
                  </div>
                )}
              </div>

              {/* Anti-Cheat Notice */}
              {form.anti_cheat_enabled && (
                <div
                  className={`p-4 rounded-2xl border flex items-start gap-3 ${
                    darkMode
                      ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                      : 'bg-amber-50 border-amber-200 text-amber-900'
                  }`}
                >
                  <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                  <div className="text-xs leading-relaxed">
                    <strong className="font-bold block mb-0.5">
                      Chế độ Chống Thoát App / Gian Lận đang BẬT:
                    </strong>
                    Không thoát trình duyệt, không chuyển sang ứng dụng khác (Zalo, Google, ChatGPT) hoặc chia đôi màn hình. Nếu rời màn hình quá{' '}
                    <strong>{form.max_violations} lần</strong>, hệ thống sẽ tự động khóa và nộp bài ngay lập tức.
                  </div>
                </div>
              )}

              {/* Student Roster Selection & Class Input */}
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-bold mb-1.5">
                    Họ và tên Học sinh / Người làm bài <span className="text-rose-500">*</span>
                  </label>

                  {rosterList.length > 0 && !customNameMode ? (
                    <div className="space-y-2.5">
                      {/* Mobile-friendly Searchable Student Roster Picker */}
                      {rosterList.length > 6 && (
                        <div
                          className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border ${
                            darkMode
                              ? 'bg-zinc-950 border-zinc-800'
                              : 'bg-zinc-50 border-zinc-200'
                          }`}
                        >
                          <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                          <input
                            type="text"
                            value={rosterSearch}
                            onChange={(e) => setRosterSearch(e.target.value)}
                            placeholder="Gõ nhanh tên của em để lọc danh sách..."
                            className="w-full bg-transparent outline-none text-xs sm:text-sm"
                          />
                        </div>
                      )}

                      <div className="max-h-52 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-2 pr-1">
                        {rosterList
                          .filter((n) =>
                            n.toLowerCase().includes(rosterSearch.trim().toLowerCase())
                          )
                          .map((stName, idx) => {
                            const selected = respondentName === stName;
                            return (
                              <button
                                key={stName}
                                type="button"
                                onClick={() => {
                                  setRespondentName(stName);
                                  localStorage.setItem(SAVED_STUDENT_NAME_KEY, stName);
                                }}
                                className={`text-left px-3.5 py-3 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between border transition-all cursor-pointer active:scale-[0.99] ${
                                  selected
                                    ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                                    : darkMode
                                      ? 'bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-indigo-500'
                                      : 'bg-zinc-50 border-zinc-200 text-zinc-800 hover:border-indigo-400'
                                }`}
                              >
                                <span className="truncate">
                                  <span className="opacity-60 font-mono mr-1.5">
                                    {idx + 1}.
                                  </span>
                                  {stName}
                                </span>
                                {selected && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                              </button>
                            );
                          })}
                      </div>

                      {!form.strict_roster && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomNameMode(true);
                            setRespondentName('');
                          }}
                          className="text-xs font-semibold text-indigo-500 hover:underline cursor-pointer"
                        >
                          + Tên em chưa có trong danh sách lớp? Bấm để tự nhập tên
                        </button>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5">
                      <input
                        type="text"
                        required
                        value={respondentName}
                        onChange={(e) => setRespondentName(e.target.value)}
                        placeholder="Nhập đầy đủ Họ và tên (VD: Nguyễn Minh Khôi)"
                        className={`w-full px-4 py-3 rounded-2xl text-sm border outline-none ${
                          darkMode
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white'
                        } ${theme.ring}`}
                      />
                      {rosterList.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setCustomNameMode(false);
                            setRespondentName('');
                          }}
                          className="text-xs font-semibold text-indigo-500 hover:underline cursor-pointer"
                        >
                          ← Quay lại chọn từ Danh sách lớp có sẵn
                        </button>
                      )}
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  <div>
                    <label className="block text-xs font-bold mb-1.5">
                      Lớp / Mã số Học sinh
                    </label>
                    <input
                      type="text"
                      value={studentClass}
                      onChange={(e) => setStudentClass(e.target.value)}
                      placeholder="VD: Lớp 10A1 - Số 12"
                      className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none ${
                        darkMode
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white'
                      }`}
                    />
                  </div>

                  {form.collect_email && (
                    <div>
                      <label className="block text-xs font-bold mb-1.5">
                        Email <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="email"
                        required
                        value={respondentEmail}
                        onChange={(e) => setRespondentEmail(e.target.value)}
                        placeholder="hocsinh@school.edu.vn"
                        className={`w-full px-4 py-2.5 rounded-2xl text-sm border outline-none ${
                          darkMode
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white'
                        }`}
                      />
                    </div>
                  )}
                </div>
              </div>

              <button
                type="submit"
                className={`w-full py-3.5 px-6 rounded-2xl text-sm font-bold shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer ${theme.btn}`}
              >
                {form.anti_cheat_enabled ? (
                  <Maximize2 className="w-4 h-4" />
                ) : (
                  <Play className="w-4 h-4" />
                )}
                <span>
                  {form.anti_cheat_enabled
                    ? 'Vào Phòng Thi Toàn Màn Hình & Bắt Đầu Tính Giờ'
                    : 'Bắt Đầu Làm Bài Ngay'}
                </span>
              </button>
            </div>
          </form>
        ) : submittedMessage ? (
          /* ==================== SUBMITTED / QUIZ SCORE SCREEN ==================== */
          <div className="space-y-6">
            <div
              className={`rounded-3xl border overflow-hidden shadow-lg ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`h-3.5 bg-gradient-to-r ${theme.banner}`} />
              <div className="p-6 sm:p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                  {quizResult ? (
                    <Award className="w-8 h-8" />
                  ) : (
                    <CheckCircle2 className="w-8 h-8" />
                  )}
                </div>

                <h2 className="font-display text-xl sm:text-2xl font-extrabold">
                  {form.title}
                </h2>
                {respondentName && (
                  <div className="mt-1.5 inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-500">
                    <UserCheck className="w-3.5 h-3.5" />
                    <span>
                      Học sinh: {respondentName}
                      {studentClass ? ` (${studentClass})` : ''}
                    </span>
                  </div>
                )}

                <p
                  className={`text-sm mt-2 max-w-md mx-auto leading-relaxed ${
                    darkMode ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {submittedMessage}
                </p>

                {/* SCORE DISPLAY FOR QUIZ MODE */}
                {quizResult && (
                  <div
                    className={`mt-6 p-5 rounded-3xl border grid grid-cols-3 gap-2 ${
                      darkMode
                        ? 'bg-zinc-950/90 border-zinc-800'
                        : 'bg-emerald-50/60 border-emerald-200'
                    }`}
                  >
                    <div>
                      <div className="text-[11px] text-zinc-500 font-semibold">
                        Điểm Thang 10
                      </div>
                      <div className="font-display text-2xl sm:text-3xl font-extrabold text-emerald-500 mt-1">
                        {quizResult.score_10}
                        <span className="text-xs font-normal text-zinc-400">/10</span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-zinc-500 font-semibold">
                        Số câu đúng
                      </div>
                      <div className="font-display text-2xl sm:text-3xl font-extrabold mt-1">
                        {quizResult.correct_count}
                        <span className="text-sm font-normal text-zinc-400">
                          /{quizResult.gradable_count}
                        </span>
                      </div>
                    </div>

                    <div>
                      <div className="text-[11px] text-zinc-500 font-semibold">
                        Thời gian làm
                      </div>
                      <div className="font-display text-xl sm:text-2xl font-extrabold font-mono mt-1.5">
                        {formatClock(elapsedSeconds)}
                      </div>
                    </div>
                  </div>
                )}

                <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
                  {!form.is_quiz && (
                    <button
                      onClick={() => {
                        setAnswers({});
                        setSubmittedMessage(null);
                        setShowingSummary(false);
                      }}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold border cursor-pointer ${
                        darkMode
                          ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                          : 'border-zinc-200 hover:bg-zinc-50 text-zinc-800'
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Gửi phản hồi khác
                    </button>
                  )}

                  {canViewSummary && !showingSummary && (
                    <button
                      onClick={handleLoadPublicSummary}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer ${theme.btn}`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      Xem biểu đồ tổng hợp
                    </button>
                  )}

                  <button
                    onClick={onBackHome}
                    className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold border cursor-pointer ${
                      darkMode
                        ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                        : 'border-zinc-200 hover:bg-zinc-50 text-zinc-800'
                    }`}
                  >
                    Về Trang chủ
                  </button>
                </div>
              </div>
            </div>

            {/* DETAILED ANSWER REVIEW FOR STUDENTS */}
            {quizResult && (
              <div className="space-y-3.5">
                <h3 className="font-display font-bold text-base px-1">
                  Chi tiết kết quả chấm từng câu:
                </h3>
                {quizResult.question_results.map((qr, idx) => {
                  const isManual = qr.is_correct === null;
                  return (
                    <div
                      key={qr.question_id}
                      className={`p-5 rounded-3xl border ${
                        isManual
                          ? darkMode
                            ? 'bg-zinc-900 border-zinc-800'
                            : 'bg-white border-zinc-200'
                          : qr.is_correct
                            ? darkMode
                              ? 'bg-emerald-950/20 border-emerald-800/60'
                              : 'bg-emerald-50/50 border-emerald-200'
                            : darkMode
                              ? 'bg-rose-950/20 border-rose-800/60'
                              : 'bg-rose-50/50 border-rose-200'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="font-semibold text-sm">
                          <span className="font-mono text-zinc-400 mr-1.5">
                            Câu {idx + 1}.
                          </span>
                          {qr.title}
                        </div>
                        <span
                          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                            isManual
                              ? 'bg-amber-500/15 text-amber-500'
                              : qr.is_correct
                                ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-400'
                                : 'bg-rose-500/20 text-rose-600 dark:text-rose-400'
                          }`}
                        >
                          {isManual ? (
                            'GV chấm riêng'
                          ) : qr.is_correct ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" /> +{qr.earned_points}/
                              {qr.max_points}đ
                            </>
                          ) : (
                            <>
                              <XCircle className="w-3.5 h-3.5" /> 0/{qr.max_points}đ
                            </>
                          )}
                        </span>
                      </div>

                      <div className="mt-2.5 text-xs space-y-1">
                        <div>
                          <span className="text-zinc-500">Bài làm của em: </span>
                          <span className="font-semibold">
                            {Array.isArray(qr.user_answer)
                              ? qr.user_answer.join(', ')
                              : String(qr.user_answer || 'Chưa trả lời')}
                          </span>
                        </div>
                        {!isManual && !qr.is_correct && qr.correct_answer && (
                          <div className="text-emerald-600 dark:text-emerald-400 font-semibold">
                            Đáp án đúng:{' '}
                            {Array.isArray(qr.correct_answer)
                              ? qr.correct_answer.join(', ')
                              : qr.correct_answer}
                          </div>
                        )}
                        {qr.explanation && (
                          <div className="pt-1.5 text-zinc-500 italic">
                            💡 Giải thích: {qr.explanation}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {showingSummary && publicSummary && (
              <div className="space-y-4">
                <h3 className="font-display font-bold text-lg">
                  Tổng hợp kết quả ({publicSummary.total_responses} phản hồi)
                </h3>
                {publicSummary.question_stats.map((qs) => (
                  <div
                    key={qs.question_id}
                    className={`p-6 rounded-3xl border ${
                      darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                    }`}
                  >
                    <div className="font-semibold text-sm mb-3">{qs.title}</div>
                    {qs.distribution && (
                      <div className="space-y-2.5">
                        {qs.distribution.map((bar) => (
                          <div key={bar.label}>
                            <div className="flex justify-between text-xs mb-1">
                              <span>{bar.label}</span>
                              <span className="font-mono font-semibold">
                                {bar.count} ({bar.percent}%)
                              </span>
                            </div>
                            <div
                              className={`h-2 rounded-full overflow-hidden ${
                                darkMode ? 'bg-zinc-800' : 'bg-zinc-100'
                              }`}
                            >
                              <div
                                className={`h-full rounded-full ${theme.bar}`}
                                style={{ width: `${bar.percent}%` }}
                              />
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* ==================== ACTIVE SURVEY / EXAM FORM ==================== */
          <form onSubmit={handleSubmitForm} className="space-y-4 sm:space-y-5">
            {/* Header Card */}
            <div
              className={`rounded-3xl border overflow-hidden shadow-xs ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`h-3 bg-gradient-to-r ${theme.banner}`} />
              <div className="p-5 sm:p-7">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                      {form.access_code}
                    </span>
                    {form.is_quiz && (
                      <span className={`text-[11px] font-bold px-2.5 py-0.5 rounded-full ${theme.badge}`}>
                        Tổng: {totalMaxPoints > 0 ? `${totalMaxPoints} điểm` : '10 điểm'}
                      </span>
                    )}
                  </div>
                  {respondentName && (
                    <span className="text-xs font-semibold text-indigo-500">
                      HS: {respondentName}
                      {studentClass ? ` • ${studentClass}` : ''}
                    </span>
                  )}
                </div>
                <h1 className="font-display text-xl sm:text-3xl font-extrabold leading-tight">
                  {form.title}
                </h1>
                {form.description && (
                  <p
                    className={`mt-2.5 text-xs sm:text-sm leading-relaxed whitespace-pre-line ${
                      darkMode ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  >
                    {form.description}
                  </p>
                )}

                {/* Quick Question Navigator Pills (Mobile & Desktop friendly) */}
                {form.questions.length > 2 && (
                  <div className="mt-4 pt-3.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center gap-1.5 overflow-x-auto pb-1">
                    {form.questions.map((q, idx) => {
                      const done = isQuestionAnswered(q.id);
                      return (
                        <a
                          key={q.id}
                          href={`#qcard-${q.id}`}
                          className={`w-7 h-7 rounded-lg text-xs font-mono font-bold flex items-center justify-center shrink-0 transition-colors ${
                            done
                              ? `${theme.btn}`
                              : darkMode
                                ? 'bg-zinc-800 text-zinc-400'
                                : 'bg-zinc-100 text-zinc-500'
                          }`}
                        >
                          {idx + 1}
                        </a>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* Identity Card ONLY if lobby was skipped (standard non-quiz survey) */}
            {!form.is_quiz && !form.anti_cheat_enabled && form.time_limit_minutes === 0 && (
              <div
                className={`p-5 sm:p-6 rounded-3xl border grid grid-cols-1 sm:grid-cols-2 gap-4 ${
                  darkMode
                    ? 'bg-zinc-900/90 border-zinc-800'
                    : 'bg-white border-zinc-200 shadow-2xs'
                }`}
              >
                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Họ và tên {rosterList.length > 0 ? '(Chọn từ danh sách)' : '(Tùy chọn)'}
                  </label>
                  {rosterList.length > 0 ? (
                    <select
                      value={respondentName}
                      onChange={(e) => setRespondentName(e.target.value)}
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none ${
                        darkMode
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                      }`}
                    >
                      <option value="">— Chọn họ tên —</option>
                      {rosterList.map((n) => (
                        <option key={n} value={n}>
                          {n}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={respondentName}
                      onChange={(e) => setRespondentName(e.target.value)}
                      placeholder="Nhập tên hoặc để trống ẩn danh"
                      className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none ${
                        darkMode
                          ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                          : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                      } ${theme.ring}`}
                    />
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Địa chỉ Email {form.collect_email && <span className="text-rose-500">*</span>}
                  </label>
                  <input
                    type="email"
                    required={form.collect_email}
                    value={respondentEmail}
                    onChange={(e) => setRespondentEmail(e.target.value)}
                    placeholder="email@example.com"
                    className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                    } ${theme.ring}`}
                  />
                </div>
              </div>
            )}

            {/* Questions List */}
            {form.questions.map((q, idx) => (
              <div
                id={`qcard-${q.id}`}
                key={q.id}
                className={`p-5 sm:p-6 rounded-3xl border scroll-mt-20 transition-colors ${
                  darkMode
                    ? 'bg-zinc-900/90 border-zinc-800'
                    : 'bg-white border-zinc-200 shadow-2xs'
                }`}
              >
                <div className="mb-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="text-sm sm:text-base font-semibold leading-snug">
                      <span className="text-zinc-400 font-mono text-xs sm:text-sm mr-1.5">
                        Câu {idx + 1}.
                      </span>
                      {q.title}
                      {q.required && <span className="text-rose-500 ml-1">*</span>}
                    </div>
                    {form.is_quiz && Number(q.points || 0) > 0 && (
                      <span className="shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                        {q.points}đ
                      </span>
                    )}
                  </div>
                  {q.description && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {q.description}
                    </p>
                  )}
                </div>

                {q.type === 'short_text' && (
                  <input
                    type="text"
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Nhập câu trả lời của bạn..."
                    className={`w-full px-4 py-3 rounded-xl text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                    } ${theme.ring}`}
                  />
                )}

                {q.type === 'email' && (
                  <input
                    type="email"
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="name@example.com"
                    className={`w-full px-4 py-3 rounded-xl text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                    } ${theme.ring}`}
                  />
                )}

                {q.type === 'date' && (
                  <input
                    type="date"
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className={`w-full sm:w-auto px-4 py-3 rounded-xl text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900'
                    }`}
                  />
                )}

                {q.type === 'long_text' && (
                  <textarea
                    rows={4}
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Nhập bài làm tự luận / ý kiến chi tiết..."
                    className={`w-full p-4 rounded-2xl text-sm border outline-none resize-y ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                    } ${theme.ring}`}
                  />
                )}

                {q.type === 'single_choice' && (
                  <div className="space-y-2.5">
                    {q.options.map((opt, oIdx) => {
                      const checked = answers[q.id] === opt;
                      const letter = String.fromCharCode(65 + oIdx);
                      return (
                        <label
                          key={opt}
                          onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all min-h-[48px] ${
                            checked
                              ? darkMode
                                ? 'border-indigo-400 bg-indigo-500/15'
                                : 'border-indigo-600 bg-indigo-50/70 shadow-2xs'
                              : darkMode
                                ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                          }`}
                        >
                          <span
                            className={`w-6 h-6 rounded-full border text-xs font-mono font-bold flex items-center justify-center shrink-0 ${
                              checked
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : darkMode
                                  ? 'border-zinc-700 text-zinc-400'
                                  : 'border-zinc-300 text-zinc-500'
                            }`}
                          >
                            {form.is_quiz ? letter : checked ? '●' : ''}
                          </span>
                          <span className="text-sm leading-snug">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'multiple_choice' && (
                  <div className="space-y-2.5">
                    {q.options.map((opt) => {
                      const selectedList = Array.isArray(answers[q.id])
                        ? (answers[q.id] as string[])
                        : [];
                      const checked = selectedList.includes(opt);
                      return (
                        <label
                          key={opt}
                          onClick={() => handleToggleCheckbox(q.id, opt)}
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all min-h-[48px] ${
                            checked
                              ? darkMode
                                ? 'border-indigo-400 bg-indigo-500/15'
                                : 'border-indigo-600 bg-indigo-50/70 shadow-2xs'
                              : darkMode
                                ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                          }`}
                        >
                          <span
                            className={`w-5 h-5 rounded-md border flex items-center justify-center shrink-0 text-xs font-bold ${
                              checked
                                ? 'bg-indigo-600 border-indigo-600 text-white'
                                : 'border-zinc-400'
                            }`}
                          >
                            {checked && '✓'}
                          </span>
                          <span className="text-sm leading-snug">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {q.type === 'dropdown' && (
                  <select
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className={`w-full px-4 py-3 rounded-xl text-sm border outline-none cursor-pointer ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                    }`}
                  >
                    <option value="">— Chọn một phương án —</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {q.type === 'rating' && (
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {Array.from({ length: q.max_rating || 5 }, (_, i) => i + 1).map((val) => {
                      const active = Number(answers[q.id] || 0) >= val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAnswers({ ...answers, [q.id]: val })}
                          className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                            active
                              ? 'border-amber-400 bg-amber-400/15 text-amber-500 scale-105'
                              : darkMode
                                ? 'border-zinc-800 bg-zinc-950 text-zinc-500'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-400'
                          }`}
                        >
                          <Star className={`w-4 h-4 sm:w-5 sm:h-5 ${active ? 'fill-amber-400' : ''}`} />
                          <span className="text-[10px] font-mono font-bold">{val}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}

            {submitError && (
              <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{submitError}</span>
              </div>
            )}

            <div className="hidden sm:flex items-center justify-between gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Xóa toàn bộ lựa chọn hiện tại để làm lại?')) {
                    setAnswers({});
                  }
                }}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
              >
                Làm mới lựa chọn
              </button>

              <button
                type="submit"
                disabled={submitting}
                className={`inline-flex items-center gap-2 px-6 sm:px-8 py-3.5 rounded-full text-sm font-bold shadow-md transition-all cursor-pointer disabled:opacity-50 ${theme.btn}`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang nộp bài...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {form.is_quiz ? 'Nộp Bài & Chấm Điểm' : 'Gửi Khảo Sát'}
                  </>
                )}
              </button>
            </div>

            {/* MOBILE STICKY BOTTOM EXAM SUBMIT BAR */}
            <div
              className={`sm:hidden fixed bottom-0 inset-x-0 z-30 p-3 border-t backdrop-blur-xl flex items-center justify-between gap-3 ${
                darkMode
                  ? 'bg-zinc-950/95 border-zinc-800'
                  : 'bg-white/95 border-zinc-200 shadow-lg'
              }`}
            >
              <div className="text-xs">
                <div className="font-bold">
                  Đã làm {answeredCount}/{form.questions.length} câu
                </div>
                <div className="text-[11px] text-zinc-500 truncate max-w-[140px]">
                  {respondentName || 'Chưa ghi tên'}
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className={`flex-1 py-3 px-4 rounded-2xl text-xs font-extrabold inline-flex items-center justify-center gap-2 shadow-md active:scale-[0.99] disabled:opacity-50 ${theme.btn}`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang nộp...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    {form.is_quiz ? 'Nộp Bài Ngay' : 'Gửi Khảo Sát'}
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
