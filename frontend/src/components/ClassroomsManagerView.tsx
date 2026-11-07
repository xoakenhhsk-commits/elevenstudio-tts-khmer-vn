import {
  ArrowLeft,
  Award,
  BookOpen,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileSpreadsheet,
  GraduationCap,
  Link2,
  Loader2,
  Plus,
  Search,
  ShieldAlert,
  Sparkles,
  Trash2,
  UserPlus,
  Users,
  Wand2,
  X,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  assignFormToClassroom,
  createClassroom,
  deleteClassroom,
  fetchClassroomGradebook,
  getClassroomCsvExportUrl,
  updateClassroom,
} from '../api';
import type {
  Classroom,
  ClassroomMasterGradebook,
  ClassroomStudent,
  ServerInfo,
  SurveyForm,
  ThemeColor,
} from '../types';

interface ClassroomsManagerViewProps {
  classrooms: Classroom[];
  forms: SurveyForm[];
  serverInfo: ServerInfo | null;
  darkMode: boolean;
  onClassroomsChange: (next: Classroom[]) => void;
  onFormUpdated: (updated: SurveyForm) => void;
  onCreateHomeworkForClass: (classroom: Classroom) => void;
  onOpenAiForClass: (classroom: Classroom) => void;
  onOpenFormBuilder: (form: SurveyForm, tab?: 'questions' | 'responses' | 'settings') => void;
  onOpenPublicClassroom: (roomCode: string) => void;
}

const CLASS_THEMES: { id: ThemeColor; label: string; grad: string }[] = [
  { id: 'indigo', label: 'Indigo', grad: 'from-indigo-600 to-violet-600' },
  { id: 'emerald', label: 'Emerald', grad: 'from-emerald-500 to-teal-600' },
  { id: 'violet', label: 'Violet', grad: 'from-violet-600 to-fuchsia-600' },
  { id: 'rose', label: 'Rose', grad: 'from-rose-500 to-orange-500' },
  { id: 'amber', label: 'Amber', grad: 'from-amber-500 to-red-500' },
];

const SAMPLE_STUDENTS_10 = [
  'Nguyễn Minh Khôi',
  'Trần Ngọc Bảo Châu',
  'Lê Hoàng Nam',
  'Phạm Gia Hân',
  'Võ Quốc Anh',
  'Đặng Thùy Dương',
  'Bùi Tuấn Kiệt',
  'Hoàng Khánh Linh',
  'Đỗ Đức Mạnh',
  'Ngô Phương Thảo',
];

function formatVietnameseFullName(raw: string): string {
  const withoutNumbers = raw.replace(/^\s*\d+[\.\)\-\s]+\s*/, '').trim();
  if (!withoutNumbers) return '';
  return withoutNumbers
    .split(/\s+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

export function ClassroomsManagerView({
  classrooms,
  forms,
  serverInfo,
  darkMode,
  onClassroomsChange,
  onFormUpdated,
  onCreateHomeworkForClass,
  onOpenAiForClass,
  onOpenFormBuilder,
  onOpenPublicClassroom,
}: ClassroomsManagerViewProps) {
  const [selectedClassId, setSelectedClassId] = useState<string | null>(null);
  const [detailTab, setDetailTab] = useState<'assignments' | 'students' | 'gradebook'>(
    'assignments'
  );

  // Create / Edit Modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingClassroom, setEditingClassroom] = useState<Classroom | null>(null);
  const [clsName, setClsName] = useState('');
  const [clsSubject, setClsSubject] = useState('');
  const [clsYear, setClsYear] = useState('2026 - 2027');
  const [clsTheme, setClsTheme] = useState<ThemeColor>('indigo');
  const [clsStudentsText, setClsStudentsText] = useState('');
  const [savingClass, setSavingClass] = useState(false);

  // Inside Class Detail states
  const [gradebookData, setGradebookData] = useState<ClassroomMasterGradebook | null>(null);
  const [loadingGradebook, setLoadingGradebook] = useState(false);
  const [studentSearch, setStudentSearch] = useState('');
  const [quickAddName, setQuickAddName] = useState('');
  const [assignFormId, setAssignFormId] = useState('');
  const [assigningForm, setAssigningForm] = useState(false);
  const [copiedRoomCode, setCopiedRoomCode] = useState<string | null>(null);

  const activeClassroom =
    classrooms.find((c) => c.id === selectedClassId) || null;

  const getPublicClassUrl = (roomCode: string) => {
    const origin = serverInfo?.public_tunnel_url || window.location.origin;
    return `${origin}/c/${roomCode}`;
  };

  const copyClassLink = (roomCode: string) => {
    navigator.clipboard.writeText(getPublicClassUrl(roomCode));
    setCopiedRoomCode(roomCode);
    setTimeout(() => setCopiedRoomCode(null), 1800);
  };

  const loadMasterGradebook = useCallback(async (classroomId: string) => {
    setLoadingGradebook(true);
    try {
      const data = await fetchClassroomGradebook(classroomId);
      setGradebookData(data);
    } catch {
      // Ignore transient errors
    } finally {
      setLoadingGradebook(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      loadMasterGradebook(selectedClassId);
    } else {
      setGradebookData(null);
    }
  }, [selectedClassId, loadMasterGradebook]);

  const openNewClassModal = () => {
    setEditingClassroom(null);
    setClsName('');
    setClsSubject('');
    setClsYear('2026 - 2027');
    setClsTheme('indigo');
    setClsStudentsText('');
    setShowCreateModal(true);
  };

  const openEditClassModal = (cls: Classroom) => {
    setEditingClassroom(cls);
    setClsName(cls.name);
    setClsSubject(cls.subject || '');
    setClsYear(cls.school_year || '2026 - 2027');
    setClsTheme((cls.theme_color as ThemeColor) || 'indigo');
    setClsStudentsText((cls.student_names || []).join('\n'));
    setShowCreateModal(true);
  };

  const handleNormalizeTextareaNames = () => {
    const lines = clsStudentsText
      .split('\n')
      .map(formatVietnameseFullName)
      .filter(Boolean);
    const unique = Array.from(new Set(lines));
    setClsStudentsText(unique.join('\n'));
  };

  const handleSaveClassForm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clsName.trim() || savingClass) return;
    setSavingClass(true);
    try {
      const rawNames = clsStudentsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);

      if (editingClassroom) {
        // Preserve existing bonus_points & notes when matching by name
        const existingMap = new Map(
          editingClassroom.students.map((st) => [st.name.toLowerCase(), st])
        );
        const mergedStudents = rawNames.map((nm, i) => {
          const clean = nm.replace(/^\s*\d+[\.\)\-\s]+\s*/, '').trim();
          const prev = existingMap.get(clean.toLowerCase());
          return (
            prev || {
              name: clean,
              student_code: `HS${String(i + 1).padStart(2, '0')}`,
              bonus_points: 0,
              note: '',
            }
          );
        });

        const updated = await updateClassroom(editingClassroom.id, {
          name: clsName.trim(),
          subject: clsSubject.trim(),
          school_year: clsYear.trim(),
          theme_color: clsTheme,
          students: mergedStudents,
        });
        onClassroomsChange(
          classrooms.map((c) => (c.id === updated.id ? updated : c))
        );
        if (selectedClassId === updated.id) {
          loadMasterGradebook(updated.id);
        }
      } else {
        const created = await createClassroom({
          name: clsName.trim(),
          subject: clsSubject.trim(),
          school_year: clsYear.trim(),
          theme_color: clsTheme,
          students: rawNames,
        });
        onClassroomsChange([created, ...classrooms]);
        setSelectedClassId(created.id);
      }
      setShowCreateModal(false);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể lưu lớp học');
    } finally {
      setSavingClass(false);
    }
  };

  const handleDeleteClassroom = async (cls: Classroom) => {
    if (
      !window.confirm(
        `Xóa lớp "${cls.name}"? (Các đề bài tập đã tạo vẫn được giữ nguyên trong kho đề của bạn).`
      )
    ) {
      return;
    }
    try {
      await deleteClassroom(cls.id);
      onClassroomsChange(classrooms.filter((c) => c.id !== cls.id));
      if (selectedClassId === cls.id) setSelectedClassId(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi xóa lớp học');
    }
  };

  const handleQuickAddSingleStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeClassroom || !quickAddName.trim()) return;
    const formatted = formatVietnameseFullName(quickAddName);
    if (!formatted) return;
    try {
      const nextStudents: Partial<ClassroomStudent>[] = [
        ...activeClassroom.students,
        {
          name: formatted,
          student_code: `HS${String(activeClassroom.students.length + 1).padStart(2, '0')}`,
          bonus_points: 0,
          note: '',
        },
      ];
      const updated = await updateClassroom(activeClassroom.id, {
        name: activeClassroom.name,
        subject: activeClassroom.subject,
        school_year: activeClassroom.school_year,
        theme_color: activeClassroom.theme_color,
        students: nextStudents,
      });
      onClassroomsChange(
        classrooms.map((c) => (c.id === updated.id ? updated : c))
      );
      setQuickAddName('');
      loadMasterGradebook(updated.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể thêm học sinh');
    }
  };

  const handleAdjustStudentBonus = async (studentId: string, delta: number) => {
    if (!activeClassroom) return;
    const nextStudents = activeClassroom.students.map((s) =>
      s.id === studentId
        ? { ...s, bonus_points: Math.round((s.bonus_points + delta) * 100) / 100 }
        : s
    );
    try {
      const updated = await updateClassroom(activeClassroom.id, {
        name: activeClassroom.name,
        subject: activeClassroom.subject,
        school_year: activeClassroom.school_year,
        theme_color: activeClassroom.theme_color,
        students: nextStudents,
      });
      onClassroomsChange(
        classrooms.map((c) => (c.id === updated.id ? updated : c))
      );
      loadMasterGradebook(updated.id);
    } catch {
      // Ignore
    }
  };

  const handleRemoveStudent = async (studentId: string) => {
    if (!activeClassroom) return;
    const nextStudents = activeClassroom.students.filter((s) => s.id !== studentId);
    const updated = await updateClassroom(activeClassroom.id, {
      name: activeClassroom.name,
      subject: activeClassroom.subject,
      school_year: activeClassroom.school_year,
      theme_color: activeClassroom.theme_color,
      students: nextStudents,
    });
    onClassroomsChange(
      classrooms.map((c) => (c.id === updated.id ? updated : c))
    );
    loadMasterGradebook(updated.id);
  };

  const handleAssignExistingForm = async () => {
    if (!activeClassroom || !assignFormId || assigningForm) return;
    setAssigningForm(true);
    try {
      const updatedForm = await assignFormToClassroom(assignFormId, {
        classroom_id: activeClassroom.id,
        strict_roster: activeClassroom.student_count > 0,
      });
      onFormUpdated(updatedForm);
      setAssignFormId('');
      await loadMasterGradebook(activeClassroom.id);
      onClassroomsChange(
        classrooms.map((c) =>
          c.id === activeClassroom.id
            ? { ...c, assigned_forms_count: c.assigned_forms_count + 1 }
            : c
        )
      );
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi giao bài tập cho lớp');
    } finally {
      setAssigningForm(false);
    }
  };

  const handleUnassignForm = async (formId: string) => {
    if (!activeClassroom) return;
    try {
      const updatedForm = await assignFormToClassroom(formId, {
        classroom_id: null,
        strict_roster: false,
      });
      onFormUpdated(updatedForm);
      await loadMasterGradebook(activeClassroom.id);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể gỡ bài khỏi lớp');
    }
  };

  const unassignedForms = forms.filter(
    (f) => !activeClassroom || f.classroom_id !== activeClassroom.id
  );
  const classForms = forms.filter(
    (f) => activeClassroom && f.classroom_id === activeClassroom.id
  );

  return (
    <div className="space-y-5">
      {/* ==================== VIEW 1: CLASSROOMS GRID ==================== */}
      {!activeClassroom ? (
        <>
          <div
            className={`p-5 sm:p-6 rounded-3xl border flex flex-col sm:flex-row sm:items-center justify-between gap-4 ${
              darkMode
                ? 'bg-zinc-900/90 border-zinc-800'
                : 'bg-white border-zinc-200 shadow-2xs'
            }`}
          >
            <div className="space-y-1">
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-500">
                <Users className="w-3.5 h-3.5" />
                QUẢN LÝ LỚP HỌC &amp; DANH SÁCH TÊN HỌC SINH
              </div>
              <h2 className="font-display text-xl sm:text-2xl font-extrabold">
                Danh sách Lớp Học Của Tôi ({classrooms.length})
              </h2>
              <p className="text-xs sm:text-sm text-zinc-500">
                Tạo lớp với danh sách tên học sinh sẵn 1 lần, sau đó giao bất kỳ bài tập nào cho lớp và theo dõi Sổ Điểm Tổng Hợp cả lớp!
              </p>
            </div>

            <button
              type="button"
              onClick={openNewClassModal}
              className="w-full sm:w-auto px-5 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center justify-center gap-2 shadow-sm cursor-pointer shrink-0 active:scale-[0.99]"
            >
              <Plus className="w-4 h-4" />
              + Tạo Lớp Học &amp; DS Tên Mới
            </button>
          </div>

          {classrooms.length === 0 ? (
            <div
              className={`p-10 sm:p-14 rounded-3xl border text-center space-y-4 ${
                darkMode
                  ? 'bg-zinc-900/60 border-zinc-800'
                  : 'bg-white border-zinc-200'
              }`}
            >
              <div className="w-14 h-14 rounded-3xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center mx-auto">
                <GraduationCap className="w-7 h-7" />
              </div>
              <div className="max-w-md mx-auto space-y-1">
                <h3 className="font-display text-lg font-bold">
                  Bạn chưa tạo Lớp học nào
                </h3>
                <p className="text-xs sm:text-sm text-zinc-500">
                  Tạo Lớp học (VD: Lớp 10A1, Lớp 12A2) kèm danh sách họ tên học sinh để giao bài tập 1 chạm và tự động xuất sổ điểm theo tên lớp.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewClassModal}
                className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center gap-2 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                Tạo Lớp Đầu Tiên Ngay
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {classrooms.map((cls) => {
                const th =
                  CLASS_THEMES.find((t) => t.id === cls.theme_color) || CLASS_THEMES[0];
                const assignedCount = forms.filter(
                  (f) => f.classroom_id === cls.id
                ).length;

                return (
                  <div
                    key={cls.id}
                    className={`rounded-3xl border overflow-hidden flex flex-col justify-between transition-all ${
                      darkMode
                        ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                        : 'bg-white border-zinc-200 shadow-2xs hover:shadow-md'
                    }`}
                  >
                    <div>
                      <div className={`bg-gradient-to-r ${th.grad} p-4 sm:p-5 text-white`}>
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="font-mono text-[11px] font-bold px-2.5 py-0.5 rounded-lg bg-black/25">
                            {cls.room_code}
                          </span>
                          <span className="text-[11px] font-semibold bg-white/20 px-2.5 py-0.5 rounded-full">
                            {cls.school_year}
                          </span>
                        </div>
                        <h3
                          onClick={() => setSelectedClassId(cls.id)}
                          className="font-display text-xl font-extrabold cursor-pointer hover:underline"
                        >
                          {cls.name}
                        </h3>
                        <p className="text-xs text-white/85 mt-0.5">
                          {cls.subject || 'Chưa gắn tên môn học'}
                        </p>
                      </div>

                      <div className="p-4 sm:p-5 space-y-3">
                        <div className="grid grid-cols-2 gap-2.5">
                          <div
                            className={`p-3 rounded-2xl border ${
                              darkMode
                                ? 'bg-zinc-950 border-zinc-800'
                                : 'bg-zinc-50 border-zinc-200/70'
                            }`}
                          >
                            <div className="text-[11px] text-zinc-500">Sĩ số lớp</div>
                            <div className="font-display text-lg font-extrabold">
                              {cls.student_count}{' '}
                              <span className="text-xs font-normal text-zinc-400">HS</span>
                            </div>
                          </div>

                          <div
                            className={`p-3 rounded-2xl border ${
                              darkMode
                                ? 'bg-zinc-950 border-zinc-800'
                                : 'bg-zinc-50 border-zinc-200/70'
                            }`}
                          >
                            <div className="text-[11px] text-zinc-500">Đã giao</div>
                            <div className="font-display text-lg font-extrabold text-indigo-500">
                              {assignedCount}{' '}
                              <span className="text-xs font-normal text-zinc-400">bài</span>
                            </div>
                          </div>
                        </div>

                        {/* Share Class Portal Link */}
                        <div
                          className={`p-2.5 rounded-2xl border flex items-center justify-between gap-2 text-xs ${
                            darkMode
                              ? 'bg-zinc-950 border-zinc-800'
                              : 'bg-indigo-50/60 border-indigo-200/70'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onOpenPublicClassroom(cls.room_code)}
                            className="truncate font-mono text-[11px] text-indigo-600 dark:text-indigo-400 hover:underline text-left cursor-pointer"
                          >
                            {getPublicClassUrl(cls.room_code)}
                          </button>
                          <button
                            type="button"
                            onClick={() => copyClassLink(cls.room_code)}
                            className="px-2.5 py-1 rounded-xl text-[11px] font-bold bg-indigo-600 text-white shrink-0 cursor-pointer"
                          >
                            {copiedRoomCode === cls.room_code ? 'Đã chép' : 'Copy Link Lớp'}
                          </button>
                        </div>
                      </div>
                    </div>

                    <div
                      className={`px-4 py-3 border-t flex items-center justify-between gap-2 ${
                        darkMode ? 'border-zinc-800 bg-zinc-950/40' : 'border-zinc-100 bg-zinc-50/60'
                      }`}
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedClassId(cls.id)}
                        className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                      >
                        Mở Lớp &amp; Giao Bài
                      </button>

                      <button
                        type="button"
                        onClick={() => onCreateHomeworkForClass(cls)}
                        className="py-2 px-3 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                        title="Soạn bài tập mới giao ngay cho lớp này"
                      >
                        + Giao bài
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteClassroom(cls)}
                        className="p-2 rounded-xl text-zinc-400 hover:text-rose-500 cursor-pointer"
                        title="Xóa lớp"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      ) : (
        /* ==================== VIEW 2: SINGLE CLASSROOM WORKSPACE ==================== */
        <div className="space-y-4 sm:space-y-5">
          {/* Top Class Banner */}
          <div
            className={`p-4 sm:p-6 rounded-3xl border space-y-4 ${
              darkMode
                ? 'bg-zinc-900/90 border-zinc-800'
                : 'bg-white border-zinc-200 shadow-2xs'
            }`}
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => setSelectedClassId(null)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                  darkMode
                    ? 'border-zinc-800 bg-zinc-950 text-zinc-300'
                    : 'border-zinc-200 bg-zinc-50 text-zinc-700'
                }`}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Tất cả Lớp học
              </button>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => openEditClassModal(activeClassroom)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold border cursor-pointer ${
                    darkMode
                      ? 'border-zinc-700 text-zinc-200 hover:bg-zinc-800'
                      : 'border-zinc-200 text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  Sửa thông tin &amp; Nhập hàng loạt tên HS
                </button>
                <button
                  type="button"
                  onClick={() => onOpenPublicClassroom(activeClassroom.room_code)}
                  className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white cursor-pointer"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  Mở Cổng Lớp Học
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold">
                    {activeClassroom.name}
                  </h2>
                  <span className="px-2.5 py-1 rounded-xl font-mono text-xs font-bold bg-indigo-500/15 text-indigo-500">
                    Mã lớp: {activeClassroom.room_code}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs text-zinc-500 mt-1">
                  {activeClassroom.subject && (
                    <span className="inline-flex items-center gap-1 font-medium">
                      <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
                      {activeClassroom.subject}
                    </span>
                  )}
                  <span>• Sĩ số: {activeClassroom.student_count} học sinh</span>
                  <span>• Đã giao: {classForms.length} bài tập</span>
                </div>
              </div>

              {/* Action Buttons for Assigning Homework directly to this Class */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => onCreateHomeworkForClass(activeClassroom)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  Soạn Bài Tập Cho {activeClassroom.name}
                </button>
                <button
                  type="button"
                  onClick={() => onOpenAiForClass(activeClassroom)}
                  className="flex-1 sm:flex-initial px-4 py-2.5 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white inline-flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  AI Tạo Đề Cho Lớp
                </button>
              </div>
            </div>

            {/* Public Class Portal Link Bar */}
            <div
              className={`p-3 rounded-2xl border flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                darkMode
                  ? 'bg-zinc-950 border-zinc-800'
                  : 'bg-indigo-50/70 border-indigo-200/80'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <Link2 className="w-4 h-4 text-indigo-500 shrink-0" />
                <div className="truncate text-xs">
                  <span className="font-semibold mr-1.5">Link Phòng Lớp gửi nhóm Zalo HS:</span>
                  <span className="font-mono text-indigo-600 dark:text-indigo-400">
                    {getPublicClassUrl(activeClassroom.room_code)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => copyClassLink(activeClassroom.room_code)}
                className="inline-flex items-center justify-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold bg-indigo-600 text-white shrink-0 cursor-pointer"
              >
                {copiedRoomCode === activeClassroom.room_code ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> Đã sao chép Link Lớp
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Sao chép Link Lớp
                  </>
                )}
              </button>
            </div>

            {/* 3 Mobile-Scrollable Sub-Tabs */}
            <div
              className={`flex items-center gap-1 p-1 rounded-2xl overflow-x-auto no-scrollbar ${
                darkMode ? 'bg-zinc-950' : 'bg-zinc-100'
              }`}
            >
              {[
                {
                  id: 'assignments',
                  label: `Bài tập đã giao (${classForms.length})`,
                  icon: GraduationCap,
                },
                {
                  id: 'students',
                  label: `Danh sách Học sinh (${activeClassroom.student_count})`,
                  icon: Users,
                },
                {
                  id: 'gradebook',
                  label: 'Sổ Điểm Tổng Hợp Lớp',
                  icon: Award,
                },
              ].map((t) => {
                const Icon = t.icon;
                const active = detailTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setDetailTab(t.id as typeof detailTab)}
                    className={`flex-1 px-3.5 py-2.5 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      active
                        ? darkMode
                          ? 'bg-zinc-800 text-white shadow-xs'
                          : 'bg-white text-zinc-950 shadow-xs'
                        : 'text-zinc-500 hover:text-zinc-900 dark:hover:text-white'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5 shrink-0" />
                    {t.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* SUBTAB 1: ASSIGNED HOMEWORK & ASSIGN EXISTING FORM */}
          {detailTab === 'assignments' && (
            <div className="space-y-4">
              {/* Assign Existing Form Picker */}
              {unassignedForms.length > 0 && (
                <div
                  className={`p-4 rounded-3xl border flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 ${
                    darkMode
                      ? 'bg-zinc-900/90 border-zinc-800'
                      : 'bg-white border-zinc-200'
                  }`}
                >
                  <select
                    value={assignFormId}
                    onChange={(e) => setAssignFormId(e.target.value)}
                    className={`flex-1 px-3.5 py-2.5 rounded-2xl text-xs font-semibold border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                    }`}
                  >
                    <option value="">
                      -- Chọn đề bài tập có sẵn trong kho để giao cho {activeClassroom.name} --
                    </option>
                    {unassignedForms.map((f) => (
                      <option key={f.id} value={f.id}>
                        [{f.access_code}] {f.title} ({f.questions.length} câu)
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={!assignFormId || assigningForm}
                    onClick={handleAssignExistingForm}
                    className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white cursor-pointer shrink-0"
                  >
                    {assigningForm ? 'Đang giao...' : `Giao cho ${activeClassroom.name}`}
                  </button>
                </div>
              )}

              {classForms.length === 0 ? (
                <div
                  className={`p-10 rounded-3xl border text-center space-y-3 ${
                    darkMode
                      ? 'bg-zinc-900/60 border-zinc-800'
                      : 'bg-white border-zinc-200'
                  }`}
                >
                  <GraduationCap className="w-10 h-10 text-zinc-400 mx-auto" />
                  <p className="text-sm font-bold">
                    Chưa có bài tập nào được giao cho {activeClassroom.name}
                  </p>
                  <button
                    type="button"
                    onClick={() => onCreateHomeworkForClass(activeClassroom)}
                    className="px-5 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 text-white cursor-pointer"
                  >
                    + Soạn Bài Tập Đầu Tiên Cho Lớp Này
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {classForms.map((f) => (
                    <div
                      key={f.id}
                      className={`p-4 sm:p-5 rounded-3xl border flex flex-col justify-between gap-4 ${
                        darkMode
                          ? 'bg-zinc-900/90 border-zinc-800'
                          : 'bg-white border-zinc-200 shadow-2xs'
                      }`}
                    >
                      <div className="space-y-2">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span className="px-2 py-0.5 rounded-lg font-mono text-[11px] font-bold bg-indigo-500/15 text-indigo-500">
                            {f.access_code}
                          </span>
                          {f.is_quiz && (
                            <span className="px-2 py-0.5 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-500">
                              Chấm điểm
                            </span>
                          )}
                          {f.anti_cheat_enabled && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg text-[11px] font-semibold bg-rose-500/15 text-rose-500">
                              <ShieldAlert className="w-3 h-3" /> Chống gian lận
                            </span>
                          )}
                        </div>

                        <h4 className="font-display font-bold text-base leading-snug">
                          {f.title}
                        </h4>

                        <div className="text-xs text-zinc-500">
                          Đã nộp:{' '}
                          <strong className="text-emerald-500">
                            {f.response_count}/{activeClassroom.student_count || '—'} HS
                          </strong>{' '}
                          • {f.questions.length} câu hỏi
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                        <button
                          type="button"
                          onClick={() => onOpenFormBuilder(f, 'responses')}
                          className="flex-1 py-2 px-3 rounded-xl text-xs font-bold bg-indigo-600 text-white cursor-pointer"
                        >
                          Xem Điểm Bài Này
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenFormBuilder(f, 'questions')}
                          className={`py-2 px-3 rounded-xl text-xs font-semibold border cursor-pointer ${
                            darkMode
                              ? 'border-zinc-700 text-zinc-200'
                              : 'border-zinc-200 text-zinc-700'
                          }`}
                        >
                          Sửa đề
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnassignForm(f.id)}
                          className="py-2 px-2.5 rounded-xl text-xs text-zinc-400 hover:text-rose-500 cursor-pointer"
                          title="Gỡ khỏi lớp này"
                        >
                          Gỡ
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* SUBTAB 2: CLASS STUDENT ROSTER */}
          {detailTab === 'students' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-3xl border flex flex-col sm:flex-row gap-2.5 ${
                  darkMode ? 'bg-zinc-900/90 border-zinc-800' : 'bg-white border-zinc-200'
                }`}
              >
                <form
                  onSubmit={handleQuickAddSingleStudent}
                  className="flex-1 flex items-center gap-2"
                >
                  <input
                    type="text"
                    value={quickAddName}
                    onChange={(e) => setQuickAddName(e.target.value)}
                    placeholder="Nhập họ tên học sinh mới để thêm nhanh vào lớp..."
                    className={`flex-1 px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                    }`}
                  />
                  <button
                    type="submit"
                    className="px-4 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white inline-flex items-center gap-1.5 shrink-0 cursor-pointer"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    Thêm HS
                  </button>
                </form>

                <div
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border sm:w-64 ${
                    darkMode ? 'bg-zinc-950 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                  }`}
                >
                  <Search className="w-3.5 h-3.5 text-zinc-400" />
                  <input
                    type="text"
                    value={studentSearch}
                    onChange={(e) => setStudentSearch(e.target.value)}
                    placeholder="Tìm tên trong lớp..."
                    className="w-full bg-transparent outline-none text-xs"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {activeClassroom.students
                  .filter((s) =>
                    s.name.toLowerCase().includes(studentSearch.trim().toLowerCase())
                  )
                  .map((st, idx) => (
                    <div
                      key={st.id}
                      className={`p-3.5 sm:p-4 rounded-2xl border flex items-center justify-between gap-2 ${
                        darkMode
                          ? 'bg-zinc-900/90 border-zinc-800'
                          : 'bg-white border-zinc-200 shadow-2xs'
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-[11px] font-bold text-zinc-400">
                            #{idx + 1}
                          </span>
                          <span className="font-semibold text-sm truncate">{st.name}</span>
                        </div>
                        <div className="text-[11px] text-zinc-400 mt-0.5">
                          Mã: {st.student_code} • Điểm cộng chuyên cần:{' '}
                          <strong
                            className={
                              st.bonus_points >= 0 ? 'text-emerald-500' : 'text-rose-500'
                            }
                          >
                            {st.bonus_points > 0 ? `+${st.bonus_points}` : st.bonus_points}đ
                          </strong>
                        </div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => handleAdjustStudentBonus(st.id, -0.5)}
                          className="px-2 py-1 rounded-lg text-xs font-mono font-bold border border-zinc-300 dark:border-zinc-700 hover:border-rose-500 cursor-pointer"
                          title="Trừ 0.5 điểm chuyên cần"
                        >
                          -0.5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAdjustStudentBonus(st.id, 0.5)}
                          className="px-2 py-1 rounded-lg text-xs font-mono font-bold border border-zinc-300 dark:border-zinc-700 hover:border-emerald-500 text-emerald-500 cursor-pointer"
                          title="Cộng 0.5 điểm phát biểu / chuyên cần"
                        >
                          +0.5
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemoveStudent(st.id)}
                          className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer"
                          title="Xóa khỏi lớp"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* SUBTAB 3: MASTER CLASSROOM GRADEBOOK */}
          {detailTab === 'gradebook' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-xs sm:text-sm font-semibold">
                  Điểm Trung Bình Chung Cả Lớp:{' '}
                  <span className="text-emerald-500 font-extrabold text-base">
                    {gradebookData?.class_average_10 !== null &&
                    gradebookData?.class_average_10 !== undefined
                      ? `${gradebookData.class_average_10}/10đ`
                      : '—'}
                  </span>
                </div>

                <a
                  href={getClassroomCsvExportUrl(activeClassroom.id)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-2xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <FileSpreadsheet className="w-4 h-4" />
                  Xuất Sổ Điểm Cả Lớp .CSV
                  <Download className="w-3.5 h-3.5" />
                </a>
              </div>

              {loadingGradebook ? (
                <div className="py-16 flex flex-col items-center justify-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-indigo-500" />
                  <span className="text-xs text-zinc-500">Đang tổng hợp sổ điểm lớp...</span>
                </div>
              ) : gradebookData ? (
                <div
                  className={`rounded-3xl border overflow-hidden ${
                    darkMode ? 'bg-zinc-900 border-zinc-800' : 'bg-white border-zinc-200'
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
                          <th className="py-3.5 px-3 font-bold">#</th>
                          <th className="py-3.5 px-3 font-bold whitespace-nowrap">
                            Họ và tên Học sinh
                          </th>
                          {gradebookData.assigned_forms.map((af, idx) => (
                            <th
                              key={af.id}
                              className="py-3.5 px-3 font-bold min-w-[120px] max-w-[180px] truncate"
                              title={af.title}
                            >
                              Bài {idx + 1}: {af.title}
                            </th>
                          ))}
                          <th className="py-3.5 px-3 font-bold whitespace-nowrap">Chuyên cần</th>
                          <th className="py-3.5 px-3 font-bold whitespace-nowrap">TB Chung</th>
                          <th className="py-3.5 px-3 font-bold whitespace-nowrap">Xếp loại</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
                        {gradebookData.student_rows.map((row, idx) => (
                          <tr key={row.id}>
                            <td className="py-3 px-3 font-mono text-zinc-400">{idx + 1}</td>
                            <td className="py-3 px-3 font-semibold whitespace-nowrap">
                              {row.name}
                            </td>
                            {gradebookData.assigned_forms.map((af) => {
                              const sc = row.scores_by_form[af.id];
                              return (
                                <td key={af.id} className="py-3 px-3 font-mono">
                                  {sc !== null && sc !== undefined ? (
                                    <span className="font-bold text-emerald-500">{sc}đ</span>
                                  ) : (
                                    <span className="text-amber-500 text-[11px]">Chưa nộp</span>
                                  )}
                                </td>
                              );
                            })}
                            <td className="py-3 px-3 font-mono">
                              {row.bonus_points > 0
                                ? `+${row.bonus_points}`
                                : row.bonus_points}
                            </td>
                            <td className="py-3 px-3 font-mono font-extrabold text-indigo-500">
                              {row.average_score_10 !== null ? `${row.average_score_10}đ` : '—'}
                            </td>
                            <td className="py-3 px-3">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-500/15 text-indigo-500 whitespace-nowrap">
                                {row.academic_rank}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      )}

      {/* ==================== CREATE / EDIT CLASSROOM MODAL ==================== */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/65 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4">
          <form
            onSubmit={handleSaveClassForm}
            className={`w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl border p-5 sm:p-6 max-h-[92vh] overflow-y-auto space-y-4 ${
              darkMode ? 'bg-zinc-900 border-zinc-800 text-zinc-100' : 'bg-white border-zinc-200 text-zinc-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display text-lg font-extrabold">
                {editingClassroom
                  ? `Cập nhật ${editingClassroom.name}`
                  : 'Tạo Lớp Học & Danh Sách Tên Học Sinh'}
              </h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-2 rounded-xl text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold mb-1">Tên Lớp Học *</label>
                <input
                  type="text"
                  required
                  value={clsName}
                  onChange={(e) => setClsName(e.target.value)}
                  placeholder="VD: Lớp 10A1"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-sm border outline-none ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800'
                      : 'bg-zinc-50 border-zinc-200'
                  }`}
                />
              </div>

              <div>
                <label className="block text-xs font-bold mb-1">Môn học / Nhóm</label>
                <input
                  type="text"
                  value={clsSubject}
                  onChange={(e) => setClsSubject(e.target.value)}
                  placeholder="VD: Tin học / Toán / Tiếng Anh"
                  className={`w-full px-3.5 py-2.5 rounded-2xl text-sm border outline-none ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-800'
                      : 'bg-zinc-50 border-zinc-200'
                  }`}
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="text-xs font-bold">Màu nhận diện lớp:</span>
              <div className="flex items-center gap-2">
                {CLASS_THEMES.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setClsTheme(t.id)}
                    className={`px-3 py-1 rounded-full text-xs font-bold border cursor-pointer ${
                      clsTheme === t.id
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : darkMode
                          ? 'border-zinc-700 text-zinc-400'
                          : 'border-zinc-200 text-zinc-600'
                    }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                <label className="text-xs font-bold">
                  Danh sách Họ và tên Học sinh (Mỗi dòng 1 tên — có thể dán từ Excel/Zalo):
                </label>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleNormalizeTextareaNames}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold bg-indigo-500/15 text-indigo-500 cursor-pointer"
                  >
                    <Wand2 className="w-3 h-3" /> Chuẩn hóa Họ Tên
                  </button>
                  <button
                    type="button"
                    onClick={() => setClsStudentsText(SAMPLE_STUDENTS_10.join('\n'))}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-500/15 text-emerald-500 cursor-pointer"
                  >
                    + Điền mẫu 10 HS
                  </button>
                </div>
              </div>

              <textarea
                rows={7}
                value={clsStudentsText}
                onChange={(e) => setClsStudentsText(e.target.value)}
                placeholder={`Nguyễn Minh Khôi\nTrần Ngọc Bảo Châu\nLê Hoàng Nam...`}
                className={`w-full p-3.5 rounded-2xl text-sm border outline-none leading-relaxed ${
                  darkMode
                    ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                }`}
              />
              <div className="text-[11px] text-zinc-500 mt-1">
                Đang nhập:{' '}
                <strong>
                  {clsStudentsText.split('\n').filter((s) => s.trim()).length} học sinh
                </strong>{' '}
                (Tự động lọc trùng tên và bỏ số thứ tự đầu dòng).
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2.5 rounded-2xl text-xs font-semibold text-zinc-500 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={savingClass || !clsName.trim()}
                className="px-6 py-3 rounded-2xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer"
              >
                {savingClass
                  ? 'Đang lưu...'
                  : editingClassroom
                    ? 'Lưu cập nhật Lớp'
                    : 'Tạo Lớp Học Ngay'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
