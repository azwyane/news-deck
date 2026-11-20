import { Window } from "happy-dom";

const window = new Window({ url: "https://example.com" });
Object.assign(globalThis, {
  window,
  document: window.document,
  DOMParser: window.DOMParser,
  Node: window.Node,
  HTMLElement: window.HTMLElement,
  location: window.location,
  navigator: window.navigator,
  localStorage: window.localStorage,
});
