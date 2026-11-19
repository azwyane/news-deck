export interface Source {
  name: string;
  pub?: string;
  url?: string;
  kind?: "hn";
  color?: string;
  category?: string;
  desc?: string;
}

export interface Story {
  title: string;
  pub?: string;
  link: string;
  desc: string;
  date: Date;
  src: string;
  thumb?: string;
  pts?: number;
  cmts?: number;
  hn?: string;
  hnSelfPost?: boolean;
  cached?: boolean;
  ai?: string;
  likedAt?: number;
  readAt?: number;
  archivedAt?: number;
}

export interface Note {
  quote: string;
  note: string;
  createdAt: number;
  title?: string;
  src?: string;
}

export interface RadioStation {
  name: string;
  url: string;
  desc?: string;
  category?: string;
  color?: string;
}

export interface AIConfig {
  url: string;
  model: string;
  apiKey?: string;
}

export interface ReadingStats {
  totalRead: number;
  totalTime: number;
  bySource: Record<string, number>;
  byDate: Record<string, number>;
  streak: number;
  lastReadDate: string | null;
}

export interface FeedHealth {
  lastOk?: number;
  lastFail?: number;
  fails?: number;
}

export type View = "All" | "Liked" | "Read" | "Notes" | "Archived" | "Radio" | (string & {});
export type Page = "reader" | "settings" | "assistant" | "sidebar" | "wrapped" | "paste" | "install" | null;
