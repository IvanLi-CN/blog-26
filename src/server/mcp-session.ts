export function resolveMcpSessionPersistenceKey(params: {
  requestedSessionId?: string;
  responseSessionId?: string;
  transportSessionId?: string;
  hasExistingSession: boolean;
}) {
  const { requestedSessionId, responseSessionId, transportSessionId, hasExistingSession } = params;
  if (responseSessionId) {
    return responseSessionId;
  }
  if (hasExistingSession) {
    return requestedSessionId || transportSessionId;
  }
  return transportSessionId;
}
