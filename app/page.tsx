'use client';

import { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { motion, useReducedMotion } from 'framer-motion';
import {
  ArrowUpRight,
  BellSimple,
  BookOpen,
  Books,
  CalendarDots,
  ChartLineUp,
  ChatCircleText,
  ClockCounterClockwise,
  Compass,
  Heart,
  List,
  MapTrifold,
  Notebook,
  ShieldCheck,
  Sparkle,
  UsersThree,
  X,
} from '@phosphor-icons/react';
import HomeBirthForm from '@/components/HomeBirthForm';
import type { Conversation } from '@/lib/conversations/types';
import type { BirthInfo } from '@/lib/ziwei/types';
import styles from './home.module.css';

const CAPABILITIES = [
  { icon: BookOpen, title: '本命解读', description: '十二宫位与星曜组合，梳理天赋、性格与人生底色' },
  { icon: ChartLineUp, title: '大限流年', description: '观察十年节律与年度重点，建立连续的人生时间轴' },
  { icon: Heart, title: '合盘关系', description: '从双方命盘看互动模式、关系议题与相处建议' },
  { icon: ChatCircleText, title: 'AI 深度问答', description: '基于当前命盘持续追问，对话和关键信息长期保存' },
];

const MODULES = [
  { href: '/heming', icon: UsersThree, title: '紫微合盘', description: '分析伴侣、亲子、合作等关系中的互动结构与共同课题。', className: styles.moduleWide },
  { href: '/learn', icon: Books, title: '学习中心', description: '从命盘结构、十二宫和十四主星开始，循序理解自己的盘。', className: styles.moduleTall },
  { href: '/bazi', icon: CalendarDots, title: '八字分析', description: '查看十神、强弱、格局与大运流年。', className: styles.moduleCompact },
  { href: '/rectification', icon: ClockCounterClockwise, title: '生时校正', description: '通过人生事件评估可能的出生时辰。', className: styles.moduleCompact },
  { href: '/cases', icon: Notebook, title: '案例研习', description: '用匿名案例训练命盘结构判断。', className: styles.moduleCompact },
  { href: '/reminders', icon: BellSimple, title: '人生提醒', description: '按流年、生日与重要事件建立本地提醒。', className: styles.moduleCompact },
];

function Reveal({ children, className = '', delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  const reduceMotion = useReducedMotion();
  return (
    <motion.div
      className={className}
      initial={reduceMotion ? false : { opacity: 0, y: 22 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.62, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const reduceMotion = useReducedMotion();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  useEffect(() => {
    document.body.classList.add('eastern-home-body');
    return () => document.body.classList.remove('eastern-home-body');
  }, []);

  const createChartConversation = async (birthInfo: BirthInfo) => {
    setCreating(true);
    setCreateError('');
    try {
      const { generateChart } = await import('@/lib/ziwei/algorithm');
      const chartSnapshot = generateChart(birthInfo);
      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'chart', birthInfo, chartSnapshot }),
      });
      const data = await response.json() as { conversation?: Conversation; error?: string };
      if (!response.ok || !data.conversation) throw new Error(data.error || '命盘创建失败，请稍后再试');
      window.dispatchEvent(new Event('conversation-updated'));
      router.push(`/chart/${data.conversation.id}`);
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : '命盘创建失败，请稍后再试');
    } finally {
      setCreating(false);
    }
  };

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Link href="/" className={styles.brand} aria-label="紫微命盘东方书院首页">
            <Image src="/assets/brand/ziwei-seal.png" alt="" width={42} height={42} priority />
            <span>紫微命盘 <i /> 东方书院</span>
          </Link>

          <nav className={styles.desktopNav} aria-label="主导航">
            <Link href="/chart">命盘</Link>
            <Link href="/heming">合盘</Link>
            <Link href="/learn">学习</Link>
            <Link href="/cases">案例</Link>
          </nav>

          <div className={styles.headerActions}>
            <Link href="/rectification">校时</Link>
            <span className={styles.actionDivider} aria-hidden="true" />
            <Link href="/bazi">八字</Link>
            <a href="#home-chart-form" className={styles.headerCta}>开始起盘</a>
            <button
              type="button"
              className={styles.menuButton}
              onClick={() => setMobileMenuOpen(current => !current)}
              aria-expanded={mobileMenuOpen}
              aria-label={mobileMenuOpen ? '关闭导航' : '打开导航'}
            >
              {mobileMenuOpen ? <X size={22} /> : <List size={22} />}
            </button>
          </div>
        </div>

        {mobileMenuOpen && (
          <motion.nav
            className={styles.mobileNav}
            aria-label="移动端导航"
            initial={reduceMotion ? false : { opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
          >
            {[
              ['/chart', '命盘'], ['/heming', '合盘'], ['/learn', '学习'], ['/cases', '案例'],
              ['/rectification', '校时'], ['/bazi', '八字'], ['/reminders', '提醒'],
            ].map(([href, label]) => (
              <Link key={href} href={href} onClick={() => setMobileMenuOpen(false)}>{label}</Link>
            ))}
          </motion.nav>
        )}
      </header>

      <main>
        <section className={styles.hero}>
          <div className={styles.heroInner}>
            <motion.div
              className={styles.heroCopy}
              initial={false}
            >
              <Image
                className={styles.orbitWatermark}
                src="/assets/brand/ziwei-orbit-watermark.png"
                alt=""
                width={1254}
                height={1254}
                priority
                sizes="(max-width: 860px) 92vw, 58vw"
              />
              <div className={styles.heroMessage}>
                <h1>知命而行，观心见己</h1>
                <p className={styles.heroLead}>以紫微为门，读懂人生的节律与选择</p>
                <p className={styles.heroDescription}>
                  <span>传统命理体系与现代 AI 解读相结合</span>
                  <span>从本命、大限到流年，建立一份可回看的长期人生档案</span>
                </p>
              </div>
            </motion.div>

            <motion.aside
              className={styles.formPanel}
              aria-label="开始起盘"
              initial={false}
            >
              <HomeBirthForm loading={creating} error={createError} onSubmit={birthInfo => void createChartConversation(birthInfo)} />
            </motion.aside>
          </div>
        </section>

        <section className={styles.capabilities} aria-label="核心能力">
          <div className={styles.capabilityGrid}>
            {CAPABILITIES.map((item, index) => {
              const Icon = item.icon;
              return (
                <Reveal key={item.title} className={styles.capability} delay={index * 0.05}>
                  <Icon size={34} weight="thin" aria-hidden="true" />
                  <div><h2>{item.title}</h2><p>{item.description}</p></div>
                </Reveal>
              );
            })}
          </div>
        </section>

        <section className={styles.methodSection}>
          <div className={styles.sectionInner}>
            <Reveal className={styles.methodCopy}>
              <p className={styles.sectionKicker}>排盘方法</p>
              <h2>排盘有据，解读有源</h2>
              <p className={styles.sectionIntro}>基础命盘由确定性规则生成，AI 只负责解释与追问。每一层结果都能回到命盘结构和知识来源。</p>
              <div className={styles.methodList}>
                <div><Compass size={22} aria-hidden="true" /><span><strong>规则可复核</strong>纳音五行局、命身宫、十四主星和四化依统一算法生成。</span></div>
                <div><ShieldCheck size={22} aria-hidden="true" /><span><strong>算法与 AI 分工清楚</strong>AI 不改动基础盘，只结合知识库解释命盘结构。</span></div>
                <div><MapTrifold size={22} aria-hidden="true" /><span><strong>长期命档持续积累</strong>历史对话、年度报告和重要事件在本地持续保存。</span></div>
              </div>
            </Reveal>

            <Reveal className={styles.productPreview} delay={0.08}>
              <div className={styles.previewFrame}>
                <Image
                  src="/assets/product/workbench-preview.png"
                  alt="东方书院命盘工作台，左侧为历史记录，中间为命盘，右侧为 AI 解读"
                  width={1480}
                  height={1040}
                  sizes="(max-width: 900px) 92vw, 52vw"
                />
              </div>
              <p>命盘、历史记录与 AI 解读在同一工作台完成</p>
            </Reveal>
          </div>
        </section>

        <section className={styles.modulesSection}>
          <div className={styles.modulesInner}>
            <Reveal className={styles.modulesHeading}>
              <p className={styles.sectionKicker}>延伸工具</p>
              <h2>不止一张命盘</h2>
              <p>从关系分析、八字到学习与案例，把命理知识变成可以持续使用的个人工具。</p>
            </Reveal>

            <div className={styles.moduleGrid}>
              {MODULES.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Reveal key={item.href} className={item.className} delay={(index % 3) * 0.05}>
                    <Link href={item.href} className={styles.moduleLink}>
                      <span className={styles.moduleIcon}><Icon size={25} aria-hidden="true" /></span>
                      <span className={styles.moduleCopy}><strong>{item.title}</strong><small>{item.description}</small></span>
                      <ArrowUpRight size={18} className={styles.moduleArrow} aria-hidden="true" />
                    </Link>
                  </Reveal>
                );
              })}
            </div>
          </div>
        </section>

        <section className={styles.sourcesSection}>
          <div className={styles.sourcesInner}>
            <Reveal className={styles.sourcesCopy}>
              <Sparkle size={24} aria-hidden="true" />
              <h2>从古籍原典到现代学习</h2>
              <p>结合《天纪》公开教学体系、《紫微斗数全书》《紫微斗数全集》与《骨髓赋》，让结论可以继续查阅和学习。</p>
            </Reveal>
            <nav className={styles.sourceLinks} aria-label="知识内容入口">
              <Link href="/knowledge">紫微知识库 <ArrowUpRight size={15} /></Link>
              <Link href="/library">古籍原典库 <ArrowUpRight size={15} /></Link>
              <Link href="/learn">系统学习 <ArrowUpRight size={15} /></Link>
              <Link href="/practice">实战练习 <ArrowUpRight size={15} /></Link>
            </nav>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.footerInner}>
          <div className={styles.footerBrand}>
            <Image src="/assets/brand/ziwei-seal.png" alt="" width={30} height={30} />
            <span>紫微命盘 <i /> 东方书院</span>
          </div>
          <p>内容仅供传统文化研究与个人成长参考，不构成医疗、投资或人生决策建议。</p>
          <div className={styles.footerLinks}><Link href="/terms">服务条款</Link><Link href="/privacy">隐私政策</Link></div>
        </div>
      </footer>
    </div>
  );
}
