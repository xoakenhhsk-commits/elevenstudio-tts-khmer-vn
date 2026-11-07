import type {
  AuthUser,
  Classroom,
  ClassroomMasterGradebook,
  ClassroomStudent,
  FormAnalytics,
  FormResponseItem,
  LiveGameAvatar,
  LiveGameHostState,
  LiveGamePlayerState,
  LiveGameRoomPublicInfo,
  LiveGameUrls,
  PublicClassroomPortal,
  QuizSubmissionResult,
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

export async function regenerateAgentKey(): Promise<string> {
  const res = await apiFetch('/api/auth/regenerate-agent-key', {
    method: 'POST',
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi tạo mới API Key' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tạo mới Agent Key');
  return data.agent_api_key;
}

// ==================== CLASSROOMS & STUDENT ROSTERS ====================

export async function fetchMyClassrooms(): Promise<Classroom[]> {
  if (!getStoredToken()) return [];
  const res = await apiFetch('/api/classrooms', { headers: authHeaders() });
  if (!res.ok) return [];
  const data = await res.json();
  return data.classrooms || [];
}

export async function createClassroom(payload: {
  name: string;
  subject?: string;
  school_year?: string;
  description?: string;
  theme_color?: string;
  students: (string | Partial<ClassroomStudent>)[];
}): Promise<Classroom> {
  const res = await apiFetch('/api/classrooms', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi tạo lớp học' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tạo lớp học mới');
  return data;
}

export async function updateClassroom(
  classroomId: string,
  payload: {
    name: string;
    subject?: string;
    school_year?: string;
    description?: string;
    theme_color?: string;
    students: (string | Partial<ClassroomStudent>)[];
  }
): Promise<Classroom> {
  const res = await apiFetch(`/api/classrooms/${classroomId}`, {
    method: 'PUT',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi lưu lớp học' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể cập nhật lớp học');
  return data;
}

export async function deleteClassroom(classroomId: string): Promise<void> {
  const res = await apiFetch(`/api/classrooms/${classroomId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể xóa lớp học');
}

export async function fetchClassroomGradebook(
  classroomId: string
): Promise<ClassroomMasterGradebook> {
  const res = await apiFetch(`/api/classrooms/${classroomId}/gradebook`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi tải sổ điểm lớp' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tải sổ điểm tổng hợp lớp');
  return data;
}

export function getClassroomCsvExportUrl(classroomId: string): string {
  const token = getStoredToken();
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${resolvedBaseUrl}/api/classrooms/${classroomId}/export-gradebook.csv${q}`;
}

export async function fetchPublicClassroomPortal(
  roomCode: string
): Promise<PublicClassroomPortal> {
  const res = await apiFetch(`/api/public/classrooms/${encodeURIComponent(roomCode)}`);
  const data = await res.json().catch(() => ({ detail: 'Không tìm thấy phòng lớp học' }));
  if (!res.ok) throw new Error(data.detail || 'Mã lớp học không tồn tại');
  return data;
}

export async function assignFormToClassroom(
  formId: string,
  payload: {
    classroom_id: string | null;
    strict_roster?: boolean;
    max_attempts?: number;
    due_at?: string | null;
  }
): Promise<SurveyForm> {
  const res = await apiFetch(`/api/forms/${formId}/assign-classroom`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi giao bài cho lớp' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể giao bài cho lớp');
  return data;
}

// ==================== TEMPLATES & PRIVATE ACCOUNT FORMS ====================

export async function fetchSurveyTemplates(): Promise<SurveyTemplate[]> {
  const res = await apiFetch('/api/templates');
  if (!res.ok) throw new Error('Không thể tải kho mẫu khảo sát');
  const data = await res.json();
  return data.templates;
}

export async function fetchMyForms(): Promise<SurveyForm[]> {
  if (!getStoredToken()) return [];
  const res = await apiFetch('/api/forms', { headers: authHeaders() });
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

export async function agentGenerateForm(payload: {
  prompt: string;
  question_count: number;
  theme_color: string;
  is_quiz?: boolean;
  is_published?: boolean;
  classroom_id?: string | null;
}): Promise<{ form: SurveyForm; public_url: string; generator_engine: string }> {
  const res = await apiFetch('/api/forms/agent-generate', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi AI Agent tạo form' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tạo biểu mẫu bằng Agent');
  return data;
}

export async function importFormFromCode(payload: {
  code: string;
  theme_color?: string;
  is_quiz?: boolean;
  is_published?: boolean;
  parse_only?: boolean;
  classroom_id?: string | null;
}): Promise<{ form?: SurveyForm; parsed?: Partial<SurveyForm>; public_url?: string }> {
  const res = await apiFetch('/api/forms/import-code', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi biên dịch Code sang Form' }));
  if (!res.ok) throw new Error(data.detail || 'Cú pháp Code không hợp lệ');
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
  const data = await res.json().catch(() => ({ detail: 'Lỗi nhân bản' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể nhân bản biểu mẫu');
  return data;
}

export async function deleteSurveyForm(formId: string): Promise<void> {
  const res = await apiFetch(`/api/forms/${formId}`, {
    method: 'DELETE',
    headers: authHeaders(),
  });
  if (!res.ok) throw new Error('Không thể xóa biểu mẫu');
}

// ==================== PUBLIC SURVEY / EXAM & GRADEBOOK ====================

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
    student_class?: string;
    answers: Record<string, unknown>;
    cheat_count?: number;
    cheat_logs?: string[];
    auto_submitted_cheat?: boolean;
    duration_seconds?: number;
  }
): Promise<{
  submitted: boolean;
  thank_you_message: string;
  allow_public_summary: boolean;
  is_quiz?: boolean;
  show_score_immediately?: boolean;
  pass_score?: number;
  quiz_result?: QuizSubmissionResult | null;
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
  if (!res.ok) throw new Error(data.detail || 'Không thể gửi bài làm');
  return data;
}

export async function fetchPublicSummary(identifier: string): Promise<FormAnalytics> {
  const res = await apiFetch(`/api/public/forms/${encodeURIComponent(identifier)}/summary`);
  const data = await res.json().catch(() => ({ detail: 'Lỗi tải tóm tắt' }));
  if (!res.ok) throw new Error(data.detail || 'Biểu mẫu không công khai thống kê');
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

export async function updateStudentGrade(
  formId: string,
  responseId: string,
  payload: {
    bonus_score?: number;
    final_score?: number;
    teacher_note?: string;
  }
): Promise<FormResponseItem> {
  const res = await apiFetch(`/api/forms/${formId}/responses/${responseId}/grade`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi cập nhật điểm' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể lưu điểm học sinh');
  return data.response;
}

export async function addManualStudentGrade(
  formId: string,
  payload: {
    respondent_name: string;
    student_class?: string;
    final_score: number;
    max_score?: number;
    teacher_note?: string;
  }
): Promise<FormResponseItem> {
  const res = await apiFetch(`/api/forms/${formId}/manual-grade`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi thêm điểm học sinh' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể thêm điểm riêng');
  return data.response;
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
  const token = getStoredToken();
  const q = token ? `?token=${encodeURIComponent(token)}` : '';
  return `${resolvedBaseUrl}/api/forms/${formId}/export.csv${q}`;
}

// ==================== LIVE CLASSROOM GAME ARENA API ====================

export function buildLiveGameWsUrl(
  pin: string,
  role: 'host' | 'player',
  playerId?: string | null
): string {
  const cleanPin = pin.replace(/\D/g, '');
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  let hostPart = window.location.host;
  if (resolvedBaseUrl.startsWith('http://')) {
    hostPart = resolvedBaseUrl.slice('http://'.length);
  } else if (resolvedBaseUrl.startsWith('https://')) {
    hostPart = resolvedBaseUrl.slice('https://'.length);
  }
  const params = new URLSearchParams({ role });
  if (role === 'host') {
    const token = getStoredToken();
    if (token) params.set('auth_token', token);
  } else if (playerId) {
    params.set('player_id', playerId);
  }
  return `${protocol}//${hostPart}/api/live/ws/${encodeURIComponent(cleanPin)}?${params.toString()}`;
}

export async function fetchLiveGameAvatars(): Promise<LiveGameAvatar[]> {
  const res = await apiFetch('/api/live/avatars');
  if (!res.ok) return [];
  const data = await res.json();
  return data.avatars || [];
}

export async function createLiveGameRoom(payload: {
  form_id: string;
  question_time_seconds?: number;
  speed_bonus?: boolean;
  show_options_on_phone?: boolean;
}): Promise<{ room: LiveGameHostState; urls: LiveGameUrls }> {
  const res = await apiFetch('/api/live/rooms', {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi tạo phòng Game Live' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể mở phòng Game Live');
  return data;
}

export async function fetchHostLiveRoomState(
  pin: string
): Promise<{ room: LiveGameHostState; urls: LiveGameUrls }> {
  const res = await apiFetch(`/api/live/rooms/${encodeURIComponent(pin)}/host`, {
    headers: authHeaders(),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi tải phòng Game' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tải trạng thái phòng Game');
  return data;
}

export async function triggerHostLiveAction(
  pin: string,
  action: 'start_game' | 'reveal_answer' | 'show_leaderboard' | 'next_question' | 'finish_game'
): Promise<{ room: LiveGameHostState; urls: LiveGameUrls }> {
  const res = await apiFetch(`/api/live/rooms/${encodeURIComponent(pin)}/action`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ action }),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi điều khiển Game' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể thực hiện thao tác Game');
  return data;
}

export async function updateHostLiveRoomSettings(
  pin: string,
  settings: {
    question_time_seconds?: number;
    speed_bonus?: boolean;
    show_options_on_phone?: boolean;
  }
): Promise<{ room: LiveGameHostState; urls: LiveGameUrls }> {
  const res = await apiFetch(`/api/live/rooms/${encodeURIComponent(pin)}/settings`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(settings),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi cập nhật cài đặt phòng' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể cập nhật cài đặt');
  return data;
}

export async function kickLivePlayer(
  pin: string,
  playerId: string
): Promise<{ room: LiveGameHostState }> {
  const res = await apiFetch(
    `/api/live/rooms/${encodeURIComponent(pin)}/players/${encodeURIComponent(playerId)}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  const data = await res.json().catch(() => ({ detail: 'Lỗi xóa người chơi' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể xóa người chơi');
  return data;
}

export async function saveLiveGameToGradebook(
  pin: string
): Promise<{ saved: boolean; saved_count: number; room: LiveGameHostState }> {
  const res = await apiFetch(
    `/api/live/rooms/${encodeURIComponent(pin)}/save-to-gradebook`,
    {
      method: 'POST',
      headers: authHeaders(),
    }
  );
  const data = await res.json().catch(() => ({ detail: 'Lỗi lưu điểm vào sổ điểm' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể lưu điểm Game vào bảng điểm');
  return data;
}

export async function fetchPublicLiveRoomInfo(
  pin: string
): Promise<LiveGameRoomPublicInfo> {
  const cleanPin = pin.replace(/\D/g, '');
  const res = await apiFetch(`/api/live/rooms/${encodeURIComponent(cleanPin)}/info`);
  const data = await res.json().catch(() => ({ detail: 'Không tìm thấy phòng Game' }));
  if (!res.ok) throw new Error(data.detail || 'Mã PIN phòng Game không tồn tại');
  return data;
}

export async function joinPublicLiveRoom(
  pin: string,
  payload: {
    name: string;
    avatar: string;
    student_class?: string;
    player_token?: string | null;
  }
): Promise<{ player_id: string; player_token: string; state: LiveGamePlayerState }> {
  const cleanPin = pin.replace(/\D/g, '');
  const res = await apiFetch(`/api/live/rooms/${encodeURIComponent(cleanPin)}/join`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi vào phòng Game' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể tham gia phòng Game');
  return data;
}

export async function fetchPlayerLiveRoomState(
  pin: string,
  playerId?: string | null
): Promise<LiveGamePlayerState> {
  const cleanPin = pin.replace(/\D/g, '');
  const q = playerId ? `?player_id=${encodeURIComponent(playerId)}` : '';
  const res = await apiFetch(`/api/live/rooms/${encodeURIComponent(cleanPin)}/state${q}`);
  const data = await res.json().catch(() => ({ detail: 'Lỗi đồng bộ phòng Game' }));
  if (!res.ok) throw new Error(data.detail || 'Phòng Game đã đóng');
  return data.state;
}

export async function submitPublicLiveAnswer(
  pin: string,
  payload: {
    player_id: string;
    player_token: string;
    choice_index: number;
  }
): Promise<{
  accepted: boolean;
  choice_index: number;
  elapsed_ms: number;
  state: LiveGamePlayerState;
}> {
  const cleanPin = pin.replace(/\D/g, '');
  const res = await apiFetch(`/api/live/rooms/${encodeURIComponent(cleanPin)}/answer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({ detail: 'Lỗi gửi đáp án' }));
  if (!res.ok) throw new Error(data.detail || 'Không thể chốt đáp án');
  return data;
}
