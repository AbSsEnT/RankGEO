'use client';

import { useState } from 'react';
import { useRank } from '../../../context/RankContext';
import styles from './page.module.css';

interface ContentStrategy {
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

export default function ContentStrategyPage() {
    const { url, analysis, trackedQueries, geoScore } = useRank();
    const [strategy, setStrategy] = useState<ContentStrategy | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

    async function handleGenerateStrategy() {
        if (!analysis || !geoScore || trackedQueries.size === 0) {
            setError('Please complete the onboarding flow and select at least one tracked query.');
            return;
        }

        setLoading(true);
        setError(null);

        // Extract ONLY the PromptResult objects that the user actively selected to track
        const selectedPromptResults = Array.from(trackedQueries).map(idx => geoScore.promptResults[idx]);

        try {
            const res = await fetch(`${API_BASE}/analyze/strategy`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    url,
                    analysis,
                    promptResults: selectedPromptResults
                })
            });

            const data = await res.json();
            if (!res.ok) {
                throw new Error(data.message || 'Failed to generate strategy');
            }

            setStrategy(data as ContentStrategy);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Unknown error occurred.');
        } finally {
            setLoading(false);
        }
    }

    // If no tracking data exists, block access safely
    if (trackedQueries.size === 0) {
        return (
            <div className={styles.emptyStateContainer}>
                <h2 className={styles.emptyTitle}>No Tracked Queries Selected</h2>
                <p className={styles.emptyDesc}>Please go back to the Onboarding flowchart and select queries you wish to target.</p>
            </div>
        );
    }

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Content Strategy Matrix</h1>
                <p className={styles.subtitle}>
                    AI will crawl your competitors and cross-reference them with your website profile to generate a targeted piece for your {trackedQueries.size} tracked queries.
                </p>
            </header>

            {!strategy && !loading && (
                <button
                    onClick={handleGenerateStrategy}
                    className={styles.generateButton}
                >
                    Generate Winning Strategy
                </button>
            )}

            {loading && (
                <div className={styles.loadingContainer}>
                    <div className={styles.spinner} />
                    <p className={styles.loadingText}>Scraping top competitor domains and reverse-engineering their content framework...</p>
                </div>
            )}

            {error && (
                <div className={styles.errorBox}>
                    <p>{error}</p>
                </div>
            )}

            {strategy && !loading && (
                <div className={styles.strategyContainer}>

                    <div className={styles.strategyHeader}>
                        <div className={styles.badgeGroup}>
                            <span className={styles.platformBadge}>{strategy.targetPlatform}</span>
                            <span className={styles.formatBadge}>{strategy.targetFormat}</span>
                        </div>
                        <h2 className={styles.strategyTitle}>{strategy.title}</h2>
                        <p className={styles.strategyDesc}>{strategy.description}</p>
                    </div>

                    <div className={styles.gridContainer}>
                        {/* Left Column: Outline */}
                        <div className={styles.outlineSection}>
                            <h3 className={styles.sectionTitle}>Recommended Outline</h3>
                            <div className={styles.structureList}>
                                {strategy.structure.map((item, idx) => (
                                    <div key={idx} className={styles.structureItem}>
                                        <div className={styles.headingMarker}>H{idx === 0 ? '1' : '2'}</div>
                                        <div className={styles.structureContent}>
                                            <h4 className={styles.headingText}>{item.heading}</h4>
                                            <p className={styles.headingDesc}>{item.description}</p>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Right Column: Keywords */}
                        <div className={styles.keywordsSection}>
                            <h3 className={styles.sectionTitle}>High-Impact Keywords</h3>
                            <p className={styles.keywordsDesc}>These semantic entities were actively found driving traffic to your competitors:</p>
                            <div className={styles.keywordsTags}>
                                {strategy.keywords.map((kw, idx) => (
                                    <span key={idx} className={styles.keywordTag}>{kw}</span>
                                ))}
                            </div>
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
}
