import {
  ArrowRight,
  BarChart3,
  Check,
  Copy,
  Edit3,
  ExternalLink,
  Eye,
  FilePlus2,
  Globe,
  Hash,
  Loader2,
  LogOut,
  Moon,
  Plus,
  QrCode,
  Search,
  Sparkles,
  Sun,
  Trash2,
  Wifi,
} from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import {
  createSurveyForm,
  deleteSurveyForm,
  duplicateSurveyForm,
  fetchCurrentUser,
  fetchMyForms,
  fetchServerInfo,
  fetchSurveyTemplates,
  logoutUser,
  updateSurveyForm,
} from './api';
import { AuthModal } from './components/AuthModal';
import { BrandLogo } from './components/BrandLogo';
import { FormBuilderView } from './components/FormBuilderView';
import { PublicSurveyView } from './components/PublicSurveyView';
import { SharePublishModal } from './components/SharePublishModal';
import type { AuthUser, ServerInfo, SurveyForm, SurveyTemplate } from './types';

function parsePublicIdentifierFromLocation(): string | null {
  const path = window.location.pathname;
  if (path.startsWith('/f/')) {
    const slug = decodeURIComponent(path.slice(3).replace(/\/+$/, ''));
    if (slug) return slug;
  }
  const params = new URLSearchParams(window.location.search);
  const qForm = params.get('form');
  return qForm ? qForm.trim() : null;
}

const CARD_BANNERS: Record<string, string> = {
  indigo: 'from-indigo-500 via-indigo-600 to-violet-600',
  emerald: 'from-emerald-500 via-teal-500 to-cyan-600',
  violet: 'from-violet-500 via-purple-600 to-fuchsia-600',
  rose: 'from-rose-500 via-pink-600 to-orange-500',
  amber: 'from-amber-400 via-orange-500 to-red-500',
  zinc: 'from-zinc-800 via-zinc-900 to-black',
};

export function App() {
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('kromaforms_theme') === 'dark';
  });

  const [user, setUser] = useState<AuthUser | null>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authDefaultMode, setAuthDefaultMode] = useState<'login' | 'register'>('login');

  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null);
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [forms, setForms] = useState<SurveyForm[]>([]);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [creatingId, setCreatingId] = useState<string | null>(null);

  // Routing & Active Views
  const [publicIdentifier, setPublicIdentifier] = useState<string | null>(() =>
    parsePublicIdentifierFromLocation()
  );
  const [editingForm, setEditingForm] = useState<SurveyForm | null>(null);
  const [builderTab, setBuilderTab] = useState<'questions' | 'responses' | 'settings'>(
    'questions'
  );
  const [shareModalForm, setShareModalForm] = useState<SurveyForm | null>(null);

  // Dashboard filters & quick code lookup
  const [searchQuery, setSearchQuery] = useState('');
  const [quickCode, setQuickCode] = useState('');
  const [copiedSlug, setCopiedSlug] = useState<string | null>(null);

  useEffect(() => {
    localStorage.setItem('kromaforms_theme', darkMode ? 'dark' : 'light');
    document.documentElement.classList.toggle('dark', darkMode);
  }, [darkMode]);

  const loadDashboardData = useCallback(async () => {
    try {
      const [srv, tplList, formList, me] = await Promise.all([
        fetchServerInfo(),
        fetchSurveyTemplates().catch(() => []),
        fetchMyForms().catch(() => []),
        fetchCurrentUser(),
      ]);
      setServerInfo(srv);
      setTemplates(tplList);
      setForms(formList);
      setUser(me);
    } finally {
      setLoadingInitial(false);
    }
  }, []);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  useEffect(() => {
    const onPopState = () => {
      const id = parsePublicIdentifierFromLocation();
      setPublicIdentifier(id);
      if (id) setEditingForm(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openPublicSurvey = (identifier: string) => {
    const clean = identifier.trim();
    if (!clean) return;
    window.history.pushState({}, '', `/f/${encodeURIComponent(clean)}`);
    setEditingForm(null);
    setPublicIdentifier(clean);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const backToHome = () => {
    if (window.location.pathname !== '/' || window.location.search) {
      window.history.pushState({}, '', '/');
    }
    setPublicIdentifier(null);
    setEditingForm(null);
    loadDashboardData();
  };

  const handleCreateBlankForm = async () => {
    if (creatingId) return;
    setCreatingId('blank');
    try {
      const created = await createSurveyForm({
        title: 'Biểu mẫu khảo sát mới',
        description: 'Rất mong nhận được ý kiến đóng góp của bạn qua biểu mẫu dưới đây.',
        theme_color: 'indigo',
        is_published: true,
        accepting_responses: true,
        allow_public_summary: true,
        questions: [
          {
            id: 'q_1',
            type: 'single_choice',
            title: 'Bạn đánh giá thế nào về dịch vụ của chúng tôi?',
            description: '',
            required: true,
            options: ['Rất hài lòng', 'Hài lòng', 'Bình thường', 'Cần cải thiện'],
          },
          {
            id: 'q_2',
            type: 'rating',
            title: 'Chấm điểm trải nghiệm tổng thể của bạn',
            description: 'Chọn từ 1 đến 5 sao',
            required: true,
            options: [],
            max_rating: 5,
          },
          {
            id: 'q_3',
            type: 'long_text',
            title: 'Ý kiến đóng góp thêm của bạn (nếu có)',
            description: '',
            required: false,
            options: [],
          },
        ],
      });
      setForms((prev) => [created, ...prev]);
      setBuilderTab('questions');
      setEditingForm(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể tạo biểu mẫu');
    } finally {
      setCreatingId(null);
    }
  };

  const handleCreateFromTemplate = async (tpl: SurveyTemplate) => {
    if (creatingId) return;
    setCreatingId(tpl.id);
    try {
      const created = await createSurveyForm({
        title: tpl.title,
        description: tpl.description,
        theme_color: tpl.theme_color,
        thank_you_message: tpl.thank_you_message,
        is_published: true,
        accepting_responses: true,
        allow_public_summary: true,
        questions: tpl.questions,
      });
      setForms((prev) => [created, ...prev]);
      setBuilderTab('questions');
      setEditingForm(created);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể khởi tạo từ mẫu');
    } finally {
      setCreatingId(null);
    }
  };

  const handleDuplicateForm = async (formId: string) => {
    try {
      const copy = await duplicateSurveyForm(formId);
      setForms((prev) => [copy, ...prev]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Lỗi nhân bản biểu mẫu');
    }
  };

  const handleDeleteForm = async (form: SurveyForm) => {
    if (!window.confirm(`Xóa biểu mẫu "${form.title}" và toàn bộ câu trả lời?`)) return;
    try {
      await deleteSurveyForm(form.id);
      setForms((prev) => prev.filter((f) => f.id !== form.id));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Không thể xóa biểu mẫu');
    }
  };

  const handleShareTogglePublish = async (nextPublished: boolean) => {
    if (!shareModalForm) return;
    const updated = await updateSurveyForm(shareModalForm.id, {
      is_published: nextPublished,
    });
    setShareModalForm(updated);
    setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    if (editingForm?.id === updated.id) setEditingForm(updated);
  };

  const handleShareToggleAccepting = async (nextAccepting: boolean) => {
    if (!shareModalForm) return;
    const updated = await updateSurveyForm(shareModalForm.id, {
      accepting_responses: nextAccepting,
    });
    setShareModalForm(updated);
    setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
    if (editingForm?.id === updated.id) setEditingForm(updated);
  };

  const getPublicUrlForSlug = (slug: string) => {
    const origin = serverInfo?.public_tunnel_url || window.location.origin;
    return `${origin}/f/${slug}`;
  };

  const copyPublicLink = (slug: string) => {
    navigator.clipboard.writeText(getPublicUrlForSlug(slug));
    setCopiedSlug(slug);
    setTimeout(() => setCopiedSlug(null), 1800);
  };

  // 1) PUBLIC RESPONDENT ROUTE (/f/:slug)
  if (publicIdentifier) {
    return (
      <PublicSurveyView
        identifier={publicIdentifier}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
        onBackHome={backToHome}
      />
    );
  }

  // 2) FORM BUILDER & RESPONSES STUDIO VIEW
  if (editingForm) {
    return (
      <>
        <FormBuilderView
          initialForm={editingForm}
          initialTab={builderTab}
          serverInfo={serverInfo}
          darkMode={darkMode}
          onToggleDarkMode={() => setDarkMode((d) => !d)}
          onBackDashboard={backToHome}
          onFormUpdated={(updated) => {
            setEditingForm(updated);
            setForms((prev) => prev.map((f) => (f.id === updated.id ? updated : f)));
          }}
          onOpenShareModal={(f) => setShareModalForm(f)}
          onOpenPublicPreview={(slug) => openPublicSurvey(slug)}
        />

        <SharePublishModal
          open={Boolean(shareModalForm)}
          form={shareModalForm}
          serverInfo={serverInfo}
          darkMode={darkMode}
          onClose={() => setShareModalForm(null)}
          onTogglePublish={handleShareTogglePublish}
          onToggleAccepting={handleShareToggleAccepting}
        />
      </>
    );
  }

  const filteredForms = forms.filter((f) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    return (
      f.title.toLowerCase().includes(q) ||
      f.access_code.toLowerCase().includes(q) ||
      f.slug.toLowerCase().includes(q)
    );
  });

  const activeHostDisplay =
    serverInfo?.public_tunnel_url ||
    (serverInfo && serverInfo.lan_ip !== '127.0.0.1'
      ? serverInfo.lan_url
      : window.location.origin);

  // 3) HOME & GOOGLE-FORMS-STYLE DASHBOARD
  return (
    <div
      className={`min-h-screen transition-colors pb-20 ${
        darkMode
          ? 'bg-zinc-950 text-zinc-100 bg-dot-grid-dark'
          : 'bg-zinc-50/80 text-zinc-900 bg-dot-grid-light'
      }`}
    >
      {/* Top Navbar */}
      <header
        className={`sticky top-0 z-30 border-b backdrop-blur-xl ${
          darkMode ? 'bg-zinc-950/85 border-zinc-800' : 'bg-white/85 border-zinc-200'
        }`}
      >
        <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <BrandLogo darkMode={darkMode} size="md" onClick={backToHome} />

          {/* Quick Enter Form Code Input */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (quickCode.trim()) openPublicSurvey(quickCode.trim());
            }}
            className="hidden md:flex items-center gap-1.5"
          >
            <div
              className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs ${
                darkMode
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                  : 'bg-zinc-100/80 border-zinc-200 text-zinc-800'
              }`}
            >
              <Hash className="w-3.5 h-3.5 text-indigo-500" />
              <input
                type="text"
                value={quickCode}
                onChange={(e) => setQuickCode(e.target.value)}
                placeholder="Nhập mã khảo sát (VD: KF-...)"
                className="bg-transparent outline-none w-44 font-mono text-xs"
              />
              <button
                type="submit"
                className="px-2.5 py-1 rounded-full font-semibold bg-zinc-950 text-white dark:bg-white dark:text-zinc-950 cursor-pointer text-[11px]"
              >
                Mở đơn
              </button>
            </div>
          </form>

          {/* Right Controls: Theme + Auth */}
          <div className="flex items-center gap-2.5">
            <button
              onClick={() => setDarkMode((d) => !d)}
              title="Đổi giao diện Sáng / Tối"
              className={`p-2.5 rounded-xl border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-zinc-800 bg-zinc-900 text-amber-400 hover:bg-zinc-800'
                  : 'border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-100'
              }`}
            >
              {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {user ? (
              <div className="flex items-center gap-2">
                <div
                  className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-xs font-semibold ${
                    darkMode
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                      : 'bg-white border-zinc-200 text-zinc-800'
                  }`}
                >
                  <span
                    className={`w-5 h-5 rounded-full bg-gradient-to-tr ${user.avatar_gradient} text-white text-[10px] font-bold flex items-center justify-center`}
                  >
                    {user.full_name.charAt(0).toUpperCase()}
                  </span>
                  <span className="max-w-[110px] truncate">{user.full_name}</span>
                </div>
                <button
                  onClick={async () => {
                    await logoutUser();
                    setUser(null);
                    loadDashboardData();
                  }}
                  title="Đăng xuất"
                  className={`p-2 rounded-xl border cursor-pointer ${
                    darkMode
                      ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-400'
                      : 'border-zinc-200 hover:bg-zinc-100 text-zinc-600'
                  }`}
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    setAuthDefaultMode('login');
                    setAuthModalOpen(true);
                  }}
                  className={`px-3.5 py-2 rounded-full text-xs font-semibold transition-colors cursor-pointer ${
                    darkMode
                      ? 'text-zinc-300 hover:bg-zinc-900'
                      : 'text-zinc-700 hover:bg-zinc-100'
                  }`}
                >
                  Đăng nhập
                </button>
                <button
                  onClick={() => {
                    setAuthDefaultMode('register');
                    setAuthModalOpen(true);
                  }}
                  className={`px-4 py-2 rounded-full text-xs font-semibold cursor-pointer ${
                    darkMode
                      ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                      : 'bg-zinc-950 text-white hover:bg-zinc-800'
                  }`}
                >
                  Đăng ký
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Banner + Live Public Server Link Strip */}
      <section className="max-w-6xl mx-auto px-4 pt-8 pb-6">
        <div
          className={`p-6 sm:p-8 rounded-3xl border relative overflow-hidden ${
            darkMode
              ? 'bg-zinc-900/90 border-zinc-800'
              : 'bg-white border-zinc-200/90 shadow-xs'
          }`}
        >
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-6">
            <div className="max-w-2xl">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mb-3">
                <Globe className="w-3.5 h-3.5" />
                <span>Nền tảng Tạo Khảo Sát &amp; Biểu Mẫu Public Trực Tuyến</span>
              </div>
              <h1 className="font-display text-2xl sm:text-4xl font-extrabold tracking-tight leading-tight">
                Thiết kế biểu mẫu đẹp như Google Forms,{' '}
                <span className="bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-500 bg-clip-text text-transparent">
                  xuất bản Link Public ngay lập tức.
                </span>
              </h1>
              <p
                className={`mt-2.5 text-sm leading-relaxed ${
                  darkMode ? 'text-zinc-400' : 'text-zinc-600'
                }`}
              >
                Tạo câu hỏi trắc nghiệm, hộp kiểm, đánh giá sao, thu thập phản hồi thời gian thực trên SQLite, xem biểu đồ trực quan, quét mã QR và xuất báo cáo Excel (.CSV).
              </p>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  onClick={handleCreateBlankForm}
                  disabled={Boolean(creatingId)}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-full text-xs sm:text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all cursor-pointer"
                >
                  {creatingId === 'blank' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Tạo Khảo Sát Mới Ngay
                </button>

                {forms[0] && (
                  <button
                    onClick={() => openPublicSurvey(forms[0].slug)}
                    className={`inline-flex items-center gap-2 px-5 py-3 rounded-full text-xs sm:text-sm font-semibold border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                        : 'border-zinc-200 hover:bg-zinc-50 text-zinc-800'
                    }`}
                  >
                    <ExternalLink className="w-4 h-4 text-emerald-500" />
                    Mở thử Form Public mẫu
                  </button>
                )}
              </div>
            </div>

            {/* Live Server Link Box */}
            <div
              className={`lg:w-80 p-4 rounded-2xl border shrink-0 space-y-2.5 ${
                darkMode
                  ? 'bg-zinc-950/90 border-zinc-800'
                  : 'bg-zinc-50/90 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between text-xs font-semibold">
                <span className="inline-flex items-center gap-1.5 text-emerald-500">
                  <Wifi className="w-3.5 h-3.5" />
                  {serverInfo?.public_tunnel_url
                    ? 'Public HTTPS Tunnel Đang Chạy'
                    : 'Máy chủ Web Public Đang Chạy'}
                </span>
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              </div>

              <div
                className={`px-3 py-2 rounded-xl font-mono text-[11px] border truncate ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                    : 'bg-white border-zinc-200 text-zinc-800'
                }`}
                title={activeHostDisplay}
              >
                {activeHostDisplay}
              </div>

              <p className="text-[11px] text-zinc-500 leading-relaxed">
                Mỗi biểu mẫu khi tạo sẽ tự động có đường dẫn{' '}
                <code className="font-mono text-indigo-500">/f/ten-khao-sat</code> kèm mã QR để gửi cho mọi người điền.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* GOOGLE FORMS STYLE: START A NEW FORM (TEMPLATE GALLERY) */}
      <section className="max-w-6xl mx-auto px-4 py-4">
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-indigo-500" />
            <h2 className="font-display font-bold text-base">
              Khởi tạo nhanh biểu mẫu (Chọn mẫu có sẵn)
            </h2>
          </div>
          <span className="text-xs text-zinc-500">1-Click tự động tạo &amp; Public</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
          {/* Blank Form Card */}
          <button
            onClick={handleCreateBlankForm}
            disabled={Boolean(creatingId)}
            className={`group text-left p-5 rounded-3xl border-2 border-dashed flex flex-col justify-between min-h-[168px] transition-all cursor-pointer ${
              darkMode
                ? 'border-zinc-800 hover:border-indigo-500 bg-zinc-900/50'
                : 'border-zinc-300 hover:border-indigo-500 bg-white shadow-2xs'
            }`}
          >
            <div className="w-11 h-11 rounded-2xl bg-indigo-500/15 text-indigo-500 flex items-center justify-center group-hover:scale-110 transition-transform">
              {creatingId === 'blank' ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                <FilePlus2 className="w-5 h-5" />
              )}
            </div>
            <div>
              <div className="font-display font-bold text-sm mt-3">Biểu mẫu trống</div>
              <div className="text-[11px] text-zinc-500 mt-0.5">
                Tự thiết kế câu hỏi từ đầu như Google Forms
              </div>
            </div>
          </button>

          {/* Pre-built Templates */}
          {templates.map((tpl) => {
            const banner = CARD_BANNERS[tpl.theme_color] || CARD_BANNERS.indigo;
            return (
              <button
                key={tpl.id}
                onClick={() => handleCreateFromTemplate(tpl)}
                disabled={Boolean(creatingId)}
                className={`group text-left rounded-3xl border overflow-hidden flex flex-col justify-between min-h-[168px] transition-all cursor-pointer hover:-translate-y-0.5 ${
                  darkMode
                    ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                    : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-2xs hover:shadow-md'
                }`}
              >
                <div className={`h-2.5 w-full bg-gradient-to-r ${banner}`} />
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-500">
                      {tpl.category}
                    </span>
                    <h3 className="font-display font-bold text-sm mt-1 line-clamp-2">
                      {tpl.name}
                    </h3>
                  </div>

                  <div className="mt-3 pt-2.5 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-[11px] text-zinc-500">
                    <span>{tpl.questions.length} câu hỏi</span>
                    <span className="inline-flex items-center gap-1 font-semibold text-zinc-900 dark:text-white group-hover:translate-x-0.5 transition-transform">
                      Dùng mẫu <ArrowRight className="w-3 h-3" />
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* MY FORMS & PUBLIC SURVEYS LIST */}
      <section className="max-w-6xl mx-auto px-4 pt-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
          <div>
            <h2 className="font-display font-bold text-lg">
              Danh sách Khảo sát &amp; Link Public đang hoạt động ({filteredForms.length})
            </h2>
            <p className="text-xs text-zinc-500">
              Bấm trực tiếp vào đường link xanh bên dưới mỗi thẻ để mở trang điền khảo sát như người dùng thật
            </p>
          </div>

          <div
            className={`flex items-center gap-2 px-3.5 py-2 rounded-2xl border text-xs sm:w-72 ${
              darkMode
                ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                : 'bg-white border-zinc-200 text-zinc-800'
            }`}
          >
            <Search className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm theo tên hoặc mã KF-..."
              className="bg-transparent outline-none w-full"
            />
          </div>
        </div>

        {loadingInitial ? (
          <div className="py-16 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 animate-spin text-zinc-400" />
            <span className="text-xs text-zinc-500">Đang tải danh sách khảo sát...</span>
          </div>
        ) : filteredForms.length === 0 ? (
          <div
            className={`p-12 rounded-3xl border text-center ${
              darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-white border-zinc-200'
            }`}
          >
            <p className="text-sm font-semibold">Chưa tìm thấy biểu mẫu nào phù hợp</p>
            <button
              onClick={handleCreateBlankForm}
              className="mt-4 px-5 py-2.5 rounded-full text-xs font-semibold bg-indigo-600 text-white cursor-pointer"
            >
              + Tạo biểu mẫu đầu tiên
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {filteredForms.map((form) => {
              const banner = CARD_BANNERS[form.theme_color] || CARD_BANNERS.indigo;
              const fullPublicUrl = getPublicUrlForSlug(form.slug);

              return (
                <div
                  key={form.id}
                  className={`rounded-3xl border overflow-hidden flex flex-col justify-between transition-all ${
                    darkMode
                      ? 'bg-zinc-900/90 border-zinc-800 hover:border-zinc-700'
                      : 'bg-white border-zinc-200 hover:border-zinc-300 shadow-xs'
                  }`}
                >
                  <div>
                    <div className={`h-3 bg-gradient-to-r ${banner}`} />
                    <div className="p-6">
                      {/* Status & Code Badges */}
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-2.5">
                        <div className="flex items-center gap-2">
                          <span
                            className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                              form.is_published
                                ? 'bg-emerald-500/15 text-emerald-500'
                                : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            <Globe className="w-3 h-3" />
                            {form.is_published ? 'Public' : 'Nháp'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-600 dark:text-zinc-300">
                            {form.access_code}
                          </span>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-zinc-500 font-medium">
                          <span className="inline-flex items-center gap-1">
                            <Eye className="w-3.5 h-3.5" /> {form.views_count} lượt xem
                          </span>
                          <span className="inline-flex items-center gap-1 font-bold text-indigo-600 dark:text-indigo-400">
                            <BarChart3 className="w-3.5 h-3.5" /> {form.response_count} phản hồi
                          </span>
                        </div>
                      </div>

                      {/* Title & Description */}
                      <h3
                        onClick={() => {
                          setBuilderTab('questions');
                          setEditingForm(form);
                        }}
                        className="font-display font-bold text-lg leading-snug cursor-pointer hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                      >
                        {form.title}
                      </h3>
                      {form.description && (
                        <p className="text-xs text-zinc-500 mt-1 line-clamp-2">
                          {form.description}
                        </p>
                      )}

                      {/* Direct Visible Public URL Box */}
                      <div
                        className={`mt-4 p-2.5 rounded-2xl border flex items-center justify-between gap-2 ${
                          darkMode
                            ? 'bg-zinc-950 border-zinc-800'
                            : 'bg-emerald-50/60 border-emerald-200/80'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => openPublicSurvey(form.slug)}
                          className="text-left font-mono text-xs text-emerald-600 dark:text-emerald-400 underline truncate cursor-pointer flex-1"
                          title="Bấm để mở trang điền khảo sát Public"
                        >
                          {fullPublicUrl}
                        </button>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => copyPublicLink(form.slug)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold cursor-pointer ${
                              darkMode
                                ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                                : 'bg-white border border-emerald-200 hover:bg-emerald-100 text-emerald-900'
                            }`}
                          >
                            {copiedSlug === form.slug ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" /> Đã chép
                              </>
                            ) : (
                              <>
                                <Copy className="w-3 h-3" /> Chép Link
                              </>
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => openPublicSurvey(form.slug)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-xl text-[11px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer"
                          >
                            Điền thử <ExternalLink className="w-3 h-3" />
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Card Footer Action Bar */}
                  <div
                    className={`px-6 py-3.5 border-t flex flex-wrap items-center justify-between gap-2 ${
                      darkMode
                        ? 'bg-zinc-950/40 border-zinc-800'
                        : 'bg-zinc-50/70 border-zinc-100'
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setBuilderTab('questions');
                          setEditingForm(form);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          darkMode
                            ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200'
                            : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800'
                        }`}
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                        Sửa câu hỏi ({form.questions.length})
                      </button>

                      <button
                        onClick={() => {
                          setBuilderTab('responses');
                          setEditingForm(form);
                        }}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          darkMode
                            ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-200'
                            : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-800'
                        }`}
                      >
                        <BarChart3 className="w-3.5 h-3.5 text-indigo-500" />
                        Kết quả ({form.response_count})
                      </button>

                      <button
                        onClick={() => setShareModalForm(form)}
                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                          darkMode
                            ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-emerald-400'
                            : 'border-zinc-200 bg-white hover:bg-zinc-100 text-emerald-700'
                        }`}
                      >
                        <QrCode className="w-3.5 h-3.5" />
                        QR / Nhúng
                      </button>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => handleDuplicateForm(form.id)}
                        title="Nhân bản khảo sát"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-zinc-900 dark:hover:text-white cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => handleDeleteForm(form)}
                        title="Xóa khảo sát"
                        className="p-1.5 rounded-lg text-zinc-400 hover:text-rose-500 cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Modals */}
      <AuthModal
        open={authModalOpen}
        initialMode={authDefaultMode}
        darkMode={darkMode}
        onClose={() => setAuthModalOpen(false)}
        onSuccess={(u) => {
          setUser(u);
          loadDashboardData();
        }}
      />

      <SharePublishModal
        open={Boolean(shareModalForm)}
        form={shareModalForm}
        serverInfo={serverInfo}
        darkMode={darkMode}
        onClose={() => setShareModalForm(null)}
        onTogglePublish={handleShareTogglePublish}
        onToggleAccepting={handleShareToggleAccepting}
      />
    </div>
  );
}

export default App;
