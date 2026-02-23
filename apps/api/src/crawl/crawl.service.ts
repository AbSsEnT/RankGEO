import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

const MAX_PAGES = 10;
const MAX_CONTENT_CHARS = 120_000;

/** Browser-like headers to reduce blocking by anti-bot / anti-crawler systems */
const CRAWL_HEADERS: HeadersInit = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  Accept:
    'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
};

export interface PageContent {
  url: string;
  text: string;
}

@Injectable()
export class CrawlService {
  async crawlSite(siteUrl: string): Promise<PageContent[]> {
    console.log(`[Crawl] Initializing crawler for: ${siteUrl}`);
    const base = this.normalizeBase(siteUrl);
    const seen = new Set<string>([base]);
    const queue: string[] = [base];
    const results: PageContent[] = [];

    while (queue.length > 0 && results.length < MAX_PAGES) {
      const url = queue.shift()!;
      console.log(`[Crawl] Fetching page: ${url} (${results.length}/${MAX_PAGES} collected)`);
      try {
        const res = await fetch(url, {
          headers: CRAWL_HEADERS,
          signal: AbortSignal.timeout(15_000),
        });
        const contentType = res.headers.get('content-type') ?? '';
        if (!res.ok || !contentType.includes('text/html'))
          continue;

        const html = await res.text();
        const $ = cheerio.load(html);

        // Extract main text: remove script, style, nav, footer
        $('script, style, nav, footer, [role="navigation"]').remove();
        const text = $('body').text().replace(/\s+/g, ' ').trim();
        if (text.length > 100) {
          results.push({ url, text });
        }

        // Discover same-origin links
        $('a[href]').each((_, el) => {
          const href = $(el).attr('href');
          if (!href || href.startsWith('#') || href.startsWith('mailto:'))
            return;
          const absolute = this.toAbsolute(base, href);
          if (absolute && this.sameOrigin(base, absolute) && !seen.has(absolute)) {
            seen.add(absolute);
            queue.push(absolute);
          }
        });
      } catch (e) {
        console.warn(`[Crawl] Failed to fetch or parse ${url}: ${(e as Error).message}`);
      }
    }

    console.log(`[Crawl] Finished crawling ${siteUrl}. Extracted ${results.length} pages.`);
    return results;
  }

  /** Concatenate page contents for LLM, truncating if needed */
  contentForAnalysis(pages: PageContent[]): string {
    let out = '';
    for (const p of pages) {
      const block = `\n--- Page: ${p.url} ---\n${p.text}\n`;
      if (out.length + block.length > MAX_CONTENT_CHARS) {
        out += block.slice(0, Math.max(0, MAX_CONTENT_CHARS - out.length - 50));
        out += '\n...[truncated]';
        break;
      }
      out += block;
    }
    return out.trim();
  }

  private normalizeBase(url: string): string {
    try {
      const u = new URL(url);
      if (!u.protocol.startsWith('http')) return '';
      u.hash = '';
      u.search = '';
      return u.toString().replace(/\/$/, '') || u.origin;
    } catch {
      return '';
    }
  }

  private toAbsolute(base: string, href: string): string | null {
    try {
      return new URL(href, base).toString();
    } catch {
      return null;
    }
  }

  private sameOrigin(base: string, url: string): boolean {
    try {
      return new URL(base).origin === new URL(url).origin;
    } catch {
      return false;
    }
  }
}
