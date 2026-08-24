const FEISHU_HOSTS = new Set([
  'open.feishu.cn',
  'open.larksuite.com',
  'open.feishu.com',
]);

export function parseFeishuWebhook(raw) {
  const value = String(raw || '').trim();
  if (!value) return { webhook: '' };
  let url;
  try {
    url = new URL(value);
  } catch {
    return { error: '飞书 Webhook 不是合法链接' };
  }
  if (url.protocol !== 'https:') return { error: '飞书 Webhook 必须是 https 链接' };
  if (!FEISHU_HOSTS.has(url.hostname)) {
    return { error: '只支持飞书/ Lark 官方机器人 Webhook' };
  }
  if (!url.pathname.includes('/open-apis/bot/v2/hook/')) {
    return { error: '请粘贴自定义机器人的 Webhook 地址' };
  }
  return { webhook: url.toString() };
}

export function parseShareOrigin(raw) {
  const value = String(raw || '').trim();
  if (!value) return '';
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return '';
    return url.origin;
  } catch {
    return '';
  }
}

export function buildInviteUrl(origin, code) {
  const base = String(origin || '').replace(/\/$/, '');
  if (!base) return '';
  return `${base}/g/${encodeURIComponent(String(code || '').toUpperCase())}`;
}

function isFeishuOk(res, data) {
  if (typeof data?.code === 'number') return data.code === 0;
  if (typeof data?.StatusCode === 'number') return data.StatusCode === 0;
  return res.ok;
}

export function maskWebhook(webhook) {
  if (!webhook) return '';
  try {
    const url = new URL(webhook);
    const parts = url.pathname.split('/');
    const token = parts[parts.length - 1] || '';
    const shown = token.length <= 8 ? '****' : `${token.slice(0, 4)}****${token.slice(-4)}`;
    parts[parts.length - 1] = shown;
    return `${url.origin}${parts.join('/')}`;
  } catch {
    return '已配置';
  }
}

async function postFeishu(webhook, { card, text }) {
  if (!webhook) return { skipped: true };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetch(webhook, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ msg_type: 'interactive', card }),
      signal: controller.signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!isFeishuOk(res, data)) {
      return { ok: false, error: data.msg || data.StatusMessage || '飞书通知失败' };
    }
    return { ok: true };
  } catch {
    try {
      const res = await fetch(webhook, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ msg_type: 'text', content: { text } }),
        signal: AbortSignal.timeout(4000),
      });
      const data = await res.json().catch(() => ({}));
      if (!isFeishuOk(res, data)) {
        return { ok: false, error: data.msg || data.StatusMessage || '飞书通知失败' };
      }
      return { ok: true };
    } catch {
      return { ok: false, error: '飞书通知发送超时' };
    }
  } finally {
    clearTimeout(timer);
  }
}

export async function sendFeishuOpenTable({ webhook, groupName, leaderName, code, shareUrl }) {
  if (!webhook) return { skipped: true };
  const link = shareUrl || '';
  const text = [
    `${leaderName || '团长'} 开桌了：${groupName || '今晚的饭局'}`,
    `邀请码：${code}`,
    link ? `入座链接：${link}` : '',
    '点开链接报上名字即可入座，不用再填邀请码。',
  ].filter(Boolean).join('\n');

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'orange',
      title: { tag: 'plain_text', content: `开饭了 · ${groupName || '今晚的饭局'}` },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: `**${leaderName || '团长'}** 开桌了，来入座吧。\n邀请码：**${code}**${link ? `\n入座链接：${link}` : ''}`,
        },
      },
      ...(link
        ? [{
          tag: 'action',
          actions: [{
            tag: 'button',
            type: 'primary',
            url: link,
            text: { tag: 'plain_text', content: '入座开饭' },
          }],
        }]
        : []),
    ],
  };

  return postFeishu(webhook, { card, text });
}

export async function sendFeishuResult({ webhook, groupName, winner, forced }) {
  if (!webhook) return { skipped: true };
  const dish = winner ? `${winner.emoji || ''} ${winner.name}`.trim() : '';
  const text = [
    `今晚出菜了 · ${groupName || '今晚的饭局'}`,
    dish ? `结果：${dish}` : '结果：暂无可用菜单',
    forced ? '（团长提前开抽）' : '',
  ].filter(Boolean).join('\n');

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'green',
      title: { tag: 'plain_text', content: `今晚就它了 · ${groupName || '今晚的饭局'}` },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: dish
            ? `今晚开出：**${dish}**${forced ? '\n（团长提前开抽）' : ''}`
            : '这轮没有可用菜单。',
        },
      },
    ],
  };

  return postFeishu(webhook, { card, text });
}

export async function sendFeishuFailed({ webhook, groupName }) {
  if (!webhook) return { skipped: true };
  const text = [
    `开抽失败 · ${groupName || '今晚的饭局'}`,
    '今天菜单都吃过了，同一天不会抽中同一道菜。换几道新菜，或明天再来。',
  ].join('\n');

  const card = {
    config: { wide_screen_mode: true },
    header: {
      template: 'red',
      title: { tag: 'plain_text', content: `今天菜单见底了 · ${groupName || '今晚的饭局'}` },
    },
    elements: [
      {
        tag: 'div',
        text: {
          tag: 'lark_md',
          content: '同一天不会抽中同一道菜。请团长补充菜单，或明天再来。',
        },
      },
    ],
  };

  return postFeishu(webhook, { card, text });
}
