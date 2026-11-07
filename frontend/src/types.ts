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
