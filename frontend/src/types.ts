export type QuestionType =
  | 'short_text'
  | 'long_text'
  | 'single_choice'
  | 'multiple_choice'
  | 'dropdown'
  | 'rating'
  | 'date'
  | 'email';

export type ThemeColor = 'indigo' | 'emerald' | 'violet' | 'rose' | 'amber' | 'zinc';

export interface ClassroomStudent {
  id: string;
  name: string;
  student_code: string;
  bonus_points: number;
  note: string;
}

export interface Classroom {
  id: string;
  user_id?: string;
  room_code: string;
  name: string;
  subject: string;
  school_year: string;
  description: string;
  theme_color: ThemeColor | string;
  students: ClassroomStudent[];
  student_names: string[];
  student_count: number;
  assigned_forms_count: number;
  created_at: string;
  updated_at: string;
}

export interface ClassroomAssignedFormSummary {
  id: string;
  title: string;
  slug: string;
  access_code: string;
  is_quiz: boolean;
  is_published: boolean;
  accepting_responses: boolean;
  time_limit_minutes: number;
  anti_cheat_enabled: boolean;
  due_at?: string | null;
  response_count: number;
  question_count: number;
}

export interface ClassroomMasterStudentRow {
  id: string;
  student_code: string;
  name: string;
  bonus_points: number;
  note: string;
  submitted_count: number;
  total_forms: number;
  total_cheats: number;
  scores_by_form: Record<string, number | null>;
  average_score_10: number | null;
  academic_rank: string;
}

export interface ClassroomMasterGradebook {
  classroom: Classroom;
  assigned_forms: ClassroomAssignedFormSummary[];
  student_rows: ClassroomMasterStudentRow[];
  class_average_10: number | null;
}

export interface PublicClassroomAssignment {
  id: string;
  slug: string;
  access_code: string;
  title: string;
  description: string;
  theme_color: string;
  is_quiz: boolean;
  accepting_responses: boolean;
  time_limit_minutes: number;
  anti_cheat_enabled: boolean;
  due_at?: string | null;
  is_past_due?: boolean;
  question_count: number;
  response_count: number;
  created_at: string;
}

export interface PublicClassroomPortal {
  id: string;
  room_code: string;
  name: string;
  subject: string;
  school_year: string;
  description: string;
  theme_color: string;
  student_names: string[];
  student_count: number;
  assignments: PublicClassroomAssignment[];
  active_live_game?: {
    pin: string;
    title: string;
    status: string;
    player_count: number;
    host_name: string;
  } | null;
}

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  description: string;
  required: boolean;
  options: string[];
  max_rating?: number;
  points?: number;
  correct_answer?: string | string[] | null;
  explanation?: string;
}

export interface SurveyForm {
  id: string;
  user_id?: string | null;
  classroom_id?: string | null;
  classroom_name?: string | null;
  classroom_room_code?: string | null;
  classroom_subject?: string | null;
  slug: string;
  access_code: string;
  title: string;
  description: string;
  theme_color: ThemeColor | string;
  thank_you_message: string;
  is_published: boolean;
  accepting_responses: boolean;
  collect_email: boolean;
  allow_public_summary: boolean;
  is_quiz: boolean;
  time_limit_minutes: number;
  anti_cheat_enabled: boolean;
  max_violations: number;
  show_score_immediately: boolean;
  shuffle_questions: boolean;
  strict_roster: boolean;
  student_roster: string[];
  max_attempts?: number;
  due_at?: string | null;
  is_past_due?: boolean;
  pass_score?: number;
  questions: Question[];
  views_count: number;
  response_count: number;
  created_at: string;
  updated_at: string;
}

export interface SurveyTemplate {
  id: string;
  name: string;
  category: string;
  theme_color: ThemeColor | string;
  is_quiz?: boolean;
  time_limit_minutes?: number;
  anti_cheat_enabled?: boolean;
  max_violations?: number;
  show_score_immediately?: boolean;
  shuffle_questions?: boolean;
  strict_roster?: boolean;
  student_roster?: string[];
  title: string;
  description: string;
  thank_you_message: string;
  questions: Question[];
}

export interface FormResponseItem {
  id: string;
  form_id: string;
  respondent_name: string | null;
  respondent_email: string | null;
  student_class?: string | null;
  answers: Record<string, unknown>;
  auto_score?: number | null;
  max_score?: number | null;
  bonus_score?: number;
  final_score?: number | null;
  teacher_note?: string | null;
  cheat_count?: number;
  cheat_logs?: string[];
  auto_submitted_cheat?: boolean;
  duration_seconds?: number;
  submitted_at: string;
}

export interface QuizQuestionResult {
  question_id: string;
  title: string;
  user_answer: unknown;
  correct_answer: string | string[] | null;
  is_correct: boolean | null;
  earned_points: number;
  max_points: number;
  explanation: string;
}

export interface QuizSubmissionResult {
  auto_score: number;
  max_score: number;
  score_10: number;
  correct_count: number;
  gradable_count: number;
  question_results: QuizQuestionResult[];
}

export interface RosterGradebookEntry {
  student_name: string;
  submitted: boolean;
  response_id: string | null;
  student_class: string | null;
  auto_score: number | null;
  bonus_score: number;
  final_score: number | null;
  max_score: number | null;
  score_10: number | null;
  cheat_count: number;
  auto_submitted_cheat: boolean;
  duration_seconds: number;
  teacher_note: string | null;
  submitted_at: string | null;
}

export interface DistributionBar {
  label: string;
  count: number;
  percent: number;
}

export interface TopStudentItem {
  id: string;
  name: string;
  student_class: string;
  score_10: number;
  duration_seconds: number;
  cheat_count: number;
}

export interface QuestionStat {
  question_id: string;
  title: string;
  type: QuestionType | string;
  answered_count: number;
  points?: number;
  correct_answer?: string | string[] | null;
  correct_rate?: number | null;
  distribution?: DistributionBar[];
  average_rating?: number;
  max_rating?: number;
  text_answers?: string[];
}

export interface FormAnalytics {
  form: SurveyForm;
  total_responses: number;
  views_count: number;
  completion_rate: number;
  average_score_10?: number | null;
  highest_score_10?: number | null;
  pass_rate?: number | null;
  score_distribution?: DistributionBar[];
  top_students?: TopStudentItem[];
  flagged_cheat_count?: number;
  roster_gradebook?: RosterGradebookEntry[];
  question_stats: QuestionStat[];
  responses: FormResponseItem[];
}

export interface ServerInfo {
  lan_ip: string;
  local_url: string;
  lan_url: string;
  public_tunnel_url: string | null;
}

export interface AuthUser {
  id: string;
  full_name: string;
  email: string;
  avatar_gradient: string;
  plan: string;
  agent_api_key?: string;
  created_at: string;
  last_login_at: string | null;
}

// ==================== LIVE CLASSROOM GAME ARENA TYPES ====================

export type LiveGameStatus =
  | 'lobby'
  | 'countdown'
  | 'question'
  | 'reveal'
  | 'leaderboard'
  | 'podium';

export interface LiveGameAvatar {
  id: string;
  emoji: string;
  label: string;
  bg: string;
}

export interface LiveGameUrls {
  play_url: string;
  lobby_url: string;
  lan_play_url: string;
  local_play_url: string;
}

export interface LiveGameHostPlayer {
  id: string;
  name: string;
  avatar: string;
  student_class: string;
  score: number;
  streak: number;
  best_streak: number;
  correct_count: number;
  score_10: number;
  rank: number;
  previous_rank: number;
  answered_current: boolean;
  current_answer?: {
    choice_index: number | null;
    is_correct: boolean;
    points_earned: number;
    elapsed_ms: number;
  } | null;
}

export interface LiveGameHostState {
  pin: string;
  form_id: string;
  form_slug: string;
  title: string;
  classroom_id?: string | null;
  classroom_name?: string | null;
  host_name: string;
  status: LiveGameStatus;
  question_time_seconds: number;
  speed_bonus: boolean;
  show_options_on_phone: boolean;
  current_question_index: number;
  total_questions: number;
  remaining_ms: number;
  player_count: number;
  answered_count: number;
  saved_to_gradebook: boolean;
  saved_count: number;
  current_question: {
    id: string;
    index: number;
    title: string;
    description: string;
    options: string[];
    correct_index: number | null;
    explanation: string;
    option_counts: number[];
  };
  players: LiveGameHostPlayer[];
}

export interface LiveGameRoomPublicInfo {
  pin: string;
  title: string;
  classroom_name?: string | null;
  student_roster: string[];
  host_name: string;
  status: LiveGameStatus;
  player_count: number;
  total_questions: number;
  avatars: LiveGameAvatar[];
}

export interface LiveGamePlayerState {
  pin: string;
  title: string;
  classroom_name?: string | null;
  student_roster: string[];
  host_name: string;
  status: LiveGameStatus;
  show_options_on_phone: boolean;
  current_question_index: number;
  total_questions: number;
  question_time_seconds: number;
  remaining_ms: number;
  player_count: number;
  current_question: {
    id: string;
    index: number;
    option_count: number;
    title: string;
    options: string[];
    correct_index: number | null;
    explanation: string;
  };
  me: {
    id: string;
    name: string;
    avatar: string;
    student_class: string;
    score: number;
    streak: number;
    best_streak: number;
    correct_count: number;
    score_10: number;
    rank: number;
    previous_rank: number;
    has_answered: boolean;
    choice_index: number | null;
    last_result?: {
      is_correct: boolean;
      points_earned: number;
      elapsed_ms: number;
    } | null;
  } | null;
  top_players: {
    id: string;
    name: string;
    avatar: string;
    score: number;
    streak: number;
    rank: number;
    score_10: number;
  }[];
}
