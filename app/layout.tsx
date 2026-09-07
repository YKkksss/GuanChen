import type { Metadata, Viewport } from 'next';
import './globals.css';
import './ai-markdown.css';
import { ThemeProvider } from '@/components/ThemeProvider';
import EasternAppFrame from '@/components/eastern/EasternAppFrame';
import { SITE_URL } from '@/lib/site';
import AutomaticBackupBootstrap from '@/components/AutomaticBackupBootstrap';

export const metadata: Metadata = {
  title: '紫微命盘 · 东方书院',
  description: '从本命、大限到流年，以可复核的紫微斗数排盘与 AI 解读，建立一份可持续回看的本地人生档案。',
  keywords: '紫微斗数, 倪海夏, 倪海厦, 紫微斗数全集, 紫微斗数全书, 骨髓赋, 命盘, 命理, 14主星, 12宫位',
  metadataBase: new URL(SITE_URL),
  alternates: {
    canonical: '/',
  },
  openGraph: {
    title: '紫微命盘 · 东方书院',
    description: '从本命、大限到流年，以可复核的紫微斗数排盘与 AI 解读，建立一份可持续回看的本地人生档案。',
    url: SITE_URL,
    siteName: '紫微命盘 · 东方书院',
    locale: 'zh_CN',
    type: 'website',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f3eee4' },
    { media: '(prefers-color-scheme: dark)', color: '#020810' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN" suppressHydrationWarning data-scroll-behavior="smooth">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('ziwei-theme');if(t==='light'||t==='dark')document.documentElement.setAttribute('data-theme',t);else document.documentElement.setAttribute('data-theme','dark');}catch(e){}})();` }} />
      </head>
      <body className="min-h-screen">
        <ThemeProvider>
          <AutomaticBackupBootstrap />
          <EasternAppFrame>{children}</EasternAppFrame>
        </ThemeProvider>
      </body>
    </html>
  );
}
