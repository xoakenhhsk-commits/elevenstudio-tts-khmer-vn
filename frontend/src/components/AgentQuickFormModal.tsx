import {
  AlertCircle,
  Bot,
  Check,
  Code2,
  Copy,
  KeyRound,
  Loader2,
  RefreshCw,
  Sparkles,
  Terminal,
  Wand2,
  X,
} from 'lucide-react';
import { useState } from 'react';
import {
  agentGenerateForm,
  importFormFromCode,
  regenerateAgentKey,
} from '../api';
import type { AuthUser, ServerInfo, SurveyForm, ThemeColor } from '../types';

interface AgentQuickFormModalProps {
  open: boolean;
  initialTab?: 'ai_prompt' | 'quick_code' | 'agent_api';
  user: AuthUser | null;
  serverInfo: ServerInfo | null;
  darkMode: boolean;
  onClose: () => void;
  onFormCreated: (form: SurveyForm) => void;
  onUserKeyUpdated: (newKey: string) => void;
}

const SAMPLE_DSL_CODE = `# Khảo sát Đăng ký Workshop AI & Web 2026
> Điền thông tin để nhận vé mời và tài liệu thực hành miễn phí
@theme: emerald

Họ và tên đầy đủ của bạn * | text
Email nhận tài liệu & vé mời * | email
Công việc hiện tại của bạn * | radio: Sinh viên CNTT, Lập trình viên, Marketing / Kinh doanh, Quản lý / Chủ doanh nghiệp
Chủ đề bạn quan tâm nhất | checkbox: Xây dựng AI Agent tự động, Thiết kế Web Full-Stack, Phân tích dữ liệu, Tự động hóa quy trình
Hình thức tham gia * | dropdown: Tham dự trực tiếp tại Hội trường, Tham gia Online qua Zoom
Mức độ mong đợi chương trình * | rating: 5
Câu hỏi bạn muốn gửi trước cho diễn giả | textarea`;

const SAMPLE_PASTE_QUIZ = `# Phiếu Đánh Giá Chất Lượng Quán Cà Phê
> Cảm ơn bạn đã ghé thăm quán hôm nay!
@theme: amber

1. Bạn đánh giá chất lượng đồ uống hôm nay mấy sao? *
2. Món đồ uống bạn yêu thích nhất tại quán? *
- Cà phê muối đặc biệt
- Trà đào cam sả
- Matcha Latte kem phô mai
- Cold Brew trái cây
3. Không gian và âm nhạc tại quán theo bạn thế nào?
- Rất chill, yên tĩnh dễ làm việc
- Thoáng mát, sạch sẽ
- Hơi ồn vào giờ cao điểm
4. Góp ý thêm để quán phục vụ bạn tốt hơn`;

const SAMPLE_JSON_CODE = `{
  "title": "Form Ứng Tuyển Nhân Sự Công Nghệ",
  "description": "Điền thông tin ứng tuyển nhanh chỉ trong 1 phút.",
  "theme_color": "indigo",
  "questions": [
    { "type": "short_text", "title": "Họ và tên ứng viên", "required": true },
    { "type": "email", "title": "Email liên hệ", "required": true },
    {
      "type": "single_choice",
      "title": "Vị trí ứng tuyển",
      "required": true,
      "options": ["Frontend React/TypeScript", "Backend Python/FastAPI", "AI Engineer", "UI/UX Designer"]
    },
    { "type": "rating", "title": "Tự đánh giá kỹ năng làm việc nhóm", "required": true, "max_rating": 5 },
    { "type": "long_text", "title": "Link GitHub / CV / Dự án nổi bật", "required": true }
  ]
}`;

const PROMPT_SUGGESTIONS = [
  'Khảo sát đánh giá quán cà phê / trà sữa gồm đồ uống, không gian, nhân viên và góp ý',
  'Form đăng ký tuyển dụng thực tập sinh IT React & Python gồm họ tên, email, kỹ năng, link CV',
  'Đăng ký tham gia sự kiện Workshop AI cho sinh viên gồm khung giờ, chủ đề quan tâm',
  'Phiếu đánh giá chất lượng khóa học và giảng viên cuối kỳ cho học viên',
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
  user,
  serverInfo,
  darkMode,
  onClose,
  onFormCreated,
  onUserKeyUpdated,
}: AgentQuickFormModalProps) {
  const [tab, setTab] = useState<'ai_prompt' | 'quick_code' | 'agent_api'>(initialTab);
  const [prompt, setPrompt] = useState('');
  const [questionCount, setQuestionCount] = useState(6);
  const [themeColor, setThemeColor] = useState<ThemeColor>('indigo');
  const [codeInput, setCodeInput] = useState(SAMPLE_DSL_CODE);

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
        is_published: true,
      });
      onFormCreated(res.form);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi AI Agent tạo form');
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
        is_published: true,
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
        "prompt": "Tạo khảo sát hài lòng khách hàng quán cà phê 5 câu",
        "question_count": 5,
        "theme_color": "emerald",
        "is_published": True
    }
)
data = res.json()
print("Mã Form:", data["access_code"])
print("Link Public điền ngay:", data["public_url"])`;

  const curlAgentSnippet = `curl -X POST "${apiEndpointBase}/api/agent/quick-create" \\
  -H "Content-Type: application/json" \\
  -H "X-Agent-Key: ${agentKey}" \\
  -d '{"prompt":"Form đăng ký sự kiện Workshop AI","question_count":6,"theme_color":"indigo"}'`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
      <div
        className={`w-full max-w-2xl rounded-3xl border overflow-hidden shadow-2xl my-auto ${
          darkMode
            ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
            : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        {/* Header */}
        <div
          className={`px-6 py-4 border-b flex items-center justify-between ${
            darkMode ? 'border-zinc-800' : 'border-zinc-200'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-indigo-600 via-violet-600 to-emerald-500 text-white flex items-center justify-center shadow-sm">
              <Bot className="w-5 h-5" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base">
                Agent &amp; Code Tạo Biểu Mẫu Siêu Tốc
              </h2>
              <p className="text-xs text-zinc-500">
                Tạo khảo sát riêng trong tài khoản của bạn ({user?.full_name}) chỉ trong vài giây
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
          className={`px-6 pt-4 pb-2 border-b ${
            darkMode ? 'border-zinc-800/80 bg-zinc-900/40' : 'border-zinc-100 bg-zinc-50/70'
          }`}
        >
          <div
            className={`grid grid-cols-3 p-1 rounded-2xl ${
              darkMode ? 'bg-zinc-900' : 'bg-zinc-200/70'
            }`}
          >
            {[
              { id: 'ai_prompt', label: 'AI Agent Tự Tạo', icon: Wand2 },
              { id: 'quick_code', label: 'Dán Code / Cú Pháp Nhanh', icon: Code2 },
              { id: 'agent_api', label: 'API Code Cho Agent', icon: Terminal },
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
                  className={`py-2 px-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? darkMode
                        ? 'bg-zinc-800 text-white shadow-xs'
                        : 'bg-white text-zinc-950 shadow-xs'
                      : 'text-zinc-500 hover:text-zinc-800 dark:hover:text-zinc-200'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span className="truncate">{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-500 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* TAB 1: AI AGENT PROMPT GENERATOR */}
          {tab === 'ai_prompt' && (
            <form onSubmit={handleRunAiAgent} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Mô tả biểu mẫu bạn muốn Agent thiết kế tự động
                </label>
                <textarea
                  rows={3}
                  required
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  placeholder="Ví dụ: Tạo khảo sát đánh giá chất lượng dịch vụ nha khoa gồm thái độ bác sĩ, chi phí, thời gian chờ và ý kiến đóng góp..."
                  className={`w-full p-3.5 rounded-2xl text-sm border outline-none resize-none ${
                    darkMode
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-indigo-500'
                      : 'bg-zinc-50 border-zinc-200 text-zinc-900 focus:bg-white focus:border-indigo-500'
                  }`}
                />
              </div>

              {/* Quick Suggestions */}
              <div>
                <div className="text-[11px] font-semibold text-zinc-500 mb-2">
                  Gợi ý bấm chọn nhanh:
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {PROMPT_SUGGESTIONS.map((s) => (
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
              </div>

              {/* Question Count + Theme */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
                <div>
                  <label className="block text-xs font-semibold mb-1.5">
                    Số lượng câu hỏi cần tạo
                  </label>
                  <div className="flex items-center gap-1.5">
                    {[4, 6, 8, 10].map((n) => (
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
                    Màu giao diện biểu mẫu
                  </label>
                  <div className="flex items-center gap-2 pt-1.5">
                    {THEMES.map((th) => (
                      <button
                        key={th.id}
                        type="button"
                        onClick={() => setThemeColor(th.id)}
                        title={th.label}
                        className={`w-6 h-6 rounded-full ${th.dot} cursor-pointer transition-transform ${
                          themeColor === th.id
                            ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-zinc-950 scale-110'
                            : 'opacity-70 hover:opacity-100'
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
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-semibold bg-gradient-to-r from-indigo-600 to-violet-600 hover:opacity-95 text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Agent đang thiết kế câu hỏi...
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      Agent Tự Tạo Form &amp; Lấy Link Ngay
                    </>
                  )}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: QUICK CODE / DSL / JSON TO FORM */}
          {tab === 'quick_code' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-xs font-semibold">
                  Nhập cú pháp Code ngắn gọn, dán câu hỏi Word/ChatGPT, hoặc JSON:
                </span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCodeInput(SAMPLE_DSL_CODE)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 bg-zinc-900 text-emerald-400'
                        : 'border-zinc-200 bg-zinc-50 text-emerald-700'
                    }`}
                  >
                    Mẫu Code Nhanh
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeInput(SAMPLE_PASTE_QUIZ)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 bg-zinc-900 text-amber-400'
                        : 'border-zinc-200 bg-zinc-50 text-amber-700'
                    }`}
                  >
                    Mẫu Copy-Paste
                  </button>
                  <button
                    type="button"
                    onClick={() => setCodeInput(SAMPLE_JSON_CODE)}
                    className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                      darkMode
                        ? 'border-zinc-800 bg-zinc-900 text-indigo-400'
                        : 'border-zinc-200 bg-zinc-50 text-indigo-700'
                    }`}
                  >
                    Mẫu JSON
                  </button>
                </div>
              </div>

              <textarea
                rows={10}
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                spellCheck={false}
                className={`w-full p-4 rounded-2xl font-mono text-xs leading-relaxed border outline-none ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-800 text-emerald-300 focus:border-emerald-500'
                    : 'bg-zinc-950 border-zinc-800 text-emerald-300'
                }`}
              />

              <div
                className={`p-3 rounded-2xl text-[11px] leading-relaxed ${
                  darkMode ? 'bg-zinc-900/80 text-zinc-400' : 'bg-zinc-100 text-zinc-600'
                }`}
              >
                <strong>Mẹo cú pháp siêu tốc:</strong> Dùng{' '}
                <code className="font-mono"># Tiêu đề</code>,{' '}
                <code className="font-mono">*</code> ở cuối câu hỏi bắt buộc, và{' '}
                <code className="font-mono">| radio: A, B, C</code> hoặc{' '}
                <code className="font-mono">| checkbox: A, B</code>,{' '}
                <code className="font-mono">| rating: 5</code>,{' '}
                <code className="font-mono">| text</code>,{' '}
                <code className="font-mono">| textarea</code>,{' '}
                <code className="font-mono">| email</code>,{' '}
                <code className="font-mono">| date</code>.
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleCompileQuickCode}
                  disabled={loading || !codeInput.trim()}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full text-xs sm:text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white shadow-md cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Đang biên dịch...
                    </>
                  ) : (
                    <>
                      <Code2 className="w-4 h-4" />
                      Chạy Code Tạo Form &amp; Xuất Bản Ngay
                    </>
                  )}
                </button>
              </div>
            </div>
          )}

          {/* TAB 3: EXTERNAL AGENT API KEY & PYTHON / CURL CODE */}
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
                    Agent API Key riêng của tài khoản {user?.email}
                  </span>
                  <button
                    type="button"
                    onClick={handleRotateKey}
                    disabled={rotatingKey}
                    className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-500 hover:underline cursor-pointer"
                  >
                    <RefreshCw className={`w-3 h-3 ${rotatingKey ? 'animate-spin' : ''}`} />
                    Đổi Key mới
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
                    {copiedKey === 'key' ? 'Đã chép' : 'Copy Key'}
                  </button>
                </div>
              </div>

              {/* Python Code */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold">
                    Code Python cho AI Agent / Script tự động tạo Form &amp; nhận Link Public:
                  </span>
                  <button
                    type="button"
                    onClick={() => copyText('py', pythonAgentSnippet)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 cursor-pointer"
                  >
                    {copiedKey === 'py' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Đã chép Code
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Sao chép Python
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 rounded-2xl bg-zinc-950 text-zinc-200 border border-zinc-800 font-mono text-[11px] overflow-x-auto leading-relaxed">
                  {pythonAgentSnippet}
                </pre>
              </div>

              {/* cURL Code */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-semibold">Lệnh Terminal cURL 1 dòng:</span>
                  <button
                    type="button"
                    onClick={() => copyText('curl', curlAgentSnippet)}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-500 cursor-pointer"
                  >
                    {copiedKey === 'curl' ? (
                      <>
                        <Check className="w-3.5 h-3.5" /> Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" /> Sao chép cURL
                      </>
                    )}
                  </button>
                </div>
                <pre className="p-3.5 rounded-2xl bg-zinc-950 text-emerald-300 border border-zinc-800 font-mono text-[11px] overflow-x-auto leading-relaxed">
                  {curlAgentSnippet}
                </pre>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
