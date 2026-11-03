import type { AuthUser, GenerationItem, ScriptTemplate, Voice } from './types';

const TOKEN_STORAGE_KEY = 'kromalabs_auth_token';

// Smart backend URL resolution: works via Vite proxy (/api), direct FastAPI (:8000), or fallback direct URL
let resolvedBaseUrl = '';

const FALLBACK_CANDIDATES = ['', 'http://127.0.0.1:8000', 'http://localhost:8000'];

async function apiFetch(path: string, init?: RequestInit): Promise<Response> {
  const candidates = resolvedBaseUrl
    ? [resolvedBaseUrl, ...FALLBACK_CANDIDATES.filter((c) => c !== resolvedBaseUrl)]
    : FALLBACK_CANDIDATES;

  let lastError: unknown = null;

  for (const base of candidates) {
    try {
      const res = await fetch(`${base}${path}`, init);
      // Vite proxy returns 500/502/504 with empty/text error when backend port 8000 is down
      if (base === '' && (res.status === 502 || res.status === 504)) {
        continue;
      }
      resolvedBaseUrl = base;
      return res;
    } catch (err) {
      lastError = err;
    }
  }

  if (lastError instanceof TypeError) {
    throw new Error(
      'Không thể kết nối máy chủ Backend (cổng 8000). Vui lòng đảm bảo Backend đang chạy!'
    );
  }
  throw lastError instanceof Error
    ? lastError
    : new Error('Lỗi kết nối tới máy chủ KromaLabs API');
}

export function resolveMediaUrl(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith('http://') || url.startsWith('https://')) return url;
  return `${resolvedBaseUrl}${url}`;
}

function normalizeGeneration(item: GenerationItem): GenerationItem {
  return {
    ...item,
    audio_url: resolveMediaUrl(item.audio_url),
    srt_url: item.srt_url ? resolveMediaUrl(item.srt_url) : null,
  };
}

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
  const res = await apiFetch('/api/auth/register', {
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
  const res = await apiFetch('/api/auth/login', {
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
    await apiFetch('/api/auth/logout', {
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
  try {
    const res = await apiFetch('/api/auth/me', {
      headers: authHeaders(),
    });
    if (!res.ok) {
      setStoredToken(null);
      return null;
    }
    const data = await res.json();
    return data.user;
  } catch {
    return null;
  }
}

// ==================== TTS & CATALOG API ====================

export async function fetchVoices(includeAll = false): Promise<Voice[]> {
  const res = await apiFetch(`/api/voices?include_all=${includeAll}`);
  if (!res.ok) throw new Error('Không thể tải danh sách giọng đọc');
  const data = await res.json();
  return data.voices;
}

export async function fetchTemplates(): Promise<ScriptTemplate[]> {
  const res = await apiFetch('/api/templates');
  if (!res.ok) throw new Error('Không thể tải mẫu kịch bản');
  const data = await res.json();
  return data.templates;
}

export async function fetchHistory(): Promise<GenerationItem[]> {
  const res = await apiFetch('/api/history', {
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể tải lịch sử giọng nói');
  const data = await res.json();
  return (data.items || []).map(normalizeGeneration);
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
  const res = await apiFetch('/api/tts/generate', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Lỗi kết nối máy chủ TTS' }));
    throw new Error(err.detail || 'Lỗi khi tạo giọng nói');
  }
  const item: GenerationItem = await res.json();
  return normalizeGeneration(item);
}

export async function previewVoice(voiceId: string): Promise<string> {
  const res = await apiFetch(`/api/voices/${encodeURIComponent(voiceId)}/preview`, {
    method: 'POST',
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Không thể phát mẫu thử' }));
    throw new Error(err.detail || 'Không thể phát mẫu thử');
  }
  const data = await res.json();
  return resolveMediaUrl(data.preview_url);
}

export async function toggleFavoriteItem(id: string): Promise<GenerationItem> {
  const res = await apiFetch(`/api/history/${id}/favorite`, {
    method: 'PATCH',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể cập nhật mục yêu thích');
  const item: GenerationItem = await res.json();
  return normalizeGeneration(item);
}

export async function deleteHistoryItem(id: string): Promise<void> {
  const res = await apiFetch(`/api/history/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể xóa bản ghi');
}

export function getDownloadUrl(id: string, type: 'mp3' | 'srt'): string {
  return resolveMediaUrl(`/api/download/${id}/${type}`);
}
