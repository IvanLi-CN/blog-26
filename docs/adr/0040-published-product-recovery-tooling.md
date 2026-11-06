---
status: accepted
---

# 已发布冻结产物的恢复工具

## Context

Product Release 原 run 重试先读取 main 上的登记工具，再 checkout 产品的冻结来源提交。已发布产物的 EdgeOne 阶段失败后，后一个 checkout 会覆盖 main 上的发布工具修复，导致原 run 无法获得诊断或传输修复。4.1.6 的两次失败还因丢弃全部 CLI 输出而没有保留失败阶段和退出码。

## Decision

登记状态为 frozen 且已有 products 证明，或状态为 published / deployed 且同时已有 products 和 publication 证明的恢复，使用当前受信 main checkout 的发布工具执行。该工具提交必须通过既有 main CI/E2E 门禁；未通过时失败关闭。尚无完整冻结 products 的阶段继续 checkout 登记的 merge SHA，避免使用新源码重建历史产品。

原 run、登记身份、产品版本、merge SHA 和冻结产物 digest 保持绑定。恢复仍从原 run 下载并验证产物，已登记产物缺失、过期或不匹配时拒绝恢复，不允许重新构建。原工作流的 source_sha 输出在这一恢复分支表示执行 checkout；产品来源仍只来自登记和 manifest。日志分别记录产品来源和执行工具提交。

发布恢复不能依赖按 tag 的 API 查找 draft：404 后枚举同 tag release，严格核验来源、机器人作者和完整身份 marker；唯一含产物的 draft 优先恢复，空重复 draft 保留，多个含产物的 draft 或任何身份冲突均失败关闭。镜像上传后仅对暂不可见进行有限读取重试，实际 digest 不一致立即拒绝并记录两个 digest，不重传或改写版本镜像。

静态站返回 HTTP 200 且 `version.json` 正文恰为空时，只允许用独立的完整证明恢复归属判断：GHCR `latest` 的实际 manifest digest 和版本/来源标签必须匹配账本中已完成且验证 latest 的正式发布，公开 Playbook manifest 的 renderer 必须与同一来源提交一致。仍执行版本单调性检查。非空损坏 JSON、缺失镜像、未完成发布、摘要冲突、未知 renderer 和较新产品均拒绝；既有 404 bootstrap 例外不扩大。此规则只恢复发布前检查，不把损坏页面判为发布成功。

EdgeOne CLI 诊断仅输出退出码和固定枚举的阶段、错误类别，不输出原始响应、凭据、项目标识或签名预览 URL。

## Consequences

可以修复原 run 的发布工具并保留全部冻结身份，不必创建替代发布 run 或改变产品字节。恢复执行依赖当前 main 的工具兼容性；新的工具门禁失败会阻止恢复，而不会改变已发布产品的来源证明。

## Rejected alternatives

仅在新工作流 YAML 中加入覆盖步骤不能修复已存在 run 使用的旧工作流定义。新建发布 run 并复制产物会破坏原 run 的审计绑定。本机绕过 CI 部署不能修复后续发布。
