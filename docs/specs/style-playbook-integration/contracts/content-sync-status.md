# Content synchronization and RAG status

Administrator HTTP and tRPC routes share the same status snapshot. Reading status and running ordinary searches never enqueue projection repair. Content collection counts adopted current parents, including local project records; public RAG coverage excludes local projects, drafts and revoked clipping visibility. Playbook resources and chapters belong to their public parent, and previous editions do not add to collection totals.

| HTTP route | Contract |
| --- | --- |
| `GET /api/admin/content-sync/status` | `source=all/blog/playbook`, existing modern search `type`, `edition=current/previous`; previous requires Playbook scope. Returns summary, sources, adopted edition, content and chunk coverage, tasks and independent search policy state. |
| `POST /api/admin/content-sync/rag/trigger` | JSON `{source,mode:repair/rebuild}`; returns HTTP 202 with `taskIds` and per-source results, including controlled configuration or active-task conflicts. Repair skips valid current targets; rebuild processes every selected target. |
| `GET /api/admin/content-sync/tasks` | `source=all/local/playbook`, `kind=sync/rag`, nonnegative offset and limit 1–100; stable descending start-time/ID order, items and total. |
| `GET /api/admin/content-sync/tasks/:taskId` | One durable task identity, phase, target identity, total/processed/failed, cancellation and timestamps. |
| `POST /api/admin/content-sync/tasks/:taskId/cancel` | Cancels that task. Already terminal tasks remain terminal; adopted content cannot be undone. |

Content and chunk coverage each partition into indexed, unindexed, outdated and failed. Parent content is indexed only when every expected chunk is valid; otherwise failed precedes outdated, then unindexed. Extra, orphaned, withdrawn and different-edition vectors do not add to totals. A row without verified configuration/input provenance is outdated, even if its vector is present. Empty coverage is null; unavailable configuration or snapshot produces null classification values with a reason, preserving the known target total. UI loading and request failure likewise never substitute zero.

Expected manifests identify scope, blog content watermarks, full adopted Playbook identity, input hash and chunk policy. Fingerprints cover provider URL, model, explicitly configured dimensions and chunk policy, excluding credentials. Without explicit dimensions the first validated return binds the configuration dimension persistently; later incompatible returns fail. Producers and modern RAG readers check this same provenance and vector length/finite values. `ragIncompleteSources` reports the selected scope's actual coverage even when literal keywords already fill topK.

Migration 0015 adds durable tasks, exactly-once source counters, manifests, target attempts and dimension bindings. Old vector tables and Playbook snapshots remain readable. Manifest completion and semantic repair happen after schema migration and are bounded/cancellable. Content adoption precedes semantic readiness; Playbook checkpoint and task ID reside in the atomic cache state. Completed content tasks count once in the same SQLite transaction as their terminal status; semantic jobs and log rows do not count. Tracking begins with these records, and earlier history is unknown.

Automatic checks, manual checks and startup recovery share source task identities. Equivalent active requests reuse identity; non-equivalent requests conflict with the in-flight task ID. Recovery resumes the original task ID and same retained Playbook identity, never a replacement edition. Cancelled jobs are not automatically restarted for the same manifest; explicit repair or a new target can enqueue work. Each vector/provenance write verifies live task ownership and cancellation, and commits atomically. Successful chunks survive cancellation and content remains searchable after provider failure.

Compatibility endpoints remain available. Legacy vector statistics describe blog parent coverage, carry explicit availability, and never infer dimensions as 1024. Legacy semantic search, enhanced parameters, modern ranking and keyword protection retain their existing scope and response shapes.

The cache commit fence has no asynchronous gap between its final cancellation check and atomic rename. A committed task-ID adoption checkpoint wins over a stale cancellation flag during recovery. Manifest target rows are filled in cancellable batches under the durable task, after saving the complete expected list. Each provider attempt resolves current credentials after admission; credential rotation does not change the projection fingerprint and removed credentials prevent another attempt.

Historical chunk status is matched by parent and chunk identity; never-indexed siblings remain unindexed. Unavailable per-target classifications are null with a reason. Late failure writes obey the same durable ownership/cancellation fence as successful writes. New content tasks retain their adoption base alongside the edition; recovery and the atomic commit fence reject a changed base. Recovery of a superseded content-adoption target fails without moving current backwards; cancelled local tasks retain their discovered total and remaining work.

来源任务 result 持久记录本地实际变化数及 Playbook 采用前后数量，无法还原的旧历史变化为 null；兼容接口保留 created、added 别名和 errors。本地等价请求复用同一运行 Promise/任务 ID，全部来源在复用本地后仍检查 Playbook。启动恢复先注册配置的本地源。重建的尝试所有权独立于已提交有效状态，失败和取消不撤销未变化的已有有效覆盖。

本地任务 target 保存完整原始变更清单，result 保存实际统计和游标；逐项内容变更、统计与游标在同一 SQLite 事务提交。全量清空与初始清单同事务提交，恢复不再重复清空或重扫，原任务只处理余项。新增/更新/跳过按数据库实际状态判断；无可靠逐项检查点的旧部分任务受控失败，不猜测重放。初始化、采集和文件读取失败持久记录为失败，无错误且无实际变化为 unchanged。兼容取消同步只取消 kind=sync，RAG 保持按任务 ID 取消。
