import { Page } from 'playwright';

interface InteractiveElement {
  type: 'button' | 'a' | 'input' | 'textarea' | 'select';
  name: string | null;
  locator: string;
}

/**
 * Finds all interactive elements on the page that are visible.
 * @param page The Playwright page object.
 * @returns A promise that resolves to an array of interactive elements.
 */
export async function getInteractiveElements(page: Page): Promise<InteractiveElement[]> {
  const elements: InteractiveElement[] = [];

  const selectors = [
    'a',
    'button',
    '[role="button"]',
    'input:not([type="hidden"])',
    'textarea',
    'select',
  ];

  for (const selector of selectors) {
    const foundElements = await page.locator(selector).all();
    for (const element of foundElements) {
      if (await element.isVisible()) {
        const tagName = await element.evaluate(el => el.tagName.toLowerCase());

        // Ensure tagName is of the expected type, otherwise skip.
        if (!['a', 'button', 'input', 'textarea', 'select'].includes(tagName)) {
            continue;
        }
        const type = tagName as InteractiveElement['type'];
        
        const textContent = (await element.textContent())?.trim().replace(/\s+/g, ' ');
        const ariaLabel = (await element.getAttribute('aria-label'))?.trim();
        const placeholder = (await element.getAttribute('placeholder'))?.trim();
        const nameAttr = (await element.getAttribute('name'))?.trim();
        const idAttr = (await element.getAttribute('id'))?.trim();
        const typeAttr = (await element.getAttribute('type'))?.trim();

        const name = ariaLabel || textContent || placeholder || nameAttr || idAttr || null;
        
        let locator: string | null = null;
        
        if (idAttr) {
            locator = `#${idAttr}`;
        } else if (nameAttr) {
            locator = `[name="${nameAttr}"]`;
        } else if (ariaLabel) {
            locator = `[aria-label="${ariaLabel}"]`;
        } else if (placeholder) {
            const sanitizedPlaceholder = placeholder.replace(/"/g, '\\"');
            locator = `[placeholder="${sanitizedPlaceholder}"]`;
        } else if (textContent && textContent.length > 0) {
            const normalizedText = textContent.replace(/"/g, '\\"');
            locator = `${type}:has-text("${normalizedText}")`;
        } else if (typeAttr) {
            locator = `${type}[type="${typeAttr}"]`;
        }

        if (locator) {
          elements.push({
            type,
            name,
            locator,
          });
        }
      }
    }
  }

  return elements;
}