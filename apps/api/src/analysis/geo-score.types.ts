import type { WebsiteAnalysis } from './analysis.schema';

export interface GeoScoreRequestBody {
  url: string;
  analysis: WebsiteAnalysis;
}

export type SourceCategory =
  | 'social_media'
  | 'shopping'
  | 'forums_qa'
  | 'review_editorial'
  | 'news_press'
  | 'other';

const SOURCE_CATEGORIES: SourceCategory[] = [
  'social_media',
  'shopping',
  'forums_qa',
  'review_editorial',
  'news_press',
  'other',
];

export function isSourceCategory(s: string): s is SourceCategory {
  return SOURCE_CATEGORIES.includes(s as SourceCategory);
}

/** Sources grouped by domain; count is how many times the domain was referenced (any URL on that domain). */
export interface SourcesByDomain {
  domain: string;
  count: number;
  urls: string[];
  category: SourceCategory;
}

export interface PromptResult {
  prompt: string;
  apparitionLikelihood: number;
  sources: SourcesByDomain[];
}

export interface GeoScoreResult {
  score: number;
  numSearchPrompts: number;
  internalPrompts: string[];
  generatedPrompts: string[];
  analysis?: WebsiteAnalysis;
  sources: SourcesByDomain[];
  promptResults: PromptResult[];
}

export interface WebSearchCallResult {
  internalPrompts: string[];
  sources: string[];
}

export interface ContentStrategy {
  title: string;
  targetPlatform: string;
  targetFormat: string;
  description: string;
  structure: {
    heading: string;
    description: string;
  }[];
  keywords: string[];
}
