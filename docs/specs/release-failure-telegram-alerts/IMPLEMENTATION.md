# Implementation

- Lifecycle: active
- Implementation: in progress

The implementation keeps the repository-local failure notifier wrapper, explicit requested/target SHA markers, and a manual smoke path. It calls the pinned Oidrune reusable workflow through GitHub OIDC and the default gateway; live notification delivery remains to be confirmed by the release workflow.
