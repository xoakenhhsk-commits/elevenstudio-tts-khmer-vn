import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  Loader2,
  Lock,
  Mail,
  ShieldCheck,
  User,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { loginUser, registerUser } from '../api';
import type { AuthUser } from '../types';
import { BrandLogo } from './BrandLogo';

interface AuthModalProps {
  open: boolean;
  initialMode: 'login' | 'register';
  darkMode: boolean;
  onClose: () => void;
  onSuccess: (user: AuthUser) => void;
}

export function AuthModal({
  open,
  initialMode,
  darkMode,
  onClose,
  onSuccess,
}: AuthModalProps) {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (mode === 'register' && fullName.trim().length < 2) {
      setError('Vui lòng nhập họ tên tối thiểu 2 ký tự.');
      return;
    }
    if (!email.includes('@')) {
      setError('Vui lòng nhập địa chỉ email hợp lệ.');
      return;
    }
    if (password.length < 6) {
      setError('Mật khẩu cần tối thiểu 6 ký tự.');
      return;
    }

    try {
      setLoading(true);
      const res =
        mode === 'register'
          ? await registerUser(fullName.trim(), email.trim(), password)
          : await loginUser(email.trim(), password);
      onSuccess(res.user);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lỗi xác thực tài khoản');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div
        className={`w-full max-w-md rounded-3xl border p-7 relative shadow-2xl transition-colors ${
          darkMode
            ? 'bg-zinc-950 border-zinc-800 text-zinc-100'
            : 'bg-white border-zinc-200 text-zinc-900'
        }`}
      >
        <button
          onClick={onClose}
          className={`absolute right-5 top-5 p-2 rounded-xl transition-colors cursor-pointer ${
            darkMode ? 'hover:bg-zinc-900 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
          }`}
        >
          <X className="w-5 h-5" />
        </button>

        <div className="mb-6">
          <BrandLogo darkMode={darkMode} size="md" />
          <h2 className="font-display text-2xl font-bold mt-5">
            {mode === 'login' ? 'Đăng nhập KromaForms' : 'Tạo tài khoản KromaForms'}
          </h2>
          <p className={`text-xs mt-1.5 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
            {mode === 'login'
              ? 'Quản lý biểu mẫu khảo sát, link Public và báo cáo dữ liệu thời gian thực.'
              : 'Miễn phí không giới hạn số lượng biểu mẫu và câu trả lời khảo sát.'}
          </p>
        </div>

        <div
          className={`grid grid-cols-2 p-1 rounded-2xl mb-5 ${
            darkMode ? 'bg-zinc-900' : 'bg-zinc-100'
          }`}
        >
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setError(null);
            }}
            className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              mode === 'login'
                ? darkMode
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'bg-white text-zinc-950 shadow-xs'
                : darkMode
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            Đăng nhập
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setError(null);
            }}
            className={`py-2 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
              mode === 'register'
                ? darkMode
                  ? 'bg-zinc-800 text-white shadow-xs'
                  : 'bg-white text-zinc-950 shadow-xs'
                : darkMode
                  ? 'text-zinc-400 hover:text-zinc-200'
                  : 'text-zinc-600 hover:text-zinc-950'
            }`}
          >
            Đăng ký mới
          </button>
        </div>

        {error && (
          <div className="mb-4 p-3 rounded-2xl bg-rose-500/10 border border-rose-500/25 text-rose-500 text-xs flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          {mode === 'register' && (
            <div>
              <label className="block text-xs font-semibold mb-1.5">Họ và tên</label>
              <div className="relative">
                <User className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Ví dụ: Nguyễn Minh Anh"
                  className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border outline-none transition-colors ${
                    darkMode
                      ? 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-600'
                      : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:border-zinc-900 focus:bg-white'
                  }`}
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold mb-1.5">Email</label>
            <div className="relative">
              <Mail className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="ban@congty.com"
                className={`w-full pl-10 pr-4 py-2.5 rounded-xl text-sm border outline-none transition-colors ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-600'
                    : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:border-zinc-900 focus:bg-white'
                }`}
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-semibold mb-1.5">Mật khẩu</label>
            <div className="relative">
              <Lock className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-zinc-400" />
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Tối thiểu 6 ký tự"
                className={`w-full pl-10 pr-10 py-2.5 rounded-xl text-sm border outline-none transition-colors ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-600'
                    : 'bg-zinc-50/70 border-zinc-200 text-zinc-900 focus:border-zinc-900 focus:bg-white'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600 cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading}
            className={`w-full py-3 rounded-full text-sm font-semibold flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-60 ${
              darkMode
                ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                : 'bg-zinc-950 text-white hover:bg-zinc-800'
            }`}
          >
            {loading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <>
                {mode === 'login' ? 'Đăng nhập vào Studio' : 'Tạo tài khoản & Bắt đầu'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </form>

        <div
          className={`mt-5 pt-4 border-t flex items-center justify-center gap-2 text-[11px] ${
            darkMode ? 'border-zinc-800 text-zinc-500' : 'border-zinc-100 text-zinc-500'
          }`}
        >
          <ShieldCheck className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span>Lưu trữ bảo mật SQLite Database • Miễn phí 100%</span>
        </div>
      </div>
    </div>
  );
}
