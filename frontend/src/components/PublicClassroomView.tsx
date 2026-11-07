import {
  AlertCircle,
  ArrowLeft,
  BookOpen,
  Calendar,
  CheckCircle2,
  Clock,
  GraduationCap,
  Loader2,
  Moon,
  Play,
  Search,
  ShieldAlert,
  Sun,
  UserCheck,
  Users,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import { fetchPublicClassroomPortal } from '../api';
import type { PublicClassroomPortal } from '../types';
import { BrandLogo } from './BrandLogo';

interface PublicClassroomViewProps {
  roomCode: string;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  onBackHome: () => void;
  onOpenAssignment: (slug: string) => void;
}

const BANNER_GRADIENTS: Record<string, string> = {
  indigo: 'from-indigo-600 via-indigo-600 to-violet-600',
  emerald: 'from-emerald-500 via-teal-600 to-cyan-600',
  violet: 'from-violet-600 via-purple-600 to-fuchsia-600',
  rose: 'from-rose-500 via-pink-600 to-orange-500',
  amber: 'from-amber-500 via-orange-500 to-red-500',
  zinc: 'from-zinc-800 via-zinc-900 to-black',
};

export const SAVED_STUDENT_NAME_KEY = 'kromaforms_saved_student_name';
export const SAVED_STUDENT_CLASS_KEY = 'kromaforms_saved_student_class';

export function PublicClassroomView({
  roomCode,
  darkMode,
  onToggleDarkMode,
  onBackHome,
  onOpenAssignment,
}: PublicClassroomViewProps) {
  const [portal, setPortal] = useState<PublicClassroomPortal | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [selectedStudent, setSelectedStudent] = useState<string>(
    () => localStorage.getItem(SAVED_STUDENT_NAME_KEY) || ''
  );
  const [nameQuery, setNameQuery] = useState('');
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    fetchPublicClassroomPortal(roomCode)
      .then((data) => {
        setPortal(data);
        localStorage.setItem(SAVED_STUDENT_CLASS_KEY, data.name);
      })
      .catch((err) =>
        setError(err instanceof Error ? err.message : 'Không tìm thấy phòng lớp học')
      )
      .finally(() => setLoading(false));
  }, [roomCode]);

  const handleChooseStudent = (name: string) => {
    setSelectedStudent(name);
    localStorage.setItem(SAVED_STUDENT_NAME_KEY, name);
    if (portal) {
      localStorage.setItem(SAVED_STUDENT_CLASS_KEY, portal.name);
    }
    setPickerOpen(false);
  };

  if (loading) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center gap-3 px-4 ${
          darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
        }`}
      >
        <Loader2 className="w-8 h-8 animate-spin text-indigo-500" />
        <p className="text-sm font-medium text-zinc-500">Đang mở Cổng Lớp Học...</p>
      </div>
    );
  }

  if (error || !portal) {
    return (
      <div
        className={`min-h-screen flex flex-col items-center justify-center px-4 text-center ${
          darkMode ? 'bg-zinc-950 text-zinc-100' : 'bg-zinc-50 text-zinc-900'
        }`}
      >
        <div
          className={`max-w-md w-full p-7 rounded-3xl border ${
            darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200 shadow-sm'
          }`}
        >
          <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-3" />
          <h2 className="font-display text-lg font-bold mb-1">Không tìm thấy Lớp học</h2>
          <p className="text-xs text-zinc-500 mb-5">{error}</p>
          <button
            onClick={onBackHome}
            className="w-full py-3 rounded-2xl text-xs font-bold bg-indigo-600 text-white cursor-pointer"
          >
            Quay về Trang chủ
          </button>
        </div>
      </div>
    );
  }

  const bannerGrad = BANNER_GRADIENTS[portal.theme_color] || BANNER_GRADIENTS.indigo;
  const filteredStudents = portal.student_names.filter((n) =>
    n.toLowerCase().includes(nameQuery.trim().toLowerCase())
  );

  return (
    <div
      className={`min-h-screen pb-16 ${
        darkMode
          ? 'bg-zinc-950 text-zinc-100 bg-dot-grid-dark'
          : 'bg-zinc-50 text-zinc-900 bg-dot-grid-light'
      }`}
    >
      {/* Mobile-friendly Sticky Header */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          darkMode ? 'bg-zinc-950/90 border-zinc-800' : 'bg-white/90 border-zinc-200'
        }`}
      >
        <div className="max-w-3xl mx-auto px-3.5 sm:px-4 h-14 flex items-center justify-between gap-2">
          <button
            onClick={onBackHome}
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
              darkMode
                ? 'border-zinc-800 bg-zinc-900 text-zinc-200'
                : 'border-zinc-200 bg-zinc-50 text-zinc-700'
            }`}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Trang chủ
          </button>

          <BrandLogo darkMode={darkMode} size="sm" />

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
      </header>

      <main className="max-w-3xl mx-auto px-3.5 sm:px-4 pt-4 sm:pt-6 space-y-4 sm:space-y-5">
        {/* Classroom Hero Card */}
        <div className="rounded-3xl overflow-hidden shadow-md border border-black/5 dark:border-white/10">
          <div className={`bg-gradient-to-r ${bannerGrad} p-5 sm:p-7 text-white`}>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-white/20 backdrop-blur-md">
                <GraduationCap className="w-3.5 h-3.5" />
                PHÒNG LỚP HỌC TRỰC TUYẾN
              </span>
              <span className="font-mono text-xs font-bold px-2.5 py-1 rounded-lg bg-black/25">
                Mã lớp: {portal.room_code}
              </span>
            </div>

            <h1 className="font-display text-2xl sm:text-3xl font-extrabold tracking-tight">
              {portal.name}
            </h1>
            <div className="mt-1.5 flex flex-wrap items-center gap-3 text-xs sm:text-sm text-white/90">
              {portal.subject && (
                <span className="inline-flex items-center gap-1">
                  <BookOpen className="w-3.5 h-3.5" /> {portal.subject}
                </span>
              )}
              <span className="inline-flex items-center gap-1">
                <Users className="w-3.5 h-3.5" /> Sĩ số: {portal.student_count} học sinh
              </span>
              <span>• Năm học {portal.school_year}</span>
            </div>
            {portal.description && (
              <p className="mt-2 text-xs text-white/85 leading-relaxed">{portal.description}</p>
            )}
          </div>

          {/* Quick Student Identity Selector (Remembers Student Name on Phone!) */}
          {portal.student_names.length > 0 && (
            <div
              className={`p-4 sm:p-5 ${
                darkMode ? 'bg-zinc-900' : 'bg-white'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-2xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center shrink-0">
                    <UserCheck className="w-5 h-5" />
                  </div>
                  <div>
                    <div className="text-[11px] text-zinc-500 font-medium">
                      Tên học sinh đang chọn trên thiết bị này:
                    </div>
                    <div className="font-display font-bold text-sm sm:text-base">
                      {selectedStudent || 'Chưa chọn tên của bạn'}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => setPickerOpen((v) => !v)}
                  className="px-4 py-2.5 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer active:scale-[0.99]"
                >
                  {selectedStudent ? 'Đổi tên học sinh' : 'Chọn tên của em trong lớp'}
                </button>
              </div>

              {pickerOpen && (
                <div className="mt-3 pt-3 border-t border-zinc-200 dark:border-zinc-800 space-y-2.5">
                  <div
                    className={`flex items-center gap-2 px-3.5 py-2.5 rounded-2xl border ${
                      darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                    }`}
                  >
                    <Search className="w-4 h-4 text-zinc-400 shrink-0" />
                    <input
                      type="text"
                      value={nameQuery}
                      onChange={(e) => setNameQuery(e.target.value)}
                      placeholder="Gõ nhanh tên của em để tìm..."
                      className="w-full bg-transparent outline-none text-sm"
                    />
                  </div>

                  <div className="max-h-56 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 pr-1">
                    {filteredStudents.map((stName, idx) => {
                      const active = selectedStudent === stName;
                      return (
                        <button
                          key={stName}
                          type="button"
                          onClick={() => handleChooseStudent(stName)}
                          className={`text-left px-3.5 py-2.5 rounded-xl text-xs sm:text-sm font-semibold flex items-center justify-between border cursor-pointer ${
                            active
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : darkMode
                                ? 'bg-zinc-950 border-zinc-800 hover:border-indigo-500 text-zinc-200'
                                : 'bg-zinc-50 border-zinc-200 hover:border-indigo-400 text-zinc-800'
                          }`}
                        >
                          <span>
                            <span className="opacity-60 font-mono mr-1.5">{idx + 1}.</span>
                            {stName}
                          </span>
                          {active && <CheckCircle2 className="w-4 h-4 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Assigned Homework / Quizzes List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
            <h2 className="font-display font-bold text-base sm:text-lg">
              Bài tập &amp; Đề kiểm tra của {portal.name} ({portal.assignments.length})
            </h2>
          </div>

          {portal.assignments.length === 0 ? (
            <div
              className={`p-10 rounded-3xl border text-center ${
                darkMode ? 'bg-zinc-900/80 border-zinc-800' : 'bg-white border-zinc-200'
              }`}
            >
              <GraduationCap className="w-10 h-10 text-zinc-400 mx-auto mb-2" />
              <p className="font-semibold text-sm">Hiện chưa có bài tập nào đang mở cho lớp.</p>
              <p className="text-xs text-zinc-500 mt-1">
                Khi Giáo viên giao bài tập mới cho {portal.name}, bài tập sẽ tự động hiện tại đây.
              </p>
            </div>
          ) : (
            portal.assignments.map((a) => (
              <div
                key={a.id}
                className={`p-4 sm:p-5 rounded-3xl border transition-all ${
                  darkMode
                    ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                    : 'bg-white border-zinc-200 shadow-2xs hover:border-indigo-300'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3.5">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-indigo-500/15 text-indigo-500">
                        {a.access_code}
                      </span>
                      {a.is_quiz && (
                        <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/15 text-emerald-500">
                          Chấm điểm tự động
                        </span>
                      )}
                      {a.time_limit_minutes > 0 && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-amber-500/15 text-amber-500">
                          <Clock className="w-3 h-3" /> {a.time_limit_minutes} phút
                        </span>
                      )}
                      {a.anti_cheat_enabled && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-rose-500/15 text-rose-500">
                          <ShieldAlert className="w-3 h-3" /> Chống thoát App
                        </span>
                      )}
                    </div>

                    <h3 className="font-display font-bold text-base sm:text-lg leading-snug">
                      {a.title}
                    </h3>
                    {a.description && (
                      <p className="text-xs text-zinc-500 line-clamp-2">{a.description}</p>
                    )}

                    <div className="flex flex-wrap items-center gap-3 text-[11px] text-zinc-400 pt-0.5">
                      <span>{a.question_count} câu hỏi</span>
                      <span>• {a.response_count} bạn đã nộp</span>
                      {a.due_at && (
                        <span
                          className={`inline-flex items-center gap-1 font-semibold ${
                            a.is_past_due ? 'text-rose-500' : 'text-amber-500'
                          }`}
                        >
                          <Calendar className="w-3 h-3" />
                          Hạn nộp: {new Date(a.due_at).toLocaleString('vi-VN')}
                        </span>
                      )}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={!a.accepting_responses}
                    onClick={() => onOpenAssignment(a.slug)}
                    className={`w-full sm:w-auto px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold inline-flex items-center justify-center gap-2 shrink-0 cursor-pointer active:scale-[0.99] ${
                      a.accepting_responses
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm'
                        : 'bg-zinc-200 dark:bg-zinc-800 text-zinc-500 cursor-not-allowed'
                    }`}
                  >
                    <Play className="w-4 h-4 fill-current" />
                    {a.is_past_due
                      ? 'Đã hết hạn nộp'
                      : a.accepting_responses
                        ? 'Vào làm bài ngay'
                        : 'Đã khóa nộp'}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </main>
    </div>
  );
}
