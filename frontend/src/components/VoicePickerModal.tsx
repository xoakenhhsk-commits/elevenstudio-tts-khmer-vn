import { Check, Globe2, Loader2, Play, Search, Square, X } from 'lucide-react';
import { useState } from 'react';
import type { Voice } from '../types';

interface VoicePickerModalProps {
  open: boolean;
  onClose: () => void;
  voices: Voice[];
  selectedVoiceId: string;
  onSelectVoice: (voice: Voice) => void;
  onPreviewVoice: (voice: Voice) => void;
  previewingVoiceId: string | null;
  loadingPreviewId: string | null;
  darkMode: boolean;
  allLoaded: boolean;
  loadingAllVoices: boolean;
  onLoadAllVoices: () => void;
}

export function VoicePickerModal({
  open,
  onClose,
  voices,
  selectedVoiceId,
  onSelectVoice,
  onPreviewVoice,
  previewingVoiceId,
  loadingPreviewId,
  darkMode,
  allLoaded,
  loadingAllVoices,
  onLoadAllVoices,
}: VoicePickerModalProps) {
  const [langFilter, setLangFilter] = useState<'all' | 'km' | 'vi' | 'other'>('all');
  const [search, setSearch] = useState('');

  if (!open) return null;

  const filtered = voices.filter((v) => {
    const matchLang =
      langFilter === 'all'
        ? true
        : langFilter === 'km'
          ? v.language.startsWith('km')
          : langFilter === 'vi'
            ? v.language.startsWith('vi')
            : !v.language.startsWith('km') && !v.language.startsWith('vi');

    const q = search.trim().toLowerCase();
    const matchQuery =
      !q ||
      v.name.toLowerCase().includes(q) ||
      v.native_name.toLowerCase().includes(q) ||
      v.language_label.toLowerCase().includes(q) ||
      v.tags.some((t) => t.toLowerCase().includes(q));

    return matchLang && matchQuery;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4">
      <div
        className={`w-full max-w-3xl max-h-[85vh] rounded-3xl border flex flex-col overflow-hidden shadow-2xl ${
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
          <div>
            <h2 className="text-lg font-semibold">Chọn giọng đọc AI (Voice Library)</h2>
            <p className={`text-xs mt-0.5 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Giọng Neural tự nhiên cho Tiếng Khmer (ភាសាខ្មែរ), Tiếng Việt và Đa ngôn ngữ
            </p>
          </div>
          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              darkMode ? 'hover:bg-zinc-800 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Filters & Search */}
        <div
          className={`px-6 py-3.5 border-b flex flex-wrap items-center justify-between gap-3 ${
            darkMode ? 'border-zinc-800/80 bg-zinc-900/40' : 'border-zinc-100 bg-zinc-50/70'
          }`}
        >
          <div className="flex items-center gap-1.5 flex-wrap">
            {[
              { id: 'all', label: 'Tất cả' },
              { id: 'km', label: '🇰🇭 Tiếng Khmer' },
              { id: 'vi', label: '🇻🇳 Tiếng Việt' },
              { id: 'other', label: '🌐 Quốc tế' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setLangFilter(tab.id as typeof langFilter)}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer ${
                  langFilter === tab.id
                    ? darkMode
                      ? 'bg-white text-zinc-950'
                      : 'bg-zinc-950 text-white'
                    : darkMode
                      ? 'bg-zinc-900 text-zinc-400 hover:text-zinc-200 border border-zinc-800'
                      : 'bg-white text-zinc-600 hover:text-zinc-950 border border-zinc-200'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative flex-1 min-w-[200px] max-w-xs">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-zinc-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Tìm tên giọng, ngôn ngữ, phong cách..."
              className={`w-full pl-9 pr-3 py-1.5 rounded-xl text-xs border outline-none transition-colors ${
                darkMode
                  ? 'bg-zinc-900 border-zinc-800 text-zinc-100 focus:border-zinc-600'
                  : 'bg-white border-zinc-200 text-zinc-900 focus:border-zinc-400'
              }`}
            />
          </div>
        </div>

        {/* Voice List */}
        <div className="p-6 overflow-y-auto space-y-3 flex-1">
          {filtered.map((voice) => {
            const isSelected = voice.id === selectedVoiceId;
            const isPreviewing = previewingVoiceId === voice.id;
            const isLoadingPreview = loadingPreviewId === voice.id;

            return (
              <div
                key={voice.id}
                onClick={() => {
                  onSelectVoice(voice);
                  onClose();
                }}
                className={`p-4 rounded-2xl border flex items-center justify-between gap-4 transition-all cursor-pointer ${
                  isSelected
                    ? darkMode
                      ? 'border-white bg-zinc-900/90'
                      : 'border-zinc-950 bg-zinc-50'
                    : darkMode
                      ? 'border-zinc-800/90 bg-zinc-900/30 hover:bg-zinc-900/80 hover:border-zinc-700'
                      : 'border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50/50'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <div
                    className={`w-11 h-11 rounded-full bg-gradient-to-br ${voice.gradient} shrink-0 flex items-center justify-center text-lg shadow-sm`}
                  >
                    {voice.flag}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-sm">{voice.native_name}</span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          darkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-700'
                        }`}
                      >
                        {voice.gender_label}
                      </span>
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                          voice.language.startsWith('km')
                            ? 'bg-amber-500/15 text-amber-500'
                            : voice.language.startsWith('vi')
                              ? 'bg-emerald-500/15 text-emerald-500'
                              : darkMode
                                ? 'bg-zinc-800 text-zinc-400'
                                : 'bg-zinc-100 text-zinc-600'
                        }`}
                      >
                        {voice.language_label}
                      </span>
                    </div>
                    <p
                      className={`text-xs mt-1 line-clamp-1 ${
                        darkMode ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {voice.description}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onPreviewVoice(voice);
                    }}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                      darkMode
                        ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                        : 'border-zinc-200 bg-white hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    {isLoadingPreview ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : isPreviewing ? (
                      <Square className="w-3.5 h-3.5 fill-current" />
                    ) : (
                      <Play className="w-3.5 h-3.5 fill-current" />
                    )}
                    Nghe thử
                  </button>

                  {isSelected && (
                    <div
                      className={`w-8 h-8 rounded-xl flex items-center justify-center ${
                        darkMode ? 'bg-white text-zinc-950' : 'bg-zinc-950 text-white'
                      }`}
                    >
                      <Check className="w-4 h-4" />
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer: Load 300+ global neural voices */}
        {!allLoaded && (
          <div
            className={`px-6 py-3 border-t flex items-center justify-between ${
              darkMode ? 'border-zinc-800 bg-zinc-900/40' : 'border-zinc-200 bg-zinc-50'
            }`}
          >
            <span className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
              Cần thêm giọng Nhật, Hàn, Pháp, Đức, Anh Anh...?
            </span>
            <button
              onClick={onLoadAllVoices}
              disabled={loadingAllVoices}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-colors cursor-pointer ${
                darkMode
                  ? 'border-zinc-700 bg-zinc-800 hover:bg-zinc-700 text-zinc-100'
                  : 'border-zinc-300 bg-white hover:bg-zinc-100 text-zinc-800'
              }`}
            >
              {loadingAllVoices ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Globe2 className="w-3.5 h-3.5" />
              )}
              Tải toàn bộ 300+ giọng Neural miễn phí
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
