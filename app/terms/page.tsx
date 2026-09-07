import LocalEditionNotice from '@/components/LocalEditionNotice';

export const metadata = { title: '本地版使用说明 · 紫微命盘' };

export default function NoticePage() {
  return <LocalEditionNotice title="本地版使用说明">
    <section><h2>版本用途</h2><p>本项目是个人或可信局域网使用的命理研究工作台，提供排盘、AI 对话、档案、事件、报告和学习功能。v1 范围固定后按计划收尾，通过完整验收后才正式冻结。</p></section>
    <section><h2>核对输入与结果</h2><p>请核对出生日期、时间、性别和地点，并注意未知时辰及不同排盘口径的限制。命理资料与 AI 内容用于学习和回顾，可能存在遗漏或错误，不能代替现实证据与专业判断。</p></section>
    <section><h2>使用与维护</h2><p>部署电脑需要保持运行，其他设备才能访问。局域网访问者共享档案，不具备独立账号空间；提醒也不是关闭应用后仍保证送达的系统通知。更新前先备份，恢复整库前核对预检结果，避免用错误备份替换现有档案。</p></section>
    <section><h2>许可与后续发布</h2><p>代码许可按仓库随附的 LICENSE 执行，上游资料保留其来源与许可说明。本页面用于说明当前版本行为，不增加未经确认的运营主体、客服承诺或违约赔偿条款。公开商业服务所需的账号隔离、部署方案及相关说明另行确认。</p></section>
  </LocalEditionNotice>;
}
