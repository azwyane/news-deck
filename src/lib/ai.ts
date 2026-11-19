import { signal } from "@preact/signals";
import { AI_SYSTEM, KEYS } from "./constants";
import { normalizeError } from "./format";
import { readJSON, writeJSON } from "./storage";

export interface AIState {
  state: "idle" | "loading" | "ready" | "failed";
  progress: string;
  summary?: string;
  report?: string;
}

export const aiState = signal<AIState>({ state: "idle", progress: "" });

export interface AIConfig {
  url: string;
  model: string;
  apiKey?: string;
}

export function getAIConfig(): AIConfig | null {
  return readJSON<AIConfig | null>(KEYS.aiServer, null);
}

export function setAIConfig(config: AIConfig | null): void {
  if (config) writeJSON(KEYS.aiServer, config);
  else {
    try {
      localStorage.removeItem(KEYS.aiServer);
    } catch { /* ignore */ }
  }
}

export function normalizeServerUrl(value: string): string {
  let url = String(value || "").trim().replace(/\/+$/, "").replace(/\/v1$/, "");
  if (url && !/^https?:\/\//i.test(url)) url = `http://${url}`;
  return url;
}

function messagesFor(prompt: string): { role: string; content: string }[] {
  return [{ role: "system", content: AI_SYSTEM }, { role: "user", content: prompt }];
}

async function request(url: string, options: RequestInit, timeout: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } catch (err) {
    throw new Error((err as Error).name === "AbortError" ? `Server timed out after ${Math.round(timeout / 1000)}s` : "Couldn't reach the server (not listening on the network, wrong address, or CORS not allowed)");
  } finally {
    clearTimeout(timer);
  }
}

function headers(config: AIConfig, json: boolean): Record<string, string> {
  return { ...(json ? { "Content-Type": "application/json" } : {}), ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}) };
}

function withCorsHint(config: AIConfig, err: unknown, streaming: boolean): never {
  const probe = async () => {
    try {
      await request(`${config.url}/v1/models`, { headers: headers(config, false) }, 6000);
      return true;
    } catch {
      return false;
    }
  };
  void probe().then((reachable) => {
    if (reachable) console.warn("AI server is reachable, but POST with JSON was blocked by CORS preflight");
  });
  throw new Error(
    `Server is reachable (GET /v1/models works) but the ${streaming ? "streaming " : ""}POST to /v1/chat/completions is blocked — your server isn't handling the CORS preflight (OPTIONS request) for POST with a JSON body. Fix: for Ollama run \`OLLAMA_HOST=0.0.0.0 OLLAMA_ORIGINS=* ollama serve\`; for llama.cpp add \`--cors '*'\`; for LM Studio enable CORS in Server settings. ${normalizeError(err)}`,
  );
}

function cleanText(value: string): string {
  return String(value)
    .replace(/<think>[\s\S]*?<\/think>/g, "")
    .replace(/<\/?think>/g, "")
    .trim();
}

async function serverChat(config: AIConfig, prompt: string, maxTokens: number, onChunk?: (chunk: string, all: string) => void): Promise<string> {
  const body = JSON.stringify({
    model: config.model,
    max_tokens: maxTokens,
    temperature: 0.3,
    stream: !!onChunk,
    messages: messagesFor(prompt),
    chat_template_kwargs: { enable_thinking: false },
  });
  let response: Response;
  try {
    response = await request(`${config.url}/v1/chat/completions`, { method: "POST", headers: headers(config, true), body }, 90000);
  } catch (err) {
    withCorsHint(config, err, !!onChunk);
  }
  if (!response.ok) throw new Error(`Server returned HTTP ${response.status}${response.status === 404 ? " (check the model name)" : ""}`);
  if (onChunk) {
    if (!response.body) throw new Error("Server did not return a stream");
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let text = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data: ")) continue;
        const data = trimmed.slice(6);
        if (data === "[DONE]") continue;
        try {
          const json = JSON.parse(data);
          const delta = json.choices?.[0]?.delta;
          const chunk = delta?.content || delta?.reasoning_content || "";
          if (chunk) {
            text += chunk;
            onChunk(chunk, cleanText(text));
          }
        } catch { /* ignore malformed SSE row */ }
      }
    }
    return cleanText(text);
  }
  const json = await response.json();
  const choice = json?.choices?.[0];
  const text = choice?.message?.content || choice?.message?.reasoning_content || choice?.message?.thinking || choice?.text || choice?.content || choice?.delta?.content || json?.content || json?.text || json?.response || json?.output || "";
  if (!text) throw new Error(`Server replied 200 OK but no text was found in any expected field. Raw response: ${JSON.stringify(json).slice(0, 300)}`);
  return cleanText(String(text));
}

const RUNTIMES = ["https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1", "https://esm.sh/@huggingface/transformers@3.8.1"];
const HOSTS = [{ name: "huggingface.co", url: "https://huggingface.co/" }, { name: "hf-mirror.com", url: "https://hf-mirror.com/" }];
const MODELS = ["HuggingFaceTB/SmolLM-135M-Instruct", "HuggingFaceTB/SmolLM2-135M-Instruct", "onnx-community/SmolLM2-135M-Instruct-ONNX-GQA"];
const DTYPES: Record<string, string> = { q8: "_quantized", int8: "_int8", q4: "_q4" };

function localHandlerFactory(report: (message: Record<string, unknown>) => void) {
  const errorText = (error: unknown) => String((error as { message?: string; name?: string })?.message || error || "unknown error").slice(0, 300);
  let generator: ((messages: unknown, options: unknown) => Promise<unknown>) | null = null;
  return async function handle(message: Record<string, unknown>) {
    const id = message.id;
    try {
      if (message.type === "load") {
        type Runtime = { pipeline: (...args: unknown[]) => Promise<unknown>; env: { useBrowserCache?: boolean; remoteHost?: string } };
        let runtime: Runtime | null = null;
        for (const url of message.runtimes as string[]) {
          try {
            runtime = await import(/* @vite-ignore */ url) as unknown as Runtime;
            report({ id, type: "step", what: `runtime ${new URL(url).host}`, note: "ok" });
            break;
          } catch (error) {
            report({ id, type: "step", what: `runtime ${new URL(url).host}`, note: errorText(error) });
          }
        }
        if (!runtime) throw new Error("Couldn't load the AI runtime from any CDN.");
        const env = runtime.env;
        if (!message.useCache) env.useBrowserCache = false;
        env.remoteHost = String(message.host || "");
        for (const candidate of message.candidates as { model: string; dtype: string }[]) {
          try {
            report({ id, type: "progress", text: "Downloading model…" });
            let last = 0;
            generator = await runtime.pipeline("text-generation", candidate.model, {
              device: "wasm",
              dtype: candidate.dtype,
              progress_callback: (progress: { status?: string; total?: number; progress?: number; loaded?: number }) => {
                const now = Date.now();
                if (progress.status === "progress" && (progress.total || 0) > 5e6 && now - last > 250) {
                  last = now;
                  report({ id, type: "progress", text: `Downloading model ${Math.round(progress.progress || 0)}% (${Math.round((progress.loaded || 0) / 1e6)}/${Math.round((progress.total || 0) / 1e6)} MB)` });
                } else if (progress.status === "ready") report({ id, type: "progress", text: "Starting model…" });
              },
            }) as typeof generator;
            report({ id, type: "step", what: `load ${candidate.model} [${candidate.dtype}]`, note: "ok" });
            break;
          } catch (error) {
            report({ id, type: "step", what: `load ${candidate.model} [${candidate.dtype}]`, note: errorText(error) });
          }
        }
        if (!generator) throw new Error("The model files were reachable but the model failed to load.");
        report({ id, type: "done" });
      } else if (message.type === "generate") {
        if (!generator) throw new Error("Model isn't loaded.");
        report({ id, type: "done", out: await generator(message.messages, message.opts) });
      }
    } catch (error) {
      report({ id, type: "error", error: errorText(error) });
    }
  };
}

interface Pending { resolve: (value: Record<string, unknown>) => void; reject: (error: Error) => void; onProgress?: (text: string) => void }
let worker: Worker | null = null;
let workerUrl = "";
let localHandler: ReturnType<typeof localHandlerFactory> | null = null;
const pending = new Map<number, Pending>();
let sequence = 0;

function handleMessage(message: Record<string, unknown>): void {
  const id = Number(message.id);
  const entry = pending.get(id);
  if (!entry) return;
  if (message.type === "progress") {
    entry.onProgress?.(String(message.text || ""));
    return;
  }
  pending.delete(id);
  if (message.type === "error") entry.reject(new Error(String(message.error || "AI failed")));
  else entry.resolve(message);
}

function dispatch(message: Record<string, unknown>, onProgress?: (text: string) => void): Promise<Record<string, unknown>> {
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject, onProgress });
    try {
      if (worker) worker.postMessage({ ...message, id });
      else void localHandler?.({ ...message, id });
    } catch (error) {
      pending.delete(id);
      reject(error as Error);
    }
  });
}

function stopEngine(): void {
  worker?.terminate();
  worker = null;
  if (workerUrl) URL.revokeObjectURL(workerUrl);
  workerUrl = "";
  localHandler = null;
  pending.forEach((entry) => entry.reject(new Error("AI engine stopped")));
  pending.clear();
}

function extractGenerated(output: unknown): string {
  const first = (output as { generated_text?: unknown })?.generated_text;
  const content = Array.isArray(first) ? first[first.length - 1]?.content : first;
  const text = String(content || "").split("<|im_end|>")[0].trim();
  const sentence = text.match(/^(.+?[.!?])(\s|$)/);
  return sentence && sentence[1].split(" ").length >= 4 ? sentence[1] : text.split(" ").slice(0, 30).join(" ");
}

let localPromise: Promise<void> | null = null;

async function initLocalAI(): Promise<void> {
  if (localPromise) return localPromise;
  aiState.value = { state: "loading", progress: "Checking connection…" };
  const steps: string[] = [];
  const setProgress = (text: string) => { aiState.value = { state: "loading", progress: text }; };
  localPromise = (async () => {
    try {
      const reachable: { model: string; dtype: string }[] = [];
      for (const host of HOSTS) {
        const probes = MODELS.flatMap((model) => Object.keys(DTYPES).map((dtype) => ({ model, dtype, file: `${DTYPES[dtype]}.onnx` })));
        const results = await Promise.all(probes.map(async (probe) => {
          try {
            const response = await fetch(`${host.url}${probe.model}/resolve/main/onnx/model${probe.file}`);
            return { ...probe, ok: response.ok };
          } catch {
            return { ...probe, ok: false };
          }
        }));
        results.forEach((result) => steps.push(`probe ${host.name}/${result.model} [${result.dtype}] ${result.ok ? "reachable" : "unreachable"}`));
        reachable.push(...results.filter((result) => result.ok).map(({ model, dtype }) => ({ model, dtype })));
        if (reachable.length) break;
      }
      if (!reachable.length) throw new Error("Can't reach the model host (huggingface.co or hf-mirror.com) from this page.");
      setProgress("Loading runtime…");
      const message = { type: "load", runtimes: RUNTIMES, host: HOSTS[0].url, candidates: reachable.slice(0, 3), useCache: /^https?:$/.test(location.protocol) };
      let engine = "main thread";
      try {
        const source = `const handle = (${localHandlerFactory.toString()})(m => postMessage(m)); onmessage = e => handle(e.data);`;
        workerUrl = URL.createObjectURL(new Blob([source], { type: "text/javascript" }));
        worker = new Worker(workerUrl, { type: "module" });
        worker.onmessage = (event: MessageEvent) => handleMessage(event.data);
        worker.onerror = (event) => {
          event.preventDefault();
          pending.forEach((entry) => entry.reject(new Error("AI worker error")));
          pending.clear();
        };
        await dispatch(message, setProgress);
        engine = "web worker";
      } catch (error) {
        steps.push(`worker: ${normalizeError(error)} — falling back to the main thread`);
        stopEngine();
        localHandler = localHandlerFactory((data) => handleMessage(data));
        await dispatch(message, setProgress);
      }
      steps.push(`engine: ${engine}`);
      aiState.value = { state: "ready", progress: "" };
    } catch (error) {
      stopEngine();
      const summary = normalizeError(error);
      aiState.value = { state: "failed", progress: "", summary, report: ["Aussie News Deck — AI load report", `time: ${new Date().toISOString()}`, `page: ${location.protocol}//${location.host || ""}`, `online: ${navigator.onLine}`, `result: ${summary}`, ...steps.map((step) => ` - ${step}`)].join("\n") };
      throw error;
    } finally {
      localPromise = null;
    }
  })();
  return localPromise;
}

export async function askAI(prompt: string, maxTokens = 300, onChunk?: (chunk: string, all: string) => void): Promise<string> {
  const config = getAIConfig();
  if (config?.url) return serverChat(config, prompt, maxTokens, onChunk);
  await initLocalAI();
  const result = await dispatch({ type: "generate", messages: messagesFor(prompt), opts: { max_new_tokens: maxTokens, repetition_penalty: 1.1 } }, onChunk ? (text) => onChunk(text, text) : undefined);
  return extractGenerated(result.out);
}

export async function testAIConfig(config: AIConfig): Promise<{ ok: boolean; models: string[]; message: string }> {
  const response = await request(`${config.url}/v1/models`, { headers: headers(config, false) }, 8000);
  if (!response.ok) throw new Error(`Server returned HTTP ${response.status} for /v1/models — is this an OpenAI-compatible server?`);
  const json = await response.json();
  const models: string[] = (json?.data || []).map((model: { id?: string }) => model.id).filter(Boolean);
  if (!config.model) {
    config.model = models[0] || "";
    if (!config.model) throw new Error("Connected, but the server lists no models — pull one first and enter its name.");
  }
  const chat = await request(`${config.url}/v1/chat/completions`, {
    method: "POST",
    headers: headers(config, true),
    body: JSON.stringify({ model: config.model, max_tokens: 5, temperature: 0, stream: false, messages: messagesFor("Reply with the single word: ok") }),
  }, 30000);
  if (!chat.ok) throw new Error(`POST returned HTTP ${chat.status}`);
  return { ok: true, models, message: `Connected ✓ ${models.length} model(s): ${models.slice(0, 4).join(", ")} · chat POST works` };
}

export async function summarizeText(text: string, onChunk?: (chunk: string, all: string) => void): Promise<string> {
  return askAI(`Summarize this article in four short plain-text sentences. Do not use markdown.\n\n${text.slice(0, 12000)}`, 260, onChunk);
}

export async function socraticSummary(title: string, text: string, onChunk?: (chunk: string, all: string) => void): Promise<string> {
  return askAI(`Read this article and give a Socratic study guide: 3 key ideas as short questions with one-sentence answers. Plain text only, no markdown.\n\nTitle: ${title}\n\n${text.slice(0, 12000)}`, 340, onChunk);
}

export async function findConnections(title: string, text: string, headlines: string[]): Promise<string> {
  return askAI(`Which of these other headlines connect to this article? Reply with at most three numbered headlines from the list, or "None". Plain text only.\n\nArticle: ${title}\n${text.slice(0, 5000)}\n\nHeadlines:\n${headlines.slice(0, 40).map((headline) => `- ${headline}`).join("\n")}`, 180);
}

export async function chatAboutArticle(question: string, title: string, text: string, onChunk?: (chunk: string, all: string) => void): Promise<string> {
  return askAI(`Answer this question using only the article below. Plain text only.\n\nQuestion: ${question}\n\nArticle: ${title}\n${text.slice(0, 10000)}`, 240, onChunk);
}

