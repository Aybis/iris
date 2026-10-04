/** Context-aware local translation. BIP codes alone do not prove a root cause. */
export function translateBip(raw: string): {message:string;confidence:'contextual'|'unknown';code:string|null} {
  const code = raw.match(/\bBIP\d{4}[A-Z]\b/i)?.[0]?.toUpperCase() ?? null;
  const bank = raw.match(/(?:HTTP_|channel[=: ]+)(BCA|MANDIRI|BNI|ASTRAPAY|QRIS)/i)?.[1]?.toUpperCase()
    ?? raw.match(/\b(BCA|MANDIRI|BNI|ASTRAPAY|QRIS)\b/i)?.[1]?.toUpperCase();
  const partner = bank ? `${bank} payment endpoint` : 'The downstream endpoint';
  if (/SocketTimeoutException|timed?\s*out|timeout/i.test(raw)) {
    const ms = raw.match(/(\d+)\s*ms\b/i)?.[1];
    return {code,confidence:'contextual',message:`${partner} did not respond${ms ? ` within ${Number(ms)/1000} seconds` : ' before the timeout'}. Check partner network connectivity and inspect the nested exception before retrying.`};
  }
  if (/signature|hmac|authorization token/i.test(raw)) return {code,confidence:'contextual',message:'Authorization verification failed. Check the client HMAC token, signing key, and clock skew. Inspect the nested security exception to identify the exact cause.'};
  if (/thread.*(?:starv|busy)|no available.*(?:worker|thread)|worker.*saturat/i.test(raw)) return {code,confidence:'contextual',message:'All integration workers are occupied. New payments are waiting in MQ. Inspect slow downstream calls and worker capacity.'};
  if (/MQRC_Q_FULL|queue.*full|queue.*depth.*critical/i.test(raw)) return {code,confidence:'contextual',message:'The inbound payment buffer has exceeded its safe depth. Compare ingestion and consumption, then inspect blocked consumers.'};
  if (/MQRC_UNKNOWN_OBJECT_NAME|unknown queue/i.test(raw)) return {code,confidence:'contextual',message:'The target MQ queue could not be found. Verify the queue name and queue-manager routing configuration.'};
  return {code,confidence:'unknown',message:code ? `${code} was reported. Inspect the complete exception list and node context; this code alone does not establish a root cause.` : raw};
}
