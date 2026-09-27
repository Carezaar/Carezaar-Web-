/** Admin-authored FAQ answers arrive as HTML. Only formatting survives: an allowlist
 *  of tags, no attributes except safe link targets, so a compromised or careless
 *  admin entry cannot run script in the app. */
const ALLOWED = new Set(["P", "BR", "UL", "OL", "LI", "STRONG", "B", "EM", "I", "U", "A", "H3", "H4", "H5", "H6", "SPAN", "DIV"]);

export function sanitizeHtml(html: string): string {
  const doc = new DOMParser().parseFromString(`<div>${html}</div>`, "text/html");
  const clean = (node: Element) => {
    for (const child of [...node.children]) {
      if (!ALLOWED.has(child.tagName)) {
        if (["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "TEMPLATE"].includes(child.tagName)) child.remove();
        else child.replaceWith(...child.childNodes);
        continue;
      }
      const href = child.tagName === "A" ? child.getAttribute("href") ?? "" : "";
      for (const attr of [...child.attributes]) child.removeAttribute(attr.name);
      if (/^(https?:|mailto:|tel:)/i.test(href)) {
        child.setAttribute("href", href);
        child.setAttribute("target", "_blank");
        child.setAttribute("rel", "noopener noreferrer");
      }
      clean(child);
    }
  };
  const root = doc.body.firstElementChild as Element;
  // Unwrapping can surface new elements; repeat until stable.
  let before = "";
  while (before !== root.innerHTML) { before = root.innerHTML; clean(root); }
  return root.innerHTML;
}
