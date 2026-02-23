'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useRank } from '../context/RankContext';
import styles from './page.module.css';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

interface AnalysisResult {
  sectorOfActivity: string;
  businessType: string;
  businessDescription: string;
  websiteStructure: string;
}

type SourceCategory =
  | 'social_media'
  | 'shopping'
  | 'forums_qa'
  | 'review_editorial'
  | 'news_press'
  | 'other';

interface SourcesByDomain {
  domain: string;
  count: number;
  urls: string[];
  category: SourceCategory;
}

interface PromptResult {
  prompt: string;
  apparitionLikelihood: number;
  sources: SourcesByDomain[];
}

interface GeoScoreResult {
  score: number;
  numSearchPrompts: number;
  internalPrompts: string[];
  generatedPrompts: string[];
  analysis?: AnalysisResult;
  sources: SourcesByDomain[];
  promptResults: PromptResult[];
}

export default function Home() {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [url, setUrl] = useState('');

  // Step 1 state
  const [loading1, setLoading1] = useState(false);
  const [error1, setError1] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);

  // Step 2 state
  const [loading2, setLoading2] = useState(false);
  const [error2, setError2] = useState<string | null>(null);
  const [geoResult, setGeoResult] = useState<GeoScoreResult | null>(null);

  // Step 3 state
  const [selectedQueries, setSelectedQueries] = useState<Set<number>>(new Set());

  const { setUrl: setGlobalUrl, setAnalysis, setGeoScore, setTrackedQueries } = useRank();
  const router = useRouter();

  const fetchTriggeredRef = useRef(false);

  function handleContinueToDashboard() {
    setGlobalUrl(url);
    if (result) setAnalysis(result);
    if (geoResult) setGeoScore(geoResult);
    setTrackedQueries(selectedQueries);
    router.push('/dashboard');
  }

  async function handleAnalyze(e: React.FormEvent) {
    e.preventDefault();
    fetchTriggeredRef.current = false;
    setError1(null);
    setResult(null);
    setGeoResult(null);
    setError2(null);
    const targetUrl = url.trim();
    if (!targetUrl) {
      setError1('Please enter a website URL.');
      return;
    }
    setLoading1(true);
    try {
      const res = await fetch(`${API_BASE}/analyze`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: targetUrl }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg = Array.isArray(data.message) ? data.message[0] : data.message;
        setError1(msg ?? data.error ?? 'Analysis failed');
        setLoading1(false);
        return;
      }
      if (data.error) {
        setError1(data.error);
        setLoading1(false);
        return;
      }
      setResult(data as AnalysisResult);
      setStep(2);
    } catch (err) {
      setError1(err instanceof Error ? err.message : 'Request failed');
    } finally {
      setLoading1(false);
    }
  }

  useEffect(() => {
    if (step === 2 && result && !geoResult && !fetchTriggeredRef.current) {
      fetchTriggeredRef.current = true;
      // Auto-trigger geo score
      let isMounted = true;
      const targetUrl = url.trim();

      const fetchGeo = async () => {
        console.log('[Frontend] Initiating /analyze/geo-score fetch...');
        setLoading2(true);
        try {
          const res = await fetch(`${API_BASE}/analyze/geo-score`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: targetUrl, analysis: result }),
          });
          console.log(`[Frontend] Fetch status: ${res.status}`);

          const text = await res.text();
          console.log(`[Frontend] Fetch response text:`, text.substring(0, 200) + '...');

          let data;
          try {
            data = JSON.parse(text);
          } catch (e: any) {
            console.error('[Frontend] Failed to parse JSON:', e.message);
            throw new Error(`Invalid JSON response: ${text.substring(0, 100)}`);
          }

          if (!isMounted) {
            console.log('[Frontend] Component unmounted, skipping update.');
            return;
          }

          if (!res.ok) {
            console.log('[Frontend] Response not ok, setting error.');
            const msg = Array.isArray(data.message) ? data.message[0] : data.message;
            setError2(msg ?? data.error ?? 'GEO score failed');
            return;
          }
          if (data.error) {
            console.log('[Frontend] Received data.error.');
            setError2(data.error);
            return;
          }

          console.log('[Frontend] Setting geoResult and advancing to Step 3!');
          setGeoResult(data as GeoScoreResult);
          setStep(3); // Move to step 3 on success
        } catch (err) {
          console.error('[Frontend] Fetch caught error:', err);
          if (!isMounted) return;
          setError2(err instanceof Error ? err.message : 'Request failed');
        } finally {
          console.log('[Frontend] Fetch attempt finished. Cleaning up loading state.');
          if (isMounted) setLoading2(false);
        }
      };

      fetchGeo();

      return () => {
        isMounted = false;
      };
    }
  }, [step, result, geoResult, url]);

  const toggleQuery = (index: number) => {
    setSelectedQueries((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        if (newSet.size < 5) {
          newSet.add(index);
        }
      }
      return newSet;
    });
  };

  return (
    <main className={styles.container}>
      <div className={styles.bgAnimation} />

      <div className={`${styles.content} ${step > 1 ? styles.contentExpanded : ''}`}>
        <h1 className={styles.logo}>RankLM</h1>
        <p className={styles.subtitle}>
          Analyze and optimize your presence across AI platforms and modern conversational search.
        </p>

        {step === 1 && (
          <form className={styles.inputWrapper} onSubmit={handleAnalyze}>
            <input
              type="url"
              className={styles.input}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              disabled={loading1}
              required
            />
            <button type="submit" className={styles.button} disabled={loading1}>
              {loading1 ? 'Analyzing website...' : 'Start Global Analysis'}
            </button>
            {error1 && <div className={styles.error}>{error1}</div>}
          </form>
        )}

        {step === 2 && result && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>Initial Website Analysis</h2>

            <div className={styles.dl}>
              <div>
                <div className={styles.dt}>Sector of Activity</div>
                <div className={styles.dd}>{result.sectorOfActivity}</div>
              </div>

              <div>
                <div className={styles.dt}>Business Type</div>
                <div className={styles.dd}>{result.businessType}</div>
              </div>

              <div>
                <div className={styles.dt}>Business Description</div>
                <div className={styles.dd}>{result.businessDescription}</div>
              </div>

              <div>
                <div className={styles.dt}>Website Structure</div>
                <div className={styles.dd}>{result.websiteStructure}</div>
              </div>
            </div>

            {loading2 && !error2 && (
              <div className={styles.progressContainer}>
                <div className={styles.progressBar} style={{ width: '85%' }} />
              </div>
            )}
            {loading2 && !error2 && (
              <div className={styles.loadingText}>Computing AI Geo Score...</div>
            )}

            {error2 && (
              <div className={styles.error} style={{ marginTop: '24px' }}>
                Failed to compute GEO score: {error2}
                <button
                  onClick={() => { setError2(null); setLoading2(false); }}
                  className={styles.button}
                  style={{ marginTop: '12px' }}
                >
                  Retry
                </button>
              </div>
            )}
          </div>
        )}

        {step === 3 && geoResult && (
          <div className={styles.card}>
            <h2 className={styles.cardTitle}>AI Search Intelligence</h2>

            <p style={{ marginBottom: '16px', color: 'var(--text-muted)' }}>
              Select up to 5 AI search queries you want to track to see your ranking progression.
            </p>

            <ul className={styles.queryList}>
              {geoResult.internalPrompts.length === 0 ? (
                <li style={{ color: 'var(--text-muted)' }}>No internal queries found.</li>
              ) : (
                geoResult.internalPrompts.map((q, i) => {
                  const isSelected = selectedQueries.has(i);
                  const maxReached = selectedQueries.size >= 5 && !isSelected;

                  return (
                    <li
                      key={i}
                      className={`${styles.queryItem} ${isSelected ? styles.queryItemSelected : ''} ${maxReached ? styles.queryItemDisabled : ''}`}
                      onClick={() => !maxReached && toggleQuery(i)}
                    >
                      <div className={styles.checkbox} />
                      <span className={styles.queryText}>{q}</span>
                    </li>
                  );
                })
              )}
            </ul>

            {selectedQueries.size > 0 && (
              <div className={styles.queryDetails}>
                <h3 className={styles.cardTitle} style={{ borderBottom: 'none', marginBottom: '16px' }}>Tracked Queries</h3>

                {Array.from(selectedQueries).map(index => {
                  const q = geoResult.internalPrompts[index];
                  const promptResult = geoResult.promptResults ? geoResult.promptResults[index] : null;

                  // Top 3 sources specifically for this prompt
                  const topSources = promptResult
                    ? [...(promptResult.sources || [])]
                      .sort((a, b) => b.count - a.count)
                      .slice(0, 3)
                    : [];

                  const likelihood = promptResult ? promptResult.apparitionLikelihood : 0;

                  return (
                    <div key={index} className={styles.queryDetailCard}>
                      <div className={styles.queryDetailTitle}>{q}</div>

                      <div className={styles.statRow}>
                        <span className={styles.statLabel}>Target Apparition Likelihood</span>
                        <span className={styles.statValue}>{likelihood}%</span>
                      </div>

                      <div>
                        <div className={styles.statLabel} style={{ marginBottom: '8px' }}>Most Cited Sources</div>
                        <ul className={styles.sourceList}>
                          {topSources.length > 0 ? topSources.map((src, idx) => (
                            <li key={idx} className={styles.sourceItem}>
                              <span className={styles.sourceDomain}>{src.domain}</span>
                              <span className={styles.sourceCount}>{src.count} citations</span>
                            </li>
                          )) : (
                            <li className={styles.sourceItem}>
                              <span className={styles.sourceDomain}>No sources cited.</span>
                            </li>
                          )}
                        </ul>
                      </div>
                    </div>
                  );
                })}

                <button
                  className={styles.button}
                  style={{ marginTop: '32px' }}
                  onClick={handleContinueToDashboard}
                >
                  Continue to Dashboard
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
