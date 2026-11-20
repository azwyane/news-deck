import { expect, test } from "bun:test";
import "./setup";
import { askAIChat, getAIConfig, setAIConfig } from "../src/lib/ai";

test("article chat sends prior turns to the chat completions endpoint", async () => {
  const originalFetch = globalThis.fetch;
  const originalConfig = getAIConfig();
  const bodies: Record<string, unknown>[] = [];
  globalThis.fetch = (async (_input: string | URL | Request, init?: RequestInit) => {
    bodies.push(JSON.parse(String(init?.body || "{}")));
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: "ok" } }] }),
    } as Response;
  }) as unknown as typeof fetch;

  try {
    setAIConfig({ url: "http://localhost:1234", model: "test-model" });
    await askAIChat([
      { role: "system", content: "Article: Test\nOnly use this article." },
      { role: "user", content: "What happened?" },
      { role: "assistant", content: "The article says X." },
      { role: "user", content: "Why does it matter?" },
    ]);

    const body = bodies[0];
    const messages = body.messages as { role: string; content: string }[];
    expect(body.model).toBe("test-model");
    expect(messages[0].role).toBe("system");
    expect(messages[1].content).toContain("Only use this article");
    expect(messages.map((message) => message.role)).toEqual(["system", "system", "user", "assistant", "user"]);
  } finally {
    if (originalConfig) setAIConfig(originalConfig);
    else setAIConfig(null);
    globalThis.fetch = originalFetch;
  }
});
