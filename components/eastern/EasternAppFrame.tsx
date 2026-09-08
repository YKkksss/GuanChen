'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  Bell,
  BookOpenText,
  Books,
  ChartDonut,
  ClockCounterClockwise,
  Database,
  Exam,
  FileText,
  FolderOpen,
  GraduationCap,
  GridFour,
  House,
  List,
  Path,
  SidebarSimple,
  SpinnerGap,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import type { Icon } from '@phosphor-icons/react';
import ResultNotice from './ResultNotice';
import styles from './EasternAppFrame.module.css';
import { resolveWorkspaceDestination, type WorkspaceDestination } from '@/lib/ui/workspace-navigation';
import { useModalFocus } from '@/lib/ui/use-modal-focus';
import { useBodyScrollLock } from '@/lib/ui/use-body-scroll-lock';

type NavItem = {
  destination?: WorkspaceDestination;
  label: string;
  href: string;
  icon: Icon;
  matches: (pathname: string) => boolean;
};

const SIDE_NAV: Array<{ label: string; items: NavItem[] }> = [
  {
    label: '命理工具',
    items: [
      { label: '命盘', href: '/chart', icon: ChartDonut, matches: path => path === '/chart' || (path !== '/chart/select' && /^\/chart\/[^/]+$/.test(path)) },
      { label: '紫微合盘', href: '/heming', icon: UsersThree, matches: path => path.startsWith('/heming') },
      { label: '八字分析', href: '/bazi', icon: GridFour, matches: path => path.startsWith('/bazi') },
      { label: '生时校正', href: '/rectification', icon: ClockCounterClockwise, matches: path => path.startsWith('/rectification') },
    ],
  },
  {
    label: '档案报告',
    items: [
      { label: '全部命盘档案', href: '/history', icon: FolderOpen, matches: path => path === '/history' },
      { label: '命盘报告', destination: 'reports', href: '/chart/select?target=reports', icon: FileText, matches: path => path.includes('/reports') },
      { label: '人生时间轴', destination: 'events', href: '/chart/select?target=events', icon: Path, matches: path => path.includes('/events') },
      { label: '运限分析', destination: 'timeline', href: '/chart/select?target=timeline', icon: ChartDonut, matches: path => path.includes('/timeline') },
      { label: '月度复盘', href: '/reviews', icon: ClockCounterClockwise, matches: path => path.startsWith('/reviews') },
      { label: '本地提醒', href: '/reminders', icon: Bell, matches: path => path.startsWith('/reminders') },
    ],
  },
  {
    label: '学习研究',
    items: [
      { label: '学习中心', href: '/learn', icon: GraduationCap, matches: path => path.startsWith('/learn') },
      { label: '紫微知识库', href: '/knowledge', icon: BookOpenText, matches: path => path.startsWith('/knowledge') },
      { label: '古籍原典', href: '/library', icon: Books, matches: path => path.startsWith('/library') },
      { label: '练习中心', href: '/practice', icon: Exam, matches: path => path.startsWith('/practice') },
      { label: '匿名案例', href: '/cases', icon: FolderOpen, matches: path => path.startsWith('/cases') },
    ],
  },
  {
    label: '数据管理',
    items: [
      { label: '数据保险箱', href: '/settings/data', icon: Database, matches: path => path.startsWith('/settings/data') },
    ],
  },
];

const TOP_NAV = [
  { label: '命盘', href: '/chart', matches: (path: string) => path.startsWith('/chart') || path.startsWith('/bazi') || path.startsWith('/rectification') },
  { label: '合盘', href: '/heming', matches: (path: string) => path.startsWith('/heming') },
  { label: '学习', href: '/learn', matches: (path: string) => path.startsWith('/learn') || path.startsWith('/knowledge') || path.startsWith('/library') || path.startsWith('/practice') },
  { label: '案例', href: '/cases', matches: (path: string) => path.startsWith('/cases') },
];

const DEV_WARMUP_ROUTES = Array.from(new Set([
  ...TOP_NAV.map(item => item.href),
  ...SIDE_NAV.flatMap(group => group.items.map(item => item.href)),
]));
let devWarmupStarted = false;

function shouldUseFrame(pathname: string) {
  if (pathname === '/') return false;
  if (pathname === '/chart' || pathname === '/history') return true;
  return ['/heming', '/bazi', '/rectification', '/reminders', '/reviews', '/learn', '/knowledge', '/library', '/practice', '/cases', '/settings', '/chart/']
    .some(prefix => pathname.startsWith(prefix));
}

function shouldShowNotice(pathname: string) {
  return pathname === '/chart'
    || pathname.startsWith('/heming')
    || pathname.startsWith('/bazi')
    || pathname.startsWith('/rectification')
    || /^\/chart\/[^/]+\/(reports|timeline|events)/.test(pathname);
}

function resolveSideHref(item: NavItem, pathname: string) {
  return item.destination ? resolveWorkspaceDestination(item.destination, pathname) : item.href;
}

export default function EasternAppFrame({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  useBodyScrollLock(mobileNavOpen);
  const mobileNavRef = useModalFocus<HTMLElement>(mobileNavOpen, () => setMobileNavOpen(false));

  useEffect(() => {
    setMobileNavOpen(false);
    setPendingHref(null);
  }, [pathname]);

  useEffect(() => {
    if (!pendingHref) return;
    const timeout = window.setTimeout(() => setPendingHref(null), 12_000);
    return () => window.clearTimeout(timeout);
  }, [pendingHref]);

  useEffect(() => {
    if (process.env.NODE_ENV !== 'development' || devWarmupStarted) return;
    devWarmupStarted = true;

    const controller = new AbortController();
    const initialTimer = window.setTimeout(() => {
      void (async () => {
        for (const href of DEV_WARMUP_ROUTES) {
          if (href === window.location.pathname) continue;
          try {
            // 开发模式不会自动预取视口内的 Link；顺序请求页面可提前完成路由编译，
            // 且不会像并发预热那样一次占满本地开发服务器。
            await fetch(href, { cache: 'no-store', signal: controller.signal });
          } catch {
            if (controller.signal.aborted) return;
          }
        }
      })();
    }, 700);

    return () => {
      window.clearTimeout(initialTimer);
      controller.abort();
    };
  }, []);

  useEffect(() => {
    const tabletMedia = window.matchMedia('(min-width: 821px) and (max-width: 1240px)');
    const syncCollapsedState = () => {
      const stored = window.localStorage.getItem('ziwei-workbench-sidebar-collapsed') === 'true';
      setSidebarCollapsed(tabletMedia.matches || stored);
    };
    syncCollapsedState();
    tabletMedia.addEventListener('change', syncCollapsedState);
    return () => tabletMedia.removeEventListener('change', syncCollapsedState);
  }, []);

  const toggleSidebar = () => {
    setSidebarCollapsed(current => {
      const next = !current;
      window.localStorage.setItem('ziwei-workbench-sidebar-collapsed', String(next));
      return next;
    });
  };

  const beginNavigation = (href: string) => {
    setMobileNavOpen(false);
    if (href !== pathname && !href.startsWith(`${pathname}?`)) setPendingHref(href);
  };

  const warmRoute = (href: string) => {
    if (href !== pathname) router.prefetch(href);
  };



  if (!shouldUseFrame(pathname)) return children;

  return (
    <div className={styles.frame} data-eastern-route={pathname}>
      <header className={styles.topbar}>
        <Link className={styles.brand} href="/" aria-label="返回观辰首页">
          <Image src="/assets/brand/guanchen-seal.svg" width={31} height={31} alt="观辰标识" priority />
          <span>
            <strong>观辰</strong>
            <small>命盘与人生观察</small>
          </span>
        </Link>
        <nav className={styles.topnav} aria-label="主要功能">
          {TOP_NAV.map(item => {
            const pending = pendingHref === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-busy={pending || undefined}
                className={`${item.matches(pathname) ? styles.activeTop : ''} ${pending ? styles.pendingTop : ''}`}
                onFocus={() => warmRoute(item.href)}
                onTouchStart={() => warmRoute(item.href)}
                onNavigate={() => beginNavigation(item.href)}
              >
                {pending && <SpinnerGap className={styles.pendingSpinner} size={13} aria-hidden="true" />}
                {item.label}
              </Link>
            );
          })}
        </nav>
        <div className={styles.topbarActions}>
          <Link className={styles.homeLink} href="/"><House size={16} aria-hidden="true" /><span>首页</span></Link>
          <button
            type="button"
            className={styles.menuButton}
            onClick={() => {
              if (!mobileNavOpen) window.dispatchEvent(new Event('eastern-navigation-open'));
              setMobileNavOpen(open => !open);
            }}
            aria-controls="eastern-mobile-navigation"
            aria-expanded={mobileNavOpen}
            aria-label={mobileNavOpen ? '关闭功能导航' : '打开功能导航'}
          >
            {mobileNavOpen ? <X size={20} aria-hidden="true" /> : <List size={20} aria-hidden="true" />}
            <span>功能</span>
          </button>
        </div>
      </header>

      {pendingHref && (
        <div className={styles.navigationProgress} role="status" aria-live="polite">
          <span className={styles.srOnly}>正在打开新页面</span>
        </div>
      )}

      <div className={`${styles.body} ${sidebarCollapsed ? styles.bodyCollapsed : ''}`}>
        <button
          type="button"
          className={`${styles.sidebarBackdrop} ${mobileNavOpen ? styles.sidebarBackdropVisible : ''}`}
          onClick={() => setMobileNavOpen(false)}
          aria-label="关闭功能导航"
          tabIndex={mobileNavOpen ? 0 : -1}
        />
        <aside
          ref={mobileNavRef}
          tabIndex={-1}
          role={mobileNavOpen ? 'dialog' : undefined}
          aria-modal={mobileNavOpen || undefined}
          id="eastern-mobile-navigation"
          className={`${styles.sidebar} ${sidebarCollapsed ? styles.sidebarCollapsed : ''} ${mobileNavOpen ? styles.sidebarOpen : ''}`}
          aria-label="观辰功能目录"
        >
          <div className={styles.sideBrand}>功能目录</div>
          {mobileNavOpen && <button type="button" className="flex min-h-11 min-w-11 items-center justify-center" aria-label="关闭目录" onClick={() => setMobileNavOpen(false)}><X size={20} /></button>}
          <button type="button" className={styles.sidebarToggle} onClick={toggleSidebar} aria-expanded={!sidebarCollapsed} title={sidebarCollapsed ? '展开侧栏' : '收起侧栏'}>
            <SidebarSimple size={18} weight={sidebarCollapsed ? 'fill' : 'regular'} aria-hidden="true" />
            <span>{sidebarCollapsed ? '展开侧栏' : '收起侧栏'}</span>
          </button>
          <nav>
            {SIDE_NAV.map(group => (
              <section key={group.label} className={styles.navGroup} aria-label={group.label}>
                <h2>{group.label}</h2>
                <div>
                  {group.items.map(item => {
                    const IconComponent = item.icon;
                    const active = item.matches(pathname);
                    const href = resolveSideHref(item, pathname);
                    const pending = pendingHref === href;
                    return (
                      <Link
                        key={`${item.href}-${item.label}`}
                        href={href}
                        title={sidebarCollapsed ? item.label : undefined}
                        className={`${active ? styles.activeSide : ''} ${pending ? styles.pendingSide : ''}`}
                        aria-current={active ? 'page' : undefined}
                        aria-busy={pending || undefined}
                        onFocus={() => warmRoute(href)}
                        onTouchStart={() => warmRoute(href)}
                        onNavigate={() => beginNavigation(href)}
                      >
                        {pending
                          ? <SpinnerGap className={styles.pendingSpinner} size={17} aria-hidden="true" />
                          : <IconComponent size={17} weight={active ? 'fill' : 'regular'} aria-hidden="true" />}
                        <span>{item.label}</span>
                      </Link>
                    );
                  })}
                </div>
              </section>
            ))}
          </nav>
          <Link href="/" className={styles.collapseHint}><House size={16} aria-hidden="true" /><span>返回首页</span></Link>
        </aside>

        <div className={styles.content}>
          {shouldShowNotice(pathname) && <div className={styles.noticeWrap}><ResultNotice compact /></div>}
          {children}
        </div>
      </div>
    </div>
  );
}
