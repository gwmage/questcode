import { Page, ElementHandle } from 'playwright';
import { PageElement, ElementType } from './types';

// Simplified representation of the page's structure and content for the AI
function simplifyDomForAi(element: PageElement): any {
  // Recursively simplify children
  const simplifiedChildren = element.children.map(simplifyDomForAi);

  const result: any = {
    // Use a more descriptive name for the AI, like 'tag' instead of 'type'
    tag: element.type, 
    name: element.name,
    // The locator is critical for the AI to take action
    locator: element.locator, 
  };

  // Only include children array if it's not empty
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
async function buildElementTree(page: Page, element: ElementHandle<HTMLElement | SVGElement>, idCounter: { next: number }, parentId?: number): Promise<PageElement | null> {
  const tagName = (await element.evaluate(el => el.tagName)).toLowerCase();
  
  // 1. Filter out non-essential or invisible elements
  const isEssential = await element.evaluate((el: HTMLElement) => {
    // Exclude non-content and non-visible elements
    if (["script", "style", "meta", "link", "head"].includes(el.tagName.toLowerCase())) return false;
    const style = window.getComputedStyle(el);
    if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity) < 0.1) return false;
    // Heuristic to ignore empty, purely stylistic containers
    if ((el.tagName === 'DIV' || el.tagName === 'SPAN') && !el.children.length && (el.textContent || '').trim().length < 2 && !el.getAttribute('role') && !el.getAttribute('aria-label')) {
       return false;
    }
    return true;
  });

  if (!isEssential) return null;

  const id = idCounter.next++;
  
  // 2. Determine a semantic ElementType for the AI
  let type: ElementType = 'container';
  if (['h1', 'h2', 'h3', 'h4', 'h5', 'h6'].includes(tagName)) type = 'heading';
  else if (['p', 'span', 'strong', 'em'].includes(tagName)) type = 'text';
  else if (tagName === 'a') type = 'link';
  else if (tagName === 'button') type = 'button';
  else if (tagName === 'input') type = 'input';
  else if (tagName === 'textarea') type = 'textarea';
  else if (tagName === 'select') type = 'select';
  else if (tagName === 'img') type = 'image';
  else if (tagName === 'form') type = 'form';
  else if (tagName === 'label') type = 'label';
  
  const name = await getElementName(element);
  
  // 3. Create a stable, unique locator by adding a temporary data-attribute
  const locator = `[data-ai-id="${id}"]`;
  await element.evaluate((el, id) => el.setAttribute('data-ai-id', String(id)), id);

  const children: PageElement[] = [];
  // Use '$$' which is a shortcut for querySelectorAll and returns ElementHandles
  const childHandles = await element.$$(':scope > *');

  for (const childHandle of childHandles) {
    const childElement = await buildElementTree(page, childHandle, idCounter, id);
    if (childElement) {
      children.push(childElement);
    }
    // Dispose of handles to prevent memory leaks
    childHandle.dispose();
  }
  
  const pageElement: PageElement = { id, type, name, locator, children, parent: parentId };
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
    return "The page has no body element.";
  }
  
  const idCounter = { next: 1 };
  const rootElement = await buildElementTree(page, body, idCounter);
  body.dispose();
  
  if (!rootElement) {
    return "Could not build the page element tree.";
  }

  // Convert the detailed tree to a simpler format for the AI prompt
  const simplifiedTree = simplifyDomForAi(rootElement);

  return JSON.stringify(simplifiedTree, null, 2);
}