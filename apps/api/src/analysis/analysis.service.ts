import { Injectable } from '@nestjs/common';
import { generateText, generateObject, Output } from 'ai';
import { createOpenAI } from '@ai-sdk/openai';
import { websiteAnalysisSchema, type WebsiteAnalysis } from './analysis.schema';
import { CrawlService } from '../crawl/crawl.service';
import { z } from 'zod';
import {
  type GeoScoreResult,
  type SourceCategory,
  type WebSearchCallResult,
  type PromptResult,
  type SourcesByDomain,
  type ContentStrategy,
  isSourceCategory,
} from './geo-score.types';

// Recursively strips Proxies, internal Getters, and Class instances
// down to pure, serializable plain Old JavaScript Objects (POJOs)
function stripProxies(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(stripProxies);
  const out: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    out[key] = stripProxies(obj[key]);
  }
  return out;
}

const promptsSchema = z.object({
  prompts: z.array(z.string()).min(1).max(10),
});

@Injectable()
export class AnalysisService {
  constructor(private readonly crawlService: CrawlService) { }

  getNumSearchPrompts(): number {
    return Math.min(10, Math.max(1, parseInt(process.env.NUM_SEARCH_PROMPTS ?? '10', 10) || 10));
    // return 5;
  }

  async analyzeWebsite(url: string): Promise<WebsiteAnalysis> {
    console.log(`[Analysis] Starting website analysis for: ${url}`);
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
      model: openai('gpt-5-mini'),
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

    console.log(`[Analysis] Analysis complete. Sector: ${experimental_output?.sectorOfActivity}`);
    return experimental_output as WebsiteAnalysis;
  }

  async generateSearchPrompts(analysis: WebsiteAnalysis): Promise<string[]> {
    console.log('[Analysis] Generating search prompts...');
    const numSearchPrompts = this.getNumSearchPrompts();
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const openai = createOpenAI({ apiKey });
    const { experimental_output } = await generateText({
      model: openai('gpt-5-mini'),
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
    console.log(`[Analysis] Starting GEO Score Pipeline for: ${url}`);
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) throw new Error('OPENAI_API_KEY is not set');

    const generatedPrompts = await this.generateSearchPrompts(analysis);
    console.log(`[Analysis] Generated ${generatedPrompts.length} search prompts.`);
    if (generatedPrompts.length === 0) {
      throw new Error('Failed to generate search prompts');
    }

    console.log('[Analysis] Firing concurrent Web Search calls...');
    const startTime = Date.now();
    const results = await Promise.all(
      generatedPrompts.map((userPrompt) =>
        this.callResponsesApiWithWebSearch(apiKey, userPrompt),
      ),
    );
    console.log(`[Analysis] All ${generatedPrompts.length} Web Search calls finished in ${Date.now() - startTime}ms`);

    const allInternalPrompts: string[] = [];
    const allSources: string[] = [];
    for (const result of results) {
      allInternalPrompts.push(...result.internalPrompts);
      allSources.push(...result.sources);
    }

    const normalizedSite = this.normalizeUrlForMatch(url);

    // Group global sources
    const sources = this.groupSources(allSources);

    // Group per-prompt sources and likelihood
    const promptResults: PromptResult[] = [];
    let promptsWhereSiteAppeared = 0;

    for (const result of results) {
      const groupedSources = this.groupSources(result.sources);
      let likelihood = 0;
      if (result.sources.some(s => this.urlMatches(s, normalizedSite))) {
        likelihood = 100;
      }

      for (const promptText of result.internalPrompts) {
        if (likelihood === 100) promptsWhereSiteAppeared += 1;
        promptResults.push({
          prompt: promptText,
          apparitionLikelihood: likelihood,
          sources: JSON.parse(JSON.stringify(groupedSources)), // Clone to avoid reference issues
        });
      }
    }

    const score =
      promptResults.length === 0
        ? 0
        : Math.round(
          (100 * promptsWhereSiteAppeared) / promptResults.length,
        );

    console.log(`[Analysis] Calculating scores and extracting domains...`);
    const uniqueDomains = new Set<string>();
    sources.forEach(s => uniqueDomains.add(s.domain));
    promptResults.forEach(pr => pr.sources.forEach(s => uniqueDomains.add(s.domain)));

    const domains = Array.from(uniqueDomains);
    console.log(`[Analysis] Classifying ${domains.length} domains...`);
    const categoryMap = await this.classifyDomains(apiKey, domains);
    console.log(`[Analysis] Domain classification complete.`);

    // Assign categories
    sources.forEach(s => (s.category = categoryMap[s.domain] ?? 'other'));
    promptResults.forEach(pr => {
      pr.sources.forEach(s => (s.category = categoryMap[s.domain] ?? 'other'));
    });

    const payload: GeoScoreResult = {
      score,
      numSearchPrompts: this.getNumSearchPrompts(),
      internalPrompts: allInternalPrompts,
      generatedPrompts,
      analysis: stripProxies(analysis),
      sources,
      promptResults,
    };

    console.log(`[Analysis] Attempting manual JSON serialization test...`);
    try {
      const test = JSON.stringify(payload);
      console.log(`[Analysis] Serialization success! Payload length: ${test.length}`);
    } catch (err: any) {
      console.error(`[Analysis] Serialization failed internally:`, err.message);
    }

    return stripProxies(payload) as GeoScoreResult;
  }

  private groupSources(sourceUrls: string[]): SourcesByDomain[] {
    const countByUrl = new Map<string, number>();
    for (const u of sourceUrls) {
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
    return [...byDomain.entries()]
      .map(([domain, { count, urls }]) => ({
        domain,
        count,
        urls: [...urls].sort(),
        category: 'other' as SourceCategory,
      }))
      .sort((a, b) => b.count - a.count);
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
    console.log(`[WebSearch] Starting search for prompt: "${userPrompt}"`);
    const start = Date.now();
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gpt-5-mini',
        input: `[Respond with ONLY 'Done' and nothing else.] ${userPrompt}`,
        tools: [{ type: 'web_search' }],
        include: ['web_search_call.action.sources'],
        tool_choice: 'required',
      }),
    });
    const data = await res.json() as any;
    console.log(`[WebSearch] Response: ${JSON.stringify(data).substring(0, 300)}...`);

    if (!res.ok) {
      throw new Error(`OpenAI Responses API error: ${res.status} ${JSON.stringify(data)}`);
    }

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
            const cleanedQueries = action.queries.map(q =>
              q.replace("[Respond with ONLY 'Done' and nothing else.] ", "")
                .replace("[Respond with ONLY 'Done' and nothing else.]", "")
            );
            internalPrompts.push(...cleanedQueries);
          }
          if (Array.isArray(action.sources)) {
            for (const s of action.sources) {
              if (s?.url) sources.push(s.url);
            }
          }
        }
      }
    }

    console.log(`[WebSearch] Search finished in ${Date.now() - start}ms: found ${sources.length} sources and ${internalPrompts.length} internal queries.`);
    return { internalPrompts, sources };
  }

  /** Domain key for grouping: hostname lowercased, optional "www." stripped. */
  private domainKey(urlStr: string): string {
    try {
      if (!urlStr.startsWith('http')) {
        urlStr = 'http://' + urlStr;
      }
      const u = new URL(urlStr);
      let hostname = u.hostname;
      if (hostname.startsWith('www.')) hostname = hostname.slice(4);
      return hostname;
    } catch {
      return urlStr;
    }
  }

  async generateContentStrategy(
    targetUrl: string,
    analysis: WebsiteAnalysis,
    promptResults: PromptResult[],
  ): Promise<ContentStrategy> {
    console.log(`[Strategy] Generating strategy for ${targetUrl} based on ${promptResults.length} tracked queries.`);

    // 1. Extract the top absolute URLs across all tracked prompt results
    const allUrls = new Set<string>();
    for (const pr of promptResults) {
      for (const src of pr.sources) {
        for (const u of src.urls) {
          allUrls.add(u);
        }
      }
    }

    // Grab max 5 distinct high-ranking competitor URLs to scrape context from.
    const topCompetitorUrls = Array.from(allUrls).slice(0, 5);

    console.log(`[Strategy] Scraping ${topCompetitorUrls.length} top competitor sources...`);

    // 2. Scrape competitor content concurrently
    const scrapedResults = await Promise.all(
      topCompetitorUrls.map(u => this.crawlService.crawlSite(u).catch(() => []))
    );

    // Flatten and combine the text into a single context payload
    const competitorContext = scrapedResults
      .flat()
      .map(page => `\n--- URL: ${page.url} ---\n${page.text.substring(0, 10000)}`)
      .join('\n\n');

    console.log(`[Strategy] Calling LLM to matrix strategy...`);

    // 3. Request structured Output strategy from LLM
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY is not set');
    }
    const openai = createOpenAI({ apiKey });

    const { object } = await generateObject({
      model: openai('gpt-5-mini'),
      schema: z.object({
        title: z.string().describe('A catchy, actionable title for this content piece.'),
        targetPlatform: z.string().describe('The ideal platform/channel (e.g., SEO Blog, Reddit thread, LinkedIn Post, Knowledge Base).'),
        targetFormat: z.string().describe('The format type (e.g., How-to Guide, Listicle, FAQ, Case Study).'),
        description: z.string().describe('A brief summary of what the content should be about and its primary goal.'),
        structure: z.array(z.object({
          heading: z.string().describe('The section heading (H2/H3 level).'),
          description: z.string().describe('Brief instructions on what to cover in this section.')
        })).describe('A recommended outline structure for the content.'),
        keywords: z.array(z.string()).describe('High-impact keywords extracted from competitor analysis to target.'),
      }),
      system: `You are an elite SEO and Content Strategy architect. 
Your goal is to design a highly specific content asset that helps the target website rank for their chosen search queries.
Analyze the target website's profile and the actual scraped content from currently ranking competitors. 
Formulate a robust, modern content strategy structured into specific headings, specifying exactly what type of content to create to outrank them.`,
      prompt: `Target Website Profiling:
URL: ${targetUrl}
Sector: ${analysis.sectorOfActivity}
Business Type: ${analysis.businessType}
Description: ${analysis.businessDescription}

Tracked Search Queries the user wants to rank for:
${promptResults.map(pr => `- ${pr.prompt} (Competitors appear ${pr.apparitionLikelihood}% of the time)`).join('\n')}

---

COMPETITOR SCRAPED CONTEXT (What currently ranks for these queries):
${competitorContext ? competitorContext : 'No competitor content could be successfully scraped.'}

---

Design the optimal content strategy (format, structure, and keywords) that this specific business should deploy to capture these search queries. Format your response strictly according to the requested schema.`,
    });

    console.log(`[Strategy] Content Strategy generation complete.`);
    return object;
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
