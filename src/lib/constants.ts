import type { Source } from "./types";

export const BUILTIN_SOURCES: Source[] = [
  { name: "ABC News", pub: "ABC", url: "https://www.abc.net.au/news/feed/10719986/rss.xml" },
  { name: "ABC Just In", pub: "ABC", url: "https://www.abc.net.au/news/feed/51120/rss.xml" },
  { name: "SBS News", url: "https://www.sbs.com.au/news/feed" },
  { name: "Guardian AU", url: "https://www.theguardian.com/au/rss" },
  { name: "The Conversation", url: "https://theconversation.com/au/articles.atom" },
  { name: "news.com.au", url: "https://www.news.com.au/feed" },
  { name: "9News", url: "https://www.9news.com.au/feed" },
  { name: "7NEWS", url: "https://7news.com.au/feed" },
  { name: "Sky News AU", url: "https://www.skynews.com.au/feed" },
  { name: "SMH", url: "https://www.smh.com.au/rss/feed.xml" },
  { name: "The Age", url: "https://www.theage.com.au/rss/feed.xml" },
  { name: "AFR", url: "https://www.afr.com/rss/feed.xml" },
  { name: "The Australian", url: "https://www.theaustralian.com.au/feed/" },
  { name: "Crikey", url: "https://www.crikey.com.au/feed/" },
  { name: "Hacker News", pub: "HN", kind: "hn", url: "https://hn.algolia.com/api/v1/search?tags=front_page&hitsPerPage=30" },
];

export const KEYS = {
  customFeeds: "aussieNewsDeck.customFeeds.v1",
  order: "aussieNewsDeck.order.v1",
  liked: "aussieNewsDeck.liked.v1",
  archive: "aussieNewsDeck.archive.v1",
  read: "aussieNewsDeck.read.v1",
  readStories: "aussieNewsDeck.readStories.v1",
  removed: "aussieNewsDeck.removed.v1",
  removedFeeds: "aussieNewsDeck.removedFeeds.v1",
  lastVisit: "aussieNewsDeck.lastVisit",
  deck: "aussieNewsDeck.v1",
  muted: "aussieNewsDeck.muted",
  refreshMode: "aussieNewsDeck.refreshMode",
  stats: "aussieNewsDeck.stats.v1",
  annotations: "aussieNewsDeck.annotations.v1",
  feedHealth: "aussieNewsDeck.feedHealth.v1",
  radio: "aussieNewsDeck.radio.v1",
  unreadOnly: "aussieNewsDeck.unreadOnly",
  font: "aussieNewsDeck.fs",
  uiFont: "aussieNewsDeck.uiFont",
  uiWeight: "aussieNewsDeck.uiWeight",
  uiLineHeight: "aussieNewsDeck.uiLineHeight",
  uiIconScale: "aussieNewsDeck.uiIconScale",
  articleCache: "aussieNewsDeck.articles.v1",
  theme: "aussieTheme",
  fontActive: "aussieFontActive",
  fontUrl: "aussieFontUrl",
  night: "aussieNight",
  ttsRate: "aussieTtsRate",
  aiServer: "aussieAiServer",
  installDismissed: "installDismissed",
} as const;

export const PROXIES = [
  (url: string) => url,
  (url: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.codetabs.com/v1/proxy?quest=${encodeURIComponent(url)}`,
  (url: string) => `https://corsproxy.io/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.cors.lol/?url=${encodeURIComponent(url)}`,
  (url: string) => `https://api.allorigins.win/get?url=${encodeURIComponent(url)}&_json=1`,
  (url: string) => `https://test.cors.workers.dev/?${url}`,
];

export const RSS2JSON = (url: string) => `https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(url)}`;

export const FETCH_TIMEOUT = 9000;
export const FETCH_ALL_TIMEOUT = 75000;
export const DECK_LIMIT = 500;
export const STORY_WINDOW_HOURS = 36;
export const HN_LINKS = /^https:\/\/news\.ycombinator\.com\/item\?id=\d+$/;
export const HN_NAME = "Hacker News";

export const DEFAULT_RADIO = [
  { name: "Triple J", url: "https://streaming.abc-cdn.net.au/audio/hls/triplejnsw.m3u8?source=web", desc: "ABC youth radio — new music, indie, alternative", category: "ABC", color: "#e91e63" },
  { name: "Double J", url: "https://streaming.abc-cdn.net.au/audio/hls/doublejnsw.m3u8?source=web", desc: "Classic alternative and new tracks for music lovers", category: "ABC", color: "#9c27b0" },
  { name: "ABC Radio National", url: "https://streaming.abc-cdn.net.au/audio/hls/rnnsw.m3u8?source=web", desc: "News, current affairs, ideas and culture", category: "ABC", color: "#2196f3" },
  { name: "ABC Classic", url: "https://streaming.abc-cdn.net.au/audio/hls/classicfmnsw.m3u8?source=web", desc: "Classical music, 24/7", category: "ABC", color: "#ff9800" },
  { name: "ABC Classic 2", url: "https://streaming.abc-cdn.net.au/audio/hls/classic2.m3u8?source=web", desc: "Classic and contemporary classical", category: "ABC", color: "#ff5722" },
  { name: "Triple J Hottest", url: "https://streaming.abc-cdn.net.au/audio/hls/triplejhottest.m3u8?source=web", desc: "The Hottest 100 — year-round", category: "ABC", color: "#c2185b" },
  { name: "Triple J Unearthed", url: "https://streaming.abc-cdn.net.au/audio/hls/triplejunearthed.m3u8?source=web", desc: "Unsigned Australian artists", category: "ABC", color: "#ad1457" },
  { name: "Sky News Radio", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/NOVA_SKYNEWSAAC.aac", desc: "Sky News Australia — 24-hour news and talk", category: "News", color: "#f44336" },
  { name: "102.9 Hot Tomato", url: "https://playerservices.streamtheworld.com/api/livestream-redirect/GOL_HOTTOMATO.mp3", desc: "Gold Coast hit music", category: "Commercial", color: "#00bcd4" },
  { name: "SEN Sydney", url: "https://d11fwwlrb0wuhh.cloudfront.net/playlist.m3u8", desc: "Sports Entertainment Network — 24/7 sport", category: "Sports", color: "#4caf50" },
];

export const AI_SYSTEM = "You are a concise Australian news assistant. Answer in plain text, no markdown. Output only the final answer directly. Do not show your reasoning or thinking process.";
