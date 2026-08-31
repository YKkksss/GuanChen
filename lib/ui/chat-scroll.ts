export interface ScrollMetrics {
  scrollTop: number;
  scrollHeight: number;
  clientHeight: number;
}

/**
 * 判断消息列表是否仍贴近底部。
 *
 * 保留少量像素容差，用于吸收浏览器小数像素与字体渲染造成的偏差；
 * 超出容差则视为用户正在阅读历史内容，流式输出不应再抢夺滚动位置。
 */
export function isNearScrollBottom(metrics: ScrollMetrics, threshold = 24) {
  const distance = metrics.scrollHeight - metrics.clientHeight - metrics.scrollTop;
  return Math.max(0, distance) <= threshold;
}
