// 通过 Playwright browser_run_code 的 filename 参数执行，先打开独立验收服务。
// 只读遍历已创建的合成资料；返回机器结果，由调用端另存 JSON。不是人工 WCAG 认证。
async (page) => {
  const base = 'http://127.0.0.1:30002';
  if (!page.url().startsWith(base + '/')) throw new Error('只允许在独立验收服务执行');
  const chart = '910953c7-e047-46be-874f-4ee3faf5edd7';
  const heming = '13ad4b4d-0cf1-46ac-9e76-f04a11919d76';
  const rectification = '4963ca0e-4211-48ef-bdef-0bece39adae4';
  const routes = [
    '/', '/chart', '/history', '/chart/select?target=reports', '/heming', '/rectification', '/bazi',
    '/learn', '/knowledge', '/library', '/practice', '/practice/review', '/practice/open-ended',
    '/practice/foundation-review', '/practice/chart-structure', '/cases', '/reminders', '/reviews',
    '/settings/data', '/privacy', '/terms',
    `/chart/${chart}`, `/chart/${chart}/events`, `/chart/${chart}/timeline`, `/chart/${chart}/reports`,
    `/chart/${chart}/reports/6b4ed922-677a-4c85-8f13-be5ff5447c74`,
    `/heming/${heming}`, `/heming/${heming}/reports`,
    `/heming/${heming}/reports/e75cad06-a016-42ff-852b-dcb55476baf2`,
    `/rectification/${rectification}`, `/rectification/${rectification}/reports`,
    `/rectification/${rectification}/reports/589ce54b-8354-49f1-9191-87872b91d7a2`,
    '/bazi/chat/bae513ad-e058-4e1f-9c0b-f8a2a6a9ba77',
  ];
  const results = [];
  const pageErrors = [];
  const onError = error => pageErrors.push({ route: page.url(), message: error.message });
  page.on('pageerror', onError);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // 每次运行使用当前视口，桌面与窄屏分别执行，避免单次调用过长。
  try {
    for (const route of routes) {
      const response = await page.goto(base + route);
      // 生产服务没有 HMR 长连接，等待本页真实请求完成后扫描。
      await page.waitForLoadState('networkidle');
      await page.addScriptTag({ path: 'node_modules/axe-core/axe.min.js' });
      const scan = () => page.evaluate(async () => {
        await document.fonts.ready;
        const result = await window.axe.run(document, {
          runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa'] },
        });
        return {
          violations: result.violations.map(item => ({
            id: item.id, impact: item.impact,
            nodes: item.nodes.map(node => ({ target: node.target, html: node.html, summary: node.failureSummary })),
          })),
          incompleteCount: result.incomplete.length,
          horizontalOverflow: document.documentElement.scrollWidth > window.innerWidth,
        };
      });
      results.push({ route, status: response.status(), ...await scan() });
      if (route === '/bazi') {
        await page.getByRole('button').filter({ hasText: 'QA-八字完整测试' }).last().click();
        await page.waitForLoadState('networkidle');
        await page.locator('summary').filter({ hasText: '藏干触达条件' }).click();
        // 等待有限的入场动画完成，避免把过渡中的透明度误报为静态对比度问题。
        await page.waitForFunction(() => document.getAnimations()
          .filter(animation => animation.effect?.getTiming().iterations !== Infinity)
          .every(animation => animation.playState === 'finished'));
        results.push({ route: '/bazi#历史档案-藏干触达展开', status: response.status(), ...await scan() });
      }
    }
  } finally { page.off('pageerror', onError); }
  return { completedAt: new Date().toISOString(), viewport: page.viewportSize(), results, pageErrors };
}
