export function detectJdwpPort(opts: string): number | undefined {
  const match = opts.match(/(?:-agentlib:jdwp=|-Xrunjdwp:)(\S+)/);
  if (!match) {
    return undefined;
  }
  const addrMatch = match[1].match(/(?:^|,)address=([^,\s]+)/);
  if (!addrMatch) {
    return undefined;
  }
  const portMatch = addrMatch[1].match(/(\d+)$/);
  if (!portMatch) {
    return undefined;
  }
  const port = parseInt(portMatch[1], 10);
  return Number.isFinite(port) && port > 0 ? port : undefined;
}
