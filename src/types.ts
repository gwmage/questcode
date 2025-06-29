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
  | 'container'
  | 'form'
  | 'section'
  | 'heading'
  | 'text'
  | 'link'
  | 'button'
  | 'input'
  | 'textarea'
  | 'select'
  | 'option'
  | 'label'
  | 'image';

export interface PageElement {
  id: number;
  type: ElementType;
  role?: string;
  name: string;
  locator: string;
  value?: string;
  children: PageElement[];
  parent?: number;
} 