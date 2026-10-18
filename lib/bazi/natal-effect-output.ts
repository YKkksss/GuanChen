/** 对本阶段尚未计算的实际作用结论作补充拦截，允许正常解释否定和待核边界。 */
export function findBaziNatalOutputViolations(text: string): string[] {
  const violations = new Set<string>();
  const claims: Array<[string, RegExp]> = [
    ['越权宣告合化', /合化(?:已经|已)?(?:成功|成立)|(?:已经|确已|可判|判定)(?:发生)?(?:合绊|合去|解冲|化成[木火土金水])/g],
    ['越权宣告拔根或根气失效', /(?:已经|确已|可判|判定)(?:被)?拔根|根(?:气)?(?:已经|已|被)(?:全部|完全|相冲|冲击|冲)?(?:拔除|拔掉|冲掉|消失|失效)|(?:因此|所以|说明)(?:已经|已)?(?:拔根|根气失效)/g],
  ];
  for (const clause of text.split(/[，,；;。！？!?\n]/)) for (const [label, pattern] of claims) {
    pattern.lastIndex = 0;
    for (const match of clause.matchAll(pattern)) {
      const before = clause.slice(Math.max(0, match.index! - 18), match.index), after = clause.slice(match.index! + match[0].length, match.index! + match[0].length + 12);
      if (/(?:不能|不可|不应|不得|不等于|不代表|不说明|未能|尚未|没有证据|无法|未判|未证明|不意味着)[^但而却]*$/.test(before) || /^(?:仍|还|尚)?(?:待核|未定|未判|不能确定|尚未确认|并未证实)/.test(after)) continue;
      violations.add(label);
    }
  }
  return [...violations];
}
