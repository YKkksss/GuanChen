const INTAKE_WORDS = /月令取用|取用入口|本气|透干|透出|会支|三合|三会|六合|杂气|去留|合化|入口/;
const NEGATED = /(?:不能|不可|不应|不得|不等于|不代表|不说明|不是|并非|并不|未必|没有|未能|尚未|无法|未判|未证明|未确定|未裁决|不意味着|不足以|不据此|不|无)[^但而却]*$/;

function qualified(before: string, after: string): boolean {
  return NEGATED.test(before)
    || /^(?:仍|还|尚)?(?:待核|未定|未判|未裁决|不能确定|未确认|尚未确认|需|须)/.test(after)
    || /(?:是否|能否|若要|如需)[^但而却]*$/.test(before) && /待核|仍需|尚需|须另|需要/.test(after)
    || /(?:仍需|尚需|还需|须另|需要)[^但而却]*$/.test(before);
}

/** 月令取用入口只并列位置与五行，不允许把入口、会支或条数写成既成结论。 */
export function findBaziMonthIntakeOutputViolations(text: string): string[] {
  const found = new Set<string>();
  const claims: Array<[string, RegExp]> = [
    ['越权宣告会支合化', /(?:三合|三会|会支|会局).{0,12}(?:因此|所以|说明|代表|已经|已|即为|就是|可判).{0,8}(?:合化|化成|化局|成局|化气|变格)|(?:已经|已)(?:合化|化局|化成)[^，。；]{0,6}(?:三合|三会)?/g],
    ['越权把缺字组合当成完整会支', /(?:缺字|缺支|仅见.{0,4}支|两支).{0,12}(?:也算|也作|视为|即是|就是|等同于).{0,8}(?:三合|三会|会局|会支)/g],
    ['越权把六合当三合三会', /六合.{0,10}(?:等同于|即为|就是|算作|视为|并入).{0,8}(?:三合|三会|会局|会支)/g],
    ['越权按入口条数排名或选唯一', /(?:入口|透干|会支|本气).{0,12}(?:最多|数量最多|条数|数量).{0,12}(?:优先|排名|第一|取为|胜出|唯一)|(?:按|以).{0,8}(?:入口|透干|会支).{0,6}(?:数量|条数).{0,8}(?:排序|排名|取舍|择优)/g],
    ['越权用入口或司令强选取格', /(?:司令|司事|分日|入口).{0,12}(?:因此|所以|据此|可判|即可|已经).{0,10}(?:取格|定格局|成格|破格|用神)/g],
    ['越权由入口直接裁旺衰或唯一喜忌', /(?:本气|透干|会支|入口).{0,20}(?:因此|所以|说明|可判|已经|即可).{0,10}(?:身强|身弱|成格|破格|唯一用神|最终用神|确定喜神|确定忌神)/g],
    ['越权给会支指定阴阳天干', /(?:三合|三会|会支).{0,12}(?:取|用|即为|确定为).{0,6}[甲乙丙丁戊己庚辛壬癸](?:木|火|土|金|水)?/g],
  ];
  const normalized = text.replace(/\*\*|__|`/g, '');
  let previousIntake = false;
  for (const sentence of normalized.split(/[。！？!?\n]/)) {
    if (!sentence.trim()) continue;
    const related: boolean = INTAKE_WORDS.test(sentence) || previousIntake && /^(?:因此|所以|据此|由此|这说明|可见)/.test(sentence.trim());
    previousIntake = related;
    if (!related) continue;
    for (const clause of sentence.split(/[，,；;]/)) for (const [label, pattern] of claims) {
      for (const match of clause.matchAll(pattern)) {
        const before = clause.slice(Math.max(0, match.index! - 40), match.index), after = clause.slice(match.index! + match[0].length, match.index! + match[0].length + 28);
        if (!qualified(before, after) && !/(?:不能|不可|不应|不得|不等于|不代表|无法|未能|不自动|尚未|不)/.test(match[0])) found.add(label);
      }
    }
  }
  return [...found];
}
