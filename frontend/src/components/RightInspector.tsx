import {
  ChevronRight,
  Download,
  Loader2,
  Play,
  RotateCcw,
  Sliders,
  Square,
  Star,
  Trash2,
} from 'lucide-react';
import { getDownloadUrl } from '../api';
import type { GenerationItem, RightTab, Voice } from '../types';

interface RightInspectorProps {
  activeTab: RightTab;
  onChangeTab: (tab: RightTab) => void;
  selectedVoice: Voice | undefined;
  onOpenVoiceModal: () => void;
  onPreviewSelected: () => void;
  isPreviewingSelected: boolean;
  isLoadingPreviewSelected: boolean;
  speed: number;
  onChangeSpeed: (v: number) => void;
  pitch: number;
  onChangePitch: (v: number) => void;
  volume: number;
  onChangeVolume: (v: number) => void;
  includeSrt: boolean;
  onChangeIncludeSrt: (v: boolean) => void;
  onResetSettings: () => void;
  history: GenerationItem[];
  onPlayTrack: (item: GenerationItem) => void;
  onToggleFavorite: (id: string) => void;
  onDeleteItem: (id: string) => void;
  darkMode: boolean;
}

export function RightInspector({
  activeTab,
  onChangeTab,
  selectedVoice,
  onOpenVoiceModal,
  onPreviewSelected,
  isPreviewingSelected,
  isLoadingPreviewSelected,
  speed,
  onChangeSpeed,
  pitch,
  onChangePitch,
  volume,
  onChangeVolume,
  includeSrt,
  onChangeIncludeSrt,
  onResetSettings,
  history,
  onPlayTrack,
  onToggleFavorite,
  onDeleteItem,
  darkMode,
}: RightInspectorProps) {
  return (
    <aside
      className={`w-88 shrink-0 border-l flex flex-col overflow-hidden transition-colors ${
        darkMode
          ? 'bg-zinc-950 border-zinc-800/80 text-zinc-100'
          : 'bg-white border-zinc-200 text-zinc-900'
      }`}
    >
      {/* Top Tabs: Settings | History (ElevenLabs style) */}
      <div
        className={`px-5 pt-4 border-b flex items-center gap-6 ${
          darkMode ? 'border-zinc-800' : 'border-zinc-200'
        }`}
      >
        <button
          onClick={() => onChangeTab('settings')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors cursor-pointer ${
            activeTab === 'settings'
              ? darkMode
                ? 'border-white text-white'
                : 'border-zinc-950 text-zinc-950'
              : darkMode
                ? 'border-transparent text-zinc-500 hover:text-zinc-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Cài đặt giọng
        </button>

        <button
          onClick={() => onChangeTab('history')}
          className={`pb-3 text-sm font-semibold border-b-2 transition-colors flex items-center gap-1.5 cursor-pointer ${
            activeTab === 'history'
              ? darkMode
                ? 'border-white text-white'
                : 'border-zinc-950 text-zinc-950'
              : darkMode
                ? 'border-transparent text-zinc-500 hover:text-zinc-300'
                : 'border-transparent text-zinc-500 hover:text-zinc-800'
          }`}
        >
          Lịch sử
          {history.length > 0 && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                darkMode ? 'bg-zinc-800 text-zinc-300' : 'bg-zinc-100 text-zinc-700'
              }`}
            >
              {history.length}
            </span>
          )}
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === 'settings' ? (
        <div className="p-5 overflow-y-auto space-y-6 flex-1">
          {/* Voice Selector Card */}
          <div>
            <label
              className={`block text-xs font-semibold mb-2 ${
                darkMode ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              Giọng đọc đang chọn (Voice)
            </label>
            <div
              className={`rounded-2xl border p-3.5 transition-all ${
                darkMode
                  ? 'bg-zinc-900/70 border-zinc-800 hover:border-zinc-700'
                  : 'bg-zinc-50/70 border-zinc-200 hover:border-zinc-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <button
                  onClick={onOpenVoiceModal}
                  className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer"
                >
                  <div
                    className={`w-10 h-10 rounded-full bg-gradient-to-br ${
                      selectedVoice?.gradient || 'from-amber-400 to-rose-500'
                    } flex items-center justify-center text-base shrink-0 shadow-sm`}
                  >
                    {selectedVoice?.flag || '🎙️'}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">
                      {selectedVoice?.native_name || 'Sreymom'}
                    </div>
                    <div
                      className={`text-xs truncate ${
                        darkMode ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      {selectedVoice?.gender_label} • {selectedVoice?.language_label}
                    </div>
                  </div>
                  <ChevronRight className="w-4 h-4 text-zinc-400 shrink-0" />
                </button>
              </div>

              <div className="mt-3 pt-3 border-t border-zinc-500/15 flex items-center justify-between gap-2">
                <button
                  onClick={onPreviewSelected}
                  className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    darkMode
                      ? 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200'
                      : 'bg-white border border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                  }`}
                >
                  {isLoadingPreviewSelected ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : isPreviewingSelected ? (
                    <Square className="w-3.5 h-3.5 fill-current" />
                  ) : (
                    <Play className="w-3.5 h-3.5 fill-current" />
                  )}
                  Nghe mẫu
                </button>

                <button
                  onClick={onOpenVoiceModal}
                  className={`text-xs font-semibold px-2.5 py-1.5 rounded-lg transition-colors cursor-pointer ${
                    darkMode
                      ? 'text-zinc-300 hover:bg-zinc-800'
                      : 'text-zinc-700 hover:bg-zinc-200/60'
                  }`}
                >
                  Đổi giọng khác
                </button>
              </div>
            </div>
          </div>

          {/* Model Card */}
          <div>
            <label
              className={`block text-xs font-semibold mb-2 ${
                darkMode ? 'text-zinc-400' : 'text-zinc-600'
              }`}
            >
              Mô hình tổng hợp (Model)
            </label>
            <div
              className={`rounded-2xl border p-3.5 ${
                darkMode ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50/70 border-zinc-200'
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold">Eleven Multilingual Neural v2</span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500">
                  Miễn phí
                </span>
              </div>
              <p className={`text-[11px] mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Tối ưu hóa dấu câu, ngữ điệu tự nhiên cho tiếng Khmer (km-KH) & Tiếng Việt (vi-VN).
              </p>
            </div>
          </div>

          {/* Speed Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Tốc độ đọc (Speed)</span>
              <span
                className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                  darkMode ? 'bg-zinc-900 text-zinc-200' : 'bg-zinc-100 text-zinc-800'
                }`}
              >
                {speed.toFixed(2)}x
              </span>
            </div>
            <input
              type="range"
              min={0.5}
              max={2.0}
              step={0.05}
              value={speed}
              onChange={(e) => onChangeSpeed(parseFloat(e.target.value))}
              className={`w-full el-slider ${
                darkMode ? 'bg-zinc-800 text-white' : 'bg-zinc-200 text-zinc-950'
              }`}
            />
            <div className="flex items-center justify-between mt-2 gap-1">
              {[
                { label: '0.85x Chậm', val: 0.85 },
                { label: '1.0x Chuẩn', val: 1.0 },
                { label: '1.15x TikTok', val: 1.15 },
                { label: '1.3x Nhanh', val: 1.3 },
              ].map((preset) => (
                <button
                  key={preset.val}
                  onClick={() => onChangeSpeed(preset.val)}
                  className={`text-[10px] font-medium px-2 py-1 rounded-lg border transition-colors cursor-pointer ${
                    Math.abs(speed - preset.val) < 0.01
                      ? darkMode
                        ? 'bg-white text-zinc-950 border-white'
                        : 'bg-zinc-950 text-white border-zinc-950'
                      : darkMode
                        ? 'border-zinc-800 text-zinc-400 hover:text-zinc-200'
                        : 'border-zinc-200 text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  {preset.label}
                </button>
              ))}
            </div>
          </div>

          {/* Pitch Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Cao độ giọng (Pitch)</span>
              <span
                className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                  darkMode ? 'bg-zinc-900 text-zinc-200' : 'bg-zinc-100 text-zinc-800'
                }`}
              >
                {pitch > 0 ? `+${pitch}Hz` : `${pitch}Hz`}
              </span>
            </div>
            <input
              type="range"
              min={-30}
              max={30}
              step={1}
              value={pitch}
              onChange={(e) => onChangePitch(parseInt(e.target.value, 10))}
              className={`w-full el-slider ${
                darkMode ? 'bg-zinc-800 text-white' : 'bg-zinc-200 text-zinc-950'
              }`}
            />
            <div
              className={`flex justify-between text-[11px] mt-1 ${
                darkMode ? 'text-zinc-500' : 'text-zinc-400'
              }`}
            >
              <span>Trầm ấm (-30Hz)</span>
              <span>Mặc định</span>
              <span>Thanh cao (+30Hz)</span>
            </div>
          </div>

          {/* Volume Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold">Âm lượng (Volume Boost)</span>
              <span
                className={`text-xs font-mono font-semibold px-2 py-0.5 rounded-md ${
                  darkMode ? 'bg-zinc-900 text-zinc-200' : 'bg-zinc-100 text-zinc-800'
                }`}
              >
                {volume > 0 ? `+${volume}%` : `${volume}%`}
              </span>
            </div>
            <input
              type="range"
              min={-40}
              max={40}
              step={5}
              value={volume}
              onChange={(e) => onChangeVolume(parseInt(e.target.value, 10))}
              className={`w-full el-slider ${
                darkMode ? 'bg-zinc-800 text-white' : 'bg-zinc-200 text-zinc-950'
              }`}
            />
          </div>

          {/* Subtitle SRT Switch */}
          <div
            className={`p-3.5 rounded-2xl border flex items-center justify-between gap-3 ${
              darkMode ? 'bg-zinc-900/40 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
            }`}
          >
            <div>
              <div className="text-xs font-semibold">Tự động tạo phụ đề .SRT</div>
              <div className={`text-[11px] ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Xuất kèm file căn thời gian cho CapCut
              </div>
            </div>
            <button
              type="button"
              onClick={() => onChangeIncludeSrt(!includeSrt)}
              className={`w-11 h-6 rounded-full transition-colors p-0.5 cursor-pointer ${
                includeSrt
                  ? darkMode
                    ? 'bg-white'
                    : 'bg-zinc-950'
                  : darkMode
                    ? 'bg-zinc-800'
                    : 'bg-zinc-300'
              }`}
            >
              <div
                className={`w-5 h-5 rounded-full transition-transform ${
                  includeSrt
                    ? darkMode
                      ? 'translate-x-5 bg-zinc-950'
                      : 'translate-x-5 bg-white'
                    : 'translate-x-0 bg-white'
                }`}
              />
            </button>
          </div>

          {/* Reset Button */}
          <button
            onClick={onResetSettings}
            className={`w-full py-2.5 rounded-xl border text-xs font-semibold flex items-center justify-center gap-2 transition-colors cursor-pointer ${
              darkMode
                ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-400 hover:text-zinc-200'
                : 'border-zinc-200 hover:bg-zinc-50 text-zinc-600 hover:text-zinc-900'
            }`}
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Đặt lại thông số mặc định
          </button>
        </div>
      ) : (
        /* Recent History Drawer */
        <div className="p-4 overflow-y-auto space-y-2.5 flex-1">
          {history.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center px-4 py-12">
              <Sliders className="w-8 h-8 text-zinc-400 mb-3 opacity-60" />
              <div className="text-sm font-medium">Chưa có bản thu nào</div>
              <p className={`text-xs mt-1 ${darkMode ? 'text-zinc-500' : 'text-zinc-400'}`}>
                Nhập văn bản tiếng Khmer hoặc tiếng Việt và bấm Tạo giọng nói.
              </p>
            </div>
          ) : (
            history.map((item) => (
              <div
                key={item.id}
                className={`p-3.5 rounded-2xl border transition-all ${
                  darkMode
                    ? 'bg-zinc-900/50 border-zinc-800 hover:border-zinc-700'
                    : 'bg-zinc-50/70 border-zinc-200 hover:border-zinc-300'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <button
                    onClick={() => onPlayTrack(item)}
                    className="text-left min-w-0 flex-1 cursor-pointer"
                  >
                    <div className="text-xs font-semibold truncate">{item.title}</div>
                    <div
                      className={`text-[11px] mt-0.5 flex items-center gap-1.5 ${
                        darkMode ? 'text-zinc-400' : 'text-zinc-500'
                      }`}
                    >
                      <span>{item.language.startsWith('km') ? '🇰🇭' : item.language.startsWith('vi') ? '🇻🇳' : '🌐'}</span>
                      <span>{item.voice_name}</span>
                      <span>•</span>
                      <span>{item.speed}x</span>
                    </div>
                  </button>

                  <button
                    onClick={() => onToggleFavorite(item.id)}
                    className="p-1 text-zinc-400 hover:text-amber-400 cursor-pointer"
                  >
                    <Star
                      className={`w-3.5 h-3.5 ${
                        item.is_favorite ? 'fill-amber-400 text-amber-400' : ''
                      }`}
                    />
                  </button>
                </div>

                <div className="mt-2.5 flex items-center justify-between gap-2">
                  <button
                    onClick={() => onPlayTrack(item)}
                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                      darkMode
                        ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                        : 'bg-zinc-950 text-white hover:bg-zinc-800'
                    }`}
                  >
                    <Play className="w-3 h-3 fill-current" />
                    Phát
                  </button>

                  <div className="flex items-center gap-1">
                    <a
                      href={getDownloadUrl(item.id, 'mp3')}
                      download
                      title="Tải MP3"
                      className={`p-1.5 rounded-lg transition-colors ${
                        darkMode ? 'hover:bg-zinc-800 text-zinc-300' : 'hover:bg-zinc-200 text-zinc-700'
                      }`}
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                    <button
                      onClick={() => onDeleteItem(item.id)}
                      title="Xóa"
                      className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                        darkMode ? 'hover:bg-zinc-800 text-zinc-400 hover:text-rose-400' : 'hover:bg-zinc-200 text-zinc-500 hover:text-rose-600'
                      }`}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </aside>
  );
}
