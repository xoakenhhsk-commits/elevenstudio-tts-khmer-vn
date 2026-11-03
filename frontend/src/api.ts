import type { AuthUser, GenerationItem, ScriptTemplate, Voice } from './types';

const TOKEN_STORAGE_KEY = 'kromalabs_auth_token';

export function getStoredToken(): string | null {
  return localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function setStoredToken(token: string | null): void {
  if (token) {
    localStorage.setItem(TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}

function authHeaders(extra?: Record<string, string>): Record<string, string> {
  const headers: Record<string, string> = { ...(extra || {}) };
  const token = getStoredToken();
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
}

// ==================== AUTH API ====================

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export async function registerUser(
  full_name: string,
  email: string,
  password: string
): Promise<AuthResponse> {
  const res = await fetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name, email, password }),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi đăng ký tài khoản' }));
  if (!res.ok) {
    throw new Error(data.detail || 'Không thể đăng ký tài khoản');
  }
  setStoredToken(data.token);
  return data;
}

export async function loginUser(email: string, password: string): Promise<AuthResponse> {
  const res = await fetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi đăng nhập' }));
  if (!res.ok) {
    throw new Error(data.detail || 'Email hoặc mật khẩu không đúng');
  }
  setStoredToken(data.token);
  return data;
}

export async function logoutUser(): Promise<void> {
  try {
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: authHeaders(),
    });
  } finally {
    setStoredToken(null);
  }
}

export async function fetchCurrentUser(): Promise<AuthUser | null> {
  const token = getStoredToken();
  if (!token) return null;
  const res = await fetch('/api/auth/me', {
    headers: authHeaders(),
  });
  if (!res.ok) {
    setStoredToken(null);
    return null;
  }
  const data = await res.json();
  return data.user;
}

// ==================== TTS & CATALOG API ====================

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
  const res = await fetch('/api/history', {
    headers: authHeaders(),
  });
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
    headers: authHeaders({ 'Content-Type': 'application/json' }),
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
  const res = await fetch(`/api/history/${id}/favorite`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể cập nhật mục yêu thích');
  return res.json();
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const res = await fetch(`/api/history/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể xóa bản ghi');
}

export function getDownloadUrl(id: string, type: 'mp3' | 'srt'): string {
  return `/api/download/${id}/${type}`;
}
