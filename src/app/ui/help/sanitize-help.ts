import { helpLinkTarget } from './help-index';

/** Elements kept (without attributes) when rendering a help page. */
const KEEP = new Set([
  'a',
  'b',
  'blockquote',
  'br',
  'code',
  'dd',
  'div',
  'dl',
  'dt',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'kbd',
  'li',
  'ol',
  'p',
  'pre',
  'samp',
  'small',
  'span',
  'strong',
  'sub',
  'sup',
  'table',
  'tbody',
  'td',
  'tfoot',
  'th',
  'thead',
  'tr',
  'tt',
  'u',
  'ul',
]);

/** Elements dropped together with their content. Anything else is unwrapped. */
const DROP = new Set([
  'applet',
  'audio',
  'base',
  'button',
  'canvas',
  'embed',
  'form',
  'frame',
  'frameset',
  'head',
  'iframe',
  'img',
  'input',
  'link',
  'math',
  'meta',
  'noscript',
  'object',
  'option',
  'picture',
  'script',
  'select',
  'source',
  'style',
  'svg',
  'template',
  'textarea',
  'title',
  'video',
]);

/**
 * Reduces a help page (spec 09 §1.1) to inert markup: the body's text and basic
 * formatting, no scripts, styles, event handlers, images or other attributes, so
 * the pane can restyle it to the app's typography. Links to other help pages
 * (`ADD.htm`) are kept as `<a href="ADD.htm">` for the pane to navigate in place;
 * every other link becomes plain text.
 */
export function sanitizeHelpHtml(html: string): string {
  const source = new DOMParser().parseFromString(html, 'text/html');
  const target = document.createElement('div');
  copyChildren(source.body, target);
  return target.innerHTML;
}

function copyChildren(from: Node, to: Node): void {
  for (const child of Array.from(from.childNodes)) {
    if (child.nodeType === Node.TEXT_NODE) {
      to.appendChild(document.createTextNode(child.textContent ?? ''));
    } else if (child.nodeType === Node.ELEMENT_NODE) {
      copyElement(child as Element, to);
    }
    // Comments, processing instructions and the like are dropped.
  }
}

function copyElement(element: Element, to: Node): void {
  const tag = element.localName.toLowerCase();
  if (DROP.has(tag)) return;
  if (!KEEP.has(tag)) {
    copyChildren(element, to);
    return;
  }
  if (tag === 'a') {
    const page = helpLinkTarget(element.getAttribute('href') ?? '');
    if (page === null) {
      copyChildren(element, to);
      return;
    }
    const link = document.createElement('a');
    link.setAttribute('href', `${page.toUpperCase()}.htm`);
    copyChildren(element, link);
    to.appendChild(link);
    return;
  }
  const copy = document.createElement(tag);
  copyChildren(element, copy);
  to.appendChild(copy);
}
