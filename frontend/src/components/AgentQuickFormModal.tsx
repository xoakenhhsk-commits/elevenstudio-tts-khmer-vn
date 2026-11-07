import {
  AlertCircle,
  Bot,
  Check,
  ClipboardList,
  Code2,
  Copy,
  GraduationCap,
  KeyRound,
  Loader2,
  RefreshCw,
  Sparkles,
  Terminal,
  Wand2,
  X,
} from 'lucide-react';
import { useEffect, useState } from 'react';
import {
  agentGenerateForm,
  importFormFromCode,
  regenerateAgentKey,
} from '../api';
import type { AuthUser, Classroom, ServerInfo, SurveyForm, ThemeColor } from '../types';

interface AgentQuickFormModalProps {
  open: boolean;
  initialTab?: 'ai_prompt' | 'quick_code' | 'agent_api';
  defaultQuizMode?: boolean;
  defaultClassroomId?: string | null;
  classrooms?: Classroom[];
  user: AuthUser | null;
  serverInfo: ServerInfo | null;
  darkMode: boolean;
  onClose: () => void;
  onFormCreated: (form: SurveyForm) => void;
  onUserKeyUpdated: (newKey: string) => void;
}

const SAMPLE_QUIZ_CODE = `# Bài Kiểm Tra 15 Phút — Toán & Tư Duy Logic
> Chọn đúng tên học sinh trong danh sách lớp. Cấm thoát màn hình trong lúc làm bài!
@quiz: on
@time: 15
@anticheat: on
@roster: Nguyễn Minh Khôi, Trần Ngọc Bảo Trân, Lê Hoàng Gia Huy, Phạm Thùy Dương

Nghiệm của phương trình 3x - 9 = 0 là bao nhiêu? * | radio: x = 2, *x = 3, x = 6, x = 9 | 2.5đ
Những số nào dưới đây chia hết cho 5? * | checkbox: *10, 14, *25, 32 | 2.5đ
Tính nhanh kết quả của 12 x 5 + 15: * | text: 75 | 2.5đ
Trình bày ngắn gọn định lý Pytago (GV chấm điểm riêng): | textarea | 2.5đ`;

const SAMPLE_DSL_CODE = `# Khảo sát Đăng ký Workshop AI & Web 2026
> Điền thông tin để nhận vé mời và tài liệu thực hành miễn phí
@theme: emerald

Họ và tên đầy đủ của bạn * | text
Email nhận tài liệu & vé mời * | email
Công việc hiện tại của bạn * | radio: Sinh viên CNTT, Lập trình viên, Marketing / Kinh doanh
Chủ đề bạn quan tâm nhất | checkbox: Xây dựng AI Agent, Thiết kế Web Full-Stack, Phân tích dữ liệu
Mức độ mong đợi chương trình * | rating: 5`;

const QUIZ_SUGGESTIONS = [
  'Tạo đề kiểm tra 15 phút Tiếng Anh lớp 10 về thì Hiện tại đơn và Câu điều kiện',
  'Bài tập trắc nghiệm Toán học gồm phương trình bậc nhất, hình học và tính nhẩm',
  'Đề kiểm tra Tin học cơ bản về HTML, Internet, Phần cứng máy tính có chấm điểm',
  'Bài kiểm tra Lịch sử & Địa lý Việt Nam có đáp án chấm thang điểm 10',
];

const SURVEY_SUGGESTIONS = [
  'Khảo sát đánh giá quán cà phê / trà sữa gồm đồ uống, không gian, nhân viên',
  'Form đăng ký tuyển dụng thực tập sinh IT gồm họ tên, email, kỹ năng, link CV',
  'Phiếu khảo sát ý kiến phụ huynh học sinh cuối học kỳ',
];

const THEMES: { id: ThemeColor; label: string; dot: string }[] = [
  { id: 'indigo', label: 'Indigo', dot: 'bg-indigo-600' },
  { id: 'emerald', label: 'Emerald', dot: 'bg-emerald-500' },
  { id: 'violet', label: 'Violet', dot: 'bg-violet-600' },
  { id: 'rose', label: 'Rose', dot: 'bg-rose-500' },
  { id: 'amber', label: 'Amber', dot: 'bg-amber-500' },
  { id: 'zinc', label: 'Minimal', dot: 'bg-zinc-900' },
];

export function AgentQuickFormModal({
  open,
  initialTab = 'ai_prompt',
  defaultQuizMode = true,
  defaultClassroomId = null,
  classrooms = [],
  user,
  serverInfo,
  darkMode,
  onClose,
  onFormCreated,
  onUserKeyUpdated,
}: AgentQuickFormModalProps) {
  const [tab, setTab] = useState<'ai_prompt' | 'quick_code' | 'agent_api'>(initialTab);
  const [isQuizMode, setIsQuizMode] = useState<boolean>(defaultQuizMode);
  const [selectedClassroomId, setSelectedClassroomId] = useState<string>(
    defaultClassroomId || ''
  );
  const [prompt, setPrompt] = useState('');
  const [questionCount, setQuestionCount] = useState(5);
  const [themeColor, setThemeColor] = useState<ThemeColor>('indigo');
  const [codeInput, setCodeInput] = useState(
    defaultQuizMode ? SAMPLE_QUIZ_CODE : SAMPLE_DSL_CODE
  );

  useEffect(() => {
    if (open) {
      setTab(initialTab);
      setIsQuizMode(defaultQuizMode);
      setSelectedClassroomId(defaultClassroomId || '');
      setCodeInput(defaultQuizMode ? SAMPLE_QUIZ_CODE : SAMPLE_DSL_CODE);
    }
  }, [open, initialTab, defaultQuizMode, defaultClassroomId]);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [rotatingKey, setRotatingKey] = useState(false);

  if (!open) return null;

  const copyText = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(id);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleRunAiAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await agentGenerateForm({
        prompt: prompt.trim(),
        question_count: questionCount,
        theme_color: themeColor,
        is_quiz: isQuizMode,
        is_published: true,
        classroom_id: selectedClassroomId || null,
      });
      onFormCreated(res.form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi AI Agent tạo đề');
    } finally {
      setLoading(false);
    }
  };

  const handleCompileQuickCode = async () => {
    if (!codeInput.trim() || loading) return;
    setError(null);
    setLoading(true);
    try {
      const res = await importFormFromCode({
        code: codeInput,
        theme_color: themeColor,
        is_quiz: isQuizMode,
        is_published: true,
        classroom_id: selectedClassroomId || null,
      });
      if (res.form) {
        onFormCreated(res.form);
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cú pháp Code không hợp lệ');
    } finally {
      setLoading(false);
    }
  };

  const handleRotateKey = async () => {
    setRotatingKey(true);
    try {
      const nextKey = await regenerateAgentKey();
      onUserKeyUpdated(nextKey);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể đổi API Key');
    } finally {
      setRotatingKey(false);
    }
  };

  const apiEndpointBase =
    serverInfo?.public_tunnel_url || 'http://localhost:8000';
  const agentKey = user?.agent_api_key || 'kf_agent_YOUR_KEY';

  const pythonAgentSnippet = `import requests

res = requests.post(
    "${apiEndpointBase}/api/agent/quick-create",
    headers={"X-Agent-Key": "${agentKey}"},
    json={
        "prompt": "Tạo đề kiểm tra 15 phút Tiếng Anh lớp 10 có đáp án chấm điểm",
        "question_count": 5,
        "is_quiz": True,
        "theme_color": "indigo"
    }
)
data = res.json()
print("Mã Bài Tập:", data["access_code"])
print("Link giao cho Học sinh:", data["public_url"])`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-3 sm:p-4 overflow-y-auto">
      <div
        className={`w-full max-w-2xl rounded-3xl border overflow-hidden shadow-2xl my-auto ${
          darkMode
            ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
            : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-5 sm:px-6 py-4 border-b flex items-center justify-between ${
            darkMode ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-emerald-500 text-white flex items-center justify-center shadow-sm shrink-0">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-sm sm:text-base">
                Agent Soạn Bài Tập Chấm Điểm &amp; Tạo Form Nhanh
              </h2>
              <p className="text-[11px] sm:text-xs text-zinc-500">
                Lưu riêng tư trong tài khoản {user?.full_name} • Tự động sinh đáp án &amp; chống thoát App
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl cursor-pointer ${
              darkMode ? 'hover:bg-zinc-900 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Tabs */}
        <div
          className={`px-4 sm:px-6 pt-3.5 pb-2 border-b ${
            darkMode ? 'border-zinc-800/80 bg-zinc-900/40' : 'border-zinc-100 bg-zinc-50/70'
          }`}
        >
          <div
            className={`grid grid-cols-3 p-1 rounded-2xl ${
              darkMode ? 'bg-zinc-900' : 'bg-zinc-200/70'
            }`}
          >
            {[
              { id: 'ai_prompt', label: 'AI Soạn Tự Động', icon: Wand2 },
              { id: 'quick_code', label: 'Dán Code Đề Thi', icon: Code2 },
              { id: 'agent_api', label: 'API Cho Agent', icon: Terminal },
            ].map((t) => {
              const Icon = t.icon;
              const active = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setError(null);
                    setTab(t.id as typeof tab);
                  }}
                  className={`py-2 px-2 rounded-xl text-[11px] sm:text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? darkMode
                        ? 'bg-zinc-800 text-white shadow-xs'
                        : 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="p-5 sm:p-6 space-y-4 max-h-[76vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* QUIZ VS SURVEY MODE SWITCH */}
          {tab !== 'agent_api' && (
            <div className="grid grid-cols-2 gap-2.5">
              <button
                type="button"
                onClick={() => {
                  setIsQuizMode(true);
                  setCodeInput(SAMPLE_QUIZ_CODE);
                }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  isQuizMode
                    ? 'border-indigo-500 bg-indigo-500/10 ring-1 ring-indigo-500'
                    : darkMode
                      ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <GraduationCap className="w-4 h-4 text-indigo-500" />
                  <span>Bài Tập / Đề Kiểm Tra</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Có đáp án chấm thang 10 + Chống thoát App
                </div>
              </button>

              <button
                type="button"
                onClick={() => {
                  setIsQuizMode(false);
                  setCodeInput(SAMPLE_DSL_CODE);
                }}
                className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                  !isQuizMode
                    ? 'border-emerald-500 bg-emerald-500/10 ring-1 ring-emerald-500'
                    : darkMode
                      ? 'border-zinc-800 bg-zinc-900/50 text-zinc-400'
                      : 'border-zinc-200 bg-zinc-50 text-zinc-600'
                }`}
              >
                <div className="flex items-center gap-2 text-xs font-bold">
                  <ClipboardList className="w-4 h-4 text-emerald-500" />
                  <span>Biểu Mẫu Khảo Sát</span>
                </div>
                <div className="text-[11px] text-zinc-500 mt-0.5">
                  Thu thập ý kiến, đăng ký sự kiện, đánh giá sao
                </div>
              </button>
            </div>
          )}

          {/* CLASSROOM TARGET SELECTOR */}
          {tab !== 'agent_api' && classrooms.length > 0 && (
            <div>
              <label className="block text-xs font-bold mb-1">
                🏫 Giao trực tiếp cho Lớp Học (tự động gắn danh sách tên học sinh lớp đó):
              </label>
              <select
                value={selectedClassroomId}
                onChange={(e) => setSelectedClassroomId(e.target.value)}
                className={`w-full px-3.5 py-2.5 rounded-2xl text-xs sm:text-sm font-semibold border outline-none ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-100'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-900'
                }`}
              >
                <option value="">-- Không gắn lớp cố định --</option>
                {classrooms.map((cls) => (
                  <option key={cls.id} value={cls.id}>
                    {cls.name} — {cls.subject || 'Lớp học'} ({cls.student_count} HS)
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* TAB 1: AI AGENT */}
          {tab === 'ai_prompt' && (
            <form onSubmit={handleRunAiAgent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  {isQuizMode
                    ? 'Nhập môn học / chủ đề bài tập bạn muốn giao cho học sinh:'
                    : 'Nhập chủ đề biểu mẫu khảo sát:'}
                </label>
                <textarea
                  rows={3}
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder={
                    isQuizMode
                      ? 'Ví dụ: Đề kiểm tra 15 phút Tiếng Anh lớp 10 về thì Hiện tại hoàn thành và Từ vựng...'
                      : 'Ví dụ: Khảo sát hài lòng khách hàng quán cà phê...'
                  }
                  className={`w-full p-3.5 rounded-2xl text-sm border outline-none resize-none ${
                    darkMode
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-indigo-500'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-indigo-500'
                  }`}
                />
              </div>

              <div className="flex flex-wrap gap-1.5">
                {(isQuizMode ? QUIZ_SUGGESTIONS : SURVEY_SUGGESTIONS).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setPrompt(s)}
                    className={`text-left text-[11px] px-3 py-1.5 rounded-xl border transition-colors cursor-pointer ${
                      darkMode
                        ? 'bg-zinc-900 border-zinc-800 hover:border-indigo-500/60 text-zinc-300'
                        : 'bg-zinc-50 border-zinc-200 hover:border-indigo-400 text-zinc-700'
                    }`}
                  >
                    + {s}
                  </button>
                ))}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Số lượng câu hỏi
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[4, 5, 8, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setQuestionCount(n)}
                        className={`flex-1 py-2 rounded-xl text-xs font-bold border cursor-pointer ${
                          questionCount === n
                            ? 'bg-indigo-600 border-indigo-600 text-white'
                            : darkMode
                              ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                              : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                        }`}
                      >
                        {n} câu
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Màu chủ đề
                  </label>
                  <div className="flex items-center gap-2 pt-1.5">
                    {THEMES.map((th) => (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => setThemeColor(th.id)}
                        className={`w-6 h-6 rounded-full ${th.dot} cursor-pointer ${
                          themeColor === th.id
                            ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-zinc-950 scale-110'
                            : 'opacity-70'
                        }`}
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <button
                  type="submit"
                  disabled={loading || !prompt.trim()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-bold bg-gradient-to-r from-indigo-600 to-violet-600 text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Agent đang soạn đề &amp; đáp án...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      {isQuizMode
                        ? 'Soạn Đề Chấm Điểm & Lấy Link Giao Bài'
                        : 'Tạo Khảo Sát & Lấy Link Ngay'}
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: QUICK CODE */}
          {tab === 'quick_code' && (
            <div className="space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold">
                  Đặt dấu <code className="text-emerald-500 font-mono">*</code> trước đáp án đúng và <code className="text-indigo-500 font-mono">@roster:</code> cho DS tên HS:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuizMode(true);
                      setCodeInput(SAMPLE_QUIZ_CODE);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-indigo-500/15 text-indigo-500 cursor-pointer"
                  >
                    Mẫu Đề Kiểm Tra
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setIsQuizMode(false);
                      setCodeInput(SAMPLE_DSL_CODE);
                    }}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-emerald-500/15 text-emerald-500 cursor-pointer"
                  >
                    Mẫu Khảo Sát
                  </button>
                </div>
              </div>

              <textarea
                rows={10}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                spellCheck={false}
                className="w-full p-4 rounded-2xl font-mono text-xs leading-relaxed bg-zinc-950 border border-zinc-800 text-emerald-300 outline-none"
              />

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCompileQuickCode}
                  disabled={loading || !codeInput.trim()}
                  className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Code2 className="w-4 h-4" />
                  )}
                  Biên dịch Code &amp; Tạo Đề Ngay
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: AGENT API */}
          {tab === 'agent_api' && (
            <div className="space-y-4">
              <div
                className={`p-4 rounded-2xl border ${
                  darkMode ? 'bg-zinc-900/70 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <span className="text-xs font-bold inline-flex items-center gap-1.5">
                    <KeyRound className="w-3.5 h-3.5 text-amber-500" />
                    Agent API Key riêng của bạn
                  </span>
                  <button
                    type="button"
                    onClick={handleRotateKey}
                    disabled={rotatingKey}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:underline cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${rotatingKey ? 'animate-spin' : ''}`} />
                    Đổi Key
                  </button>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={agentKey}
                    className={`flex-1 px-3 py-2 rounded-xl font-mono text-xs border outline-none ${
                      darkMode
                        ? 'bg-zinc-950 border-zinc-800 text-amber-300'
                        : 'bg-white border-zinc-200 text-zinc-900'
                    }`}
                  />
                  <button
                    type="button"
                    onClick={() => copyText('key', agentKey)}
                    className="px-3.5 py-2 rounded-xl text-xs font-semibold bg-zinc-900 text-white dark:bg-white dark:text-zinc-950 cursor-pointer"
                  >
                    {copiedKey === 'key' ? 'Đã chép' : 'Copy'}
                  </button>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold">
                    Code Python gọi Agent tạo Đề Kiểm Tra &amp; nhận Link giao bài:
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('py', pythonAgentSnippet)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 cursor-pointer"
                  >
                    {copiedKey === 'py' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Copy Python
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 rounded-2xl bg-zinc-950 text-zinc-200 border border-zinc-800 font-mono text-[11px] overflow-x-auto leading-relaxed">
                  {pythonAgentSnippet}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
