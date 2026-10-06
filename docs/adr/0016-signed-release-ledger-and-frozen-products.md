---
status: accepted
---

# Signed release ledger and frozen products

发布登记使用独立 `release-ledger` 分支，由内置 `GITHUB_TOKEN` 调用 GraphQL `createCommitOnBranch`，以读取到的旧 SHA 作为 `expectedHeadOid` 进行原子比较交换；并发竞争不能覆盖已完成的状态更新。登记分支从批准的 bootstrap SHA 创建，首个签名登记提交绑定该父提交，后续均为签名单父状态链。提交经 GitHub Verified 核验；状态摘要和批准的 bootstrap 来源写入签名提交消息。

登记绑定版本、准备来源、策略和语义证据，再绑定 PR、合并 SHA、原 Actions run、冻结产物和发布/部署证明。版本一旦预留就被占用；废弃准备也不释放版本。登记只支持相邻向前的状态迁移；已记录身份字段和证明不可替换。

输入与两种产物存入原运行的不可覆盖 Actions artifact，保留 90 天。恢复核验 artifact ID、服务端归档摘要、文件清单摘要及产品摘要；过期或丢失时停止，不为同一身份重新取得变化的外部输入。静态归档同时用于 GitHub Release 与 EdgeOne；OCI 归档以保留 digest 的方式上传 GHCR。

该方案增加登记历史核验和 artifact 存储成本，并使 90 天之后的恢复明确受阻。它避免另建发布数据库，也使发布状态与实际 GitHub 身份和不可变产物共同可审计。生产共享锁串行处理产品发布与 Playbook 内容更新；只有两种产物发布、静态部署及在线来源校验全部完成后才推进 latest。
