export interface Action {
  type: 'click' | 'type' | 'crawl' | 'finish' | 'generate_report' | 'keypress' | 'fill';
  locator?: string;
  value?: string;
  description: string;
  force?: boolean;
  key?: string;
  error?: string;
} 