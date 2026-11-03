import {
  AudioLines,
  BookOpenText,
  History,
  Mic2,
  Moon,
  Sparkles,
  Sun,
} from 'lucide-react';
import type { NavSection } from '../types';

interface SidebarProps {
  activeSection: NavSection;
  onSelectSection: (section: NavSection) => void;
  darkMode: boolean;
  onToggleDarkMode: () => void;
  historyCount: number;
  voiceCount: number;
}

export function Sidebar({
  activeSection,
  onSelectSection,
  darkMode,
  onToggleDarkMode,
  historyCount,
  voiceCount,
}: SidebarProps) {
  const navItems: {
    id: NavSection;
    label: string;
    sublabel: string;
    icon: typeof AudioLines;
    badge?: string | number;
  }[] = [
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
      label: 'Lịch sử tạo file',
      sublabel: 'MP3 & Phụ đề SRT',
      icon: History,
      badge: historyCount > 0 ? historyCount : undefined,
    },
  ];

  return (
    <aside
      className={`w-64 shrink-0 border-r flex flex-col justify-between transition-colors ${
        darkMode
          ? 'bg-zinc-950 border-zinc-800/80 text-zinc-100'
          : 'bg-zinc-50/80 border-zinc-200 text-zinc-900'
      }`}
    >
      {/* Brand Header */}
      <div className="p-4">
        <div className="flex items-center justify-between mb-6 px-1">
          <div className="flex items-center gap-2.5">
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center font-black tracking-tighter text-sm shadow-sm ${
                darkMode
                  ? 'bg-white text-zinc-950'
                  : 'bg-zinc-950 text-white'
              }`}
            >
              II
            </div>
            <div>
              <div className="font-semibold text-sm tracking-tight leading-none">
                ElevenStudio
              </div>
              <div
                className={`text-[11px] mt-0.5 font-medium ${
                  darkMode ? 'text-zinc-400' : 'text-zinc-500'
                }`}
              >
                Khmer • VN Neural AI
              </div>
            </div>
          </div>

          <button
            onClick={onToggleDarkMode}
            title={darkMode ? 'Chuyển sang Giao diện Sáng' : 'Chuyển sang Giao diện Tối'}
            className={`p-2 rounded-lg border transition-colors cursor-pointer ${
              darkMode
                ? 'border-zinc-800 bg-zinc-900 hover:bg-zinc-800 text-zinc-300'
                : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-600'
            }`}
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>

        {/* Navigation Section Label */}
        <div
          className={`px-2.5 mb-2 text-[11px] font-semibold uppercase tracking-wider ${
            darkMode ? 'text-zinc-500' : 'text-zinc-400'
          }`}
        >
          Audio Playground
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
                        : darkMode
                          ? 'text-zinc-500'
                          : 'text-zinc-500'
                    }`}
                  />
                  <div className="truncate">
                    <div className="text-sm font-medium leading-tight truncate">
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

      {/* Bottom Engine Card */}
      <div className="p-4">
        <div
          className={`rounded-2xl p-3.5 border ${
            darkMode
              ? 'bg-zinc-900/70 border-zinc-800'
              : 'bg-white border-zinc-200/90 shadow-xs'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
              Free Neural v2
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              Unlimited
            </span>
          </div>

          <div
            className={`w-full h-1.5 rounded-full overflow-hidden mb-2 ${
              darkMode ? 'bg-zinc-800' : 'bg-zinc-100'
            }`}
          >
            <div className="h-full w-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 rounded-full" />
          </div>

          <p
            className={`text-[11px] leading-relaxed ${
              darkMode ? 'text-zinc-400' : 'text-zinc-500'
            }`}
          >
            Miễn phí 100% không cần API Key. Hỗ trợ giọng{' '}
            <span className="font-medium text-amber-500">🇰🇭 Khmer</span> &{' '}
            <span className="font-medium text-emerald-500">🇻🇳 Việt Nam</span>.
          </p>
        </div>
      </div>
    </aside>
  );
}
