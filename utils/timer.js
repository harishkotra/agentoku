export function nowMs() {
  return performance.now();
}

export function elapsedMs(startMs) {
  return performance.now() - startMs;
}

export function formatMs(ms) {
  return `${(ms / 1000).toFixed(2)}s`;
}

export async function withTimeout(promiseFactory, timeoutMs) {
  let timeoutId;
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error("TIMEOUT")), timeoutMs);
  });

  try {
    return await Promise.race([promiseFactory(), timeoutPromise]);
  } finally {
    clearTimeout(timeoutId);
  }
}
