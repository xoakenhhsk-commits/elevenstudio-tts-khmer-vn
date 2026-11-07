import {
  AlignLeft,
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  CircleDot,
  Copy,
  ExternalLink,
  Eye,
  Globe,
  Loader2,
  Mail,
  Moon,
  Palette,
  Plus,
  Save,
  Settings,
  Star,
  Sun,
  Trash2,
  Type,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { updateSurveyForm } from '../api';
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
  { value: 'short_text', label: 'Trả lời ngắn', icon: Type },
  { value: 'long_text', label: 'Đoạn văn dài', icon: AlignLeft },
  { value: 'single_choice', label: 'Trắc nghiệm (1 lựa chọn)', icon: CircleDot },
  { value: 'multiple_choice', label: 'Hộp kiểm (Nhiều lựa chọn)', icon: CheckSquare },
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
  const [saving, setSaving] = useState(false);
  const [savedToast, setSavedToast] = useState(false);
  const [dirty, setDirty] = useState(false);

  const currentTheme =
    THEME_OPTIONS.find((t) => t.id === form.theme_color) || THEME_OPTIONS[0];

  const publicLink = `${
    serverInfo?.public_tunnel_url || window.location.origin
  }/f/${form.slug}`;

  const patchLocalForm = (patch: Partial<SurveyForm>) => {
    setForm((prev) => ({ ...prev, ...patch }));
    setDirty(true);
  };

  const handleSave = async (overridePatch?: Partial<SurveyForm>) => {
    setSaving(true);
    try {
      const payload = {
        ...form,
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
        questions: payload.questions,
      });
      setForm(updated);
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

  const updateQuestion = (qid: string, patch: Partial<Question>) => {
    const nextQuestions = form.questions.map((q) => {
      if (q.id !== qid) return q;
      const merged = { ...q, ...patch };
      if (patch.type && needsChoiceOptions(patch.type) && merged.options.length === 0) {
        merged.options = ['Tùy chọn 1', 'Tùy chọn 2', 'Tùy chọn 3'];
      }
      if (patch.type === 'rating' && !merged.max_rating) {
        merged.max_rating = 5;
      }
      return merged;
    });
    patchLocalForm({ questions: nextQuestions });
  };

  const addQuestion = (presetType: QuestionType = 'single_choice') => {
    const newQ: Question = {
      id: `q_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 5)}`,
      type: presetType,
      title: 'Câu hỏi chưa có tiêu đề',
      description: '',
      required: false,
      options: needsChoiceOptions(presetType)
        ? ['Lựa chọn 1', 'Lựa chọn 2', 'Lựa chọn 3']
        : [],
      max_rating: presetType === 'rating' ? 5 : undefined,
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
      alert('Biểu mẫu cần có ít nhất 1 câu hỏi.');
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
      className={`min-h-screen pb-20 transition-colors ${
        darkMode
          ? 'bg-zinc-950 text-zinc-100 bg-dot-grid-dark'
          : 'bg-zinc-50/90 text-zinc-900 bg-dot-grid-light'
      }`}
    >
      {/* Top Sticky Studio Bar (Google Forms + ElevenLabs Minimalist Hybrid) */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          darkMode ? 'bg-zinc-950/90 border-zinc-800' : 'bg-white/90 border-zinc-200'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          {/* Left: Back + Brand + Editable Form Name */}
          <div className="flex items-center gap-3 min-w-0">
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

            <div className="hidden md:block shrink-0">
              <BrandLogo darkMode={darkMode} size="sm" onClick={onBackDashboard} />
            </div>

            <div className="h-5 w-px bg-zinc-200 dark:bg-zinc-800 hidden md:block" />

            <div className="min-w-0">
              <input
                type="text"
                value={form.title}
                onChange={(e) => patchLocalForm({ title: e.target.value })}
                className="font-display font-bold text-sm sm:text-base bg-transparent outline-none truncate w-44 sm:w-64 md:w-72 border-b border-transparent focus:border-indigo-500"
                placeholder="Tiêu đề biểu mẫu..."
              />
              <div className="flex items-center gap-2 text-[11px] text-zinc-400">
                <span className="font-mono">{form.access_code}</span>
                <span>•</span>
                <span
                  className={
                    form.is_published ? 'text-emerald-500 font-medium' : 'text-amber-500'
                  }
                >
                  {form.is_published ? 'Đang Public' : 'Bản nháp'}
                </span>
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
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onToggleDarkMode}
              title="Đổi giao diện Sáng / Tối"
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
              title="Xem trước giao diện người điền"
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-200'
                  : 'border-zinc-200 hover:bg-zinc-100 text-zinc-800'
              }`}
            >
              <Eye className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">Xem thử</span>
            </button>

            <button
              onClick={() => handleSave()}
              disabled={saving}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                dirty
                  ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300'
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
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs transition-all cursor-pointer"
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Public &amp; Lấy Link</span>
            </button>
          </div>
        </div>

        {/* Center Tabs Row (Questions | Responses | Settings) */}
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between gap-4 border-t border-zinc-200/60 dark:border-zinc-800/60">
          <div className="flex items-center gap-1">
            {[
              { id: 'questions', label: `Câu hỏi (${form.questions.length})` },
              { id: 'responses', label: `Câu trả lời (${form.response_count})` },
              { id: 'settings', label: 'Cài đặt & Link' },
            ].map((t) => {
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as typeof activeTab)}
                  className={`px-4 py-2.5 text-xs font-semibold border-b-2 transition-colors cursor-pointer ${
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

          {/* Theme Color Picker */}
          <div className="hidden sm:flex items-center gap-1.5 py-1.5">
            <Palette className="w-3.5 h-3.5 text-zinc-400 mr-1" />
            {THEME_OPTIONS.map((th) => (
              <button
                key={th.id}
                type="button"
                title={`Màu chủ đề: ${th.label}`}
                onClick={() => patchLocalForm({ theme_color: th.id })}
                className={`w-5 h-5 rounded-full ${th.dot} transition-transform cursor-pointer ${
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
          <div className="max-w-4xl mx-auto px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-2 min-w-0">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse shrink-0" />
              <span className="font-semibold shrink-0">Link Public đang mở:</span>
              <a
                href={publicLink}
                target="_blank"
                rel="noreferrer"
                className="font-mono underline truncate hover:opacity-80"
              >
                {publicLink}
              </a>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => navigator.clipboard.writeText(publicLink)}
                className="px-2.5 py-1 rounded-lg font-semibold bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer text-[11px]"
              >
                Sao chép Link
              </button>
              <a
                href={publicLink}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold border border-emerald-500/40 hover:bg-emerald-500/10 text-[11px]"
              >
                Mở tab mới <ExternalLink className="w-3 h-3" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* TAB CONTENT */}
      <main className="max-w-4xl mx-auto px-4 pt-7">
        {activeTab === 'questions' && (
          <div className="max-w-3xl mx-auto space-y-5">
            {/* Form Header Card */}
            <div
              className={`rounded-3xl border overflow-hidden shadow-xs ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`h-3.5 bg-gradient-to-r ${currentTheme.banner}`} />
              <div className="p-6 sm:p-8 space-y-4">
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => patchLocalForm({ title: e.target.value })}
                  placeholder="Nhập tiêu đề khảo sát..."
                  className="w-full font-display text-2xl sm:text-3xl font-extrabold bg-transparent outline-none border-b border-transparent focus:border-zinc-300 dark:focus:border-zinc-700 pb-1"
                />
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => patchLocalForm({ description: e.target.value })}
                  placeholder="Mô tả biểu mẫu / hướng dẫn dành cho người điền..."
                  className={`w-full text-sm bg-transparent outline-none resize-y border-b border-transparent focus:border-zinc-300 dark:focus:border-zinc-700 ${
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
                  className={`rounded-3xl border transition-all p-6 ${
                    isSelected
                      ? darkMode
                        ? 'bg-zinc-900 border-indigo-500/70 ring-2 ring-indigo-500/20'
                        : 'bg-white border-indigo-500 shadow-md ring-2 ring-indigo-500/10'
                      : darkMode
                        ? 'bg-zinc-900/85 border-zinc-800 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-2xs'
                  }`}
                >
                  {/* Question Title + Type Selector */}
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 mb-3">
                    <div className="sm:col-span-8">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold px-2 py-0.5 rounded-lg bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                          Câu {idx + 1}
                        </span>
                        <input
                          type="text"
                          value={q.title}
                          onChange={(e) => updateQuestion(q.id, { title: e.target.value })}
                          placeholder="Nhập nội dung câu hỏi..."
                          className={`flex-1 font-semibold text-base px-3 py-2 rounded-xl border outline-none ${
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

                  {/* Optional Hint / Subtitle */}
                  <input
                    type="text"
                    value={q.description}
                    onChange={(e) => updateQuestion(q.id, { description: e.target.value })}
                    placeholder="Ghi chú phụ / gợi ý cho câu hỏi này (tùy chọn)..."
                    className={`w-full text-xs px-3 py-1.5 rounded-lg mb-4 bg-transparent border-b outline-none ${
                      darkMode
                        ? 'border-zinc-800 text-zinc-400 focus:border-zinc-600'
                        : 'border-zinc-100 text-zinc-500 focus:border-zinc-300'
                    }`}
                  />

                  {/* Question Body Preview / Option Builder */}
                  {needsChoiceOptions(q.type) && (
                    <div className="space-y-2 mb-4">
                      {q.options.map((opt, optIdx) => (
                        <div key={`${q.id}-opt-${optIdx}`} className="flex items-center gap-2.5">
                          {q.type === 'single_choice' && (
                            <span className="w-4 h-4 rounded-full border border-zinc-400 shrink-0" />
                          )}
                          {q.type === 'multiple_choice' && (
                            <span className="w-4 h-4 rounded-sm border border-zinc-400 shrink-0" />
                          )}
                          {q.type === 'dropdown' && (
                            <span className="text-xs font-mono text-zinc-400 w-5 shrink-0">
                              {optIdx + 1}.
                            </span>
                          )}

                          <input
                            type="text"
                            value={opt}
                            onChange={(e) => {
                              const nextOpts = [...q.options];
                              nextOpts[optIdx] = e.target.value;
                              updateQuestion(q.id, { options: nextOpts });
                            }}
                            className={`flex-1 px-3 py-1.5 rounded-xl text-sm border outline-none ${
                              darkMode
                                ? 'bg-zinc-950/70 border-zinc-800 text-zinc-200 focus:border-zinc-600'
                                : 'bg-zinc-50/60 border-zinc-200 text-zinc-800 focus:bg-white focus:border-zinc-400'
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
                              title="Xóa tùy chọn"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          )}
                        </div>
                      ))}

                      <button
                        type="button"
                        onClick={() =>
                          updateQuestion(q.id, {
                            options: [...q.options, `Tùy chọn ${q.options.length + 1}`],
                          })
                        }
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline pt-1 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Thêm tùy chọn
                      </button>
                    </div>
                  )}

                  {q.type === 'rating' && (
                    <div className="flex items-center gap-4 mb-4 py-2">
                      <div className="flex items-center gap-1.5">
                        {Array.from({ length: q.max_rating || 5 }, (_, i) => (
                          <Star
                            key={i}
                            className="w-6 h-6 text-amber-400 fill-amber-400/30"
                          />
                        ))}
                      </div>
                      <select
                        value={q.max_rating || 5}
                        onChange={(e) =>
                          updateQuestion(q.id, { max_rating: Number(e.target.value) })
                        }
                        className={`px-3 py-1.5 rounded-xl text-xs font-semibold border ${
                          darkMode
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-300'
                            : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        <option value={5}>Thang 5 Sao</option>
                        <option value={10}>Thang 10 Điểm</option>
                      </select>
                    </div>
                  )}

                  {(q.type === 'short_text' ||
                    q.type === 'long_text' ||
                    q.type === 'email' ||
                    q.type === 'date') && (
                    <div
                      className={`px-4 py-2.5 rounded-xl border border-dashed text-xs text-zinc-400 mb-4 ${
                        darkMode ? 'border-zinc-800' : 'border-zinc-200'
                      }`}
                    >
                      {q.type === 'short_text' && 'Ô nhập câu trả lời ngắn (1 dòng)...'}
                      {q.type === 'long_text' && 'Ô nhập đoạn văn chi tiết (nhiều dòng)...'}
                      {q.type === 'email' && 'Ô nhập địa chỉ Email (name@domain.com)...'}
                      {q.type === 'date' && 'Bộ chọn Ngày / Tháng / Năm...'}
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
                        title="Đưa lên trên"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowUp className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveQuestion(idx, 1)}
                        disabled={idx === form.questions.length - 1}
                        title="Đưa xuống dưới"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white disabled:opacity-30 cursor-pointer"
                      >
                        <ArrowDown className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => duplicateQuestion(idx)}
                        title="Nhân bản câu hỏi"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      >
                        <Copy className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => removeQuestion(q.id)}
                        title="Xóa câu hỏi"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <label className="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
                      <span>Bắt buộc trả lời</span>
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
              className={`p-4 rounded-3xl border flex flex-wrap items-center justify-center gap-2 ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
              }`}
            >
              <button
                type="button"
                onClick={() => addQuestion('single_choice')}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 hover:opacity-90 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Thêm câu hỏi trắc nghiệm
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
                + Tự luận ngắn
              </button>
              <button
                type="button"
                onClick={() => addQuestion('rating')}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-2xl text-xs font-semibold border cursor-pointer ${
                  darkMode
                    ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-200'
                    : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                }`}
              >
                <Star className="w-3.5 h-3.5 text-amber-500" />
                + Đánh giá Sao
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
                + Hộp kiểm
              </button>
            </div>
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
            <div
              className={`p-6 sm:p-8 rounded-3xl border space-y-6 ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Settings className="w-5 h-5 text-indigo-500" />
                <h2 className="font-display text-lg font-bold">
                  Cấu hình Biểu mẫu &amp; Quyền truy cập Public
                </h2>
              </div>

              {[
                {
                  key: 'is_published' as const,
                  title: 'Xuất bản Public trên Web',
                  desc: 'Cho phép bất kỳ ai có đường link /f/' + form.slug + ' hoặc mã ' + form.access_code + ' truy cập điền đơn.',
                  value: form.is_published,
                },
                {
                  key: 'accepting_responses' as const,
                  title: 'Đang mở nhận câu trả lời',
                  desc: 'Tắt mục này khi khảo sát đã hết hạn hoặc đủ số lượng người đăng ký.',
                  value: form.accepting_responses,
                },
                {
                  key: 'collect_email' as const,
                  title: 'Bắt buộc người điền nhập địa chỉ Email',
                  desc: 'Thu thập email xác thực của người tham gia trước khi gửi biểu mẫu.',
                  value: form.collect_email,
                },
                {
                  key: 'allow_public_summary' as const,
                  title: 'Cho phép người điền xem biểu đồ tổng hợp sau khi nộp',
                  desc: 'Giống tùy chọn "Xem biểu đồ tóm tắt" trên Google Forms.',
                  value: form.allow_public_summary,
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

              <div>
                <label className="block text-xs font-semibold mb-2">
                  Lời cảm ơn hiển thị sau khi người dùng gửi đơn
                </label>
                <textarea
                  rows={3}
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
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-full text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  Lưu cài đặt biểu mẫu
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
