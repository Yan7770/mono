# MONO Cloudflare Worker 伴侣服务

一个零依赖、单文件的 Cloudflare Worker，同时为 MONO 提供：
- `GET /api/quotes`：A 股 / 场内 ETF 实时行情（含沪/深/北交所，自动转 UTF-8 JSON）
- `GET /api/kline`：A 股日 K 线收盘价（用于跨天未打开时自动补齐缺失交易日快照）
- `POST /api/vision`：账单截图 / 小票 AI 识图（自动区分消费、收入、内部转账/还款，防止重复记账）
- `GET /api/health`：连接与配置自检

## 3 分钟免费部署（方式一：网页后台直接粘贴，无需本地命令行）

1. 登录 [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左侧 **Workers & Pages** → **Create Worker**，命名为 `mono-api`。
2. 点击 **Edit Code**，将本目录的 `worker.js` 全文粘贴进去，点击 **Deploy**。
3. 进入该 Worker 的 **Settings → Variables and Secrets**，添加以下变量：
   - `AI_API_KEY`（选 **Secret** 加密）：填入你的视觉模型 API Key
   - `AI_API_BASE`（Plaintext）：见下方常用模型配置
   - `AI_MODEL`（Plaintext）：见下方常用模型配置
   - `ACCESS_TOKEN`（Secret，强烈建议设置）：自己随便定一个访问口令（如 `mono-2026-xxx`），防止别人蹭你的额度
4. 复制 Worker 地址（例如 `https://mono-api.你的子域.workers.dev`），打开 MONO → **个人空间 → AI 与行情设置** 填入地址和口令，点「测试连接」即可。

## 方式二：Wrangler CLI 部署

```bash
cd mono/worker
npx wrangler login
npx wrangler secret put AI_API_KEY
npx wrangler secret put ACCESS_TOKEN
npx wrangler deploy
```

## 常用视觉大模型配置参考

| 平台 | `AI_API_FORMAT` | `AI_API_BASE` | 推荐 `AI_MODEL` |
|---|---|---|---|
| **DeepSeek 官方（识图）** | `openai` | `https://api.deepseek.com` | `deepseek-flash`（注意：须选支持视觉的模型，不要填纯文本模型） |
| **阿里云百炼（通义千问）** | `openai` | `https://dashscope.aliyuncs.com/compatible-mode/v1` | `qwen-vl-plus` 或 `qwen2.5-vl-72b-instruct` |
| **智谱 BigModel** | `openai` | `https://open.bigmodel.cn/api/paas/v4` | `glm-4v-flash`（免费额度高）或 `glm-4v-plus` |
| **硅基流动 SiliconFlow** | `openai` | `https://api.siliconflow.cn/v1` | `Qwen/Qwen2.5-VL-72B-Instruct` |
| **Gemini（OpenAI 兼容）** | `openai` | `https://generativelanguage.googleapis.com/v1beta/openai` | `gemini-2.5-flash` |
| **OpenRouter** | `openai` | `https://openrouter.ai/api/v1` | `google/gemini-2.5-flash` 或 `qwen/qwen2.5-vl-72b-instruct` |
| **OpenAI** | `openai` | `https://api.openai.com/v1` | `gpt-4o-mini` |
| **Anthropic Claude** | `anthropic` | `https://api.anthropic.com/v1` | `claude-sonnet-4-20250514` |
