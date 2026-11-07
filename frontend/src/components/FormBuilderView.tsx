import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Award,
  Calendar,
  Check,
  CheckCircle2,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Clock,
  Code2,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  GraduationCap,
  Loader2,
  Mail,
  Moon,
  Palette,
  Plus,
  Save,
  Settings,
  ShieldAlert,
  Star,
  Sun,
  Trash2,
  Type,
  Users,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { importFormFromCode, updateSurveyForm } from '../api';
import type { Question, QuestionType, ServerInfo, SurveyForm, ThemeColor } from '../types';
import { BrandLogo } from './BrandLogo';
import { ResponsesAnalyticsView } from './ResponsesAnalyticsView';

interface FormBuilderViewProps {
  initialForm: SurveyForm;
  initialTab?: 'questions' | 'responses' | 'settings';
  serverInfo: ServerInfo | null;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onBackDashboard: () => void;
  onFormUpdated: (updated: SurveyForm) => void;
  onOpenShareModal: (form: SurveyForm) => void;
  onOpenPublicPreview: (slug: string) => void;
}

const QUESTION_TYPE_OPTIONS: {
  value: QuestionType;
  label: string;
  icon: typeof Type;
}[] = [
  { value: 'single_choice', label: 'Trắc nghiệm (1 đáp án)', icon: CircleDot },
  { value: 'multiple_choice', label: 'Hộp kiểm (Nhiều đáp án)', icon: CheckSquare },
  { value: 'short_text', label: 'Trả lời ngắn / Điền từ', icon: Type },
  { value: 'long_text', label: 'Tự luận / Đoạn văn dài', icon: AlignLeft },
  { value: 'dropdown', label: 'Menu thả xuống (Dropdown)', icon: ChevronDown },
  { value: 'rating', label: 'Đánh giá Sao (1 - 5 ★)', icon: Star },
  { value: 'email', label: 'Địa chỉ Email', icon: Mail },
  { value: 'date', label: 'Ngày tháng', icon: Calendar },
];

const THEME_OPTIONS: {
  id: ThemeColor;
  label: string;
  dot: string;
  banner: string;
}[] = [
  {
    id: 'indigo',
    label: 'Indigo',
    dot: 'bg-indigo-600',
    banner: 'from-indigo-500 via-indigo-600 to-violet-600',
  },
  {
    id: 'emerald',
    label: 'Emerald',
    dot: 'bg-emerald-500',
    banner: 'from-emerald-500 via-teal-500 to-cyan-600',
  },
  {
    id: 'violet',
    label: 'Violet',
    dot: 'bg-violet-600',
    banner: 'from-violet-500 via-purple-600 to-fuchsia-600',
  },
  {
    id: 'rose',
    label: 'Rose',
    dot: 'bg-rose-500',
    banner: 'from-rose-500 via-pink-600 to-orange-500',
  },
  {
    id: 'amber',
    label: 'Amber',
    dot: 'bg-amber-500',
    banner: 'from-amber-400 via-orange-500 to-red-500',
  },
  {
    id: 'zinc',
    label: 'Minimalist',
    dot: 'bg-zinc-900',
    banner: 'from-zinc-800 via-zinc-900 to-black',
  },
];

function needsChoiceOptions(type: QuestionType): boolean {
  return type === 'single_choice' || type === 'multiple_choice' || type === 'dropdown';
}

export function FormBuilderView({
  initialForm,
  initialTab = 'questions',
  serverInfo,
  darkMode,
  onToggleDarkMode,
  onBackDashboard,
  onFormUpdated,
  onOpenShareModal,
  onOpenPublicPreview,
}: FormBuilderViewProps) {
  const [form, setForm] = useState<SurveyForm>(initialForm);
  const [activeTab, setActiveTab] = useState<'questions' | 'responses' | 'settings'>(
    initialTab
  );
  const [activeQuestionId, setActiveQuestionId] = useState<string | null>(
    initialForm.questions[0]?.id || null
  );
  const [rosterText, setRosterText] = useState<string>(
    (initialForm.student_roster || []).join('\n')
  );
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [showBatchCode, setShowBatchCode] = useState(false);
  const [batchCodeText, setBatchCodeText] = useState('');
  const [batchImporting, setBatchImporting] = useState(false);

  const currentTheme =
    THEME_OPTIONS.find((t) => t.id === form.theme_color) || THEME_OPTIONS[0];

  const publicLink = `${
    serverInfo?.public_tunnel_url || window.location.origin
  }/f/${form.slug}`;

  const totalPoints = form.questions.reduce(
    (sum, q) => sum + Number(q.points || 0),
    0
  );

  const patchLocalForm = (patch: Partial<SurveyForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleToggleQuizMode = (nextQuiz: boolean) => {
    const count = Math.max(1, form.questions.length);
    const defaultPts = Math.round((10 / count) * 100) / 100;
    const updatedQs = form.questions.map((q) => {
      if (!nextQuiz) return q;
      const pts = Number(q.points || 0) > 0 ? q.points : defaultPts;
      const corr =
        q.correct_answer ??
        (q.type === 'single_choice' && q.options.length > 0 ? q.options[0] : null);
      return { ...q, points: pts, required: true, correct_answer: corr };
    });
    patchLocalForm({
      is_quiz: nextQuiz,
      anti_cheat_enabled: nextQuiz ? true : form.anti_cheat_enabled,
      time_limit_minutes:
        nextQuiz && form.time_limit_minutes === 0 ? 15 : form.time_limit_minutes,
      questions: updatedQs,
    });
  };

  const handleDistribute10Points = () => {
    if (form.questions.length === 0) return;
    const ptsEach = Math.round((10 / form.questions.length) * 100) / 100;
    const nextQs = form.questions.map((q, idx) => {
      if (idx === form.questions.length - 1) {
        const rest =
          Math.round((10 - ptsEach * (form.questions.length - 1)) * 100) / 100;
        return { ...q, points: Math.max(0, rest) };
      }
      return { ...q, points: ptsEach };
    });
    patchLocalForm({ is_quiz: true, questions: nextQs });
  };

  const handleSave = async (overridePatch?: Partial<SurveyForm>) => {
    setSaving(true);
    try {
      const parsedRoster = rosterText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      const payload = {
        ...form,
        student_roster: parsedRoster,
        ...(overridePatch || {}),
      };
      const updated = await updateSurveyForm(form.id, {
        title: payload.title,
        description: payload.description,
        theme_color: payload.theme_color,
        thank_you_message: payload.thank_you_message,
        is_published: payload.is_published,
        accepting_responses: payload.accepting_responses,
        collect_email: payload.collect_email,
        allow_public_summary: payload.allow_public_summary,
        is_quiz: payload.is_quiz,
        time_limit_minutes: payload.time_limit_minutes,
        anti_cheat_enabled: payload.anti_cheat_enabled,
        max_violations: payload.max_violations,
        show_score_immediately: payload.show_score_immediately,
        shuffle_questions: payload.shuffle_questions,
        strict_roster: payload.strict_roster,
        student_roster: payload.student_roster,
        questions: payload.questions,
      });
      setForm(updated);
      setRosterText((updated.student_roster || []).join('\n'));
      onFormUpdated(updated);
      setDirty(false);
      setSavedToast(true);
      setTimeout(() => setSavedToast(false), 1800);
      return updated;
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi khi lưu biểu mẫu');
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleAppendQuestionsFromCode = async () => {
    if (!batchCodeText.trim() || batchImporting) return;
    setBatchImporting(true);
    try {
      const res = await importFormFromCode({
        code: batchCodeText,
        is_quiz: form.is_quiz,
        parse_only: true,
      });
      const parsedQuestions = res.parsed?.questions || [];
      if (parsedQuestions.length > 0) {
        patchLocalForm({
          is_quiz: form.is_quiz || Boolean(res.parsed?.is_quiz),
          questions: [...form.questions, ...parsedQuestions],
        });
        setBatchCodeText('');
        setShowBatchCode(false);
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Cú pháp Code không hợp lệ');
    } finally {
      setBatchImporting(false);
    }
  };

  const updateQuestion = (qid: string, patch: Partial<Question>) => {
    const nextQuestions = form.questions.map((q) => {
      if (q.id !== qid) return q;
      const merged = { ...q, ...patch };
      if (patch.type && needsChoiceOptions(patch.type) && merged.options.length === 0) {
        merged.options = ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D'];
      }
      if (patch.type === 'rating' && !merged.max_rating) {
        merged.max_rating = 5;
      }
      return merged;
    });
    patchLocalForm({ questions: nextQuestions });
  };

  const toggleCorrectOption = (q: Question, opt: string) => {
    if (q.type === 'multiple_choice') {
      const cur = Array.isArray(q.correct_answer) ? q.correct_answer : [];
      const next = cur.includes(opt) ? cur.filter((x) => x !== opt) : [...cur, opt];
      updateQuestion(q.id, { correct_answer: next });
    } else {
      updateQuestion(q.id, {
        correct_answer: q.correct_answer === opt ? null : opt,
      });
    }
  };

  const addQuestion = (presetType: QuestionType = 'single_choice') => {
    const opts = needsChoiceOptions(presetType)
      ? ['Đáp án A', 'Đáp án B', 'Đáp án C', 'Đáp án D']
      : [];
    const newQ: Question = {
      id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      type: presetType,
      title: 'Câu hỏi mới',
      description: '',
      required: form.is_quiz ? true : false,
      options: opts,
      max_rating: presetType === 'rating' ? 5 : undefined,
      points: form.is_quiz ? 2 : 0,
      correct_answer: form.is_quiz && presetType === 'single_choice' ? opts[0] : null,
      explanation: '',
    };
    patchLocalForm({ questions: [...form.questions, newQ] });
    setActiveQuestionId(newQ.id);
  };

  const duplicateQuestion = (idx: number) => {
    const src = form.questions[idx];
    const copy: Question = {
      ...src,
      id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      title: `${src.title} (Bản sao)`,
      options: [...src.options],
    };
    const next = [...form.questions];
    next.splice(idx + 1, 0, copy);
    patchLocalForm({ questions: next });
    setActiveQuestionId(copy.id);
  };

  const removeQuestion = (qid: string) => {
    if (form.questions.length <= 1) {
      alert('Cần có ít nhất 1 câu hỏi.');
      return;
    }
    patchLocalForm({ questions: form.questions.filter((q) => q.id !== qid) });
  };

  const moveQuestion = (idx: number, dir: -1 | 1) => {
    const target = idx + dir;
    if (target < 0 || target >= form.questions.length) return;
    const next = [...form.questions];
    const [picked] = next.splice(idx, 1);
    next.splice(target, 0, picked);
    patchLocalForm({ questions: next });
  };

  const handlePreview = async () => {
    if (dirty) {
      const saved = await handleSave();
      if (saved) onOpenPublicPreview(saved.slug);
    } else {
      onOpenPublicPreview(form.slug);
    }
  };

  const handleOpenShare = async () => {
    if (dirty) {
      const saved = await handleSave();
      if (saved) onOpenShareModal(saved);
    } else {
      onOpenShareModal(form);
    }
  };

  return (
    <div
      className={`min-h-screen pb-24 transition-colors ${
        darkMode
          ? 'bg-zinc-950 text-zinc-100 bg-dot-grid-dark'
          : 'bg-zinc-50/90 text-zinc-900 bg-dot-grid-light'
      }`}
    >
      {/* Top Sticky Responsive Studio Bar */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          darkMode ? 'bg-zinc-950/90 border-zinc-800' : 'bg-white/90 border-zinc-200'
        }`}
      >
        <div className="max-w-6xl mx-auto px-3 sm:px-4 h-15 sm:h-16 flex items-center justify-between gap-2">
          {/* Left: Back + Title */}
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              onClick={onBackDashboard}
              title="Quay lại Bảng điều khiển"
              className={`p-2 rounded-xl border transition-colors cursor-pointer shrink-0 ${
                darkMode
                  ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                  : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
              }`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>

            <div className="hidden lg:block shrink-0">
              <BrandLogo darkMode={darkMode} size="sm" onClick={onBackDashboard} />
            </div>

            <div className="min-w-0">
              <input
                type="text"
                value={form.title}
                onChange={(e) => patchLocalForm({ title: e.target.value })}
                className="font-display font-bold text-sm sm:text-base bg-transparent outline-none truncate w-36 xs:w-48 sm:w-64 md:w-80 border-b border-transparent focus:border-indigo-500"
                placeholder="Tiêu đề bài tập / khảo sát..."
              />
              <div className="flex items-center gap-1.5 text-[11px] text-zinc-400 truncate">
                <span className="font-mono">{form.access_code}</span>
                {form.is_quiz && (
                  <span className="text-indigo-500 font-semibold">
                    • Tổng {Math.round(totalPoints * 100) / 100}đ
                  </span>
                )}
                {dirty && <span className="text-amber-500">• Chưa lưu</span>}
                {savedToast && (
                  <span className="text-emerald-500 inline-flex items-center gap-0.5 font-medium">
                    <Check className="w-3 h-3" /> Đã lưu
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Right Action Controls */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
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

            <button
              onClick={handlePreview}
              title="Làm thử với tư cách Học sinh"
              className={`inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-200'
                  : 'border-zinc-200 hover:bg-zinc-100 text-zinc-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden md:inline">Làm thử</span>
            </button>

            <button
              onClick={() => handleSave()}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                dirty
                  ? 'border-indigo-500 bg-indigo-600 text-white'
                  : darkMode
                    ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                    : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
              }`}
            >
              {saving ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Save className="w-3.5 h-3.5" />
              )}
              <span className="hidden sm:inline">Lưu</span>
            </button>

            <button
              onClick={handleOpenShare}
              className="inline-flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span className="hidden xs:inline">Giao bài /</span>
              <span>Lấy Link</span>
            </button>
          </div>
        </div>

        {/* Scrollable Tabs Row */}
        <div className="max-w-4xl mx-auto px-3 sm:px-4 flex items-center justify-between gap-3 border-t border-zinc-200/60 dark:border-zinc-800/60 overflow-x-auto">
          <div className="flex items-center gap-1 shrink-0">
            {[
              {
                id: 'questions',
                label: form.is_quiz
                  ? `Soạn đề & Đáp án (${form.questions.length})`
                  : `Câu hỏi (${form.questions.length})`,
              },
              {
                id: 'responses',
                label: form.is_quiz
                  ? `Bảng điểm HS (${form.response_count})`
                  : `Câu trả lời (${form.response_count})`,
              },
              {
                id: 'settings',
                label: 'Chống gian lận & DS Lớp',
              },
            ].map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as typeof activeTab)}
                  className={`px-3 sm:px-4 py-2.5 text-xs font-semibold border-b-2 whitespace-nowrap transition-colors cursor-pointer ${
                    active
                      ? 'border-indigo-600 text-indigo-600 dark:border-white dark:text-white'
                      : 'border-transparent text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200'
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>

          <div className="hidden md:flex items-center gap-1.5 py-1.5 shrink-0">
            <Palette className="w-3.5 h-3.5 text-zinc-400 mr-1" />
            {THEME_OPTIONS.map((th) => (
              <button
                key={th.id}
                type="button"
                title={th.label}
                onClick={() => patchLocalForm({ theme_color: th.id })}
                className={`w-4.5 h-4.5 rounded-full ${th.dot} transition-transform cursor-pointer ${
                  form.theme_color === th.id
                    ? 'ring-2 ring-offset-2 ring-zinc-900 dark:ring-white dark:ring-offset-zinc-950 scale-110'
                    : 'opacity-70 hover:opacity-100'
                }`}
              />
            ))}
          </div>
        </div>
      </header>

      {/* Live Public URL Quick Strip */}
      {form.is_published && (
        <div
          className={`border-b ${
            darkMode
              ? 'bg-emerald-950/30 border-emerald-900/40 text-emerald-300'
              : 'bg-emerald-50/90 border-emerald-200/70 text-emerald-900'
          }`}
        >
          <div className="max-w-4xl mx-auto px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-semibold shrink-0 hidden sm:inline">Link giao bài:</span>
              <a
                href={publicLink}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline truncate hover:opacity-80"
              >
                {publicLink}
              </a>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => navigator.clipboard.writeText(publicLink)}
                className="px-2.5 py-1 rounded-lg font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer text-[11px]"
              >
                Chép Link
              </button>
              <a
                href={publicLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold border border-emerald-500/40 text-[11px]"
              >
                Mở <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* MAIN CONTENT */}
      <main className="max-w-4xl mx-auto px-3 sm:px-4 pt-5 sm:pt-7">
        {activeTab === 'questions' && (
          <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
            {/* QUICK HOMEWORK / QUIZ & ANTI-CHEAT BAR */}
            <div
              className={`p-4 rounded-3xl border flex flex-wrap items-center justify-between gap-3 ${
                form.is_quiz
                  ? darkMode
                    ? 'bg-indigo-950/30 border-indigo-800/60'
                    : 'bg-indigo-50/80 border-indigo-200'
                  : darkMode
                    ? 'bg-zinc-900 border-zinc-800'
                    : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={() => handleToggleQuizMode(!form.is_quiz)}
                  className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-2xl text-xs font-bold transition-all cursor-pointer ${
                    form.is_quiz
                      ? 'bg-indigo-600 text-white shadow-xs'
                      : darkMode
                        ? 'bg-zinc-800 text-zinc-300'
                        : 'bg-zinc-100 text-zinc-700'
                  }`}
                >
                  <GraduationCap className="w-4 h-4" />
                  {form.is_quiz
                    ? 'Đang bật: Bài tập Chấm điểm'
                    : 'Bật Chế độ Bài tập Chấm điểm'}
                </button>

                <button
                  type="button"
                  onClick={() =>
                    patchLocalForm({ anti_cheat_enabled: !form.anti_cheat_enabled })
                  }
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl text-xs font-bold border transition-all cursor-pointer ${
                    form.anti_cheat_enabled
                      ? 'bg-rose-500/15 border-rose-500/40 text-rose-600 dark:text-rose-400'
                      : darkMode
                        ? 'border-zinc-800 text-zinc-400'
                        : 'border-zinc-200 text-zinc-600'
                  }`}
                >
                  <ShieldAlert className="w-3.5 h-3.5" />
                  {form.anti_cheat_enabled ? 'Chống thoát App: BẬT' : 'Chống thoát App: TẮT'}
                </button>
              </div>

              {form.is_quiz && (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400">
                    Tổng: {Math.round(totalPoints * 100) / 100}đ
                  </span>
                  <button
                    type="button"
                    onClick={handleDistribute10Points}
                    className={`px-3 py-1.5 rounded-xl text-[11px] font-semibold border cursor-pointer ${
                      darkMode
                        ? 'border-indigo-700 bg-zinc-900 text-indigo-300 hover:bg-zinc-800'
                        : 'border-indigo-200 bg-white text-indigo-700 hover:bg-indigo-50'
                    }`}
                  >
                    Chia đều thang 10đ
                  </button>
                </div>
              )}
            </div>

            {/* Form Title & Description Card */}
            <div
              className={`rounded-3xl border overflow-hidden shadow-xs ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`h-3 bg-gradient-to-r ${currentTheme.banner}`} />
              <div className="p-5 sm:p-7 space-y-3">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => patchLocalForm({ title: e.target.value })}
                  placeholder="Nhập tiêu đề bài kiểm tra / khảo sát..."
                  className="w-full font-display text-xl sm:text-3xl font-extrabold bg-transparent outline-none border-b border-transparent focus:border-zinc-300 dark:focus:border-zinc-700 pb-1"
                />
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => patchLocalForm({ description: e.target.value })}
                  placeholder="Hướng dẫn làm bài cho học sinh / mô tả biểu mẫu..."
                  className={`w-full text-xs sm:text-sm bg-transparent outline-none resize-y ${
                    darkMode ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                />
              </div>
            </div>

            {/* Question Editor Cards */}
            {form.questions.map((q, idx) => {
              const isSelected = activeQuestionId === q.id;
              return (
                <div
                  key={q.id}
                  onClick={() => setActiveQuestionId(q.id)}
                  className={`rounded-3xl border transition-all p-4 sm:p-6 ${
                    isSelected
                      ? darkMode
                        ? 'bg-zinc-900 border-indigo-500/70 ring-2 ring-indigo-500/20'
                        : 'bg-white border-indigo-500 shadow-md ring-2 ring-indigo-500/10'
                      : darkMode
                        ? 'bg-zinc-900/85 border-zinc-800 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-2xs'
                  }`}
                >
                  {/* Question Header Row */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 sm:gap-3 mb-3">
                    <div className="sm:col-span-8">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-1 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500 shrink-0">
                          C{idx + 1}
                        </span>
                        <input
                          type="text"
                          value={q.title}
                          onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
                          placeholder="Nhập nội dung câu hỏi..."
                          className={`flex-1 font-semibold text-sm sm:text-base px-3 py-2 rounded-xl border outline-none ${
                            darkMode
                              ? 'bg-zinc-950 border-zinc-800 text-zinc-100 focus:border-indigo-500'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-indigo-500'
                          }`}
                        />
                      </div>
                    </div>

                    <div className="sm:col-span-4">
                      <select
                        value={q.type}
                        onChange={(e) =>
                          updateQuestion(q.id, { type: e.target.value as QuestionType })
                        }
                        className={`w-full px-3 py-2.5 rounded-xl text-xs font-semibold border outline-none cursor-pointer ${
                          darkMode
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-200'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                        }`}
                      >
                        {QUESTION_TYPE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>
                            {opt.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>

                  {/* Choice Options + Direct Answer Key Selector */}
                  {needsChoiceOptions(q.type) && (
                    <div className="space-y-2 mb-4">
                      {form.is_quiz && (
                        <div className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          ✓ Bấm vào nút tròn/vuông bên trái đáp án để đánh dấu ĐÁP ÁN ĐÚNG:
                        </div>
                      )}

                      {q.options.map((opt, optIdx) => {
                        const isCorrect = Array.isArray(q.correct_answer)
                          ? q.correct_answer.includes(opt)
                          : q.correct_answer === opt;

                        return (
                          <div key={`${q.id}-opt-${optIdx}`} className="flex items-center gap-2">
                            {form.is_quiz ? (
                              <button
                                type="button"
                                onClick={() => toggleCorrectOption(q, opt)}
                                title="Đánh dấu là đáp án đúng"
                                className={`w-6 h-6 rounded-lg border flex items-center justify-center shrink-0 transition-colors cursor-pointer ${
                                  isCorrect
                                    ? 'bg-emerald-500 border-emerald-500 text-white'
                                    : darkMode
                                      ? 'border-zinc-700 text-zinc-500 hover:border-emerald-500'
                                      : 'border-zinc-300 text-zinc-400 hover:border-emerald-500'
                                }`}
                              >
                                <Check className="w-3.5 h-3.5" />
                              </button>
                            ) : (
                              <span className="text-xs font-mono text-zinc-400 w-5 shrink-0">
                                {optIdx + 1}.
                              </span>
                            )}

                            <input
                              type="text"
                              value={opt}
                              onChange={(e) => {
                                const newVal = e.target.value;
                                const nextOpts = [...q.options];
                                const oldVal = nextOpts[optIdx];
                                nextOpts[optIdx] = newVal;

                                let nextCorr = q.correct_answer;
                                if (q.correct_answer === oldVal) {
                                  nextCorr = newVal;
                                } else if (
                                  Array.isArray(q.correct_answer) &&
                                  q.correct_answer.includes(oldVal)
                                ) {
                                  nextCorr = q.correct_answer.map((x) =>
                                    x === oldVal ? newVal : x
                                  );
                                }
                                updateQuestion(q.id, {
                                  options: nextOpts,
                                  correct_answer: nextCorr,
                                });
                              }}
                              className={`flex-1 px-3 py-2 rounded-xl text-sm border outline-none ${
                                form.is_quiz && isCorrect
                                  ? darkMode
                                    ? 'bg-emerald-950/30 border-emerald-600 text-emerald-200 font-semibold'
                                    : 'bg-emerald-50 border-emerald-400 text-emerald-900 font-semibold'
                                  : darkMode
                                    ? 'bg-zinc-950/70 border-zinc-800 text-zinc-200'
                                    : 'bg-zinc-50/60 border-zinc-200 text-zinc-800 focus:bg-white'
                              }`}
                            />

                            {q.options.length > 1 && (
                              <button
                                type="button"
                                onClick={() => {
                                  const nextOpts = q.options.filter((_, i) => i !== optIdx);
                                  updateQuestion(q.id, { options: nextOpts });
                                }}
                                className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            )}
                          </div>
                        );
                      })}

                      <button
                        type="button"
                        onClick={() =>
                          updateQuestion(q.id, {
                            options: [...q.options, `Đáp án ${String.fromCharCode(65 + q.options.length)}`],
                          })
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pt-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm đáp án lựa chọn
                      </button>
                    </div>
                  )}

                  {/* Short Text Answer Key in Quiz Mode */}
                  {form.is_quiz && q.type === 'short_text' && (
                    <div
                      className={`p-3.5 rounded-2xl border mb-4 ${
                        darkMode
                          ? 'bg-emerald-950/20 border-emerald-800/50'
                          : 'bg-emerald-50/60 border-emerald-200'
                      }`}
                    >
                      <label className="block text-[11px] font-bold text-emerald-600 dark:text-emerald-400 mb-1">
                        Đáp án đúng tự chấm (ngăn cách nhiều cách viết bằng dấu |, không phân biệt hoa thường):
                      </label>
                      <input
                        type="text"
                        value={typeof q.correct_answer === 'string' ? q.correct_answer : ''}
                        onChange={(e) =>
                          updateQuestion(q.id, { correct_answer: e.target.value })
                        }
                        placeholder="Ví dụ: Hà Nội | Ha Noi"
                        className={`w-full px-3 py-1.5 rounded-xl text-xs font-semibold border outline-none ${
                          darkMode
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                            : 'bg-white border-emerald-200 text-zinc-900'
                        }`}
                      />
                    </div>
                  )}

                  {/* Quiz Points + Optional Explanation Row */}
                  {form.is_quiz && (
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 mb-4 pt-1">
                      <div className="sm:col-span-3">
                        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                          Điểm câu này
                        </label>
                        <div className="flex items-center gap-1.5">
                          <Award className="w-4 h-4 text-amber-500 shrink-0" />
                          <input
                            type="number"
                            step="0.25"
                            min="0"
                            max="100"
                            value={q.points ?? 0}
                            onChange={(e) =>
                              updateQuestion(q.id, { points: Number(e.target.value) })
                            }
                            className={`w-full px-2.5 py-1.5 rounded-xl text-xs font-mono font-bold border outline-none ${
                              darkMode
                                ? 'bg-zinc-950 border-zinc-800 text-amber-400'
                                : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                            }`}
                          />
                        </div>
                      </div>

                      <div className="sm:col-span-9">
                        <label className="block text-[11px] font-semibold text-zinc-500 mb-1">
                          Lời giải / Giải thích hiển thị sau khi nộp bài (tùy chọn)
                        </label>
                        <input
                          type="text"
                          value={q.explanation || ''}
                          onChange={(e) =>
                            updateQuestion(q.id, { explanation: e.target.value })
                          }
                          placeholder="Giải thích ngắn gọn vì sao chọn đáp án này..."
                          className={`w-full px-3 py-1.5 rounded-xl text-xs border outline-none ${
                            darkMode
                              ? 'bg-zinc-950 border-zinc-800 text-zinc-300'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                          }`}
                        />
                      </div>
                    </div>
                  )}

                  {/* Card Footer Toolbar */}
                  <div
                    className={`pt-3 border-t flex flex-wrap items-center justify-between gap-2 ${
                      darkMode ? 'border-zinc-800' : 'border-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveQuestion(idx, -1)}
                        disabled={idx === 0}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(idx, 1)}
                        disabled={idx === form.questions.length - 1}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateQuestion(idx)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(q.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <span>Bắt buộc</span>
                      <button
                        type="button"
                        onClick={() => updateQuestion(q.id, { required: !q.required })}
                        className={`w-9 h-5 rounded-full p-0.5 transition-colors cursor-pointer ${
                          q.required
                            ? 'bg-indigo-600'
                            : darkMode
                              ? 'bg-zinc-800'
                              : 'bg-zinc-300'
                        }`}
                      >
                        <div
                          className={`w-4 h-4 rounded-full bg-white transition-transform ${
                            q.required ? 'translate-x-4' : 'translate-x-0'
                          }`}
                        />
                      </button>
                    </label>
                  </div>
                </div>
              );
            })}

            {/* Add Question Floating Action Bar */}
            <div
              className={`p-3.5 sm:p-4 rounded-3xl border flex flex-wrap items-center justify-center gap-2 ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
              }`}
            >
              <button
                type="button"
                onClick={() => addQuestion('single_choice')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                + Trắc nghiệm
              </button>
              <button
                type="button"
                onClick={() => addQuestion('multiple_choice')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold border cursor-pointer ${
                  darkMode
                    ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-200'
                    : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5 text-emerald-500" />
                + Nhiều đáp án
              </button>
              <button
                type="button"
                onClick={() => addQuestion('short_text')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold border cursor-pointer ${
                  darkMode
                    ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-200'
                    : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <Type className="w-3.5 h-3.5" />
                + Điền đáp án ngắn
              </button>
              <button
                type="button"
                onClick={() => addQuestion('long_text')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold border cursor-pointer ${
                  darkMode
                    ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-200'
                    : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5 text-amber-500" />
                + Tự luận
              </button>
              <button
                type="button"
                onClick={() => setShowBatchCode((v) => !v)}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                <Code2 className="w-3.5 h-3.5" />
                + Dán Code có sẵn đáp án
              </button>
            </div>

            {showBatchCode && (
              <div
                className={`p-5 rounded-3xl border space-y-3 ${
                  darkMode ? 'bg-zinc-900 border-indigo-500/50' : 'bg-white border-indigo-300 shadow-sm'
                }`}
              >
                <div className="text-xs font-semibold leading-relaxed">
                  Dán nhanh câu hỏi kèm đáp án đúng (đặt dấu <code className="text-emerald-500 font-mono">*</code> trước đáp án đúng):
                </div>
                <textarea
                  rows={5}
                  value={batchCodeText}
                  onChange={(e) => setBatchCodeText(e.target.value)}
                  placeholder={`Thủ đô Việt Nam là gì? * | radio: *Hà Nội, TP.HCM, Đà Nẵng | 2.5đ\nKết quả 15 x 4 bằng mấy? * | text: 60 | 2.5đ`}
                  className="w-full p-3.5 rounded-2xl font-mono text-xs bg-zinc-950 text-emerald-300 border border-zinc-800 outline-none"
                />
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setShowBatchCode(false)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold text-zinc-500 cursor-pointer"
                  >
                    Đóng
                  </button>
                  <button
                    type="button"
                    onClick={handleAppendQuestionsFromCode}
                    disabled={batchImporting || !batchCodeText.trim()}
                    className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer disabled:opacity-50"
                  >
                    {batchImporting ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : (
                      <CheckCircle2 className="w-3.5 h-3.5" />
                    )}
                    Thêm vào đề hiện tại
                  </button>
                </div>
              </div>
            )}
          </div>
        )}

        {activeTab === 'responses' && (
          <ResponsesAnalyticsView
            form={form}
            darkMode={darkMode}
            onResponseCountChange={(cnt) =>
              setForm((prev) => ({ ...prev, response_count: cnt }))
            }
          />
        )}

        {activeTab === 'settings' && (
          <div className="max-w-2xl mx-auto space-y-5">
            {/* ANTI-CHEAT & EXAM TIMER CARD */}
            <div
              className={`p-5 sm:p-7 rounded-3xl border space-y-5 ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-5 h-5 text-rose-500" />
                <h2 className="font-display text-base sm:text-lg font-bold">
                  Giám Sát Chống Thoát App / Gian Lận &amp; Thời Gian Làm Bài
                </h2>
              </div>

              {/* Time Limit Picker */}
              <div>
                <label className="text-xs font-bold flex items-center gap-1.5 mb-2">
                  <Clock className="w-3.5 h-3.5 text-indigo-500" />
                  Thời gian làm bài đếm ngược (Hết giờ tự động thu bài):
                </label>
                <div className="flex flex-wrap items-center gap-2">
                  {[0, 10, 15, 30, 45, 60, 90].map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => patchLocalForm({ time_limit_minutes: m })}
                      className={`px-3.5 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                        form.time_limit_minutes === m
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : darkMode
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-300'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                      }`}
                    >
                      {m === 0 ? 'Không giới hạn' : `${m} phút`}
                    </button>
                  ))}
                </div>
              </div>

              {[
                {
                  key: 'is_quiz' as const,
                  title: 'Chế độ Bài tập / Đề kiểm tra tự chấm điểm',
                  desc: 'Tự động tính điểm từng câu và tổng hợp vào Bảng điểm lớp học.',
                  value: form.is_quiz,
                },
                {
                  key: 'anti_cheat_enabled' as const,
                  title: 'Chống thoát App / Chuyển Tab / Chia đôi màn hình / Copy',
                  desc: 'Bắt buộc vào phòng thi toàn màn hình, cảnh báo đỏ ngay khi rời ứng dụng và ghi lịch sử vi phạm cho Giáo viên.',
                  value: form.anti_cheat_enabled,
                },
                {
                  key: 'shuffle_questions' as const,
                  title: 'Đảo ngẫu nhiên thứ tự câu hỏi cho mỗi học sinh',
                  desc: 'Giúp hạn chế học sinh ngồi cạnh nhìn chép thứ tự câu của nhau.',
                  value: form.shuffle_questions,
                },
                {
                  key: 'show_score_immediately' as const,
                  title: 'Cho học sinh xem điểm và lời giải ngay sau khi nộp bài',
                  desc: 'Tắt mục này nếu Giáo viên muốn giữ kín đáp án cho đến khi cả lớp thi xong.',
                  value: form.show_score_immediately,
                },
              ].map((item) => (
                <div
                  key={item.key}
                  className="flex items-center justify-between gap-4 py-2 border-b last:border-b-0 border-zinc-100 dark:border-zinc-800"
                >
                  <div>
                    <div className="text-sm font-semibold">{item.title}</div>
                    <div className="text-xs text-zinc-500 mt-0.5">{item.desc}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => patchLocalForm({ [item.key]: !item.value })}
                    className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                      item.value
                        ? 'bg-emerald-500'
                        : darkMode
                          ? 'bg-zinc-800'
                          : 'bg-zinc-300'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full bg-white transition-transform ${
                        item.value ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                </div>
              ))}

              {form.anti_cheat_enabled && (
                <div>
                  <label className="block text-xs font-bold mb-2">
                    Số lần thoát màn hình tối đa trước khi TỰ ĐỘNG KHÓA &amp; THU BÀI:
                  </label>
                  <div className="flex items-center gap-2">
                    {[1, 2, 3, 5].map((v) => (
                      <button
                        key={v}
                        type="button"
                        onClick={() => patchLocalForm({ max_violations: v })}
                        className={`px-4 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                          form.max_violations === v
                            ? 'bg-rose-600 border-rose-600 text-white'
                            : darkMode
                              ? 'bg-zinc-950 border-zinc-800 text-zinc-300'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        {v} lần
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* STUDENT CLASS ROSTER CARD */}
            <div
              className={`p-5 sm:p-7 rounded-3xl border space-y-4 ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Users className="w-5 h-5 text-indigo-500" />
                <div>
                  <h2 className="font-display text-base sm:text-lg font-bold">
                    Danh Sách Tên Học Sinh Giao Bài ({rosterText.split('\n').filter((x) => x.trim()).length} HS)
                  </h2>
                  <p className="text-xs text-zinc-500">
                    Mỗi dòng 1 họ tên học sinh. Học sinh sẽ chọn đúng tên mình khi vào thi &amp; Giáo viên theo dõi được ai chưa nộp, cộng điểm riêng từng em.
                  </p>
                </div>
              </div>

              <textarea
                rows={6}
                value={rosterText}
                onChange={(e) => {
                  setRosterText(e.target.value);
                  setDirty(true);
                }}
                placeholder={`Nguyễn Minh Khôi\nTrần Ngọc Bảo Trân\nLê Hoàng Gia Huy\nPhạm Thùy Dương`}
                className={`w-full p-3.5 rounded-2xl text-sm border outline-none ${
                  darkMode
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                }`}
              />

              <div className="flex items-center justify-between gap-4 pt-1">
                <div>
                  <div className="text-xs font-bold">
                    Chỉ cho phép tên có trong danh sách lớp nộp bài
                  </div>
                  <div className="text-[11px] text-zinc-500">
                    Chặn người lạ ngoài danh sách lớp tự ý điền tên ảo
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    patchLocalForm({ strict_roster: !form.strict_roster })
                  }
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors shrink-0 cursor-pointer ${
                    form.strict_roster
                      ? 'bg-indigo-600'
                      : darkMode
                        ? 'bg-zinc-800'
                        : 'bg-zinc-300'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      form.strict_roster ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            </div>

            {/* GENERAL PUBLISHING SETTINGS */}
            <div
              className={`p-5 sm:p-7 rounded-3xl border space-y-4 ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-emerald-500" />
                <h2 className="font-display text-base font-bold">
                  Trạng thái Mở Link &amp; Lời nhắn sau khi nộp
                </h2>
              </div>

              <div className="flex items-center justify-between gap-4 py-1">
                <span className="text-sm font-semibold">Đang mở nhận bài làm / phản hồi</span>
                <button
                  type="button"
                  onClick={() =>
                    patchLocalForm({ accepting_responses: !form.accepting_responses })
                  }
                  className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                    form.accepting_responses ? 'bg-emerald-500' : 'bg-zinc-400'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      form.accepting_responses ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>

              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Lời thông báo sau khi học sinh / người tham gia nộp bài
                </label>
                <textarea
                  rows={2}
                  value={form.thank_you_message}
                  onChange={(e) =>
                    patchLocalForm({ thank_you_message: e.target.value })
                  }
                  className={`w-full p-3.5 rounded-2xl text-sm border outline-none ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-200'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                  }`}
                />
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => handleSave()}
                  disabled={saving}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
                >
                  <Save className="w-4 h-4" />
                  Lưu toàn bộ cài đặt &amp; Danh sách lớp
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
