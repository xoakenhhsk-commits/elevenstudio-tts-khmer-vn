export interface Voice {
  id: string;
  name: string;
  native_name: string;
  language: string;
  language_label: string;
  flag: string;
  gender: 'Female' | 'Male' | string;
  gender_label: string;
  style: string;
  description: string;
  tags: string[];
  gradient: string;
  featured: boolean;
  sample_text: string;
}

export interface GenerationItem {
  id: string;
  title: string;
  text: string;
  voice_id: string;
  voice_name: string;
  language: string;
  gender: string;
  speed: number;
  pitch: number;
  volume: number;
  audio_filename: string;
  srt_filename: string | null;
  audio_url: string;
  srt_url: string | null;
  char_count: number;
  file_size: number;
  duration_est: number;
  is_favorite: boolean;
  created_at: string;
}

export interface ScriptTemplate {
  id: string;
  title: string;
  language: string;
  voice_id: string;
  category: string;
  text: string;
}

export type NavSection = 'tts' | 'voices' | 'history' | 'templates';
export type RightTab = 'settings' | 'history';
