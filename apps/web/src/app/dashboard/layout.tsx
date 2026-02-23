'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import styles from './layout.module.css';

export default function DashboardLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const pathname = usePathname();

    return (
        <div className={styles.dashboardContainer}>
            {/* Sidebar Navigation */}
            <aside className={styles.sidebar}>
                <div className={styles.logoContainer}>
                    <h2 className={styles.logo}>RankLM</h2>
                </div>

                <nav className={styles.nav}>
                    <Link
                        href="/dashboard"
                        className={`${styles.navItem} ${pathname === '/dashboard' ? styles.active : ''}`}
                    >
                        Overview
                    </Link>
                    <Link
                        href="/dashboard/strategy"
                        className={`${styles.navItem} ${pathname === '/dashboard/strategy' ? styles.active : ''}`}
                    >
                        Content Strategy
                    </Link>
                    <Link
                        href="/dashboard/keywords"
                        className={`${styles.navItem} ${pathname === '/dashboard/keywords' ? styles.active : ''}`}
                    >
                        Keywords (Soon)
                    </Link>
                    <Link
                        href="/dashboard/creation"
                        className={`${styles.navItem} ${pathname === '/dashboard/creation' ? styles.active : ''}`}
                    >
                        Content Creation (Soon)
                    </Link>
                </nav>
            </aside>

            {/* Main Content Area */}
            <main className={styles.mainContent}>
                {children}
            </main>
        </div>
    );
}
