(() => {
  'use strict';

  const CONFIG_KEY = 'mono.services.v1';
  const TENCENT_QUOTE_BASE = 'https://qt.gtimg.cn/q=';
  const TENCENT_KLINE_BASE = 'https://web.ifzq.gtimg.cn/appstock/app/fqkline/get';

  const AI_PRESETS = [
    {
      id: 'deepseek',
      label: 'DeepSeek 官方（deepseek-flash 识图）',
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-flash'
    },
    {
      id: 'qwen',
      label: '阿里云百炼（通义千问 VL）',
      baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
      model: 'qwen-vl-plus'
    },
    {
      id: 'zhipu',
      label: '智谱 BigModel（GLM-4V）',
      baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
      model: 'glm-4v-flash'
    },
    {
      id: 'siliconflow',
      label: '硅基流动 SiliconFlow',
      baseUrl: 'https://api.siliconflow.cn/v1',
      model: 'Qwen/Qwen2.5-VL-72B-Instruct'
    },
    {
      id: 'gemini',
      label: 'Google Gemini（兼容接口）',
      baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai',
      model: 'gemini-2.5-flash'
    },
    {
      id: 'openrouter',
      label: 'OpenRouter',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'google/gemini-2.5-flash'
    },
    {
      id: 'openai',
      label: 'OpenAI',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini'
    }
  ];

  const DEFAULT_CONFIG = {
    workerUrl: '',
    workerToken: '',
    aiMode: 'worker', // 'worker' | 'direct'
    aiBaseUrl: AI_PRESETS[0].baseUrl,
    aiApiKey: '',
    aiModel: AI_PRESETS[0].model
  };

  function cleanWorkerUrl(url) {
    return String(url || '').trim()
      .replace(/\/api\/(health|quotes|kline|vision)\/?$/i, '')
      .replace(/\/+$/, '');
  }

  function cleanAiBaseUrl(url) {
    return String(url || '').trim()
      .replace(/\/(chat\/completions|models)\/?$/i, '')
      .replace(/\/+$/, '');
  }

  function readConfig() {
    try {
      const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        return {
          workerUrl: cleanWorkerUrl(raw.workerUrl),
          workerToken: String(raw.workerToken || '').trim(),
          aiMode: raw.aiMode === 'direct' ? 'direct' : 'worker',
          aiBaseUrl: cleanAiBaseUrl(raw.aiBaseUrl || DEFAULT_CONFIG.aiBaseUrl),
          aiApiKey: String(raw.aiApiKey || '').trim(),
          aiModel: String(raw.aiModel || DEFAULT_CONFIG.aiModel).trim()
        };
      }
    } catch {}
    return { ...DEFAULT_CONFIG };
  }

  function saveConfig(next) {
    const merged = {
      ...readConfig(),
      ...next
    };
    merged.workerUrl = cleanWorkerUrl(merged.workerUrl);
    merged.workerToken = String(merged.workerToken || '').trim();
    merged.aiMode = merged.aiMode === 'direct' ? 'direct' : 'worker';
    merged.aiBaseUrl = cleanAiBaseUrl(merged.aiBaseUrl || DEFAULT_CONFIG.aiBaseUrl);
    merged.aiApiKey = String(merged.aiApiKey || '').trim();
    merged.aiModel = String(merged.aiModel || DEFAULT_CONFIG.aiModel).trim();
    localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
    return merged;
  }

  function hasVisionReady(cfg = readConfig()) {
    if (cfg.aiMode === 'direct') return Boolean(cfg.aiBaseUrl && cfg.aiApiKey && cfg.aiModel);
    return Boolean(cfg.workerUrl);
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

  function candidateSymbols(raw) {
    const cleaned = String(raw || '').trim().toLowerCase();
    if (/^(sh|sz|bj|jj)\d{6}$/.test(cleaned)) return [cleaned];
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length !== 6) return [];
    const list = [];
    if (/^(60|68|51|56|58|50)/.test(digits)) list.push('sh' + digits);
    else if (/^(00|30|15|16|18|12)/.test(digits)) list.push('sz' + digits);
    else if (/^(4|8|92)/.test(digits)) list.push('bj' + digits);
    else list.push('sh' + digits, 'sz' + digits);
    // Always also check Chinese open-end mutual fund (场外基金) prefix `jj`
    list.push('jj' + digits);
    return [...new Set(list)];
  }

  function marketLabel(symbolOrMarket, code = '') {
    const market = String(symbolOrMarket || '').slice(0, 2).toLowerCase();
    if (market === 'jj') return '基金';
    const digits = String(code || symbolOrMarket || '').replace(/\D/g, '');
    if (/^(51|56|58|50|15|16|18)/.test(digits)) return 'ETF';
    if (market === 'sh') return '沪A';
    if (market === 'sz') return '深A';
    if (market === 'bj') return '北A';
    return 'A股';
  }

  function beijingNow(date = new Date()) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Asia/Shanghai',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      weekday: 'short',
      hour12: false
    }).formatToParts(date);
    const map = Object.fromEntries(parts.map(p => [p.type, p.value]));
    const hour = Number(map.hour === '24' ? 0 : map.hour);
    const minute = Number(map.minute);
    const minutes = hour * 60 + minute;
    const dateStr = `${map.year}-${map.month}-${map.day}`;
    const isWeekend = map.weekday === 'Sat' || map.weekday === 'Sun';
    let phase = 'closed';
    if (isWeekend) phase = 'weekend';
    else if (minutes < 9 * 60 + 15) phase = 'pre';
    else if ((minutes >= 9 * 60 + 15 && minutes <= 11 * 60 + 30) || (minutes >= 13 * 60 && minutes <= 15 * 60)) phase = 'trading';
    else if (minutes > 11 * 60 + 30 && minutes < 13 * 60) phase = 'noon';
    else phase = 'closed';

    return {
      date: dateStr,
      hour,
      minute,
      minutes,
      isWeekend,
      phase,
      afterSettlementTime: !isWeekend && minutes >= 15 * 60 + 5
    };
  }

  function isDateSettledNow(quoteDate, now = beijingNow()) {
    if (!quoteDate || !/^\d{4}-\d{2}-\d{2}$/.test(quoteDate)) return false;
    if (quoteDate < now.date) return true;
    if (quoteDate === now.date) return now.isWeekend || now.minutes >= 15 * 60 + 5;
    return false;
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

  function parseTencentQuotes(text) {
    const quotes = [];
    for (const line of String(text || '').split('\n')) {
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
    return quotes;
  }

  function authHeaders(cfg) {
    const headers = {};
    if (cfg.workerToken) headers['Authorization'] = `Bearer ${cfg.workerToken}`;
    return headers;
  }

  async function fetchWithTimeout(url, options = {}, timeoutMs = 15000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      return await fetch(url, { ...options, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  async function fetchQuotesDirect(symbols) {
    const res = await fetchWithTimeout(TENCENT_QUOTE_BASE + symbols.join(','), {}, 10000);
    if (!res.ok) throw new Error('行情接口请求失败');
    const buf = await res.arrayBuffer();
    let text;
    try {
      text = new TextDecoder('gbk').decode(buf);
    } catch {
      text = new TextDecoder('utf-8').decode(buf);
    }
    return { quotes: parseTencentQuotes(text), source: 'direct', fetchedAt: new Date().toISOString() };
  }

  async function fetchQuotes(rawSymbols) {
    const symbols = [...new Set((rawSymbols || []).map(normalizeSymbol).filter(Boolean))];
    if (!symbols.length) return { quotes: [], source: 'none', fetchedAt: new Date().toISOString() };
    const cfg = readConfig();
    if (cfg.workerUrl) {
      try {
        const res = await fetchWithTimeout(
          `${cfg.workerUrl}/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`,
          { headers: authHeaders(cfg) },
          10000
        );
        const data = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.quotes)) {
          return { ...data, source: 'worker' };
        }
        if (res.status === 401) throw new Error(data?.error || 'Worker 访问口令无效');
      } catch (err) {
        if (String(err?.message || '').includes('口令')) throw err;
        // Fallback to direct Tencent HTTPS CORS endpoint if Worker is unreachable.
      }
    }
    return fetchQuotesDirect(symbols);
  }

  async function lookupCode(raw) {
    const candidates = candidateSymbols(raw);
    if (!candidates.length) return { quotes: [] };
    return fetchQuotes(candidates);
  }

  async function fetchKlineDirect(symbol, days = 30) {
    if (symbol.startsWith('jj')) {
      // Mutual fund daily history requires Worker (EastMoney pingzhongdata has no CORS)
      return { symbol, bars: [], source: 'direct' };
    }
    const res = await fetchWithTimeout(`${TENCENT_KLINE_BASE}?param=${symbol},day,,,${days},`, {}, 10000);
    if (!res.ok) throw new Error('历史收盘价接口请求失败');
    const payload = await res.json();
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
    return { symbol, bars, source: 'direct' };
  }

  async function fetchKline(rawSymbol, days = 30) {
    const symbol = normalizeSymbol(rawSymbol);
    if (!symbol) return { symbol: '', bars: [], source: 'none' };
    const cfg = readConfig();
    if (cfg.workerUrl) {
      try {
        const res = await fetchWithTimeout(
          `${cfg.workerUrl}/api/kline?symbol=${encodeURIComponent(symbol)}&days=${days}`,
          { headers: authHeaders(cfg) },
          10000
        );
        const data = await res.json().catch(() => null);
        if (res.ok && Array.isArray(data?.bars)) {
          return { ...data, source: 'worker' };
        }
      } catch {
        // Fallback to direct Tencent kline endpoint
      }
    }
    return fetchKlineDirect(symbol, days);
  }

  function buildDirectVisionPrompt(accounts, today) {
    const accountLines = Array.isArray(accounts) && accounts.length
      ? accounts.map(a => `- ${a.name}（机构：${a.bank || '无'}，类型：${a.type}）`).join('\n')
      : '（用户暂无已建账户）';
    return `你是个人记账助手，请精准识别用户上传的账单截图、支付凭证或消费小票中的所有收支条目，仅输出合法 JSON，不要输出任何额外解释或 Markdown 代码块。

当前日期参考：${today}
用户已有账户列表：
${accountLines}

识别与去重规则：
1. 若图片同时包含「月度/账单汇总行」（如“本月支出合计”“总收入”“账户余额”“可用额度”）和「逐笔交易明细」，只提取逐笔明细，绝不把汇总行当作一笔支出重复提取。若整张图只有单笔支付成功页或小票总计，则提取该笔最终实付金额。
2. 每笔条目的 type 必须是 "expense"（真实消费/支出）、"income"（工资/收款/退款，退款请在 note 标注“退款”）或 "transfer"（信用卡还款、花呗/白条还款、提现、本人银行卡互转、零钱通/余额宝转入转出等内部资金划转）。
3. amount 必须是正数，最多保留两位小数。
4. date 格式为 YYYY-MM-DD；无年份按当前年份补全；无日期填当前日期参考值。
5. accountHint 填写截图中显示的支付方式或银行卡名称，无法判断则填空字符串。

输出 JSON 格式：
{"summaryNote":"来源简述","items":[{"type":"expense","amount":38.5,"title":"商户或摘要","date":"${today}","accountHint":"支付方式","note":""}]}`;
  }

  function parseJsonFromText(rawText) {
    const text = String(rawText || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
    const candidate = fenced ? fenced[1].trim() : text;
    try {
      return JSON.parse(candidate);
    } catch {
      const start = candidate.indexOf('{');
      const end = candidate.lastIndexOf('}');
      if (start >= 0 && end > start) return JSON.parse(candidate.slice(start, end + 1));
      throw new Error('AI 返回内容无法解析为账单 JSON，请更换清晰截图重试。');
    }
  }

  function explainVisionError(status, rawMessage, modelName = '') {
    const msg = String(rawMessage || '');
    const lower = msg.toLowerCase();
    if (lower.includes('image_url') || lower.includes('does not support image') || lower.includes('multimodal') || lower.includes('vision')) {
      return `模型「${modelName || '当前模型'}」不支持图片输入。如使用 DeepSeek 请将模型名设为 deepseek-flash（不要用 deepseek-chat / deepseek-reasoner）。`;
    }
    if (status === 401 || lower.includes('invalid api') || lower.includes('authentication') || lower.includes('unauthorized')) {
      return 'API Key 无效或已过期，请在「AI 与行情设置」中核对 Key。';
    }
    if (status === 402 || lower.includes('insufficient balance') || lower.includes('quota')) {
      return 'API 账户余额不足或额度已用尽，请前往模型平台充值。';
    }
    if (status === 404 || lower.includes('model not exist') || lower.includes('does not exist')) {
      return `接口地址或模型名「${modelName}」不存在（HTTP 404），请检查 Base URL（勿重复带 /chat/completions）和模型名称。`;
    }
    return msg || `AI 接口返回错误（HTTP ${status || '未知'}）`;
  }

  function explainNetworkError(err, isWorker) {
    if (err?.name === 'AbortError') {
      return '识别请求超时（超过 90 秒），请裁切较短的单张账单截图后重试。';
    }
    const msg = String(err?.message || '');
    if (err instanceof TypeError || /failed to fetch|load failed|network/i.test(msg)) {
      return isWorker
        ? '无法连接到你的 Cloudflare Worker，请检查 Worker 地址是否正确及网络是否正常。'
        : '浏览器直连 AI 接口被跨域（CORS）拦截或网络不可达，请检查接口地址，或部署 Cloudflare Worker 代理。';
    }
    return msg || '识图请求失败，请稍后重试。';
  }

  function normalizeVisionResult(parsed, fallbackDate) {
    const rawItems = Array.isArray(parsed?.items) ? parsed.items : [];
    const items = [];
    for (const raw of rawItems) {
      if (!raw || typeof raw !== 'object') continue;
      const amount = Math.round(Math.abs(Number(raw.amount)) * 100) / 100;
      if (!Number.isFinite(amount) || amount <= 0 || amount > 999999999.99) continue;
      const rawType = String(raw.type || '').toLowerCase();
      const type = rawType === 'income' ? 'income' : rawType === 'transfer' ? 'transfer' : 'expense';
      const title = String(raw.title || raw.merchant || '未命名收支').trim().slice(0, 48);
      const date = /^\d{4}-\d{2}-\d{2}$/.test(String(raw.date || '')) ? raw.date : fallbackDate;
      items.push({
        type,
        amount,
        title,
        date,
        accountHint: String(raw.accountHint || '').trim().slice(0, 48),
        note: String(raw.note || '').trim().slice(0, 64)
      });
    }
    return {
      summaryNote: String(parsed?.summaryNote || '').trim().slice(0, 120),
      items
    };
  }

  async function recognizeReceipt(images, { accounts = [], today = beijingNow().date } = {}) {
    const cfg = readConfig();
    if (!hasVisionReady(cfg)) {
      throw new Error('请先在「个人空间 → AI 与行情设置」中配置 Cloudflare Worker 地址或视觉模型 API。');
    }

    if (cfg.aiMode === 'worker') {
      let res;
      try {
        res = await fetchWithTimeout(`${cfg.workerUrl}/api/vision`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...authHeaders(cfg)
          },
          body: JSON.stringify({
            images,
            today,
            accounts: accounts.map(({ id, name, bank, type }) => ({ id, name, bank, type }))
          })
        }, 90000);
      } catch (err) {
        throw new Error(explainNetworkError(err, true));
      }
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(explainVisionError(res.status, data?.error, 'Worker 模型'));
      }
      return normalizeVisionResult(data, today);
    }

    // Direct OpenAI-compatible Vision API mode
    const prompt = buildDirectVisionPrompt(accounts, today);
    const content = [{ type: 'text', text: prompt }];
    for (const dataUrl of images) {
      content.push({ type: 'image_url', image_url: { url: dataUrl } });
    }
    let res;
    try {
      res = await fetchWithTimeout(`${cfg.aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.aiApiKey}`
        },
        body: JSON.stringify({
          model: cfg.aiModel,
          temperature: 0.1,
          max_tokens: 2048,
          messages: [{ role: 'user', content }]
        })
      }, 90000);
    } catch (err) {
      throw new Error(explainNetworkError(err, false));
    }
    const payload = await res.json().catch(() => null);
    if (!res.ok) {
      const msg = payload?.error?.message || payload?.message || '';
      throw new Error(explainVisionError(res.status, msg, cfg.aiModel));
    }
    const rawText = payload?.choices?.[0]?.message?.content;
    const text = Array.isArray(rawText) ? rawText.map(p => p?.text || '').join('\n') : String(rawText || '');
    return normalizeVisionResult(parseJsonFromText(text), today);
  }

  const TEST_PIXEL_DATA_URL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAIAAACQd1PeAAAADElEQVR4nGP4//8/AAX+Av4N70a4AAAAAElFTkSuQmCC';

  async function testConnection(overrideConfig) {
    const cfg = overrideConfig ? { ...readConfig(), ...overrideConfig } : readConfig();
    cfg.workerUrl = cleanWorkerUrl(cfg.workerUrl);
    cfg.workerToken = String(cfg.workerToken || '').trim();
    cfg.aiBaseUrl = cleanAiBaseUrl(cfg.aiBaseUrl);
    cfg.aiModel = String(cfg.aiModel || '').trim();
    cfg.aiApiKey = String(cfg.aiApiKey || '').trim();

    if (cfg.aiMode === 'worker') {
      if (!cfg.workerUrl) return { ok: false, message: '请先填写 Cloudflare Worker 地址。' };
      try {
        const res = await fetchWithTimeout(`${cfg.workerUrl}/api/health`, {
          headers: authHeaders(cfg)
        }, 10000);
        const data = await res.json().catch(() => null);
        if (!res.ok) {
          return { ok: false, message: data?.error || `连接失败（HTTP ${res.status}）` };
        }
        const aiText = data?.visionConfigured
          ? `已就绪（模型：${data.model || '默认'}）`
          : 'Worker 已连通，但尚未配置 AI_API_KEY';
        return { ok: true, message: `连接成功 · ${aiText}`, data };
      } catch (err) {
        return { ok: false, message: explainNetworkError(err, true) };
      }
    }

    if (!cfg.aiBaseUrl || !cfg.aiApiKey || !cfg.aiModel) {
      return { ok: false, message: '直连模式请填写完整的接口地址、API Key 和模型名称。' };
    }
    try {
      const res = await fetchWithTimeout(`${cfg.aiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${cfg.aiApiKey}`
        },
        body: JSON.stringify({
          model: cfg.aiModel,
          max_tokens: 16,
          messages: [{
            role: 'user',
            content: [
              { type: 'text', text: 'OK' },
              { type: 'image_url', image_url: { url: TEST_PIXEL_DATA_URL } }
            ]
          }]
        })
      }, 20000);
      const payload = await res.json().catch(() => null);
      if (res.ok) {
        return { ok: true, message: `测试通过！模型「${cfg.aiModel}」已验证支持识图记账。` };
      }
      const rawMsg = payload?.error?.message || payload?.message || '';
      return { ok: false, message: explainVisionError(res.status, rawMsg, cfg.aiModel) };
    } catch (err) {
      return { ok: false, message: explainNetworkError(err, false) };
    }
  }

  function compressImage(file, { maxEdge = 1280, quality = 0.82 } = {}) {
    return new Promise((resolve, reject) => {
      if (!file || (file.type && !String(file.type).startsWith('image/'))) {
        reject(new Error('请选择图片文件（JPG / PNG / WebP）。'));
        return;
      }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('读取图片失败，请重试。'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('无法解码该图片格式，请换一张截图重试。'));
        img.onload = () => {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;
          if (!width || !height) {
            reject(new Error('图片尺寸无效。'));
            return;
          }
          const scale = Math.min(1, maxEdge / Math.max(width, height));
          const targetW = Math.max(1, Math.round(width * scale));
          const targetH = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          // Help iOS Safari reclaim canvas memory promptly
          canvas.width = 1;
          canvas.height = 1;
          resolve(dataUrl);
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  window.MonoServices = {
    AI_PRESETS,
    readConfig,
    saveConfig,
    hasVisionReady,
    normalizeSymbol,
    candidateSymbols,
    lookupCode,
    marketLabel,
    beijingNow,
    isDateSettledNow,
    fetchQuotes,
    fetchKline,
    recognizeReceipt,
    testConnection,
    compressImage
  };
})();
