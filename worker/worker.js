/**
 * MONO Companion Worker (Cloudflare Workers)
 * Unified lightweight proxy for:
 *   1. /api/health  - Connectivity & configuration check
 *   2. /api/quotes  - A-share / ETF real-time quotes (Tencent qt.gtimg.cn)
 *   3. /api/kline   - A-share / ETF daily K-line closes for missed-day backfill
 *   4. /api/vision  - Receipt / bill screenshot recognition via Vision LLM API
 *
 * Environment Variables / Secrets (set in Cloudflare Dashboard or wrangler secret):
 *   - AI_API_KEY     (Secret) API key for your Vision LLM provider
 *   - AI_API_BASE    (Var)    Base URL, default: https://dashscope.aliyuncs.com/compatible-mode/v1
 *   - AI_MODEL       (Var)    Vision model name, default: qwen-vl-plus
 *   - AI_API_FORMAT  (Var)    "openai" (default, works with Qwen/GLM/SiliconFlow/Gemini-compat/OpenRouter/OpenAI)
 *                             or "anthropic" (for Claude Messages API)
 *   - ACCESS_TOKEN   (Secret, optional) Shared bearer token to restrict access to your own MONO app
 *   - ALLOWED_ORIGIN (Var, optional) Restrict CORS origin, e.g. https://yourname.github.io (default: *)
 */

const TENCENT_QUOTE_BASE = 'https://qt.gtimg.cn/q=';
const TENCENT_KLINE_BASE = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';

const DEFAULT_AI_BASE = 'https://api.deepseek.com';
const DEFAULT_AI_MODEL = 'deepseek-flash';

function corsHeaders(request, env) {
  const allowed = (env.ALLOWED_ORIGIN || '*').trim();
  const origin = request.headers.get('Origin') || '*';
  const allowOrigin = allowed === '*' ? '*' : (allowed.split(',').map(s => s.trim()).includes(origin) ? origin : allowed.split(',')[0].trim());
  return {
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin'
  };
}

function jsonResponse(data, status, request, env) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...corsHeaders(request, env)
    }
  });
}

function checkAuth(request, env) {
  const expected = (env.ACCESS_TOKEN || '').trim();
  if (!expected) return true;
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  return token === expected;
}

function normalizeSymbol(raw) {
  const cleaned = String(raw || '').trim().toLowerCase();
  if (/^(sh|sz|bj|jj)\d{6}$/.test(cleaned)) return cleaned;
  const digits = cleaned.replace(/\D/g, '');
  if (digits.length !== 6) return null;
  if (/^(60|68|51|56|58|50)/.test(digits)) return 'sh' + digits;
  if (/^(00|30|15|16|18|12)/.test(digits)) return 'sz' + digits;
  if (/^(4|8|92)/.test(digits)) return 'bj' + digits;
  return 'jj' + digits;
}

function formatQuoteTimestamp(raw) {
  const s = String(raw || '').replace(/\D/g, '');
  if (s.length >= 14) {
    return {
      quoteDate: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
      quoteTime: `${s.slice(8, 10)}:${s.slice(10, 12)}:${s.slice(12, 14)}`
    };
  }
  if (s.length >= 8) {
    return {
      quoteDate: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`,
      quoteTime: ''
    };
  }
  return { quoteDate: '', quoteTime: '' };
}

async function handleQuotes(url, request, env) {
  const rawList = (url.searchParams.get('symbols') || '').split(',');
  const symbols = [...new Set(rawList.map(normalizeSymbol).filter(Boolean))].slice(0, 60);
  if (!symbols.length) {
    return jsonResponse({ error: '请提供有效的 6 位 A 股或 ETF 代码。' }, 400, request, env);
  }

  const upstream = await fetch(TENCENT_QUOTE_BASE + symbols.join(','), {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!upstream.ok) {
    return jsonResponse({ error: '行情源暂时不可用，请稍后重试。' }, 502, request, env);
  }

  const buffer = await upstream.arrayBuffer();
  const text = new TextDecoder('gbk').decode(buffer);
  const quotes = [];

  for (const line of text.split('\n')) {
    const match = line.match(/v_([a-z]{2}\d{6})="([^"]*)"/);
    if (!match || !match[2]) continue;
    const symbol = match[1];
    const parts = match[2].split('~');

    // Open-end mutual fund (场外基金): v_jj008163="code~name~estNav~estPct~estTime~nav~accNav~dayPct~navDate~"
    if (symbol.startsWith('jj')) {
      if (parts.length < 9 || !parts[1]) continue;
      const nav = Number(parts[5]);
      const estNav = Number(parts[2]);
      const dayPct = Number(parts[7]);
      const price = Number.isFinite(nav) && nav > 0 ? nav : (Number.isFinite(estNav) && estNav > 0 ? estNav : 0);
      if (price <= 0) continue;
      const pct = Number.isFinite(dayPct) ? dayPct : 0;
      const prevClose = pct > -99.9 ? Math.round((price / (1 + pct / 100)) * 10000) / 10000 : price;
      const change = Math.round((price - prevClose) * 10000) / 10000;
      const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(String(parts[8] || '').trim()) ? parts[8].trim() : '';
      quotes.push({
        symbol,
        market: 'jj',
        code: parts[0] || symbol.slice(2),
        name: parts[1].trim(),
        price,
        prevClose,
        open: prevClose,
        change,
        changePct: Math.round(pct * 100) / 100,
        quoteDate,
        quoteTime: '',
        suspended: false,
        assetKind: 'fund'
      });
      continue;
    }

    if (parts.length < 35 || !parts[1]) continue;

    const price = Number(parts[3]);
    const prevClose = Number(parts[4]);
    const open = Number(parts[5]);
    const change = Number(parts[31]);
    const changePct = Number(parts[32]);
    const { quoteDate, quoteTime } = formatQuoteTimestamp(parts[30]);
    const effectivePrice = Number.isFinite(price) && price > 0 ? price : (Number.isFinite(prevClose) ? prevClose : 0);
    const suspended = (Number.isFinite(price) && price === 0) || parts[40] === 'S' || parts[40] === 'D';

    quotes.push({
      symbol,
      market: symbol.slice(0, 2),
      code: parts[2] || symbol.slice(2),
      name: parts[1].trim(),
      price: effectivePrice,
      prevClose: Number.isFinite(prevClose) ? prevClose : effectivePrice,
      open: Number.isFinite(open) ? open : 0,
      change: Number.isFinite(change) ? change : Math.round((effectivePrice - prevClose) * 1000) / 1000,
      changePct: Number.isFinite(changePct) ? changePct : (prevClose > 0 ? Math.round((effectivePrice - prevClose) / prevClose * 10000) / 100 : 0),
      quoteDate,
      quoteTime,
      suspended,
      assetKind: 'stock'
    });
  }

  return jsonResponse({ quotes, fetchedAt: new Date().toISOString() }, 200, request, env);
}

async function handleKline(url, request, env) {
  const symbol = normalizeSymbol(url.searchParams.get('symbol'));
  const days = Math.max(2, Math.min(120, Number(url.searchParams.get('days')) || 30));
  if (!symbol) {
    return jsonResponse({ error: '无效的证券代码。' }, 400, request, env);
  }

  // Open-end mutual fund historical NAVs from EastMoney pingzhongdata
  if (symbol.startsWith('jj')) {
    const code = symbol.slice(2);
    const upstream = await fetch(`https://fund.eastmoney.com/pingzhongdata/${code}.js`, {
      headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://fund.eastmoney.com/' }
    });
    if (!upstream.ok) {
      return jsonResponse({ symbol, bars: [] }, 200, request, env);
    }
    const jsText = await upstream.text();
    const match = jsText.match(/var\s+Data_netWorthTrend\s*=\s*(\[[\s\S]*?\]);/);
    let bars = [];
    if (match) {
      try {
        const trend = JSON.parse(match[1]);
        bars = trend.slice(-days).map(pt => {
          const d = new Date(Number(pt.x) + 8 * 3600000);
          const date = d.toISOString().slice(0, 10);
          const close = Number(pt.y);
          return { date, open: close, close, high: close, low: close };
        }).filter(b => /^\d{4}-\d{2}-\d{2}$/.test(b.date) && Number.isFinite(b.close) && b.close > 0);
      } catch {}
    }
    return jsonResponse({ symbol, bars }, 200, request, env);
  }

  const upstream = await fetch(`${TENCENT_KLINE_BASE}?param=${symbol},day,,,${days},`, {
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });
  if (!upstream.ok) {
    return jsonResponse({ error: '历史收盘价接口暂时不可用。' }, 502, request, env);
  }

  const payload = await upstream.json();
  const node = payload?.data?.[symbol];
  const rawBars = Array.isArray(node?.day) && node.day.length ? node.day
    : Array.isArray(node?.qfqday) ? node.qfqday : [];

  const bars = rawBars
    .filter(row => Array.isArray(row) && /^\d{4}-\d{2}-\d{2}$/.test(row[0]))
    .map(row => ({
      date: row[0],
      open: Number(row[1]),
      close: Number(row[2]),
      high: Number(row[3]),
      low: Number(row[4])
    }))
    .filter(bar => Number.isFinite(bar.close) && bar.close > 0);

  return jsonResponse({ symbol, bars }, 200, request, env);
}

function buildVisionPrompt(accounts, today) {
  const accountLines = Array.isArray(accounts) && accounts.length
    ? accounts.map(a => `- ${a.name}（机构：${a.bank || '无'}，类型：${a.type}）`).join('\n')
    : '（用户暂无已建账户）';

  return `你是个人记账助手，请精准识别用户上传的账单截图、支付凭证或消费小票中的所有收支条目，仅输出合法 JSON，不要输出任何额外解释或 Markdown 代码块。

当前日期参考：${today || new Date().toISOString().slice(0, 10)}
用户已有账户列表：
${accountLines}

识别与去重规则（非常重要）：
1. 若图片同时包含「月度/账单汇总行」（如“本月支出合计”“总收入”“账户余额”“可用额度”）和「逐笔交易明细」，只提取逐笔明细，绝不把汇总行当作一笔支出重复提取。若整张图只有单笔支付成功页或小票总计，则提取该笔最终实付金额（优先实付/合计金额，不要把商品单价和合计重复提取）。
2. 每笔条目的 type 必须是以下三者之一：
   - "expense"：真实消费、购物、餐饮、缴费、红包发出等支出
   - "income"：工资、奖金、转账收款、红包收款、退款（退款请在 note 中标注“退款”）等收入
   - "transfer"：信用卡还款、花呗/白条还款、微信/支付宝提现、本人银行卡互转、零钱通/余额宝/朝朝宝转入转出等内部资金划转（非真实收支）
3. category 必须从以下预设分类中选择最贴切的一个：
   - 支出：餐饮、交通、购物、居住、日用、娱乐、医疗、人情、学习、其他支出
   - 收入：工资、奖金、理财收益、退款、兼职、其他收入
   - 转账：转账 或 还款
4. amount 必须是正数，最多保留两位小数。
5. date 格式为 YYYY-MM-DD；若截图只有月日（如 11-24），按当前年份补全；若无日期则填当前日期参考值。
6. accountHint 填写截图中显示的支付方式或收款账户（如“招商银行储蓄卡(1234)”“零钱”“花呗”“信用卡”），无法判断则填空字符串。
7. 若截图中看不到任何有效金额或交易记录，items 返回空数组，并在 summaryNote 说明原因。

输出 JSON 格式：
{
  "summaryNote": "简短说明识别来源，例如：微信账单截图，共识别 4 笔",
  "items": [
    {
      "type": "expense",
      "category": "餐饮",
      "amount": 38.5,
      "title": "商户或交易摘要（16字以内）",
      "date": "2026-11-24",
      "accountHint": "支付方式或银行名称",
      "note": "可选补充，如退款/疑似还款"
    }
  ]
}`;
}

function parseJsonFromText(rawText) {
  const text = String(rawText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  if (!text) throw new Error('模型返回内容为空，请重试。');
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : text;
  try {
    return JSON.parse(candidate);
  } catch {
    const objStart = candidate.indexOf('{');
    const objEnd = candidate.lastIndexOf('}');
    if (objStart >= 0 && objEnd > objStart) {
      try { return JSON.parse(candidate.slice(objStart, objEnd + 1)); } catch {}
    }
    const arrStart = candidate.indexOf('[');
    const arrEnd = candidate.lastIndexOf(']');
    if (arrStart >= 0 && arrEnd > arrStart) {
      try { return JSON.parse(candidate.slice(arrStart, arrEnd + 1)); } catch {}
    }
    throw new Error('模型返回格式无法解析为 JSON：' + text.replace(/\s+/g, ' ').slice(0, 80));
  }
}

function parseNumericAmount(raw) {
  if (typeof raw === 'number') return Math.round(Math.abs(raw) * 100) / 100;
  const cleaned = String(raw ?? '').replace(/[¥￥$,，\s元块RMB]/gi, '').trim();
  const match = cleaned.match(/[+-]?\d+(?:\.\d+)?/);
  if (!match) return NaN;
  return Math.round(Math.abs(Number(match[0])) * 100) / 100;
}

function parseItemType(rawType, rawAmount, title = '') {
  const t = String(rawType || '').trim().toLowerCase();
  if (['income', 'in', '收入', '入账', '收款', '退款'].some(k => t.includes(k))) return 'income';
  if (['transfer', '提现', '还款', '转账', '划转', '转入', '转出'].some(k => t.includes(k))) return 'transfer';
  if (['expense', 'out', '支出', '消费', '付款'].some(k => t.includes(k))) return 'expense';
  if (/提现|还款|零钱通|余额宝|朝朝宝|本人互转/.test(String(title))) return 'transfer';
  if (String(rawAmount ?? '').trim().startsWith('+')) return 'income';
  return 'expense';
}

function normalizeVisionItems(parsed, fallbackDate) {
  const rawItems = Array.isArray(parsed)
    ? parsed
    : Array.isArray(parsed?.items) ? parsed.items
    : Array.isArray(parsed?.transactions) ? parsed.transactions
    : Array.isArray(parsed?.records) ? parsed.records
    : Array.isArray(parsed?.bills) ? parsed.bills
    : Array.isArray(parsed?.data) ? parsed.data
    : [];
  const items = [];
  for (const raw of rawItems) {
    if (!raw || typeof raw !== 'object') continue;
    const amount = parseNumericAmount(raw.amount ?? raw.money ?? raw.value);
    if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) continue;
    const title = String(raw.title || raw.merchant || raw.name || raw.desc || '未命名收支').trim().slice(0, 48);
    const type = parseItemType(raw.type || raw.direction || raw.category, raw.amount, title);
    const rawDate = String(raw.date || '').trim().slice(0, 10);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(rawDate) ? rawDate : fallbackDate;
    items.push({
      type,
      category: String(raw.category || raw.tag || '').trim().slice(0, 24),
      amount,
      title,
      date,
      accountHint: String(raw.accountHint || raw.account || raw.paymentMethod || '').trim().slice(0, 48),
      note: String(raw.note || raw.remark || '').trim().slice(0, 64)
    });
  }
  return {
    summaryNote: String(parsed?.summaryNote || parsed?.summary || '').trim().slice(0, 120),
    items
  };
}

async function callOpenAIVision(images, prompt, env) {
  const base = (env.AI_API_BASE || DEFAULT_AI_BASE).replace(/\/(chat\/completions|models)\/?$/i, '').replace(/\/+$/, '');
  const model = (env.AI_MODEL || DEFAULT_AI_MODEL).trim();
  const content = [{ type: 'text', text: prompt }];
  for (const dataUrl of images) {
    content.push({ type: 'image_url', image_url: { url: dataUrl } });
  }

  const reqBody = {
    model,
    temperature: 0.1,
    max_tokens: 4096,
    messages: [{ role: 'user', content }]
  };
  if (/deepseek/i.test(base) || /deepseek/i.test(model)) {
    reqBody.thinking = { type: 'disabled' };
    reqBody.response_format = { type: 'json_object' };
  }

  const response = await fetch(`${base}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${env.AI_API_KEY}`
    },
    body: JSON.stringify(reqBody)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = payload?.error?.message || payload?.message || `AI 接口返回 ${response.status}`;
    throw new Error(msg);
  }
  const msgObj = payload?.choices?.[0]?.message;
  const raw = msgObj?.content;
  let text = Array.isArray(raw) ? raw.map(part => part?.text || '').join('\n') : String(raw || '');
  if (!text.trim() && msgObj?.reasoning_content) {
    text = String(msgObj.reasoning_content);
  }
  return text;
}

async function callAnthropicVision(images, prompt, env) {
  const base = (env.AI_API_BASE || 'https://api.anthropic.com/v1').replace(/\/+$/, '');
  const model = (env.AI_MODEL || 'claude-sonnet-4-20250514').trim();
  const content = [];
  for (const dataUrl of images) {
    const match = String(dataUrl).match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) continue;
    content.push({
      type: 'image',
      source: { type: 'base64', media_type: match[1], data: match[2] }
    });
  }
  content.push({ type: 'text', text: prompt });

  const response = await fetch(`${base}/messages`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': env.AI_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model,
      max_tokens: 2048,
      messages: [{ role: 'user', content }]
    })
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const msg = payload?.error?.message || `Anthropic 接口返回 ${response.status}`;
    throw new Error(msg);
  }
  return (payload?.content || []).map(block => block?.text || '').join('\n');
}

async function handleVision(request, env) {
  if (!env.AI_API_KEY) {
    return jsonResponse({ error: 'Worker 尚未配置 AI_API_KEY，请先在 Cloudflare 环境变量中添加。' }, 500, request, env);
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: '请求体必须为 JSON。' }, 400, request, env);
  }

  const rawImages = Array.isArray(body?.images) ? body.images : (body?.imageDataUrl ? [body.imageDataUrl] : []);
  const images = rawImages.filter(img => typeof img === 'string' && img.startsWith('data:image/')).slice(0, 4);
  if (!images.length) {
    return jsonResponse({ error: '请上传至少一张有效图片。' }, 400, request, env);
  }

  const today = /^\d{4}-\d{2}-\d{2}$/.test(String(body?.today || '')) ? body.today : new Date().toISOString().slice(0, 10);
  const prompt = buildVisionPrompt(body?.accounts, today);

  try {
    const format = (env.AI_API_FORMAT || 'openai').trim().toLowerCase();
    const rawText = format === 'anthropic'
      ? await callAnthropicVision(images, prompt, env)
      : await callOpenAIVision(images, prompt, env);
    const parsed = parseJsonFromText(rawText);
    const normalized = normalizeVisionItems(parsed, today);
    return jsonResponse(normalized, 200, request, env);
  } catch (error) {
    return jsonResponse({ error: error?.message || '图片识别失败，请稍后重试。' }, 502, request, env);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, '') || '/';

    if (!checkAuth(request, env)) {
      return jsonResponse({ error: '访问口令无效，请检查 MONO 设置中的访问口令。' }, 401, request, env);
    }

    if (request.method === 'GET' && (path === '/' || path === '/api/health')) {
      return jsonResponse({
        ok: true,
        service: 'mono-worker',
        visionConfigured: Boolean(env.AI_API_KEY),
        model: env.AI_MODEL || DEFAULT_AI_MODEL,
        format: (env.AI_API_FORMAT || 'openai').toLowerCase()
      }, 200, request, env);
    }

    if (request.method === 'GET' && path === '/api/quotes') {
      return handleQuotes(url, request, env);
    }

    if (request.method === 'GET' && path === '/api/kline') {
      return handleKline(url, request, env);
    }

    if (request.method === 'POST' && path === '/api/vision') {
      return handleVision(request, env);
    }

    return jsonResponse({ error: 'Not Found' }, 404, request, env);
  }
};
