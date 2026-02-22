import type { WebsiteAnalysis } from './analysis.schema';

export interface GeoScoreRequestBody {
  url: string;
  analysis: WebsiteAnalysis;
}

export interface GeoScoreResult {
  score: number;
  internalPrompts: string[];
  generatedPrompts: string[];
  analysis?: WebsiteAnalysis;
  allSources?: string[];
}

export interface WebSearchCallResult {
  internalPrompts: string[];
  sources: string[];
}
