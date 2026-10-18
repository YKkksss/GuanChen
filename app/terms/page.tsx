import LocalEditionNotice from '@/components/LocalEditionNotice';

export const metadata = { title: '服务使用说明 · 观辰' };

export default function NoticePage() {
  return <LocalEditionNotice title="服务使用说明">
    <section><h2>版本用途</h2><p>观辰是一套集中部署、按账号提供资料空间的命理研究工作台，提供排盘、AI 对话、档案、事件、报告和学习功能。v1.0.0 已冻结；账号体系为后续开发内容。</p></section>
    <section><h2>核对输入与结果</h2><p>请核对出生日期、时间、性别和地点，并注意未知时辰及不同排盘口径的限制。命理资料与 AI 内容用于学习和回顾，可能存在遗漏或错误，不能代替现实证据与专业判断。</p></section>
    <section><h2>使用与维护</h2><p>服务端需要保持运行，各设备登录同一账号访问自己的档案；提醒也不是关闭应用后仍保证送达的系统通知。更新前先备份，恢复账号数据前核对预检结果，避免用错误备份替换现有档案。</p></section>
    <section><h2>许可与后续发布</h2><p>代码许可按仓库随附的 LICENSE 执行，上游资料保留其来源与许可说明。本页面用于说明当前版本行为，不增加未经确认的运营主体、客服承诺或违约赔偿条款。正式公开运营的服务地址、运营主体与部署配置由部署者确定。</p></section>
  </LocalEditionNotice>;
}
