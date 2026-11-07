import {
  BarChart3,
  Calendar,
  Download,
  Eye,
  FileSpreadsheet,
  Inbox,
  Loader2,
  Percent,
  RefreshCw,
  Star,
  Table2,
  Trash2,
  UserCheck,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { deleteResponseItem, fetchFormAnalytics, getCsvExportUrl } from '../api';
import type { FormAnalytics, SurveyForm } from '../types';

interface ResponsesAnalyticsViewProps {
  form: SurveyForm;
  darkMode: boolean;
  onResponseCountChange?: (count: number) => void;
}

const BAR_COLORS: Record<string, string> = {
  indigo: 'bg-indigo-600',
  emerald: 'bg-emerald-500',
  violet: 'bg-violet-600',
  rose: 'bg-rose-500',
  amber: 'bg-amber-500',
  zinc: 'bg-zinc-900 dark:bg-white',
};

export function ResponsesAnalyticsView({
  form,
  darkMode,
  onResponseCountChange,
}: ResponsesAnalyticsViewProps) {
  const [analytics, setAnalytics] = useState<FormAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [subTab, setSubTab] = useState<'summary' | 'table' | 'individual'>('summary');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const loadAnalytics = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchFormAnalytics(form.id);
      setAnalytics(data);
      onResponseCountChange?.(data.total_responses);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thể tải thống kê');
    } finally {
      setLoading(false);
    }
  }, [form.id, onResponseCountChange]);

  useEffect(() => {
    loadAnalytics();
  }, [loadAnalytics]);

  const handleDeleteResponse = async (responseId: string) => {
    if (!window.confirm('Xóa phản hồi này khỏi cơ sở dữ liệu?')) return;
    setDeletingId(responseId);
    try {
      await deleteResponseItem(form.id, responseId);
      await loadAnalytics();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể xóa phản hồi');
    } finally {
      setDeletingId(null);
    }
  };

  const barColor = BAR_COLORS[form.theme_color] || BAR_COLORS.indigo;

  const formatAnswerValue = (val: unknown): string => {
    if (val === undefined || val === null || val === '') return '—';
    if (Array.isArray(val)) return val.join(', ');
    return String(val);
  };

  if (loading) {
    return (
      <div className="py-20 flex flex-col items-center justify-center gap-3">
        <Loader2 className="w-7 h-7 animate-spin text-zinc-400" />
        <p className="text-sm text-zinc-500">Đang tổng hợp dữ liệu phản hồi...</p>
      </div>
    );
  }

  if (error || !analytics) {
    return (
      <div
        className={`p-8 rounded-3xl border text-center ${
          darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
        }`}
      >
        <p className="text-sm text-rose-500 font-medium">{error || 'Lỗi tải dữ liệu'}</p>
        <button
          onClick={loadAnalytics}
          className="mt-4 px-4 py-2 rounded-xl text-xs font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
        >
          Thử lại
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* KPI Overview Row */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div
          className={`p-5 rounded-3xl border ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Tổng câu trả lời</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-display text-3xl font-extrabold">
            {analytics.total_responses}
          </div>
          <div className="mt-1 text-[11px] text-emerald-500 font-medium">
            Lưu trực tiếp SQLite realtime
          </div>
        </div>

        <div
          className={`p-5 rounded-3xl border ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Lượt mở xem Link Public</span>
            <Eye className="w-4 h-4 text-indigo-500" />
          </div>
          <div className="mt-2 font-display text-3xl font-extrabold">
            {analytics.views_count}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            Mã truy cập: <span className="font-mono font-semibold">{form.access_code}</span>
          </div>
        </div>

        <div
          className={`p-5 rounded-3xl border ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Tỷ lệ hoàn thành đơn</span>
            <Percent className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 font-display text-3xl font-extrabold">
            {analytics.completion_rate}%
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {form.accepting_responses ? 'Đang mở nhận câu trả lời' : 'Đã tạm khóa nhận đơn'}
          </div>
        </div>
      </div>

      {/* Sub-navigation + Actions */}
      <div
        className={`p-3 rounded-3xl border flex flex-wrap items-center justify-between gap-3 ${
          darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
        }`}
      >
        <div
          className={`inline-flex p-1 rounded-2xl ${
            darkMode ? 'bg-zinc-950' : 'bg-zinc-100'
          }`}
        >
          {[
            { id: 'summary', label: 'Biểu đồ tổng hợp', icon: BarChart3 },
            { id: 'table', label: 'Bảng dữ liệu', icon: Table2 },
            { id: 'individual', label: 'Từng phản hồi', icon: Inbox },
          ].map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id as typeof subTab)}
                className={`px-3.5 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-all cursor-pointer ${
                  active
                    ? darkMode
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'bg-white text-zinc-950 shadow-xs'
                    : darkMode
                      ? 'text-zinc-400 hover:text-zinc-200'
                      : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={loadAnalytics}
            title="Làm mới dữ liệu"
            className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
              darkMode
                ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </button>

          <a
            href={getCsvExportUrl(form.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white transition-colors shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            Xuất Excel (.CSV)
            <Download className="w-3 h-3 opacity-80" />
          </a>
        </div>
      </div>

      {/* Empty Responses State */}
      {analytics.total_responses === 0 ? (
        <div
          className={`p-14 rounded-3xl border text-center ${
            darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
          }`}
        >
          <Inbox className="w-10 h-10 text-zinc-400 mx-auto mb-3" />
          <h3 className="font-display font-bold text-lg">Chưa có câu trả lời nào</h3>
          <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
            Hãy bấm nút &ldquo;Public &amp; Lấy Link&rdquo; ở góc phải phía trên để gửi đường dẫn khảo sát cho mọi người điền thử.
          </p>
        </div>
      ) : subTab === 'summary' ? (
        /* SUMMARY CHARTS */
        <div className="space-y-4">
          {analytics.question_stats.map((qs, idx) => (
            <div
              key={qs.question_id}
              className={`p-6 rounded-3xl border ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div className="flex items-start justify-between gap-4 mb-4">
                <div>
                  <div className="font-semibold text-base">
                    <span className="text-zinc-400 font-mono text-sm mr-2">{idx + 1}.</span>
                    {qs.title}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {qs.answered_count} câu trả lời
                  </div>
                </div>
              </div>

              {/* Rating summary */}
              {qs.average_rating !== undefined && (
                <div
                  className={`inline-flex items-center gap-3 px-4 py-2.5 rounded-2xl mb-4 border ${
                    darkMode
                      ? 'bg-amber-500/10 border-amber-500/20'
                      : 'bg-amber-50 border-amber-200/70'
                  }`}
                >
                  <Star className="w-6 h-6 text-amber-500 fill-amber-400" />
                  <div>
                    <div className="font-display text-xl font-extrabold text-amber-500">
                      {qs.average_rating} / {qs.max_rating || 5} sao
                    </div>
                    <div className="text-[11px] text-zinc-500">Điểm đánh giá trung bình</div>
                  </div>
                </div>
              )}

              {/* Distribution bars */}
              {qs.distribution && qs.distribution.length > 0 && (
                <div className="space-y-3">
                  {qs.distribution.map((bar) => (
                    <div key={bar.label}>
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="font-medium">{bar.label}</span>
                        <span className="font-mono text-zinc-500 font-semibold">
                          {bar.count} phản hồi ({bar.percent}%)
                        </span>
                      </div>
                      <div
                        className={`h-2.5 rounded-full overflow-hidden ${
                          darkMode ? 'bg-zinc-800' : 'bg-zinc-100'
                        }`}
                      >
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${barColor}`}
                          style={{ width: `${Math.max(bar.percent, bar.count > 0 ? 3 : 0)}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Open-ended text answers */}
              {qs.text_answers && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {qs.text_answers.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">Chưa có câu trả lời văn bản.</p>
                  ) : (
                    qs.text_answers.map((ans, i) => (
                      <div
                        key={`${qs.question_id}-txt-${i}`}
                        className={`px-3.5 py-2.5 rounded-xl text-xs border ${
                          darkMode
                            ? 'bg-zinc-950 border-zinc-800 text-zinc-200'
                            : 'bg-zinc-50 border-zinc-200/80 text-zinc-800'
                        }`}
                      >
                        {ans}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      ) : subTab === 'table' ? (
        /* SPREADSHEET TABLE VIEW */
        <div
          className={`rounded-3xl border overflow-hidden ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr
                  className={`border-b ${
                    darkMode ? 'bg-zinc-950 border-zinc-800 text-zinc-400' : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                  }`}
                >
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">#</th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Thời gian gửi</th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Người điền</th>
                  {form.questions.map((q, i) => (
                    <th
                      key={q.id}
                      className="py-3.5 px-4 font-semibold min-w-[180px] max-w-[260px] truncate"
                      title={q.title}
                    >
                      {i + 1}. {q.title}
                    </th>
                  ))}
                  <th className="py-3.5 px-4 font-semibold text-right">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {analytics.responses.map((resp, idx) => (
                  <tr
                    key={resp.id}
                    className={
                      darkMode ? 'hover:bg-zinc-800/40' : 'hover:bg-zinc-50/80'
                    }
                  >
                    <td className="py-3 px-4 font-mono text-zinc-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      {new Date(resp.submitted_at).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <div className="font-semibold">
                        {resp.respondent_name || 'Ẩn danh'}
                      </div>
                      {resp.respondent_email && (
                        <div className="text-[11px] text-zinc-400">
                          {resp.respondent_email}
                        </div>
                      )}
                    </td>
                    {form.questions.map((q) => (
                      <td key={q.id} className="py-3 px-4 max-w-[260px] truncate">
                        {formatAnswerValue(resp.answers[q.id])}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteResponse(resp.id)}
                        disabled={deletingId === resp.id}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 transition-colors cursor-pointer"
                        title="Xóa phản hồi"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        /* INDIVIDUAL RESPONSES CARDS */
        <div className="space-y-4">
          {analytics.responses.map((resp, idx) => (
            <div
              key={resp.id}
              className={`p-6 rounded-3xl border ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div
                className={`pb-4 mb-4 border-b flex items-center justify-between gap-3 ${
                  darkMode ? 'border-zinc-800' : 'border-zinc-100'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-500">
                      #{analytics.responses.length - idx}
                    </span>
                    <span className="font-semibold text-sm">
                      {resp.respondent_name || 'Người tham gia ẩn danh'}
                    </span>
                    {resp.respondent_email && (
                      <span className="text-xs text-zinc-400">
                        ({resp.respondent_email})
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1 flex items-center gap-1.5">
                    <Calendar className="w-3 h-3" />
                    {new Date(resp.submitted_at).toLocaleString('vi-VN')}
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteResponse(resp.id)}
                  disabled={deletingId === resp.id}
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                    darkMode
                      ? 'border-zinc-800 hover:border-rose-500/50 text-zinc-400 hover:text-rose-400'
                      : 'border-zinc-200 hover:border-rose-300 text-zinc-500 hover:text-rose-600'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {form.questions.map((q, qIndex) => (
                  <div
                    key={q.id}
                    className={`p-3.5 rounded-2xl border ${
                      darkMode
                        ? 'bg-zinc-950/60 border-zinc-800/80'
                        : 'bg-zinc-50/70 border-zinc-200/70'
                    }`}
                  >
                    <div className="text-[11px] font-medium text-zinc-400 mb-1">
                      Câu {qIndex + 1}: {q.title}
                    </div>
                    <div className="text-sm font-semibold break-words">
                      {formatAnswerValue(resp.answers[q.id])}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
