'use strict';

async function notifyIssuance(webhook, issuance, fetchImpl = fetch) {
  const url = new URL(webhook);
  if (url.origin !== 'https://discord.com' ||
      !/^\/api\/webhooks\/\d+\/[\w-]+$/.test(url.pathname)) {
    throw new Error('Invalid Discord webhook configuration');
  }

  const type = issuance.documentType === 'invoice' ? '請求書' : '領収書';
  const time = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo', dateStyle: 'medium', timeStyle: 'medium',
  }).format(issuance.issuedAt.toMillis());
  const response = await fetchImpl(url, {
    method: 'POST',
    redirect: 'error',
    headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({
      content: `${type}を発行しました（${time} JST）`,
      allowed_mentions: {parse: []},
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error(`Discord returned HTTP ${response.status}`);
}

module.exports = {notifyIssuance};
