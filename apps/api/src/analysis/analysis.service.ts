import { Injectable } from '@nestjs/common';
import { generateText, Output } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { websiteAnalysisSchema, type WebsiteAnalysis } from './analysis.schema';
import { CrawlService } from '../crawl/crawl.service';
import { z } from 'zod';
import {
  type GeoScoreResult,
  type SourceCategory,
  type WebSearchCallResult,
  isSourceCategory,
} from './geo-score.types';

const promptsSchema = z.object({
  prompts: z.array(z.string()).min(1).max(10),
});

@Injectable()
export class AnalysisService {
  constructor(private readonly crawlService: CrawlService) {}

  getNumSearchPrompts(): number {
    return Math.min(10, Math.max(1, parseInt(process.env.NUM_SEARCH_PROMPTS ?? '10', 10) || 10));
  }

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
    const numSearchPrompts = this.getNumSearchPrompts();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const openai = createOpenAI({ apiKey });
    const { experimental_output } = await generateText({
      model: openai('gpt-4o-mini'),
      experimental_output: Output.object({
        schema: promptsSchema,
      }),
      prompt: `You are generating exactly ${numSearchPrompts} human-like prompts that a real customer would type into ChatGPT to get recommendations for products or services.

Business context:
- Sector: ${analysis.sectorOfActivity}
- Business type: ${analysis.businessType}
- Description: ${analysis.businessDescription}
- Website structure: ${analysis.websiteStructure}

Generate exactly ${numSearchPrompts} diverse, natural prompts that such a customer would use to find product recommendations in the same space (e.g. "Best project management software for small teams", "Top CRM for startups"). Each prompt should be one sentence, as if typed into a search or chat. Return them in the "prompts" array.

Critical: Do NOT mention the name of the website, the business name, or any brand or company name that could identify this business. Write only generic, category-level prompts as if the user does not know the brand.`,
    });

    const out = experimental_output as { prompts: string[] };
    return Array.isArray(out?.prompts) ? out.prompts.slice(0, numSearchPrompts) : [];
  }

  async runGeoScorePipeline(
    url: string,
    analysis: WebsiteAnalysis,
  ): Promise<GeoScoreResult> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const generatedPrompts = await this.generateSearchPrompts(analysis);
    if (generatedPrompts.length === 0) {
      throw new Error('Failed to generate search prompts');
    }

    const results = await Promise.all(
      generatedPrompts.map((userPrompt) =>
        this.callResponsesApiWithWebSearch(apiKey, userPrompt),
      ),
    );

    const allInternalPrompts: string[] = [];
    const allSources: string[] = [];
    const sourcesPerPrompt: string[][] = [];
    for (const result of results) {
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

    const countByUrl = new Map<string, number>();
    for (const u of allSources) {
      countByUrl.set(u, (countByUrl.get(u) ?? 0) + 1);
    }
    const byDomain = new Map<string, { count: number; urls: Set<string> }>();
    for (const [url, count] of countByUrl) {
      const domain = this.domainKey(url);
      const entry = byDomain.get(domain);
      if (entry) {
        entry.count += count;
        entry.urls.add(url);
      } else {
        byDomain.set(domain, { count, urls: new Set([url]) });
      }
    }
    const sources = [...byDomain.entries()]
      .map(([domain, { count, urls }]) => ({
        domain,
        count,
        urls: [...urls].sort(),
        category: 'other' as SourceCategory,
      }))
      .sort((a, b) => b.count - a.count);

    const domains = sources.map((s) => s.domain);
    const categoryMap = await this.classifyDomains(apiKey, domains);
    sources.forEach(
      (s) => (s.category = categoryMap[s.domain] ?? 'other'),
    );

    return {
      score,
      numSearchPrompts: this.getNumSearchPrompts(),
      internalPrompts: allInternalPrompts,
      generatedPrompts,
      analysis,
      sources,
    };
  }

  private async classifyDomains(
    apiKey: string,
    domains: string[],
  ): Promise<Record<string, SourceCategory>> {
    if (domains.length === 0) return {};
    try {
      const domainList = domains.join('\n');
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-5-mini',
          messages: [
            {
              role: 'user',
              content: `Classify each of these website domains into exactly one of: social_media, shopping, forums_qa, review_editorial, news_press, other. Use only the domain name. Domains are listed in display order (most referred first). Return a JSON object mapping each domain to its category, e.g. {"reddit.com": "forums_qa", "amazon.com": "shopping"}. No other text.\n\n${domainList}`,
            },
          ],
          response_format: { type: 'json_object' },
        }),
      });
      if (!res.ok) {
        const err = await res.text();
        throw new Error(`OpenAI error: ${res.status} ${err}`);
      }
      const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> };
      const raw = data.choices?.[0]?.message?.content;
      if (!raw || typeof raw !== 'string') return {};
      const parsed = JSON.parse(raw) as Record<string, string>;
      const out: Record<string, SourceCategory> = {};
      for (const [key, val] of Object.entries(parsed)) {
        let domain = key.toLowerCase().trim();
        if (domain.startsWith('www.')) domain = domain.slice(4);
        out[domain] = isSourceCategory(val) ? val : 'other';
      }
      return out;
    } catch (e) {
      console.warn('Domain classifier failed, using other for all:', e);
      return {};
    }
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
        model: 'gpt-5-mini',
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

  /** Domain key for grouping: hostname lowercased, optional "www." stripped. */
  private domainKey(url: string): string {
    try {
      const host = new URL(url).hostname.toLowerCase();
      return host.startsWith('www.') ? host.slice(4) : host;
    } catch {
      return '';
    }
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
