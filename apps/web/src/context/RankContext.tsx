'use client';

import React, { createContext, useContext, useState, ReactNode } from 'react';

// Extracting types logically from the page.tsx or defining them here
export interface AnalysisResult {
    sectorOfActivity: string;
    businessType: string;
    businessDescription: string;
    websiteStructure: string;
}

export type SourceCategory =
    | 'social_media'
    | 'shopping'
    | 'forums_qa'
    | 'review_editorial'
    | 'news_press'
    | 'other';

export interface SourcesByDomain {
    domain: string;
    count: number;
    urls: string[];
    category: SourceCategory;
}

export interface PromptResult {
    prompt: string;
    apparitionLikelihood: number;
    sources: SourcesByDomain[];
}

export interface GeoScoreResult {
    score: number;
    numSearchPrompts: number;
    internalPrompts: string[];
    generatedPrompts: string[];
    analysis?: AnalysisResult;
    sources: SourcesByDomain[];
    promptResults: PromptResult[];
}

interface RankContextState {
    url: string;
    setUrl: (url: string) => void;
    analysis: AnalysisResult | null;
    setAnalysis: (analysis: AnalysisResult | null) => void;
    geoScore: GeoScoreResult | null;
    setGeoScore: (geoScore: GeoScoreResult | null) => void;
    trackedQueries: Set<number>;
    setTrackedQueries: (queries: Set<number>) => void;
}

const RankContext = createContext<RankContextState | undefined>(undefined);

export function RankProvider({ children }: { children: ReactNode }) {
    const [url, setUrl] = useState('');
    const [analysis, setAnalysis] = useState<AnalysisResult | null>(null);
    const [geoScore, setGeoScore] = useState<GeoScoreResult | null>(null);
    const [trackedQueries, setTrackedQueries] = useState<Set<number>>(new Set());

    return (
        <RankContext.Provider
            value={{
                url,
                setUrl,
                analysis,
                setAnalysis,
                geoScore,
                setGeoScore,
                trackedQueries,
                setTrackedQueries,
            }}
        >
            {children}
        </RankContext.Provider>
    );
}

export function useRank() {
    const context = useContext(RankContext);
    if (context === undefined) {
        throw new Error('useRank must be used within a RankProvider');
    }
    return context;
}
