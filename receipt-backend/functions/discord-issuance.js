'use strict';

async function notifyIssuance(webhook, issuance, issuanceId, fetchImpl = fetch) {
  const url = new URL(webhook);
  if (url.origin !== 'https://discord.com' ||
      !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)) {
    throw new Error('Invalid Discord webhook configuration');
  }

  const type = issuance.documentType === 'invoice' ? '請求書' : '領収書';
  const time = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).format(issuance.issuedAt.toMillis());
  const app = issuance.documentType === 'invoice' ? 'invoice' : 'recipt';
  const link = `https://app.urakatabu.com/${app}/?issued=${encodeURIComponent(issuanceId)}`;
  const actor = (issuance.actorName || '発行者').replace(/[\r\n]/g, ' ');
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'error',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      content: `${actor}さんが${type}を発行しました（${time} JST）\n<${link}>`,
      flags: 4,
      allowed_mentions: {parse: []},
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
}

module.exports = {notifyIssuance};
