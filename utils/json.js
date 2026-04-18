export function parseStrictJson(rawText) {
  if (typeof rawText !== "string") {
    return { ok: false, error: "Response is not a string." };
  }

  const text = rawText.trim();
  if (!text.startsWith("{") || !text.endsWith("}")) {
    return { ok: false, error: "Response is not strict JSON object text." };
  }

  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: `Invalid JSON: ${error.message}` };
  }
}

export function safeStringify(value) {
  return JSON.stringify(value, null, 2);
}
