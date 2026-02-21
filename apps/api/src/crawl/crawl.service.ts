import { Injectable } from '@nestjs/common';
import * as cheerio from 'cheerio';

const MAX_PAGES = 25;
const MAX_CONTENT_CHARS = 120_000;

export interface PageContent {
  url: string;
  text: string;
}

@Injectable()
export class CrawlService {
  async crawlSite(siteUrl: string): Promise<PageContent[]> {
    const base = this.normalizeBase(siteUrl);
    const seen = new Set<string>([base]);
    const queue: string[] = [base];
    const results: PageContent[] = [];

    while (queue.length > 0 && results.length < MAX_PAGES) {
      const url = queue.shift()!;
      try {
        const res = await fetch(url, {
          headers: { 'User-Agent': 'RankGEO-Bot/1.0' },
          signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok || !res.headers.get('content-type')?.includes('text/html'))
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
      } catch {
        // Skip failed pages
      }
    }

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
