const MONTH_COMMAND_WORDS = /人元司令|人元司事|月令分日|司令分日|司令|司事|分日定位|月内位置/;
const NEGATED = /(?:不能|不可|不应|不得|不等于|不代表|不说明|不是|并非|并不|未必|没有|未能|尚未|无法|未判|未证明|未确定|未裁决|不意味着|不足以|不据此)[^但而却]*$/;

function qualified(before: string, after: string): boolean {
  return NEGATED.test(before)
    || /^(?:仍|还|尚)?(?:待核|未定|未判|未裁决|不能确定|未确认|尚未确认|需|须)/.test(after)
    || /(?:是否|能否|若要|如需)[^但而却]*$/.test(before) && /待核|仍需|尚需|须另|需要/.test(after)
    || /(?:仍需|尚需|还需|须另|需要)[^但而却]*$/.test(before);
}

/** 只遮蔽司令说明中明确否定或待核的结论词，供既有通用拦截器避免误报；原回复从不改写。 */
export function baziMonthCommandAssertionText(text: string): string {
  return text.split(/(?<=[。！？!?\n])/).map(sentence => {
    if (!MONTH_COMMAND_WORDS.test(sentence)) return sentence;
    return sentence.split(/(?<=[，,；;])/).map(clause => clause.replace(/身强身弱|身强|身弱|偏强|偏弱|成格|破格|(?:唯一|最终|确定)(?:用神|喜神|忌神|喜用)/g, (claim, offset: number) => {
      const before = clause.slice(Math.max(0, offset - 40), offset), after = clause.slice(offset + claim.length, offset + claim.length + 28);
      return qualified(before, after) ? '待核结论' : claim;
    })).join('');
  }).join('');
}

/** 司令分日只定位原典表段，不允许单凭定位推出全局或替换未明确的原文字。 */
export function findBaziMonthCommandOutputViolations(text: string): string[] {
  const found = new Set<string>();
  const claims: Array<[string, RegExp]> = [
    ['越权用司令裁定旺衰', /(?:日主|命主|命局|此命|你)?(?:已|已经|确定|判定|可判|就是|即为|属于|变得)?(?:身强身弱|身强|身弱|偏强|偏弱|强旺|衰弱)/g],
    ['越权用司令裁定格局成败', /(?:已经|已|确定|判定|可判|就是|即为)?(?:成格|破格)|格局(?:已经|已)?(?:成立|失败|成败已定)/g],
    ['越权用司令指定唯一喜忌', /(?:唯一|最终|确定)(?:用神|喜神|忌神|喜用)|(?:用神|喜神|忌神|喜用)(?:就是|即为|确定为|唯一为)/g],
    ['越权替换司令原文字', /[艮坤已巳]土.{0,8}(?:就是|即为|改作|改为|换成|映射为|认定为|等同于)[戊己](?:土)?/g],
    ['越权补满司令三十日尾段', /(?:三十日|30日|三十天|30天)(?:后|之后|以外).{0,12}(?:顺延|自动归入|仍归|仍属|沿用末段|归入末段|归入最后)/g],
  ];
  const normalized = text.replace(/\*\*|__|`/g, '');
  let previousMonthCommand = false;
  for (const sentence of normalized.split(/[。！？!?\n]/)) {
    if (!sentence.trim()) continue;
    const related: boolean = MONTH_COMMAND_WORDS.test(sentence) || previousMonthCommand && /^(?:因此|所以|据此|由此|这说明|可见)/.test(sentence.trim());
    previousMonthCommand = related;
    if (!related) continue;
    for (const clause of sentence.split(/[，,；;]/)) for (const [label, pattern] of claims) {
      for (const match of clause.matchAll(pattern)) {
        const before = clause.slice(Math.max(0, match.index! - 40), match.index), after = clause.slice(match.index! + match[0].length, match.index! + match[0].length + 28);
        if (!qualified(before, after) && !/(?:不能|不可|不应|不得|不等于|不代表|无法|未能|不自动|尚未)/.test(match[0])) found.add(label);
      }
    }
  }
  return [...found];
}
