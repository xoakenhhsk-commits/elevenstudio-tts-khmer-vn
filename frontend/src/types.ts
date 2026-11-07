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
  answers: Record<string, unknown>;
  submitted_at: string;
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
