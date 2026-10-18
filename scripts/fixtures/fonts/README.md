# PDF 测试字体

这两个字体只用于 `scripts/test-report-pdf-exports.ts` 的确定性分页测试，不用于生产排版。

- 来源：Noto Sans SC（`notofonts/noto-cjk`，SIL Open Font License 1.1）。
- 子集：只保留 PDF 测试、分页夹具、渲染器与报告类型文本中出现的字符，约 870 个。
- 目的：避免 CI 或开发机缺少中文字体、或系统字体度量不同，导致同一份 PDF 夹具在不同机器上页数不一致。

生成方式（需 fontTools）：

```powershell
python -m fontTools.subset NotoSansSC-Regular.otf `
  --text-file=chars.txt `
  --output-file=NotoSansSC-Test-Regular.otf `
  --layout-features=*
```

许可全文见 [OFL.txt](./OFL.txt)。字体只作为测试夹具提交，不改变生产 PDF 的字体选择逻辑。
