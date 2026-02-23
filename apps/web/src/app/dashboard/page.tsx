'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useRank } from '../../context/RankContext';
import styles from './page.module.css';

export default function DashboardHome() {
    const { url, analysis, geoScore, trackedQueries } = useRank();
    const router = useRouter();

    useEffect(() => {
        // If user refreshes or hasn't onboarded, redirect back to onboarding
        if (!url || !analysis || !geoScore) {
            router.push('/');
        }
    }, [url, analysis, geoScore, router]);

    if (!url || !geoScore) return null;

    const getScoreColor = (score: number) => {
        if (score >= 80) return '#4ade80'; // Green
        if (score >= 40) return '#fbbf24'; // Yellow
        return '#f87171'; // Red
    };

    return (
        <div className={styles.container}>
            <header className={styles.header}>
                <h1 className={styles.title}>Overview Dashboard</h1>
                <p className={styles.subtitle}>Analyzing <span className={styles.highlight}>{url}</span></p>
            </header>

            <div className={styles.gridContainer}>
                {/* Geo Score Card */}
                <section className={`${styles.card} ${styles.scoreCard}`}>
                    <h2 className={styles.cardTitle}>Global Apparition Score</h2>
                    <div className={styles.scoreCircleWrapper}>
                        <div
                            className={styles.scoreCircle}
                            style={{ borderColor: getScoreColor(geoScore.score) }}
                        >
                            <span className={styles.scoreText}>{geoScore.score}%</span>
                        </div>
                    </div>
                    <p className={styles.scoreDesc}>
                        Your website appeared in {Math.round((geoScore.score / 100) * trackedQueries.size)} out of the {trackedQueries.size} tracked queries.
                    </p>
                </section>

                {/* Website Profile Card */}
                <section className={styles.card}>
                    <h2 className={styles.cardTitle}>Website Profile</h2>
                    <div className={styles.profileGrid}>
                        <div>
                            <div className={styles.dt}>Sector</div>
                            <div className={styles.dd}>{analysis?.sectorOfActivity}</div>
                        </div>
                        <div>
                            <div className={styles.dt}>Business Type</div>
                            <div className={styles.dd}>{analysis?.businessType}</div>
                        </div>
                        <div className={styles.fullWidth}>
                            <div className={styles.dt}>Description</div>
                            <div className={styles.dd}>{analysis?.businessDescription}</div>
                        </div>
                        <div className={styles.fullWidth}>
                            <div className={styles.dt}>Structure</div>
                            <div className={styles.dd}>{analysis?.websiteStructure}</div>
                        </div>
                    </div>
                </section>
            </div>

            {/* Tracked Queries Overview */}
            <h2 className={styles.sectionTitle}>Tracked Queries Performance</h2>
            <div className={styles.queriesGrid}>
                {Array.from(trackedQueries).map(index => {
                    const q = geoScore.internalPrompts[index];
                    const promptResult = geoScore.promptResults ? geoScore.promptResults[index] : null;

                    const likelihood = promptResult ? promptResult.apparitionLikelihood : 0;
                    const topSources = promptResult
                        ? [...(promptResult.sources || [])]
                            .sort((a, b) => b.count - a.count)
                            .slice(0, 3)
                        : [];

                    return (
                        <div key={index} className={styles.queryCard}>
                            <div className={styles.queryHeader}>
                                <h3 className={styles.queryTitle}>{q}</h3>
                                <span
                                    className={styles.queryScore}
                                    style={{ color: getScoreColor(likelihood) }}
                                >
                                    {likelihood}%
                                </span>
                            </div>

                            <div className={styles.sourcesContainer}>
                                <div className={styles.sourcesLabel}>Top Copetitors:</div>
                                <div className={styles.sourceList}>
                                    {topSources.length > 0 ? topSources.map((src, idx) => (
                                        <details key={idx} className={styles.sourceDetails}>
                                            <summary className={styles.sourceSummary}>
                                                <span className={styles.sourceDomain}>{src.domain}</span>
                                                <span className={styles.sourceCount}>{src.count} citations</span>
                                            </summary>
                                            <div className={styles.urlListWrapper}>
                                                <ul className={styles.urlList}>
                                                    {src.urls.map((u, uIdx) => (
                                                        <li key={uIdx} className={styles.urlItem}>
                                                            <a href={u} target="_blank" rel="noopener noreferrer" className={styles.urlLink}>
                                                                {u}
                                                            </a>
                                                        </li>
                                                    ))}
                                                </ul>
                                            </div>
                                        </details>
                                    )) : (
                                        <div className={styles.sourceItem}>
                                            <span className={styles.sourceDomain}>No sources found</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
