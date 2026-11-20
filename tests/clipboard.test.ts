import { expect, test } from "bun:test";
import "./setup";
import { copyText } from "../src/lib/clipboard";

function restoreProperty(target: object, key: string, descriptor?: PropertyDescriptor): void {
  if (descriptor) Object.defineProperty(target, key, descriptor);
  else Reflect.deleteProperty(target, key);
}

test("copyText uses the clipboard API when available", async () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const writes: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: async (text: string) => {
        writes.push(text);
      },
    },
    configurable: true,
    writable: true,
  });

  try {
    expect(await copyText("full selection text")).toBe(true);
    expect(writes).toEqual(["full selection text"]);
  } finally {
    restoreProperty(navigator, "clipboard", originalClipboard);
  }
});

test("copyText falls back to execCommand when clipboard access fails", async () => {
  const originalClipboard = Object.getOwnPropertyDescriptor(navigator, "clipboard");
  const originalExecCommand = Object.getOwnPropertyDescriptor(document, "execCommand");
  const commands: string[] = [];
  Object.defineProperty(navigator, "clipboard", {
    value: {
      writeText: async () => {
        throw new Error("clipboard blocked");
      },
    },
    configurable: true,
    writable: true,
  });
  Object.defineProperty(document, "execCommand", {
    value: (command: string) => {
      commands.push(command);
      return true;
    },
    configurable: true,
    writable: true,
  });

  try {
    expect(await copyText("fallback selection text")).toBe(true);
    expect(commands).toEqual(["copy"]);
    expect(document.querySelector("textarea")).toBeNull();
  } finally {
    restoreProperty(document, "execCommand", originalExecCommand);
    restoreProperty(navigator, "clipboard", originalClipboard);
  }
});
