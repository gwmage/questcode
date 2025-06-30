const fs = require('fs');
const path = require('path');

const newContent = `
import { Page, ElementHandle } from 'playwright';
import { PageElement, ElementType } from './types';

// This function is no longer simplifying as much, but renaming it would be a larger refactor.
// It now passes most of the rich context to the AI.
function formatForAi(element: PageElement): any {
  const simplifiedChildren = element.children.map(formatForAi);

  const result: any = {
    type: element.type,
    name: element.name,
    locator: element.locator,
    isClickable: element.isClickable,
    html: element.html, // Pass the raw HTML snippet
  };

  if (simplifiedChildren.length > 0) {
    result.children = simplifiedChildren;
  }
  return result;
}

// Evaluates an element in the browser context to get its name
function getElementName(element: ElementHandle): Promise<string> {
  return element.evaluate((el: HTMLElement) => { // Explicitly type el as HTMLElement
    const a = (s: string | null): string => (s || '').trim();
    return a(el.getAttribute('aria-label')) || a(el.textContent) || a(el.getAttribute('placeholder')) || a(el.getAttribute('name')) || a(el.id);
  });
}

// Recursively builds a tree of PageElement objects from the DOM
export async function buildElementTree(
  page: Page,
  element: ElementHandle<HTMLElement | SVGElement>,
  idCounter: { next: number },
  parentId?: number,
): Promise<PageElement | null> {
  const elementInfo = await element.evaluate((el: HTMLElement) => {
    const tagName = el.tagName.toLowerCase();

    // 1. Filter out non-essential or invisible elements
    if (
      ['script', 'style', 'meta', 'link', 'head', 'noscript'].includes(tagName)
    )
      return null;

    const style = window.getComputedStyle(el);
    if (
      style.display === 'none' ||
      style.visibility === 'hidden' ||
      parseFloat(style.opacity) < 0.1 ||
      parseFloat(style.width) < 1 ||
      parseFloat(style.height) < 1
    ) {
      return null;
    }

    // Heuristic to ignore empty, purely stylistic containers
    if (
      (el.tagName === 'DIV' || el.tagName === 'SPAN') &&
      !el.children.length &&
      (el.textContent || '').trim().length < 2 &&
      !el.getAttribute('role') &&
      !el.getAttribute('aria-label')
    ) {
      return null;
    }
    
    // 2. Determine interactivity
    const isClickable =
      el.hasAttribute('onclick') ||
      window.getComputedStyle(el).cursor === 'pointer' ||
      el.hasAttribute('role') && ['button', 'link', 'menuitem'].includes(el.getAttribute('role')!);

    // 3. Extract a concise name for the element
    const a = (s: string | null): string => (s || '').trim();
    const name =
      a(el.getAttribute('aria-label')) ||
      a(el.textContent) ||
      a(el.getAttribute('placeholder')) ||
      a(el.getAttribute('name')) ||
      a(el.id);
      
    // 4. Get outer HTML without children
    const clone = el.cloneNode(false) as HTMLElement;
    const html = clone.outerHTML;

    return {
      tagName,
      name: name.substring(0, 100), // Truncate long names
      html,
      isClickable,
    };
  });

  if (!elementInfo) return null;

  const id = idCounter.next++;
  let { tagName, name, html, isClickable } = elementInfo; // 'name' is now mutable

  // ** THE FIX **
  // Get the real-time value for input, textarea, and select elements
  if (['input', 'textarea', 'select'].includes(tagName)) {
    const value = await element.inputValue();
    if (value) {
      // Prepend the current value to the name for the AI to see
      name = \`[\${value}] | \${name}\`;
    }
  }

  // 5. Determine a semantic ElementType for the AI
  let type: ElementType = 'unknown';
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) type = 'heading';
  else if (['p', 'strong', 'em', 'span'].includes(tagName)) type = 'text';
  else if (tagName === 'a') type = 'link';
  else if (tagName === 'button' || isClickable) type = 'button'; // Treat all clickables as buttons for simplicity
  else if (tagName === 'input') type = 'input';
  else if (tagName === 'textarea') type = 'textarea';
  else if (tagName === 'select') type = 'select';
  else if (tagName === 'img') type = 'image';
  else if (tagName === 'form') type = 'form';
  else if (tagName === 'label') type = 'label';
  else if (['div', 'nav', 'main', 'footer', 'header', 'section'].includes(tagName)) type = 'container';

  // 6. Create a stable, unique locator
  const locator = \`[data-ai-id="\${id}"]\`;
  await element.evaluate((el, id) => el.setAttribute('data-ai-id', String(id)), id);

  const isEditable = await element.isEditable();
  const children: PageElement[] = [];

  // If the element is editable (like an input or a Tiptap editor),
  // we treat it as a leaf node and don't process its children.
  // This prevents the AI from trying to interact with the inner text nodes.
  if (isEditable) {
    // Also, ensure its type is correctly identified for the AI
    if (type === 'container' || type === 'unknown') {
      type = 'textarea'; // Treat contenteditable divs as textareas
    }
  } else {
    const childHandles = await element.$$(':scope > *');
    for (const childHandle of childHandles) {
      const childElement = await buildElementTree(page, childHandle, idCounter, id);
      if (childElement) {
        children.push(childElement);
      }
      childHandle.dispose();
    }
  }


  const pageElement: PageElement = {
    id,
    type,
    name,
    locator,
    html,
    isClickable,
    children,
    parent: parentId,
  };
  return pageElement;
}

/**
 * Traverses the page's DOM, builds a simplified tree of essential elements,
 * and returns it as a JSON string for the AI to analyze.
 * @param page The Playwright page object.
 * @returns A promise that resolves to a JSON string representing the page context.
 */
export async function getPageContext(page: Page): Promise<string> {
  // Clear any markers from previous analysis runs
  await page.evaluate(() => {
    document.querySelectorAll('[data-ai-id]').forEach(el => el.removeAttribute('data-ai-id'));
  });

  const body = await page.locator('body').elementHandle();
  if (!body) {
    return '{"error": "The page has no body element."}';
  }

  const idCounter = { next: 1 };
  const rootElement = await buildElementTree(page, body, idCounter);
  body.dispose();

  if (!rootElement) {
    return '{"error": "Could not build the page element tree."}';
  }

  // Convert the detailed tree to a simpler format for the AI prompt
  const simplifiedTree = formatForAi(rootElement);

  return JSON.stringify(simplifiedTree, null, 2);
}
`;

fs.writeFileSync(path.join(__dirname, 'src', 'utils.ts'), newContent.trim());
console.log('src/utils.ts has been updated.'); 