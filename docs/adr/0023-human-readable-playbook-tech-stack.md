---
status: accepted
---

# Playbook project pages use a human-readable technology stack view

Project practice pages parse the public `stack` payload into a single reading flow with the semantic groups 运行与交付、依赖与工具、配置与质量和其他信息. Groups appear as a horizontal tab strip with one active panel rather than columns or nested cards. Scalar arrays render as horizontal chips, lists longer than eight items collapse, null and empty values are omitted, and a secondary 查看原始数据 disclosure preserves the formatted public structure. This keeps the first reading layer useful to people without changing the published payload or removing technical traceability.

The view uses stable labels for known fields and humanizes remaining public keys. Publishing and agent-maintenance keys such as routing, status, confidence, verification dates, project relationships, release tags, digests, source commits and schema identity are filtered recursively before rendering, including in the raw-data disclosure. The `language` stack field remains available as a technology value; filtering is applied to the stack payload rather than by a broad display-name blacklist. Scalar arrays render as horizontal chips, while field labels and values share a compact wrapping row so dependencies, config files, scripts, workflows and markers stay dense. Lists up to eight items stay visible; longer lists use a compact item-count disclosure. Stringified JSON is parsed recursively so upstream exports may provide either structured values or encoded JSON without forcing the reader to learn the transport shape. If no useful public fields remain, the whole section is omitted.
