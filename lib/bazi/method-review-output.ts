/** 补充拦截本轮仍未裁决的结论；不将否定、待核的正常说明误认为断言。 */
export function findBaziMethodOutputViolations(text: string): string[] {
  const found = new Set<string>();
  const claims: Array<[string, RegExp]> = [
    ['越权宣告通关或病药生效', /(?:已经|已能|确已|可判|判定)(?:完成)?通关|通关(?:已经|已)?(?:成立|成功|生效)|病药(?:已经|已)?(?:生效|奏效)|(?:药神|所取之药)(?:已经|已)(?:生效|奏效)/g],
    ['越权宣告格局成败或救应完成', /(?:已经|确已|可判|判定)(?:成格|破格|救应完成)|格局(?:已经|已)(?:成立|失败)|救应(?:已经|已)完成/g],
    ['越权判断身强身弱', /(?:最终|确定|判定)(?:日主|命主|命局)?(?:身强身弱|身强|身弱)|(?:日主|命主|命局)(?:确定|已经判为)(?:身强|身弱)/g],
  ];
  for (const clause of text.split(/[，,；;。！？!?\n]/)) for (const [label, pattern] of claims) {
    for (const match of clause.matchAll(pattern)) {
      const before = clause.slice(Math.max(0, match.index! - 20), match.index);
      const after = clause.slice(match.index! + match[0].length, match.index! + match[0].length + 12);
      if (/(?:不能|不可|不应|不得|不等于|不代表|未能|尚未|没有证据|无法|未判|未证明)[^但而却]*$/.test(before) || /^(?:仍|还|尚)?(?:待核|未定|未判|未裁决|不能确定|未确认|尚未确认)/.test(after)) continue;
      found.add(label);
    }
  }
  return [...found];
}
