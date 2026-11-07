import {
  Check,
  Code2,
  Copy,
  ExternalLink,
  Globe,
  Hash,
  QrCode,
  Wifi,
  X,
} from 'lucide-react';
import { useState } from 'react';
import type { ServerInfo, SurveyForm } from '../types';

interface SharePublishModalProps {
  open: boolean;
  form: SurveyForm | null;
  serverInfo: ServerInfo | null;
  darkMode: boolean;
  onClose: () => void;
  onTogglePublish: (nextPublished: boolean) => void;
  onToggleAccepting: (nextAccepting: boolean) => void;
}

export function SharePublishModal({
  open,
  form,
  serverInfo,
  darkMode,
  onClose,
  onTogglePublish,
  onToggleAccepting,
}: SharePublishModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'link' | 'qr' | 'embed'>('link');

  if (!open || !form) return null;

  const baseOrigin =
    serverInfo?.public_tunnel_url || window.location.origin;
  const publicUrl = `${baseOrigin}/f/${form.slug}`;
  const lanUrl =
    serverInfo && serverInfo.lan_ip !== '127.0.0.1'
      ? `${serverInfo.lan_url}/f/${form.slug}`
      : null;

  const embedCode = `<iframe src="${publicUrl}" width="100%" height="720" frameborder="0" style="border-radius:16px; border:1px solid #e4e4e7;"></iframe>`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&margin=10&data=${encodeURIComponent(
    lanUrl || publicUrl
  )}`;

  const copyText = (key: string, val: string) => {
    navigator.clipboard.writeText(val);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/55 backdrop-blur-xs p-4">
      <div
        className={`w-full max-w-xl rounded-3xl border overflow-hidden shadow-2xl ${
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
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-500 flex items-center justify-center">
              <Globe className="w-4 h-4" />
            </div>
            <div>
              <h2 className="font-display font-bold text-base">
                Xuất bản & Chia sẻ Link Public
              </h2>
              <p className={`text-xs ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Ai có đường link hoặc mã khảo sát đều có thể điền trực tiếp
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className={`p-2 rounded-xl transition-colors cursor-pointer ${
              darkMode ? 'hover:bg-zinc-900 text-zinc-400' : 'hover:bg-zinc-100 text-zinc-500'
            }`}
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Publish Status Switches */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div>
                <div className="text-xs font-bold">Trạng thái Public</div>
                <div className="text-[11px] text-emerald-500 font-medium">
                  {form.is_published ? 'Đang công khai trên Web' : 'Đang ẩn (Nháp)'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onTogglePublish(!form.is_published)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                  form.is_published ? 'bg-emerald-500' : darkMode ? 'bg-zinc-800' : 'bg-zinc-300'
                }`}
              >
                <div
                  className={`w-5 h-5 rounded-full bg-white transition-transform ${
                    form.is_published ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            <div
              className={`p-3.5 rounded-2xl border flex items-center justify-between ${
                darkMode ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
              }`}
            >
              <div>
                <div className="text-xs font-bold">Nhận câu trả lời</div>
                <div
                  className={`text-[11px] font-medium ${
                    form.accepting_responses ? 'text-emerald-500' : 'text-amber-500'
                  }`}
                >
                  {form.accepting_responses ? 'Đang mở nhận đơn' : 'Đã đóng nhận đơn'}
                </div>
              </div>
              <button
                type="button"
                onClick={() => onToggleAccepting(!form.accepting_responses)}
                className={`w-11 h-6 rounded-full p-0.5 transition-colors cursor-pointer ${
                  form.accepting_responses
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
                    form.accepting_responses
                      ? darkMode
                        ? 'translate-x-5 bg-zinc-950'
                        : 'translate-x-5 bg-white'
                      : 'translate-x-0 bg-white'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Sub-tabs: Link | QR | Embed */}
          <div
            className={`grid grid-cols-3 p-1 rounded-2xl ${
              darkMode ? 'bg-zinc-900' : 'bg-zinc-100'
            }`}
          >
            {[
              { id: 'link', label: 'Link & Mã Code', icon: Globe },
              { id: 'qr', label: 'Mã QR Điện thoại', icon: QrCode },
              { id: 'embed', label: 'Nhúng Website', icon: Code2 },
            ].map((t) => {
              const Icon = t.icon;
              const active = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id as typeof activeTab)}
                  className={`py-2 rounded-xl text-xs font-semibold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                    active
                      ? darkMode
                        ? 'bg-zinc-800 text-white shadow-xs'
                        : 'bg-white text-zinc-950 shadow-xs'
                      : darkMode
                        ? 'text-zinc-400 hover:text-zinc-200'
                        : 'text-zinc-600 hover:text-zinc-950'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {t.label}
                </button>
              );
            })}
          </div>

          {activeTab === 'link' && (
            <div className="space-y-4">
              {/* Primary Public Link */}
              <div>
                <label className="block text-xs font-semibold mb-1.5">
                  Đường dẫn Khảo sát Public trực tiếp
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={publicUrl}
                    className={`flex-1 px-3.5 py-2.5 rounded-xl text-xs font-mono border outline-none ${
                      darkMode
                        ? 'bg-zinc-900 border-zinc-800 text-zinc-200'
                        : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                    }`}
                  />
                  <button
                    onClick={() => copyText('public', publicUrl)}
                    className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-semibold cursor-pointer shrink-0 ${
                      darkMode
                        ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                        : 'bg-zinc-950 text-white hover:bg-zinc-800'
                    }`}
                  >
                    {copiedKey === 'public' ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-500" />
                        Đã chép
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Sao chép
                      </>
                    )}
                  </button>
                  <a
                    href={publicUrl}
                    target="_blank"
                    rel="noreferrer"
                    title="Mở trang khảo sát trong tab mới"
                    className={`p-2.5 rounded-xl border transition-colors ${
                      darkMode
                        ? 'border-zinc-800 hover:bg-zinc-900 text-zinc-300'
                        : 'border-zinc-200 hover:bg-zinc-100 text-zinc-700'
                    }`}
                  >
                    <ExternalLink className="w-4 h-4" />
                  </a>
                </div>
              </div>

              {/* LAN Wi-Fi Link if available */}
              {lanUrl && lanUrl !== publicUrl && (
                <div>
                  <label className="text-xs font-semibold mb-1.5 flex items-center gap-1.5">
                    <Wifi className="w-3.5 h-3.5 text-emerald-500" />
                    Link mở trên Điện thoại / Máy tính cùng mạng Wi-Fi
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={lanUrl}
                      className={`flex-1 px-3.5 py-2 rounded-xl text-xs font-mono border outline-none ${
                        darkMode
                          ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                          : 'bg-zinc-50 border-zinc-200 text-zinc-700'
                      }`}
                    />
                    <button
                      onClick={() => copyText('lan', lanUrl)}
                      className={`px-3 py-2 rounded-xl text-xs font-semibold border cursor-pointer ${
                        darkMode
                          ? 'border-zinc-700 hover:bg-zinc-800 text-zinc-200'
                          : 'border-zinc-200 hover:bg-zinc-100 text-zinc-800'
                      }`}
                    >
                      {copiedKey === 'lan' ? 'Đã chép!' : 'Chép LAN'}
                    </button>
                  </div>
                </div>
              )}

              {/* Short Access Code */}
              <div
                className={`p-4 rounded-2xl border flex items-center justify-between ${
                  darkMode ? 'bg-zinc-900/50 border-zinc-800' : 'bg-zinc-50 border-zinc-200'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Hash className="w-5 h-5 text-indigo-500" />
                  <div>
                    <div className="text-xs font-semibold">Mã truy cập nhanh (Form Code)</div>
                    <div className={`text-[11px] ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                      Người tham gia nhập mã này ngay tại Trang chủ để vào điền đơn
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => copyText('code', form.access_code)}
                  className={`px-3.5 py-1.5 rounded-xl font-mono text-sm font-bold border cursor-pointer ${
                    darkMode
                      ? 'bg-zinc-950 border-zinc-700 text-white'
                      : 'bg-white border-zinc-300 text-zinc-950 shadow-2xs'
                  }`}
                >
                  {copiedKey === 'code' ? 'ĐÃ CHÉP' : form.access_code}
                </button>
              </div>
            </div>
          )}

          {activeTab === 'qr' && (
            <div className="flex flex-col items-center text-center py-2">
              <div className="p-3 bg-white rounded-2xl border border-zinc-200 shadow-sm">
                <img
                  src={qrImageUrl}
                  alt="QR Code khảo sát"
                  className="w-44 h-44 rounded-lg"
                />
              </div>
              <p className="text-xs font-semibold mt-3">{form.title}</p>
              <p className={`text-[11px] mt-1 ${darkMode ? 'text-zinc-400' : 'text-zinc-500'}`}>
                Quét mã QR bằng Camera điện thoại hoặc Zalo để mở trực tiếp biểu mẫu
              </p>
            </div>
          )}

          {activeTab === 'embed' && (
            <div className="space-y-3">
              <label className="block text-xs font-semibold">
                Mã nhúng HTML (&lt;iframe&gt;) gắn vào Website / Blog
              </label>
              <textarea
                rows={4}
                readOnly
                value={embedCode}
                className={`w-full p-3.5 rounded-2xl text-xs font-mono border outline-none resize-none ${
                  darkMode
                    ? 'bg-zinc-900 border-zinc-800 text-zinc-300'
                    : 'bg-zinc-50 border-zinc-200 text-zinc-800'
                }`}
              />
              <button
                onClick={() => copyText('embed', embedCode)}
                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer ${
                  darkMode
                    ? 'bg-white text-zinc-950 hover:bg-zinc-200'
                    : 'bg-zinc-950 text-white hover:bg-zinc-800'
                }`}
              >
                {copiedKey === 'embed' ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-500" />
                    Đã sao chép mã nhúng
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    Sao chép mã HTML
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
