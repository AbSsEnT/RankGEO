import { Injectable } from '@nestjs/common';
import { generateText, Output } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { websiteAnalysisSchema, type WebsiteAnalysis } from './analysis.schema';
import { CrawlService } from '../crawl/crawl.service';
import { z } from 'zod';
import type { GeoScoreResult, WebSearchCallResult } from './geo-score.types';

const promptsSchema = z.object({ prompts: z.array(z.string()).length(10) });

@Injectable()
export class AnalysisService {
  constructor(private readonly crawlService: CrawlService) {}

  async analyzeWebsite(url: string): Promise<WebsiteAnalysis> {
    const pages = await this.crawlService.crawlSite(url);
    if (pages.length === 0) {
      throw new Error('Could not extract any content from the website');
    }

    const content = this.crawlService.contentForAnalysis(pages);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }

    const openai = createOpenAI({ apiKey });
    const { experimental_output } = await generateText({
      model: openai('gpt-4o-mini'),
      experimental_output: Output.object({
        schema: websiteAnalysisSchema,
      }),
      prompt: `Analyze the following website content extracted from multiple pages and provide structured information for marketing (GEO) purposes.

Website content:
${content}

Provide:
1. sectorOfActivity: The sector or industry the business operates in.
2. businessType: The type of business (e.g. B2B, B2C, marketplace, SaaS).
3. businessDescription: A short, clear description of what the business does.
4. websiteStructure: A description of the website structure and main sections (e.g. homepage, product pages, blog, contact).`,
    });

    return experimental_output as WebsiteAnalysis;
  }

  async generateSearchPrompts(analysis: WebsiteAnalysis): Promise<string[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const openai = createOpenAI({ apiKey });
    const { experimental_output } = await generateText({
      model: openai('gpt-4o-mini'),
      experimental_output: Output.object({
        schema: promptsSchema,
      }),
      prompt: `You are generating exactly 10 human-like prompts that a real customer would type into ChatGPT to get recommendations for products or services.

Business context:
- Sector: ${analysis.sectorOfActivity}
- Business type: ${analysis.businessType}
- Description: ${analysis.businessDescription}
- Website structure: ${analysis.websiteStructure}

Generate exactly 10 diverse, natural prompts that such a customer would use to find product recommendations in the same space (e.g. "Best project management software for small teams", "Top CRM for startups"). Each prompt should be one sentence, as if typed into a search or chat. Return them in the "prompts" array.`,
    });

    const out = experimental_output as { prompts: string[] };
    return Array.isArray(out?.prompts) ? out.prompts.slice(0, 10) : [];
  }

  async runGeoScorePipeline(
    url: string,
    analysis?: WebsiteAnalysis,
  ): Promise<GeoScoreResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const analysisResult = analysis ?? (await this.analyzeWebsite(url));
    const generatedPrompts = await this.generateSearchPrompts(analysisResult);
    if (generatedPrompts.length === 0) {
      throw new Error('Failed to generate search prompts');
    }

    const allInternalPrompts: string[] = [];
    const allSources: string[] = [];
    const sourcesPerPrompt: string[][] = [];

    for (const userPrompt of generatedPrompts) {
      const result = await this.callResponsesApiWithWebSearch(apiKey, userPrompt);
      allInternalPrompts.push(...result.internalPrompts);
      allSources.push(...result.sources);
      sourcesPerPrompt.push(result.sources);
    }

    const normalizedSite = this.normalizeUrlForMatch(url);
    let promptsWhereSiteAppeared = 0;
    for (const sources of sourcesPerPrompt) {
      if (sources.some((s) => this.urlMatches(s, normalizedSite))) {
        promptsWhereSiteAppeared += 1;
      }
    }
    const score =
      sourcesPerPrompt.length === 0
        ? 0
        : Math.round(
            (100 * promptsWhereSiteAppeared) / sourcesPerPrompt.length,
          );

    return {
      score,
      internalPrompts: allInternalPrompts,
      generatedPrompts,
      analysis: analysisResult,
      allSources: [...new Set(allSources)],
    };
  }

  private async callResponsesApiWithWebSearch(
    apiKey: string,
    userPrompt: string,
  ): Promise<WebSearchCallResult> {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini-search-preview',
        input: userPrompt,
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
        tool_choice: 'required',
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`OpenAI Responses API error: ${res.status} ${err}`);
    }

    const data = (await res.json()) as {
      output?: Array<{
        type?: string;
        action?: {
          type?: string;
          queries?: string[];
          sources?: Array<{ type?: string; url?: string }>;
        };
      }>;
    };

    const internalPrompts: string[] = [];
    const sources: string[] = [];

    for (const item of data.output ?? []) {
      if (item.type === 'web_search_call' && item.action) {
        const action = item.action as {
          type?: string;
          queries?: string[];
          sources?: Array<{ url?: string }>;
        };
        if (action.type === 'search') {
          if (Array.isArray(action.queries)) {
            internalPrompts.push(...action.queries);
          }
          if (Array.isArray(action.sources)) {
            for (const s of action.sources) {
              if (s?.url) sources.push(s.url);
            }
          }
        }
      }
    }

    return { internalPrompts, sources };
  }

  private normalizeUrlForMatch(url: string): string {
    try {
      const u = new URL(url);
      u.hash = '';
      u.search = '';
      const path = u.pathname.replace(/\/$/, '') || '';
      return `${u.origin.toLowerCase()}${path}`;
    } catch {
      return url.toLowerCase();
    }
  }

  private urlMatches(sourceUrl: string, normalizedSite: string): boolean {
    try {
      const s = this.normalizeUrlForMatch(sourceUrl);
      return s === normalizedSite || s.startsWith(normalizedSite + '/');
    } catch {
      return false;
    }
  }
}
