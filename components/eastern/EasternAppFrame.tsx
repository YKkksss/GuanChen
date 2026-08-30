'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Bell,
  BookOpenText,
  Books,
  ChartDonut,
  ClockCounterClockwise,
  Exam,
  FileText,
  FolderOpen,
  GraduationCap,
  GridFour,
  House,
  Path,
  UsersThree,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import ResultNotice from './ResultNotice';
import styles from './EasternAppFrame.module.css';

type NavItem = {
  label: string;
  href: string;
  icon: Icon;
  matches: (pathname: string) => boolean;
};

const SIDE_NAV: NavItem[] = [
  { label: '命盘', href: '/chart', icon: ChartDonut, matches: path => path === '/chart' || /^\/chart\/[^/]+$/.test(path) },
  { label: '紫微合盘', href: '/heming', icon: UsersThree, matches: path => path.startsWith('/heming') },
  { label: '八字分析', href: '/bazi', icon: GridFour, matches: path => path.startsWith('/bazi') },
  { label: '生时校正', href: '/rectification', icon: ClockCounterClockwise, matches: path => path.startsWith('/rectification') },
  { label: '年度报告', href: '/reviews', icon: FileText, matches: path => path.startsWith('/reviews') || path.includes('/reports') },
  { label: '人生时间轴', href: '/chart', icon: Path, matches: path => path.includes('/timeline') || path.includes('/events') },
  { label: '本地提醒', href: '/reminders', icon: Bell, matches: path => path.startsWith('/reminders') },
  { label: '学习中心', href: '/learn', icon: GraduationCap, matches: path => path.startsWith('/learn') },
  { label: '紫微知识库', href: '/knowledge', icon: BookOpenText, matches: path => path.startsWith('/knowledge') },
  { label: '古籍原典', href: '/library', icon: Books, matches: path => path.startsWith('/library') },
  { label: '练习中心', href: '/practice', icon: Exam, matches: path => path.startsWith('/practice') },
  { label: '匿名案例', href: '/cases', icon: FolderOpen, matches: path => path.startsWith('/cases') },
];

const TOP_NAV = [
  { label: '命盘', href: '/chart', matches: (path: string) => path.startsWith('/chart') || path.startsWith('/bazi') || path.startsWith('/rectification') },
  { label: '合盘', href: '/heming', matches: (path: string) => path.startsWith('/heming') },
  { label: '学习', href: '/learn', matches: (path: string) => path.startsWith('/learn') || path.startsWith('/knowledge') || path.startsWith('/library') || path.startsWith('/practice') },
  { label: '案例', href: '/cases', matches: (path: string) => path.startsWith('/cases') },
];

function shouldUseFrame(pathname: string) {
  if (pathname === '/' || pathname === '/chart' || /^\/chart\/[^/]+$/.test(pathname)) return false;
  return ['/heming', '/bazi', '/rectification', '/reminders', '/reviews', '/learn', '/knowledge', '/library', '/practice', '/cases', '/chart/']
    .some(prefix => pathname.startsWith(prefix));
}

function shouldShowNotice(pathname: string) {
  return pathname.startsWith('/heming')
    || pathname.startsWith('/bazi')
    || pathname.startsWith('/rectification')
    || /^\/chart\/[^/]+\/(reports|timeline|events)/.test(pathname);
}

function resolveSideHref(item: NavItem, pathname: string) {
  const context = pathname.match(/^\/(chart|heming|rectification)\/([^/]+)/);
  if (!context) return item.href;
  const [, section, id] = context;
  if (item.label === '年度报告') return `/${section}/${id}/reports`;
  if (item.label === '人生时间轴' && section !== 'rectification') return `/${section}/${id}/timeline`;
  return item.href;
}

export default function EasternAppFrame({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  if (!shouldUseFrame(pathname)) return children;

  return (
    <div className={styles.frame} data-eastern-route={pathname}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="返回东方书院首页">
          <Image src="/assets/brand/ziwei-seal.png" width={31} height={31} alt="紫微命盘印章" priority />
          <span>
            <strong>紫微命盘</strong>
            <small>东方书院</small>
          </span>
        </Link>
        <nav className={styles.topnav} aria-label="主要功能">
          {TOP_NAV.map(item => (
            <Link key={item.href} href={item.href} className={item.matches(pathname) ? styles.activeTop : ''}>{item.label}</Link>
          ))}
        </nav>
        <Link className={styles.homeLink} href="/"><House size={16} aria-hidden="true" /><span>首页</span></Link>
      </header>

      <div className={styles.body}>
        <aside className={styles.sidebar} aria-label="东方书院功能目录">
          <div className={styles.sideBrand}>紫微命盘</div>
          <nav>
            {SIDE_NAV.map(item => {
              const IconComponent = item.icon;
              const active = item.matches(pathname);
              const href = resolveSideHref(item, pathname);
              return (
                <Link key={`${item.href}-${item.label}`} href={href} className={active ? styles.activeSide : ''} aria-current={active ? 'page' : undefined}>
                  <IconComponent size={16} weight={active ? 'fill' : 'regular'} aria-hidden="true" />
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <Link href="/" className={styles.collapseHint}>返回首页</Link>
        </aside>

        <div className={styles.content}>
          {shouldShowNotice(pathname) && <ResultNotice compact />}
          {children}
        </div>
      </div>
    </div>
  );
}
