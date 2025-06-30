/**
 * Defines the structure of an action the AI can decide to take.
 */
export type Action = {
  type: 'click' | 'fill' | 'keypress' | 'crawl' | 'finish' | 'select';
  locator?: string; // Not needed for 'finish' or 'crawl'
  value?: string; // For 'fill' and 'select'
  key?: string; // Only for 'keypress'
  description: string;
  force?: boolean;
  error?: string;
} 

export type ElementType =
  | 'button'
  | 'link'
  | 'input'
  | 'select'
  | 'textarea'
  | 'text'
  | 'image'
  | 'container'
  | 'heading'
  | 'label'
  | 'form'
  | 'unknown';

export interface PageElement {
  id: number;
  type: ElementType;
  name: string;
  locator: string;
  html: string; // Add the outer HTML of the element
  isClickable: boolean; // Explicitly mark if the element is deemed clickable
  children: PageElement[];
  parent?: number;
} 