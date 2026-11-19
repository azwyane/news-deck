export function sanitizeHtml(html: string): DocumentFragment {
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("script,style,iframe,object,embed,form,link,meta,base,svg,math").forEach((node) => node.remove());
  template.content.querySelectorAll("*").forEach((node) => {
    for (const attr of [...node.attributes]) {
      const name = attr.name.toLowerCase();
      const value = attr.value.trim().toLowerCase();
      const unsafeUrl = (name === "href" || name === "src" || name === "xlink:href") && /^(javascript|data|vbscript):/.test(value);
      if (name.startsWith("on") || name === "style" || name === "srcdoc" || unsafeUrl) node.removeAttribute(attr.name);
    }
    if (node.tagName === "A") {
      node.setAttribute("rel", "noopener noreferrer");
      node.removeAttribute("target");
    }
    if (node.tagName === "IMG") {
      node.setAttribute("loading", "lazy");
      node.setAttribute("referrerpolicy", "no-referrer");
    }
  });
  return template.content;
}

export function stripTags(html: string): string {
  const fragment = sanitizeHtml(html);
  const div = document.createElement("div");
  div.append(fragment);
  return (div.textContent || "").trim();
}
