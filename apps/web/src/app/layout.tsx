import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'RankGEO',
  description: 'RankGEO Web App',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
