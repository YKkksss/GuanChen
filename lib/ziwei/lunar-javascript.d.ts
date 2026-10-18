declare module 'lunar-javascript' {
  class Lunar {
    static fromYmd(year: number, month: number, day: number): Lunar;
    getYear(): number;
    getMonth(): number;  // negative = leap month
    getDay(): number;
    getYearGan(): string;
    getYearZhi(): string;
    getMonthGan(): string;
    getMonthZhi(): string;
    getDayGan(): string;
    getDayZhi(): string;
    getYearInChinese(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getJieQi(): string;
    getDayInGanZhi(): string;
    getDayInGanZhiExact(): string;
    getTimeInGanZhi(): string;
    getTimeYi(): string[];
    getTimeJi(): string[];
    getTimeChongDesc(): string;
    getTimeChongShengXiao(): string;
    getTimeSha(): string;
    getTimeTianShen(): string;
    getTimeTianShenType(): string;
    getTimeTianShenLuck(): string;
    getMonthInGanZhi(): string;
    getMonthInGanZhiExact(): string;
    getDayYi(sect?: number): string[];
    getDayJi(sect?: number): string[];
    getZhiXing(): string;
    getDayTianShen(): string;
    getDayTianShenType(): string;
    getDayTianShenLuck(): string;
    getDayChongDesc(): string;
    getDayChongShengXiao(): string;
    getDaySha(): string;
    getEightChar(): EightChar;
    getSolar(): Solar;
  }

  class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    static fromYmdHms(year: number, month: number, day: number, hour: number, minute: number, second: number): Solar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    toYmd(): string;
    getLunar(): Lunar;
  }

  class EightChar {
    setSect(sect: number): void;
  }
}
