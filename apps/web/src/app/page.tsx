'use client';

import { useState } from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface AnalysisResult {
  sectorOfActivity: string;
  businessType: string;
  businessDescription: string;
  websiteStructure: string;
}

interface SourcesByDomain {
  domain: string;
  count: number;
  urls: string[];
}

interface GeoScoreResult {
  score: number;
  internalPrompts: string[];
  generatedPrompts: string[];
  analysis?: AnalysisResult;
  sources: SourcesByDomain[];
}

export default function Home() {
  const [url, setUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  const [geoLoading, setGeoLoading] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [geoResult, setGeoResult] = useState<GeoScoreResult | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResult(null);
    setGeoResult(null);
    setGeoError(null);
    const targetUrl = url.trim();
    if (!targetUrl) {
      setError('Please enter a website URL.');
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        setError(msg ?? data.error ?? 'Analysis failed');
        return;
      }
      if (data.error) {
        setError(data.error);
        return;
      }
      setResult(data as AnalysisResult);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleGeoScore() {
    const targetUrl = url.trim();
    if (!targetUrl || !result) return;
    setGeoError(null);
    setGeoLoading(true);
    try {
      const res = await fetch(`${API_BASE}/analyze/geo-score`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl, analysis: result }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        setGeoError(msg ?? data.error ?? 'GEO score failed');
        return;
      }
      if (data.error) {
        setGeoError(data.error);
        return;
      }
      setGeoResult(data as GeoScoreResult);
    } catch (err) {
      setGeoError(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setGeoLoading(false);
    }
  }

  return (
    <main style={{ maxWidth: 720, margin: '0 auto', padding: 24 }}>
      <h1>RankGEO</h1>
      <p style={{ marginBottom: 24 }}>
        Improve GEO for your clients’ websites. Enter a URL to analyze sector, business type, description, and structure.
      </p>

      <form onSubmit={handleSubmit}>
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="https://example.com"
          disabled={loading}
          style={{
            width: '100%',
            padding: 12,
            marginBottom: 12,
            fontSize: 16,
          }}
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Analyzing…' : 'Analyze website'}
        </button>
      </form>

      {error && (
        <p style={{ color: 'crimson', marginTop: 16 }} role="alert">
          {error}
        </p>
      )}

      {result && (
        <section style={{ marginTop: 32 }}>
          <h2>Analysis result</h2>
          <dl style={{ margin: 0 }}>
            <dt><strong>Sector of activity</strong></dt>
            <dd style={{ marginBottom: 16 }}>{result.sectorOfActivity}</dd>

            <dt><strong>Business type</strong></dt>
            <dd style={{ marginBottom: 16 }}>{result.businessType}</dd>

            <dt><strong>Business description</strong></dt>
            <dd style={{ marginBottom: 16 }}>{result.businessDescription}</dd>

            <dt><strong>Website structure</strong></dt>
            <dd>{result.websiteStructure}</dd>
          </dl>

          <div style={{ marginTop: 24 }}>
            <button
              type="button"
              onClick={handleGeoScore}
              disabled={geoLoading}
            >
              {geoLoading ? 'Computing GEO score…' : 'Get GEO score'}
            </button>
          </div>
        </section>
      )}

      {geoError && (
        <p style={{ color: 'crimson', marginTop: 16 }} role="alert">
          {geoError}
        </p>
      )}

      {geoResult && (
        <section style={{ marginTop: 32 }}>
          <h2>GEO score</h2>
          <p style={{ fontSize: 24, fontWeight: 600, marginBottom: 24 }}>
            Score: {geoResult.score}/100
          </p>
          <p style={{ marginBottom: 8 }}>
            In {Math.round((geoResult.score / 100) * 10)} of 10 simulated user prompts, the analyzed website appeared in the search sources.
          </p>

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Generated human-like prompts (10)</h3>
          <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
            Prompts a real customer would type into ChatGPT to get product recommendations in this space.
          </p>
          <ol style={{ margin: 0, paddingLeft: 20 }}>
            {geoResult.generatedPrompts.map((p, i) => (
              <li key={i} style={{ marginBottom: 8 }}>{p}</li>
            ))}
          </ol>

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Internal search queries (web search tool)</h3>
          <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
            Queries the model used when calling the web search tool across all 10 prompts.
          </p>
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {geoResult.internalPrompts.length === 0 ? (
              <li>No web search calls recorded.</li>
            ) : (
              geoResult.internalPrompts.map((q, i) => (
                <li key={i} style={{ marginBottom: 6 }}>{q}</li>
              ))
            )}
          </ul>

          <h3 style={{ marginTop: 24, marginBottom: 8 }}>Sources by domain</h3>
          <p style={{ color: '#666', marginBottom: 12, fontSize: 14 }}>
            Domains returned by the web search tool; count is how many times each domain was referenced. Listed URLs are the specific paths found.
          </p>
          {!geoResult.sources?.length ? (
            <p>No sources recorded.</p>
          ) : (
            <ul style={{ margin: 0, paddingLeft: 20, listStyle: 'none' }}>
              {geoResult.sources.map((group, i) => (
                <li key={i} style={{ marginBottom: 16 }}>
                  <strong style={{ display: 'block', marginBottom: 6 }}>
                    {group.domain} — Referenced {group.count} time{group.count === 1 ? '' : 's'}.
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: 20 }}>
                    {group.urls.map((url, j) => (
                      <li key={j} style={{ marginBottom: 6 }}>
                        <a href={url} target="_blank" rel="noopener noreferrer">{url}</a>
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </main>
  );
}
