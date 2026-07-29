export function backoff(attempt: number, baseDelay = 1000, maxDelay = 60000): number {
  return Math.min(baseDelay * Math.pow(2, attempt), maxDelay);
}

export function calculateBackoff(attempt: number): number {
  return backoff(attempt);
}
