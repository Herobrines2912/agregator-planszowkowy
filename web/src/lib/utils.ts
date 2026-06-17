export function assertNever(x: never): never {
  throw new Error(`Unexpected value: ${String(x)}`)
}

// Prevents </script> injection in JSON-LD script tags — JSON.stringify does not escape HTML chars.
export function safeJsonLdStringify(obj: unknown): string {
  return JSON.stringify(obj)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/&/g, '\\u0026')
}
