import {
  Award,
  BarChart3,
  Calendar,
  Check,
  Clock,
  Download,
  Edit3,
  Eye,
  FileSpreadsheet,
  GraduationCap,
  Inbox,
  Loader2,
  Percent,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Star,
  Table2,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  addManualStudentGrade,
  deleteResponseItem,
  fetchFormAnalytics,
  getCsvExportUrl,
  updateStudentGrade,
} from '../api';
import type { FormAnalytics, FormResponseItem, SurveyForm } from '../types';

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
  const [subTab, setSubTab] = useState<'gradebook' | 'summary' | 'table' | 'individual'>(
    form.is_quiz || (form.student_roster?.length ?? 0) > 0 ? 'gradebook' : 'summary'
  );
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // Inline Score Editor state
  const [editingRespId, setEditingRespId] = useState<string | null>(null);
  const [editFinalScore, setEditFinalScore] = useState<string>('');
  const [editTeacherNote, setEditTeacherNote] = useState<string>('');
  const [savingGrade, setSavingGrade] = useState(false);

  // Add Custom Student Score Modal / Drawer
  const [showAddManual, setShowAddManual] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualClass, setManualClass] = useState('');
  const [manualScore, setManualScore] = useState('8.5');
  const [manualNote, setManualNote] = useState('Điểm cộng phát biểu / Chấm bài trực tiếp');
  const [addingManual, setAddingManual] = useState(false);

  // Gradebook filter
  const [gradeFilter, setGradeFilter] = useState<'all' | 'missing' | 'cheated'>('all');

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
    if (!window.confirm('Xóa bài nộp / phản hồi này khỏi bảng dữ liệu?')) return;
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

  const startEditingGrade = (resp: FormResponseItem) => {
    setEditingRespId(resp.id);
    setEditFinalScore(String(resp.final_score ?? resp.auto_score ?? 0));
    setEditTeacherNote(resp.teacher_note || '');
  };

  const handleSaveInlineGrade = async (responseId: string) => {
    setSavingGrade(true);
    try {
      await updateStudentGrade(form.id, responseId, {
        final_score: Number(editFinalScore) || 0,
        teacher_note: editTeacherNote,
      });
      setEditingRespId(null);
      await loadAnalytics();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể lưu điểm');
    } finally {
      setSavingGrade(false);
    }
  };

  const handleCreateManualGrade = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || addingManual) return;
    setAddingManual(true);
    try {
      const maxPts =
        form.questions.reduce((acc, q) => acc + Number(q.points || 0), 0) || 10;
      await addManualStudentGrade(form.id, {
        respondent_name: manualName.trim(),
        student_class: manualClass.trim(),
        final_score: Number(manualScore) || 0,
        max_score: maxPts,
        teacher_note: manualNote.trim(),
      });
      setManualName('');
      setShowAddManual(false);
      await loadAnalytics();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi thêm điểm học sinh');
    } finally {
      setAddingManual(false);
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
        <p className="text-sm text-zinc-500">Đang tổng hợp Bảng điểm &amp; thống kê...</p>
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

  const rosterEntries = analytics.roster_gradebook || [];
  const missingRosterEntries = rosterEntries.filter((r) => !r.submitted);

  return (
    <div className="space-y-5 sm:space-y-6">
      {/* Responsive KPI Cards (2 cols on mobile, 4 cols on desktop) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div
          className={`p-4 sm:p-5 rounded-3xl border ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Đã nộp bài</span>
            <UserCheck className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="mt-2 font-display text-2xl sm:text-3xl font-extrabold">
            {analytics.total_responses}
            {rosterEntries.length > 0 && (
              <span className="text-sm font-normal text-zinc-400">
                /{rosterEntries.length} HS
              </span>
            )}
          </div>
          <div className="mt-1 text-[11px] text-emerald-500 font-medium">
            {missingRosterEntries.length > 0
              ? `Còn ${missingRosterEntries.length} HS chưa nộp`
              : 'Lưu trực tiếp SQLite'}
          </div>
        </div>

        <div
          className={`p-4 sm:p-5 rounded-3xl border ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>{form.is_quiz ? 'Điểm TB lớp (Hệ 10)' : 'Lượt mở xem Link'}</span>
            {form.is_quiz ? (
              <Award className="w-4 h-4 text-indigo-500" />
            ) : (
              <Eye className="w-4 h-4 text-indigo-500" />
            )}
          </div>
          <div className="mt-2 font-display text-2xl sm:text-3xl font-extrabold">
            {form.is_quiz
              ? analytics.average_score_10 !== null && analytics.average_score_10 !== undefined
                ? `${analytics.average_score_10}đ`
                : '—'
              : analytics.views_count}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {form.is_quiz && analytics.highest_score_10 !== null
              ? `Cao nhất: ${analytics.highest_score_10}/10`
              : `Mã: ${form.access_code}`}
          </div>
        </div>

        <div
          className={`p-4 sm:p-5 rounded-3xl border ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Cảnh báo thoát App</span>
            <ShieldAlert className="w-4 h-4 text-rose-500" />
          </div>
          <div
            className={`mt-2 font-display text-2xl sm:text-3xl font-extrabold ${
              (analytics.flagged_cheat_count || 0) > 0 ? 'text-rose-500' : 'text-emerald-500'
            }`}
          >
            {analytics.flagged_cheat_count || 0}
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {form.anti_cheat_enabled ? 'Chống gian lận đang BẬT' : 'Chống gian lận đang TẮT'}
          </div>
        </div>

        <div
          className={`p-4 sm:p-5 rounded-3xl border ${
            darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-zinc-500 font-medium">
            <span>Tỷ lệ hoàn thành</span>
            <Percent className="w-4 h-4 text-amber-500" />
          </div>
          <div className="mt-2 font-display text-2xl sm:text-3xl font-extrabold">
            {analytics.completion_rate}%
          </div>
          <div className="mt-1 text-[11px] text-zinc-400">
            {analytics.views_count} lượt mở đề
          </div>
        </div>
      </div>

      {/* Scrollable Sub-navigation + CSV Export */}
      <div
        className={`p-3 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
          darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
        }`}
      >
        <div
          className={`flex items-center gap-1 p-1 rounded-2xl overflow-x-auto ${
            darkMode ? 'bg-zinc-950' : 'bg-zinc-100'
          }`}
        >
          {[
            { id: 'gradebook', label: 'Bảng điểm & DS Tên', icon: GraduationCap },
            { id: 'summary', label: 'Biểu đồ câu hỏi', icon: BarChart3 },
            { id: 'table', label: 'Bảng tổng hợp', icon: Table2 },
            { id: 'individual', label: 'Chi tiết bài làm', icon: Inbox },
          ].map((t) => {
            const Icon = t.icon;
            const active = subTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setSubTab(t.id as typeof subTab)}
                className={`px-3 py-2 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 whitespace-nowrap transition-all cursor-pointer ${
                  active
                    ? darkMode
                      ? 'bg-zinc-800 text-white shadow-xs'
                      : 'bg-white text-zinc-950 shadow-xs'
                    : darkMode
                      ? 'text-zinc-400 hover:text-zinc-200'
                      : 'text-zinc-600 hover:text-zinc-950'
                }`}
              >
                <Icon className="w-3.5 h-3.5 shrink-0" />
                {t.label}
              </button>
            );
          })}
        </div>

        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => setShowAddManual((v) => !v)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Chấm điểm riêng theo tên</span>
          </button>

          <button
            onClick={loadAnalytics}
            title="Làm mới"
            className={`p-2 rounded-xl border cursor-pointer ${
              darkMode
                ? 'border-zinc-800 hover:bg-zinc-800 text-zinc-300'
                : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <a
            href={getCsvExportUrl(form.id)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-2xs"
          >
            <FileSpreadsheet className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">Xuất Bảng điểm</span> .CSV
            <Download className="w-3 h-3 opacity-80" />
          </a>
        </div>
      </div>

      {/* ADD MANUAL / BONUS STUDENT SCORE DRAWER */}
      {showAddManual && (
        <form
          onSubmit={handleCreateManualGrade}
          className={`p-5 rounded-3xl border space-y-4 ${
            darkMode
              ? 'bg-zinc-900 border-indigo-500/50'
              : 'bg-indigo-50/50 border-indigo-200'
          }`}
        >
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-sm flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-indigo-500" />
              Thêm / Vào Điểm Riêng Trực Tiếp Cho Học Sinh Theo Tên
            </h3>
            <button
              type="button"
              onClick={() => setShowAddManual(false)}
              className="text-xs text-zinc-500 hover:underline cursor-pointer"
            >
              Đóng
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-semibold mb-1">
                Chọn từ Danh sách lớp hoặc nhập Họ tên HS *
              </label>
              <input
                list="roster-datalist"
                required
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="VD: Nguyễn Minh Khôi"
                className={`w-full px-3.5 py-2 rounded-xl text-xs border outline-none ${
                  darkMode
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                    : 'bg-white border-zinc-200 text-zinc-900'
                }`}
              />
              <datalist id="roster-datalist">
                {(form.student_roster || []).map((n) => (
                  <option key={n} value={n} />
                ))}
              </datalist>
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Lớp / Mã HS</label>
              <input
                type="text"
                value={manualClass}
                onChange={(e) => setManualClass(e.target.value)}
                placeholder="VD: 10A1"
                className={`w-full px-3.5 py-2 rounded-xl text-xs border outline-none ${
                  darkMode
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                    : 'bg-white border-zinc-200 text-zinc-900'
                }`}
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold mb-1">Điểm số *</label>
              <input
                type="number"
                step="0.25"
                min="0"
                max="100"
                required
                value={manualScore}
                onChange={(e) => setManualScore(e.target.value)}
                className={`w-full px-3.5 py-2 rounded-xl text-xs font-mono font-bold border outline-none ${
                  darkMode
                    ? 'bg-zinc-950 border-zinc-800 text-emerald-400'
                    : 'bg-white border-zinc-200 text-emerald-700'
                }`}
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <input
              type="text"
              value={manualNote}
              onChange={(e) => setManualNote(e.target.value)}
              placeholder="Ghi chú riêng (VD: Điểm thưởng phát biểu / Chấm vở / Kiểm tra bù...)"
              className={`flex-1 px-3.5 py-2 rounded-xl text-xs border outline-none ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-800 text-zinc-200'
                  : 'bg-white border-zinc-200 text-zinc-800'
              }`}
            />
            <button
              type="submit"
              disabled={addingManual}
              className="inline-flex items-center justify-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              Lưu vào Bảng điểm
            </button>
          </div>
        </form>
      )}

      {/* ==================== TAB 1: STUDENT GRADEBOOK & CLASS ROSTER ==================== */}
      {subTab === 'gradebook' && (
        <div className="space-y-4">
          {/* Filter Pills */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              {[
                { id: 'all', label: `Tất cả bài nộp (${analytics.responses.length})` },
                ...(rosterEntries.length > 0
                  ? [
                      {
                        id: 'missing',
                        label: `Chưa nộp bài (${missingRosterEntries.length})`,
                      },
                    ]
                  : []),
                {
                  id: 'cheated',
                  label: `Thoát App / Vi phạm (${analytics.flagged_cheat_count || 0})`,
                },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setGradeFilter(f.id as typeof gradeFilter)}
                  className={`px-3 py-1.5 rounded-full text-xs font-semibold border cursor-pointer ${
                    gradeFilter === f.id
                      ? 'bg-indigo-600 border-indigo-600 text-white'
                      : darkMode
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-400'
                        : 'bg-white border-zinc-200 text-zinc-600'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            {rosterEntries.length === 0 && (
              <span className="text-[11px] text-zinc-500 flex items-center gap-1">
                <Users className="w-3.5 h-3.5" />
                Mẹo: Nhập Danh sách tên lớp trong tab &ldquo;Cài đặt &amp; Giao bài&rdquo; để theo dõi HS chưa nộp!
              </span>
            )}
          </div>

          {/* Missing Students View */}
          {gradeFilter === 'missing' ? (
            missingRosterEntries.length === 0 ? (
              <div
                className={`p-10 rounded-3xl border text-center ${
                  darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <Check className="w-8 h-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm font-bold">
                  Tuyệt vời! 100% học sinh trong danh sách lớp đã nộp bài đầy đủ.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                {missingRosterEntries.map((m, i) => (
                  <div
                    key={m.student_name}
                    className={`p-4 rounded-2xl border flex items-center justify-between gap-2 ${
                      darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
                    }`}
                  >
                    <div>
                      <div className="text-xs text-zinc-400 font-mono">#{i + 1}</div>
                      <div className="font-semibold text-sm">{m.student_name}</div>
                      <span className="text-[11px] text-amber-500 font-semibold">
                        Chưa nộp bài
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setManualName(m.student_name);
                        setManualScore('0');
                        setManualNote('Chưa nộp bài đúng hạn');
                        setShowAddManual(true);
                      }}
                      className="px-2.5 py-1.5 rounded-xl text-[11px] font-semibold border border-zinc-300 dark:border-zinc-700 hover:border-indigo-500 cursor-pointer"
                    >
                      Chấm điểm riêng
                    </button>
                  </div>
                ))}
              </div>
            )
          ) : (
            /* Submitted Students Gradebook Cards/Rows */
            <div className="space-y-3">
              {analytics.responses
                .filter((r) => (gradeFilter === 'cheated' ? (r.cheat_count || 0) > 0 : true))
                .map((resp, idx) => {
                  const maxS = Number(resp.max_score || 10);
                  const finS = Number(resp.final_score ?? resp.auto_score ?? 0);
                  const score10 = maxS > 0 ? Math.round((finS / maxS) * 1000) / 100 : finS;
                  const cheats = resp.cheat_count || 0;
                  const isEditing = editingRespId === resp.id;

                  return (
                    <div
                      key={resp.id}
                      className={`p-4 sm:p-5 rounded-3xl border transition-all ${
                        cheats > 0
                          ? darkMode
                            ? 'bg-rose-950/15 border-rose-800/60'
                            : 'bg-rose-50/40 border-rose-200'
                          : darkMode
                            ? 'bg-zinc-900/90 border-zinc-800'
                            : 'bg-white border-zinc-200 shadow-2xs'
                      }`}
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Student Name & Meta */}
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="px-2 py-0.5 rounded-lg text-[11px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-500">
                              #{idx + 1}
                            </span>
                            <span className="font-display font-bold text-base">
                              {resp.respondent_name || 'Học sinh chưa ghi tên'}
                            </span>
                            {resp.student_class && (
                              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-indigo-500/15 text-indigo-500">
                                {resp.student_class}
                              </span>
                            )}

                            {/* Anti-cheat Badge */}
                            {cheats > 0 ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-500/20 text-rose-500">
                                <ShieldAlert className="w-3 h-3" />
                                {cheats} lần thoát App
                                {resp.auto_submitted_cheat ? ' (Đã tự thu bài)' : ''}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-500">
                                <ShieldCheck className="w-3 h-3" /> Nghiêm túc
                              </span>
                            )}
                          </div>

                          <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400">
                            <span className="inline-flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              {new Date(resp.submitted_at).toLocaleString('vi-VN')}
                            </span>
                            {(resp.duration_seconds || 0) > 0 && (
                              <span className="inline-flex items-center gap-1 font-mono">
                                <Clock className="w-3 h-3" />
                                Làm trong {Math.floor((resp.duration_seconds || 0) / 60)}p
                                {(resp.duration_seconds || 0) % 60}s
                              </span>
                            )}
                            {resp.teacher_note && (
                              <span className="text-indigo-500 font-medium">
                                • Ghi chú GV: {resp.teacher_note}
                              </span>
                            )}
                          </div>

                          {/* Cheat violation log details */}
                          {resp.cheat_logs && resp.cheat_logs.length > 0 && (
                            <div className="pt-1 text-[11px] text-rose-500 space-y-0.5">
                              {resp.cheat_logs.map((lg, li) => (
                                <div key={`${resp.id}-cl-${li}`}>⚠ {lg}</div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Score Pill & Teacher Edit Button */}
                        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-zinc-100 dark:border-zinc-800">
                          <div className="text-left sm:text-right">
                            <div className="font-display text-2xl font-extrabold text-emerald-500">
                              {score10}
                              <span className="text-xs font-normal text-zinc-400"> /10đ</span>
                            </div>
                            <div className="text-[10px] font-mono text-zinc-400">
                              Điểm gốc: {finS}/{maxS}
                            </div>
                          </div>

                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => startEditingGrade(resp)}
                              className={`inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                                darkMode
                                  ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                                  : 'border-zinc-200 hover:bg-zinc-100 text-zinc-800'
                              }`}
                            >
                              <Edit3 className="w-3.5 h-3.5 text-indigo-500" />
                              Sửa điểm riêng
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteResponse(resp.id)}
                              disabled={deletingId === resp.id}
                              className="p-2 rounded-xl text-zinc-400 hover:text-rose-500 cursor-pointer"
                              title="Xóa bài nộp"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      {/* Inline Custom Score Editor */}
                      {isEditing && (
                        <div
                          className={`mt-4 pt-4 border-t grid grid-cols-1 sm:grid-cols-12 gap-3 items-end ${
                            darkMode ? 'border-zinc-800' : 'border-zinc-200'
                          }`}
                        >
                          <div className="sm:col-span-3">
                            <label className="block text-[11px] font-semibold mb-1">
                              Tổng điểm mới (trên {maxS})
                            </label>
                            <input
                              type="number"
                              step="0.25"
                              value={editFinalScore}
                              onChange={(e) => setEditFinalScore(e.target.value)}
                              className={`w-full px-3 py-2 rounded-xl text-xs font-mono font-bold border outline-none ${
                                darkMode
                                  ? 'bg-zinc-950 border-zinc-700 text-emerald-400'
                                  : 'bg-zinc-50 border-zinc-300 text-emerald-700'
                              }`}
                            />
                          </div>

                          <div className="sm:col-span-6">
                            <label className="block text-[11px] font-semibold mb-1">
                              Nhận xét riêng của Giáo viên cho {resp.respondent_name || 'HS'}
                            </label>
                            <input
                              type="text"
                              value={editTeacherNote}
                              onChange={(e) => setEditTeacherNote(e.target.value)}
                              placeholder="VD: Cộng 1đ bài tự luận trình bày tốt..."
                              className={`w-full px-3 py-2 rounded-xl text-xs border outline-none ${
                                darkMode
                                  ? 'bg-zinc-950 border-zinc-700 text-zinc-200'
                                  : 'bg-zinc-50 border-zinc-300 text-zinc-900'
                              }`}
                            />
                          </div>

                          <div className="sm:col-span-3 flex items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setEditingRespId(null)}
                              className="px-3 py-2 rounded-xl text-xs font-semibold text-zinc-500 cursor-pointer"
                            >
                              Hủy
                            </button>
                            <button
                              type="button"
                              disabled={savingGrade}
                              onClick={() => handleSaveInlineGrade(resp.id)}
                              className="px-4 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                            >
                              {savingGrade ? 'Đang lưu...' : 'Lưu điểm'}
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}

              {analytics.responses.length === 0 && (
                <div
                  className={`p-12 rounded-3xl border text-center ${
                    darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
                  }`}
                >
                  <GraduationCap className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
                  <h3 className="font-display font-bold text-base">
                    Chưa có học sinh nào nộp bài
                  </h3>
                  <p className="text-xs text-zinc-500 mt-1 max-w-md mx-auto">
                    Bấm nút &ldquo;Public &amp; Lấy Link&rdquo; gửi cho lớp làm bài, hoặc bấm &ldquo;+ Chấm điểm riêng theo tên&rdquo; để nhập điểm trực tiếp.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ==================== TAB 2: QUESTION CHARTS ==================== */}
      {subTab === 'summary' && (
        <div className="space-y-4">
          {analytics.question_stats.map((qs, idx) => (
            <div
              key={qs.question_id}
              className={`p-5 sm:p-6 rounded-3xl border ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-2 mb-4">
                <div>
                  <div className="font-semibold text-sm sm:text-base">
                    <span className="text-zinc-400 font-mono text-xs sm:text-sm mr-2">
                      Câu {idx + 1}.
                    </span>
                    {qs.title}
                  </div>
                  <div className="text-xs text-zinc-500 mt-0.5">
                    {qs.answered_count} lượt trả lời
                  </div>
                </div>

                {qs.correct_rate !== null && qs.correct_rate !== undefined && (
                  <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500">
                    Tỷ lệ làm đúng: {qs.correct_rate}%
                  </span>
                )}
              </div>

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
                    <div className="text-[11px] text-zinc-500">Trung bình đánh giá</div>
                  </div>
                </div>
              )}

              {qs.distribution && qs.distribution.length > 0 && (
                <div className="space-y-3">
                  {qs.distribution.map((bar) => {
                    const isRightOpt =
                      qs.correct_answer &&
                      (Array.isArray(qs.correct_answer)
                        ? qs.correct_answer.includes(bar.label)
                        : qs.correct_answer === bar.label);
                    return (
                      <div key={bar.label}>
                        <div className="flex items-center justify-between text-xs mb-1.5 gap-2">
                          <span className="font-medium flex items-center gap-1.5">
                            {bar.label}
                            {Boolean(isRightOpt) && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-emerald-500/20 text-emerald-500">
                                ✓ Đáp án đúng
                              </span>
                            )}
                          </span>
                          <span className="font-mono text-zinc-500 font-semibold shrink-0">
                            {bar.count} ({bar.percent}%)
                          </span>
                        </div>
                        <div
                          className={`h-2.5 rounded-full overflow-hidden ${
                            darkMode ? 'bg-zinc-800' : 'bg-zinc-100'
                          }`}
                        >
                          <div
                            className={`h-full rounded-full transition-all duration-500 ${
                              isRightOpt ? 'bg-emerald-500' : barColor
                            }`}
                            style={{ width: `${Math.max(bar.percent, bar.count > 0 ? 3 : 0)}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {qs.text_answers && (
                <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
                  {qs.text_answers.length === 0 ? (
                    <p className="text-xs text-zinc-400 italic">Chưa có câu trả lời.</p>
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
      )}

      {/* ==================== TAB 3: SPREADSHEET TABLE ==================== */}
      {subTab === 'table' && (
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
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800 text-zinc-400'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-600'
                  }`}
                >
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">#</th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Họ và tên</th>
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Lớp</th>
                  {form.is_quiz && (
                    <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Điểm</th>
                  )}
                  <th className="py-3.5 px-4 font-semibold whitespace-nowrap">Thoát App</th>
                  {form.questions.map((q, i) => (
                    <th
                      key={q.id}
                      className="py-3.5 px-4 font-semibold min-w-[160px] max-w-[240px] truncate"
                      title={q.title}
                    >
                      C{i + 1}. {q.title}
                    </th>
                  ))}
                  <th className="py-3.5 px-4 font-semibold text-right">Xóa</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                {analytics.responses.map((resp, idx) => (
                  <tr
                    key={resp.id}
                    className={darkMode ? 'hover:bg-zinc-800/40' : 'hover:bg-zinc-50/80'}
                  >
                    <td className="py-3 px-4 font-mono text-zinc-400">{idx + 1}</td>
                    <td className="py-3 px-4 font-semibold whitespace-nowrap">
                      {resp.respondent_name || 'Ẩn danh'}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      {resp.student_class || '—'}
                    </td>
                    {form.is_quiz && (
                      <td className="py-3 px-4 font-mono font-bold text-emerald-500 whitespace-nowrap">
                        {resp.final_score ?? resp.auto_score ?? 0}/{resp.max_score ?? 10}
                      </td>
                    )}
                    <td className="py-3 px-4 font-mono whitespace-nowrap">
                      {(resp.cheat_count || 0) > 0 ? (
                        <span className="text-rose-500 font-bold">{resp.cheat_count} lần</span>
                      ) : (
                        <span className="text-emerald-500">0</span>
                      )}
                    </td>
                    {form.questions.map((q) => (
                      <td key={q.id} className="py-3 px-4 max-w-[240px] truncate">
                        {formatAnswerValue(resp.answers[q.id])}
                      </td>
                    ))}
                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => handleDeleteResponse(resp.id)}
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer"
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
      )}

      {/* ==================== TAB 4: INDIVIDUAL SUBMISSIONS ==================== */}
      {subTab === 'individual' && (
        <div className="space-y-4">
          {analytics.responses.map((resp, idx) => (
            <div
              key={resp.id}
              className={`p-5 sm:p-6 rounded-3xl border ${
                darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200 shadow-2xs'
              }`}
            >
              <div
                className={`pb-4 mb-4 border-b flex flex-wrap items-center justify-between gap-3 ${
                  darkMode ? 'border-zinc-800' : 'border-zinc-100'
                }`}
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-500">
                      #{analytics.responses.length - idx}
                    </span>
                    <span className="font-semibold text-sm">
                      {resp.respondent_name || 'Ẩn danh'}
                    </span>
                    {resp.student_class && (
                      <span className="text-xs text-zinc-400">({resp.student_class})</span>
                    )}
                    {resp.final_score !== null && resp.final_score !== undefined && (
                      <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-500">
                        Điểm: {resp.final_score}/{resp.max_score || 10}
                      </span>
                    )}
                  </div>
                  <div className="text-[11px] text-zinc-400 mt-1">
                    {new Date(resp.submitted_at).toLocaleString('vi-VN')}
                  </div>
                </div>

                <button
                  onClick={() => handleDeleteResponse(resp.id)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold border border-zinc-200 dark:border-zinc-800 text-zinc-500 hover:text-rose-500 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Xóa
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
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
