import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  CheckCircle2,
  Loader2,
  Moon,
  RotateCcw,
  Send,
  Star,
  Sun,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchPublicSummary, fetchPublicSurvey, submitPublicSurvey } from '../api';
import type { FormAnalytics, SurveyForm } from '../types';
import { BrandLogo } from './BrandLogo';

interface PublicSurveyViewProps {
  identifier: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onBackHome: () => void;
}

const THEME_ACCENTS: Record<
  string,
  { banner: string; ring: string; btn: string; bar: string; text: string }
> = {
  indigo: {
    banner: 'from-indigo-500 via-indigo-600 to-violet-600',
    ring: 'focus:border-indigo-500',
    btn: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    bar: 'bg-indigo-600',
    text: 'text-indigo-600 dark:text-indigo-400',
  },
  emerald: {
    banner: 'from-emerald-500 via-teal-500 to-cyan-600',
    ring: 'focus:border-emerald-500',
    btn: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    bar: 'bg-emerald-500',
    text: 'text-emerald-600 dark:text-emerald-400',
  },
  violet: {
    banner: 'from-violet-500 via-purple-600 to-fuchsia-600',
    ring: 'focus:border-violet-500',
    btn: 'bg-violet-600 hover:bg-violet-700 text-white',
    bar: 'bg-violet-600',
    text: 'text-violet-600 dark:text-violet-400',
  },
  rose: {
    banner: 'from-rose-500 via-pink-600 to-orange-500',
    ring: 'focus:border-rose-500',
    btn: 'bg-rose-600 hover:bg-rose-700 text-white',
    bar: 'bg-rose-500',
    text: 'text-rose-600 dark:text-rose-400',
  },
  amber: {
    banner: 'from-amber-400 via-orange-500 to-red-500',
    ring: 'focus:border-amber-500',
    btn: 'bg-amber-600 hover:bg-amber-700 text-white',
    bar: 'bg-amber-500',
    text: 'text-amber-600 dark:text-amber-400',
  },
  zinc: {
    banner: 'from-zinc-800 via-zinc-900 to-black',
    ring: 'focus:border-zinc-900 dark:focus:border-white',
    btn: 'bg-zinc-950 hover:bg-zinc-800 text-white dark:bg-white dark:text-zinc-950',
    bar: 'bg-zinc-900 dark:bg-white',
    text: 'text-zinc-900 dark:text-zinc-100',
  },
};

export function PublicSurveyView({
  identifier,
  darkMode,
  onToggleDarkMode,
  onBackHome,
}: PublicSurveyViewProps) {
  const [form, setForm] = useState<SurveyForm | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [respondentName, setRespondentName] = useState('');
  const [respondentEmail, setRespondentEmail] = useState('');
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [submittedMessage, setSubmittedMessage] = useState<string | null>(null);
  const [canViewSummary, setCanViewSummary] = useState(false);
  const [publicSummary, setPublicSummary] = useState<FormAnalytics | null>(null);
  const [showingSummary, setShowingSummary] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPublicSurvey(identifier)
      .then((f) => setForm(f))
      .catch((err) => setError(err instanceof Error ? err.message : 'Không thể tải khảo sát'))
      .finally(() => setLoading(false));
  }, [identifier]);

  const theme = THEME_ACCENTS[form?.theme_color || 'indigo'] || THEME_ACCENTS.indigo;

  const answeredCount = form
    ? form.questions.filter((q) => {
        const v = answers[q.id];
        return (
          v !== undefined &&
          v !== null &&
          v !== '' &&
          !(Array.isArray(v) && v.length === 0)
        );
      }).length
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form || submitting) return;
    setSubmitError(null);

    try {
      setSubmitting(true);
      const res = await submitPublicSurvey(form.slug, {
        respondent_name: respondentName,
        respondent_email: respondentEmail,
        answers,
      });
      setSubmittedMessage(res.thank_you_message);
      setCanViewSummary(res.allow_public_summary);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Không thể gửi câu trả lời');
    } finally {
      setSubmitting(false);
    }
  };

  const handleLoadPublicSummary = async () => {
    if (!form) return;
    const stats = await fetchPublicSummary(form.slug);
    setPublicSummary(stats);
    setShowingSummary(true);
  };

  return (
    <div
      className={`min-h-screen transition-colors pb-16 ${
        darkMode
          ? 'bg-zinc-950 text-zinc-100 bg-dot-grid-dark'
          : 'bg-zinc-50/90 text-zinc-900 bg-dot-grid-light'
      }`}
    >
      {/* Top Minimal Header */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          darkMode ? 'bg-zinc-950/85 border-zinc-800' : 'bg-white/85 border-zinc-200'
        }`}
      >
        <div className="max-w-3xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <button
              onClick={onBackHome}
              className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                  : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
              }`}
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              Trang chủ
            </button>
            <BrandLogo darkMode={darkMode} size="sm" onClick={onBackHome} />
          </div>

          <div className="flex items-center gap-3">
            {form && !submittedMessage && (
              <span className="text-xs font-mono font-semibold text-zinc-500">
                {answeredCount}/{form.questions.length} câu ({progressPct}%)
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
        {form && !submittedMessage && (
          <div className={`h-1 w-full ${darkMode ? 'bg-zinc-900' : 'bg-zinc-100'}`}>
            <div
              className={`h-full transition-all duration-300 ${theme.bar}`}
              style={{ width: `${progressPct}%` }}
            />
          </div>
        )}
      </header>

      <div className="max-w-2xl mx-auto px-4 pt-8">
        {loading ? (
          <div className="py-24 flex flex-col items-center justify-center gap-3">
            <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
            <p className="text-sm text-zinc-500">Đang tải biểu mẫu khảo sát...</p>
          </div>
        ) : error || !form ? (
          <div
            className={`p-10 rounded-3xl border text-center ${
              darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-xs'
            }`}
          >
            <AlertCircle className="w-10 h-10 text-rose-500 mx-auto mb-3" />
            <h2 className="font-display text-xl font-bold">Không thể mở biểu mẫu</h2>
            <p className="text-sm text-zinc-500 mt-2">{error}</p>
            <button
              onClick={onBackHome}
              className="mt-6 px-5 py-2.5 rounded-full text-xs font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
            >
              Quay về KromaForms Home
            </button>
          </div>
        ) : submittedMessage ? (
          /* THANK YOU SCREEN + OPTIONAL LIVE SUMMARY */
          <div className="space-y-6">
            <div
              className={`rounded-3xl border overflow-hidden shadow-lg ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`h-3 bg-gradient-to-r ${theme.banner}`} />
              <div className="p-8 text-center">
                <div className="w-14 h-14 rounded-2xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center mx-auto mb-4">
                  <CheckCircle2 className="w-8 h-8" />
                </div>
                <h2 className="font-display text-2xl font-bold">{form.title}</h2>
                <p
                  className={`text-sm mt-2 max-w-md mx-auto leading-relaxed ${
                    darkMode ? 'text-zinc-300' : 'text-zinc-600'
                  }`}
                >
                  {submittedMessage}
                </p>

                <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
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

                  {canViewSummary && !showingSummary && (
                    <button
                      onClick={handleLoadPublicSummary}
                      className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs font-semibold cursor-pointer ${theme.btn}`}
                    >
                      <BarChart3 className="w-3.5 h-3.5" />
                      Xem kết quả thống kê ({form.response_count + 1})
                    </button>
                  )}
                </div>
              </div>
            </div>

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
                    {qs.average_rating !== undefined && (
                      <div className="text-2xl font-display font-extrabold text-amber-500 mb-3">
                        {qs.average_rating} / {qs.max_rating || 5} ★
                      </div>
                    )}
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
          /* SURVEY FORM RESPONDENT BODY */
          <form onSubmit={handleSubmit} className="space-y-5">
            {/* Header Card (like Google Forms Top Card) */}
            <div
              className={`rounded-3xl border overflow-hidden shadow-xs ${
                darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <div className={`h-3.5 bg-gradient-to-r ${theme.banner}`} />
              <div className="p-6 sm:p-8">
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-[11px] font-mono font-semibold px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                    Mã: {form.access_code}
                  </span>
                  <span className="text-xs text-zinc-400">
                    * Biểu thị câu hỏi bắt buộc
                  </span>
                </div>
                <h1 className="font-display text-2xl sm:text-3xl font-extrabold leading-tight">
                  {form.title}
                </h1>
                {form.description && (
                  <p
                    className={`mt-3 text-sm leading-relaxed whitespace-pre-line ${
                      darkMode ? 'text-zinc-400' : 'text-zinc-600'
                    }`}
                  >
                    {form.description}
                  </p>
                )}
              </div>
            </div>

            {/* Respondent Identity Card (if collect_email or optional name) */}
            <div
              className={`p-6 rounded-3xl border grid grid-cols-1 sm:grid-cols-2 gap-4 ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Họ tên của bạn (Tùy chọn)
                </label>
                <input
                  type="text"
                  value={respondentName}
                  onChange={(e) => setRespondentName(e.target.value)}
                  placeholder="Nhập tên hoặc để trống ẩn danh"
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-colors ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                      : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                  } ${theme.ring}`}
                />
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
                  className={`w-full px-3.5 py-2.5 rounded-xl text-sm border outline-none transition-colors ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                      : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                  } ${theme.ring}`}
                />
              </div>
            </div>

            {/* Questions List */}
            {form.questions.map((q, idx) => (
              <div
                key={q.id}
                className={`p-6 rounded-3xl border transition-colors ${
                  darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
                }`}
              >
                <div className="mb-4">
                  <div className="text-base font-semibold leading-snug">
                    <span className="text-zinc-400 font-mono text-sm mr-2">
                      {idx + 1}.
                    </span>
                    {q.title}
                    {q.required && <span className="text-rose-500 ml-1">*</span>}
                  </div>
                  {q.description && (
                    <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      {q.description}
                    </p>
                  )}
                </div>

                {/* SHORT TEXT */}
                {q.type === 'short_text' && (
                  <input
                    type="text"
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Câu trả lời của bạn..."
                    className={`w-full px-4 py-2.5 rounded-xl text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                    } ${theme.ring}`}
                  />
                )}

                {/* EMAIL */}
                {q.type === 'email' && (
                  <input
                    type="email"
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="name@example.com"
                    className={`w-full px-4 py-2.5 rounded-xl text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                    } ${theme.ring}`}
                  />
                )}

                {/* DATE */}
                {q.type === 'date' && (
                  <input
                    type="date"
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    className={`px-4 py-2.5 rounded-xl text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900'
                    }`}
                  />
                )}

                {/* LONG TEXT */}
                {q.type === 'long_text' && (
                  <textarea
                    rows={4}
                    value={(answers[q.id] as string) || ''}
                    onChange={(e) => setAnswers({ ...answers, [q.id]: e.target.value })}
                    placeholder="Nhập chi tiết ý kiến của bạn..."
                    className={`w-full p-4 rounded-2xl text-sm border outline-none resize-y ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:bg-white'
                    } ${theme.ring}`}
                  />
                )}

                {/* SINGLE CHOICE (RADIO) */}
                {q.type === 'single_choice' && (
                  <div className="space-y-2.5">
                    {q.options.map((opt) => {
                      const checked = answers[q.id] === opt;
                      return (
                        <label
                          key={opt}
                          onClick={() => setAnswers({ ...answers, [q.id]: opt })}
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            checked
                              ? darkMode
                                ? 'border-white bg-zinc-800/80'
                                : 'border-zinc-900 bg-zinc-50 shadow-2xs'
                              : darkMode
                                ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                          }`}
                        >
                          <span
                            className={`w-4.5 h-4.5 rounded-full border flex items-center justify-center shrink-0 ${
                              checked
                                ? darkMode
                                  ? 'border-white'
                                  : 'border-zinc-950'
                                : 'border-zinc-400'
                            }`}
                          >
                            {checked && (
                              <span
                                className={`w-2.5 h-2.5 rounded-full ${
                                  darkMode ? 'bg-white' : 'bg-zinc-950'
                                }`}
                              />
                            )}
                          </span>
                          <span className="text-sm">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* MULTIPLE CHOICE (CHECKBOXES) */}
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
                          className={`flex items-center gap-3 p-3.5 rounded-2xl border cursor-pointer transition-all ${
                            checked
                              ? darkMode
                                ? 'border-white bg-zinc-800/80'
                                : 'border-zinc-900 bg-zinc-50 shadow-2xs'
                              : darkMode
                                ? 'border-zinc-800 hover:border-zinc-700 bg-zinc-950/50'
                                : 'border-zinc-200 hover:border-zinc-300 bg-white'
                          }`}
                        >
                          <span
                            className={`w-4.5 h-4.5 rounded-md border flex items-center justify-center shrink-0 text-[11px] font-bold ${
                              checked
                                ? darkMode
                                  ? 'bg-white border-white text-zinc-950'
                                  : 'bg-zinc-950 border-zinc-950 text-white'
                                : 'border-zinc-400'
                            }`}
                          >
                            {checked && '✓'}
                          </span>
                          <span className="text-sm">{opt}</span>
                        </label>
                      );
                    })}
                  </div>
                )}

                {/* DROPDOWN */}
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
                    <option value="">— Chọn một mục —</option>
                    {q.options.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                  </select>
                )}

                {/* STAR RATING */}
                {q.type === 'rating' && (
                  <div className="flex items-center gap-2 pt-1">
                    {Array.from({ length: q.max_rating || 5 }, (_, i) => i + 1).map((val) => {
                      const active = Number(answers[q.id] || 0) >= val;
                      return (
                        <button
                          key={val}
                          type="button"
                          onClick={() => setAnswers({ ...answers, [q.id]: val })}
                          className={`w-12 h-12 rounded-2xl border flex flex-col items-center justify-center gap-0.5 transition-all cursor-pointer ${
                            active
                              ? 'border-amber-400 bg-amber-400/15 text-amber-500 scale-105'
                              : darkMode
                                ? 'border-zinc-800 bg-zinc-950 text-zinc-500 hover:border-zinc-700'
                                : 'border-zinc-200 bg-zinc-50 text-zinc-400 hover:border-zinc-300'
                          }`}
                        >
                          <Star className={`w-5 h-5 ${active ? 'fill-amber-400' : ''}`} />
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

            <div className="flex items-center justify-between pt-2">
              <button
                type="button"
                onClick={() => setAnswers({})}
                className="text-xs font-semibold text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200 cursor-pointer"
              >
                Xóa hết câu trả lời
              </button>

              <button
                type="submit"
                disabled={submitting}
                className={`inline-flex items-center gap-2 px-7 py-3.5 rounded-full text-sm font-semibold shadow-md transition-all cursor-pointer disabled:opacity-50 ${theme.btn}`}
              >
                {submitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Đang gửi...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Gửi khảo sát
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

