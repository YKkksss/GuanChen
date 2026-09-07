/** 本地版只使用部署者配置的地址，不继承上游站点身份。 */
export const SITE_URL = new URL(process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:30001').origin;
