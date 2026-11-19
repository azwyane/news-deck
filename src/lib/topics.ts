import type { Story } from "./types";
import { tokenize } from "./format";

export const TOPIC_KEYWORDS: Record<string, string[]> = {
  Politics: ["parliament", "government", "minister", "election", "labor", "liberal", "coalition", "senate", "prime minister", "opposition", "policy", "bill", "mp ", "premier", "cabinet", "treasury", " Albanese", " Dutton", " greens"],
  Tech: ["tech", "technology", "ai", "artificial intelligence", "software", "digital", "cyber", "internet", "app", "data", "google", "apple", "microsoft", "meta", "facebook", "twitter", "social media", "startup", "silicon", "chatgpt", "openai"],
  Sport: ["afl", "nrl", "cricket", "tennis", "soccer", "football", "olympics", "rugby", "league", "union", "golf", "racing", "horse", "f1", "nbl", "basketball", "match", "grand final", "premiership", "world cup"],
  Business: ["economy", "market", "shares", "bank", "rba", "inflation", "budget", "business", "asx", "dollar", "trade", "finance", "investment", "superannuation", "tax", "profit", "revenue", "ipo", "merger"],
  World: ["international", "overseas", "united states", " china", "japan", "europe", " uk", "russia", "ukraine", "israel", "gaza", "palestine", "nato", "united nations", " war", "conflict", "nuclear", "trump", "biden"],
  Climate: ["climate", "emissions", "environment", "renewable", "carbon", "flood", "bushfire", "drought", "net zero", "solar", "wind", " coal", "gas", "energy", "weather", "heatwave"],
  Health: ["health", "hospital", "covid", "medical", "mental", "drug", "vaccine", "doctor", "nurse", "patient", "disease", "cancer", "study", "research", "obesity", "opioid"],
  Crime: ["police", "court", "charged", "arrested", "murder", "assault", "theft", "crime", "prison", "sentence", "verdict", "trial", "judge", "magistrate", "bail", "drug bust"],
};

export const TOPIC_COLORS: Record<string, string> = {
  Politics: "#e74c3c",
  Tech: "#3498db",
  Sport: "#2ecc71",
  Business: "#f39c12",
  World: "#9b59b6",
  Climate: "#27ae60",
  Health: "#e67e22",
  Crime: "#95a5a6",
};

export function classifyTopic(title: string, description = ""): string | null {
  const text = `${title} ${description}`.toLowerCase();
  for (const [topic, keywords] of Object.entries(TOPIC_KEYWORDS)) {
    if (keywords.some((keyword) => text.includes(keyword))) return topic;
  }
  return null;
}

export interface StoryCluster {
  items: Story[];
  pubs: string[];
}

export function clusterStories(stories: Story[]): StoryCluster[] {
  const tokens = stories.map((story) => tokenize(story.title));
  const counts = new Map<string, number>();
  tokens.forEach((set) => set.forEach((token) => counts.set(token, (counts.get(token) || 0) + 1)));
  const total = stories.length;
  const logTotal = Math.log(1 + total);
  const weight = (token: string) => Math.log(1 + total / (counts.get(token) || 1)) / logTotal;
  const clusters: { members: Set<string>[]; items: Story[] }[] = [];
  stories.forEach((story, index) => {
    let match: { members: Set<string>[]; items: Story[] } | undefined;
    let best = 0;
    for (const cluster of clusters) {
      for (const member of cluster.members) {
        let shared = 0;
        let score = 0;
        tokens[index].forEach((token) => {
          if (member.has(token)) {
            shared++;
            score += weight(token);
          }
        });
        if (shared >= 2 && score >= 1.4 && score > best) {
          best = score;
          match = cluster;
        }
      }
    }
    if (match) {
      match.items.push(story);
      match.members.push(tokens[index]);
    } else {
      clusters.push({ members: [tokens[index]], items: [story] });
    }
  });
  return clusters.map((cluster) => ({
    items: cluster.items,
    pubs: [...new Set(cluster.items.map((story) => story.pub || story.src))],
  }));
}

export function makeBriefing(stories: Story[], limit = 6): { multi: StoryCluster[]; latest: StoryCluster[] } {
  const cutoff = Date.now() - 36 * 3600 * 1000;
  let pool = stories.filter((story) => !story.hn);
  let recent = pool.filter((story) => story.date.getTime() >= cutoff);
  if (recent.length < 10) recent = pool;
  recent.sort((a, b) => b.date.getTime() - a.date.getTime());
  const clusters = clusterStories(recent);
  const multi = clusters.filter((cluster) => cluster.pubs.length >= 2).sort((a, b) => b.pubs.length - a.pubs.length || b.items[0].date.getTime() - a.items[0].date.getTime()).slice(0, limit);
  const latest = clusters.filter((cluster) => cluster.pubs.length < 2).slice(0, Math.max(0, limit - multi.length));
  return { multi, latest };
}
