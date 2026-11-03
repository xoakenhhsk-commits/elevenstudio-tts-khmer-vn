import type { GenerationItem, ScriptTemplate, Voice } from './types';

export async function fetchVoices(includeAll = false): Promise<Voice[]> {
  const res = await fetch(`/api/voices?include_all=${includeAll}`);
  if (!res.ok) throw new Error('Không thể tải danh sách giọng đọc');
  const data = await res.json();
  return data.voices;
}

export async function fetchTemplates(): Promise<ScriptTemplate[]> {
  const res = await fetch('/api/templates');
  if (!res.ok) throw new Error('Không thể tải mẫu kịch bản');
  const data = await res.json();
  return data.templates;
}

export async function fetchHistory(): Promise<GenerationItem[]> {
  const res = await fetch('/api/history');
  if (!res.ok) throw new Error('Không thể tải lịch sử giọng nói');
  const data = await res.json();
  return data.items;
}

export interface GeneratePayload {
  text: string;
  voice_id: string;
  speed: number;
  pitch: number;
  volume: number;
  title?: string;
  include_srt: boolean;
}

export async function generateSpeech(payload: GeneratePayload): Promise<GenerationItem> {
  const res = await fetch('/api/tts/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Lỗi kết nối máy chủ TTS' }));
    throw new Error(err.detail || 'Lỗi khi tạo giọng nói');
  }
  return res.json();
}

export async function previewVoice(voiceId: string): Promise<string> {
  const res = await fetch(`/api/voices/${encodeURIComponent(voiceId)}/preview`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Không thể phát mẫu thử' }));
    throw new Error(err.detail || 'Không thể phát mẫu thử');
  }
  const data = await res.json();
  return data.preview_url;
}

export async function toggleFavoriteItem(id: string): Promise<GenerationItem> {
  const res = await fetch(`/api/history/${id}/favorite`, { method: 'PATCH' });
  if (!res.ok) throw new Error('Không thể cập nhật mục yêu thích');
  return res.json();
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const res = await fetch(`/api/history/${id}`, { method: 'DELETE' });
  if (!res.ok) throw new Error('Không thể xóa bản ghi');
}

export function getDownloadUrl(id: string, type: 'mp3' | 'srt'): string {
  return `/api/download/${id}/${type}`;
}
