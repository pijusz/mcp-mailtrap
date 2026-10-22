/** Build an MCP error result the model can read and act on. */
export function errorResult(text: string) {
  return {
    content: [{ type: "text" as const, text: `Error: ${text}` }],
    isError: true,
  };
}

/**
 * Return an error result if any of the named args are missing, otherwise null.
 * Used by multi-action tools where required params depend on `action`.
 */
export function requireArgs(
  args: Record<string, unknown>,
  names: string[],
  action: string,
) {
  const missing = names.filter((n) => args[n] === undefined || args[n] === "");
  if (missing.length === 0) return null;
  const verb = missing.length === 1 ? "is" : "are";
  return errorResult(`${missing.join(" and ")} ${verb} required for action "${action}".`);
}
