import type { WebsiteAnalysis } from './analysis.schema';

export interface GeoScoreRequestBody {
  url: string;
  analysis: WebsiteAnalysis;
}

/** Sources grouped by domain; count is how many times the domain was referenced (any URL on that domain). */
export interface SourcesByDomain {
  domain: string;
  count: number;
  urls: string[];
}

export interface GeoScoreResult {
  score: number;
  internalPrompts: string[];
  generatedPrompts: string[];
  analysis?: WebsiteAnalysis;
  sources: SourcesByDomain[];
}

export interface WebSearchCallResult {
  internalPrompts: string[];
  sources: string[];
}
