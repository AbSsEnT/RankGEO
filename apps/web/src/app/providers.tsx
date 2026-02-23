'use client';

import { RankProvider } from '../context/RankContext';

export function Providers({ children }: { children: React.ReactNode }) {
    return <RankProvider>{children}</RankProvider>;
}
