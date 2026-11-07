import type {
  AuthUser,
  FormAnalytics,
  ServerInfo,
  SurveyForm,
  SurveyTemplate,
} from './types';

const TOKEN_STORAGE_KEY = 'kromaforms_auth_token';
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
    throw new Error('Không thể kết nối máy chủ Backend (cổng 8000).');
  }
  throw lastError instanceof Error ? lastError : new Error('Lỗi kết nối API');
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

// ==================== SYSTEM & AUTH ====================

export async function fetchServerInfo(): Promise<ServerInfo> {
  const res = await apiFetch('/api/server-info');
  if (!res.ok) {
    return {
      lan_ip: '127.0.0.1',
      local_url: window.location.origin,
      lan_url: window.location.origin,
      public_tunnel_url: null,
    };
  }
  return res.json();
}

export async function registerUser(
  full_name: string,
  email: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await apiFetch('/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ full_name, email, password }),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi đăng ký tài khoản' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể đăng ký tài khoản');
  setStoredToken(data.token);
  return data;
}

export async function loginUser(
  email: string,
  password: string
): Promise<{ token: string; user: AuthUser }> {
  const res = await apiFetch('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi đăng nhập' }));
  if (!res.ok) throw new Error(data.detail || 'Email hoặc mật khẩu không đúng');
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
  if (!getStoredToken()) return null;
  try {
    const res = await apiFetch('/api/auth/me', { headers: authHeaders() });
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

// ==================== TEMPLATES & FORMS ====================

export async function fetchSurveyTemplates(): Promise<SurveyTemplate[]> {
  const res = await apiFetch('/api/templates');
  if (!res.ok) throw new Error('Không thể tải kho mẫu khảo sát');
  const data = await res.json();
  return data.templates;
}

export async function fetchMyForms(): Promise<SurveyForm[]> {
  const res = await apiFetch('/api/forms', { headers: authHeaders() });
  if (!res.ok) throw new Error('Không thể tải danh sách biểu mẫu');
  const data = await res.json();
  return data.forms;
}

export async function fetchPublicFeed(): Promise<SurveyForm[]> {
  const res = await apiFetch('/api/forms/public-feed');
  if (!res.ok) return [];
  const data = await res.json();
  return data.forms;
}

export async function createSurveyForm(
  payload: Partial<SurveyForm>
): Promise<SurveyForm> {
  const res = await apiFetch('/api/forms', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi tạo biểu mẫu' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tạo biểu mẫu');
  return data;
}

export async function updateSurveyForm(
  formId: string,
  payload: Partial<SurveyForm>
): Promise<SurveyForm> {
  const res = await apiFetch(`/api/forms/${formId}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi lưu biểu mẫu' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể lưu biểu mẫu');
  return data;
}

export async function duplicateSurveyForm(formId: string): Promise<SurveyForm> {
  const res = await apiFetch(`/api/forms/${formId}/duplicate`, {
    method: 'POST',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể nhân bản biểu mẫu');
  return res.json();
}

export async function deleteSurveyForm(formId: string): Promise<void> {
  const res = await apiFetch(`/api/forms/${formId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể xóa biểu mẫu');
}

// ==================== PUBLIC SURVEY & ANALYTICS ====================

export async function fetchPublicSurvey(identifier: string): Promise<SurveyForm> {
  const res = await apiFetch(`/api/public/forms/${encodeURIComponent(identifier)}`);
  const data = await res.json().catch(() => ({ detail: 'Không tìm thấy khảo sát' }));
  if (!res.ok) throw new Error(data.detail || 'Biểu mẫu không tồn tại hoặc đã đóng');
  return data;
}

export async function submitPublicSurvey(
  identifier: string,
  payload: {
    respondent_name?: string;
    respondent_email?: string;
    answers: Record<string, unknown>;
  }
): Promise<{
  submitted: boolean;
  thank_you_message: string;
  allow_public_summary: boolean;
}> {
  const res = await apiFetch(
    `/api/public/forms/${encodeURIComponent(identifier)}/submit`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }
  );
  const data = await res.json().catch(() => ({ detail: 'Lỗi gửi câu trả lời' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể gửi khảo sát');
  return data;
}

export async function fetchFormAnalytics(identifier: string): Promise<FormAnalytics> {
  const res = await apiFetch(`/api/forms/${encodeURIComponent(identifier)}/analytics`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi tải thống kê' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tải dữ liệu thống kê');
  return data;
}

export async function deleteResponseItem(
  formId: string,
  responseId: string
): Promise<void> {
  const res = await apiFetch(`/api/forms/${formId}/responses/${responseId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể xóa phản hồi');
}

export function getCsvExportUrl(formId: string): string {
  return `${resolvedBaseUrl}/api/forms/${formId}/export.csv`;
}
