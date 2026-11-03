import {
  ArrowLeft,
  AudioLines,
  BookOpenText,
  History,
  Home,
  LogIn,
  LogOut,
  Mic2,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { AuthUser, NavSection } from '../types';
import { BrandLogo } from './BrandLogo';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  onGoLanding: () => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  historyCount: number;
  voiceCount: number;
  user: AuthUser | null;
  onOpenAuth: (mode: 'login' | 'register') => void;
  onLogout: () => void;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  onGoLanding,
  darkMode,
  onToggleDarkMode,
  historyCount,
  voiceCount,
  user,
  onOpenAuth,
  onLogout,
}: SidebarProps) {
  const navItems: {
    id: NavSection;
    label: string;
    sublabel: string;
    icon: typeof AudioLines;
    badge?: string | number;
  }[] = [
    {
      id: 'home',
      label: 'Trang chủ Studio',
      sublabel: 'Tổng quan & Thống kê',
      icon: Home,
    },
    {
      id: 'tts',
      label: 'Text to Speech',
      sublabel: 'Phòng thu giọng nói',
      icon: AudioLines,
    },
    {
      id: 'voices',
      label: 'Voice Library',
      sublabel: 'Khmer & Tiếng Việt',
      icon: Mic2,
      badge: voiceCount,
    },
    {
      id: 'templates',
      label: 'Mẫu kịch bản',
      sublabel: 'TikTok • Review • Tin tức',
      icon: BookOpenText,
    },
    {
      id: 'history',
      label: 'Lịch sử của tôi',
      sublabel: 'MP3 & Phụ đề SRT',
      icon: History,
      badge: historyCount > 0 ? historyCount : undefined,
    },
  ];

  const initials = user
    ? user.full_name
        .split(' ')
        .filter(Boolean)
        .slice(0, 2)
        .map((s) => s[0]?.toUpperCase())
        .join('')
    : '';

  return (
    <aside
      className={`w-66 shrink-0 border-r flex flex-col justify-between transition-colors ${
        darkMode
          ? 'bg-zinc-950 border-zinc-800/80 text-zinc-100'
          : 'bg-zinc-50/80 border-zinc-200 text-zinc-900'
      }`}
    >
      {/* Brand Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-4 px-1">
          <BrandLogo
            darkMode={darkMode}
            size="md"
            showTagline
            onClick={onGoLanding}
          />

          <button
            onClick={onToggleDarkMode}
            title={darkMode ? 'Đổi sang Giao diện Sáng' : 'Đổi sang Giao diện Tối'}
            className={`p-2 rounded-xl border transition-colors cursor-pointer ${
              darkMode
                ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-amber-400'
                : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700 shadow-2xs'
            }`}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        {/* Back to Public Home Link */}
        <button
          onClick={onGoLanding}
          className={`w-full mb-4 px-3 py-2 rounded-xl border text-xs font-semibold flex items-center justify-between transition-colors cursor-pointer ${
            darkMode
              ? 'border-zinc-800/90 bg-zinc-900/40 hover:bg-zinc-900 text-zinc-300'
              : 'border-zinc-200/90 bg-white hover:bg-zinc-100/70 text-zinc-700'
          }`}
        >
          <span className="inline-flex items-center gap-2">
            <ArrowLeft className="w-3.5 h-3.5" />
            Trang giới thiệu Home
          </span>
          <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
        </button>

        {/* Navigation Section Label */}
        <div
          className={`px-2.5 mb-2 text-[11px] font-semibold uppercase tracking-wider ${
            darkMode ? 'text-zinc-500' : 'text-zinc-400'
          }`}
        >
          Không gian làm việc
        </div>

        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = activeSection === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectSection(item.id)}
                className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl text-left transition-all cursor-pointer ${
                  active
                    ? darkMode
                      ? 'bg-zinc-800/90 text-white shadow-sm ring-1 ring-zinc-700/70'
                      : 'bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-200'
                    : darkMode
                      ? 'text-zinc-400 hover:text-zinc-100 hover:bg-zinc-900/70'
                      : 'text-zinc-600 hover:text-zinc-950 hover:bg-zinc-200/50'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Icon
                    className={`w-4 h-4 shrink-0 ${
                      active
                        ? darkMode
                          ? 'text-white'
                          : 'text-zinc-950'
                        : 'text-zinc-500'
                    }`}
                  />
                  <div className="truncate">
                    <div className="text-sm font-semibold leading-tight truncate">
                      {item.label}
                    </div>
                    <div
                      className={`text-[11px] truncate ${
                        darkMode ? 'text-zinc-500' : 'text-zinc-400'
                      }`}
                    >
                      {item.sublabel}
                    </div>
                  </div>
                </div>

                {item.badge !== undefined && (
                  <span
                    className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                      active
                        ? darkMode
                          ? 'bg-zinc-700 text-zinc-100'
                          : 'bg-zinc-900 text-white'
                        : darkMode
                          ? 'bg-zinc-900 text-zinc-400'
                          : 'bg-zinc-200/80 text-zinc-600'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>
      </div>

      {/* Bottom User Account & Auth Card */}
      <div className="p-4 space-y-3">
        {user ? (
          <div
            className={`rounded-2xl p-3.5 border ${
              darkMode
                ? 'bg-zinc-900/70 border-zinc-800'
                : 'bg-white border-zinc-200/90 shadow-2xs'
            }`}
          >
            <div className="flex items-center gap-3">
              <div
                className={`w-9 h-9 rounded-full bg-gradient-to-br ${user.avatar_gradient} text-white text-xs font-bold flex items-center justify-center shrink-0 shadow-xs`}
              >
                {initials || 'U'}
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-bold truncate">{user.full_name}</div>
                <div
                  className={`text-[11px] truncate ${
                    darkMode ? 'text-zinc-400' : 'text-zinc-500'
                  }`}
                >
                  {user.email}
                </div>
              </div>
            </div>

            <div className="mt-3 pt-2.5 border-t border-zinc-500/15 flex items-center justify-between">
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                {user.plan}
              </span>

              <button
                onClick={onLogout}
                className={`inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-lg transition-colors cursor-pointer ${
                  darkMode
                    ? 'text-zinc-400 hover:text-rose-400 hover:bg-zinc-800'
                    : 'text-zinc-600 hover:text-rose-600 hover:bg-zinc-100'
                }`}
              >
                <LogOut className="w-3.5 h-3.5" />
                Đăng xuất
              </button>
            </div>
          </div>
        ) : (
          <div
            className={`rounded-2xl p-3.5 border ${
              darkMode
                ? 'bg-zinc-900/70 border-zinc-800'
                : 'bg-white border-zinc-200/90 shadow-2xs'
            }`}
          >
            <div className="text-xs font-bold">Lưu lịch sử vào tài khoản</div>
            <p
              className={`text-[11px] mt-1 leading-relaxed ${
                darkMode ? 'text-zinc-400' : 'text-zinc-500'
              }`}
            >
              Đăng nhập để lưu trữ riêng các file âm thanh Khmer & Việt Nam của bạn.
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onOpenAuth('login')}
                className={`py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                  darkMode
                    ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                    : 'border-zinc-200 hover:bg-zinc-50 text-zinc-800'
                }`}
              >
                <LogIn className="w-3.5 h-3.5" />
                Đăng nhập
              </button>
              <button
                onClick={() => onOpenAuth('register')}
                className={`py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer ${
                  darkMode
                    ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                    : 'bg-zinc-950 text-white hover:bg-zinc-800'
                }`}
              >
                Đăng ký
              </button>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
