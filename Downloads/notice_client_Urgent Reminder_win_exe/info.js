/**
 * 消息公告服务 Worker
 * 绑定域名: info.aihuihui.de5.net
 * KV 变量绑定名称: NOTICE_KV
 * 环境变量 (可选): ADMIN_KEY (默认未设置时为 admin123)
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ADMIN_KEY = env.ADMIN_KEY || "admin123"; // 可在 CF 后台环境变量自定义

    // 跨域响应头
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, X-Admin-Key",
      "Content-Type": "application/json; charset=utf-8",
    };

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // 1. 客户端轮询接口：GET /api/data
    if (url.pathname === "/api/data" && request.method === "GET") {
      let raw = null;
      if (env.NOTICE_KV) {
        raw = await env.NOTICE_KV.get("CURRENT_NOTICE");
      }
      const data = raw ? JSON.parse(raw) : null;

      // 严格匹配 Python 脚本所需的数据结构：data.get("urgent")
      const responseData = {
        urgent: data ? { id: data.id, text: data.text } : null,
        updatedAt: data ? data.updatedAt : null,
      };

      return new Response(JSON.stringify(responseData), {
        headers: corsHeaders,
      });
    }

    // 2. 发布新通知：POST /api/publish
    if (url.pathname === "/api/publish" && request.method === "POST") {
      try {
        const body = await request.json();
        const clientKey = request.headers.get("X-Admin-Key") || body.key;

        if (clientKey !== ADMIN_KEY) {
          return new Response(JSON.stringify({ error: "管理密钥错误" }), {
            status: 403,
            headers: corsHeaders,
          });
        }

        const text = (body.text || "").trim();
        if (!text) {
          return new Response(JSON.stringify({ error: "通知内容不能为空" }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        // 以毫秒级时间戳作为唯一 id，触发 Python 端的弹窗更新
        const newNotice = {
          id: Date.now(),
          text: text,
          updatedAt: new Date().toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" }),
        };

        if (env.NOTICE_KV) {
          await env.NOTICE_KV.put("CURRENT_NOTICE", JSON.stringify(newNotice));
        }

        return new Response(JSON.stringify({ success: true, notice: newNotice }), {
          headers: corsHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // 3. 撤回/清空通知：POST /api/clear
    if (url.pathname === "/api/clear" && request.method === "POST") {
      try {
        const body = await request.json().catch(() => ({}));
        const clientKey = request.headers.get("X-Admin-Key") || body.key;

        if (clientKey !== ADMIN_KEY) {
          return new Response(JSON.stringify({ error: "管理密钥错误" }), {
            status: 403,
            headers: corsHeaders,
          });
        }

        if (env.NOTICE_KV) {
          await env.NOTICE_KV.delete("CURRENT_NOTICE");
        }

        return new Response(JSON.stringify({ success: true, message: "通知已撤回" }), {
          headers: corsHeaders,
        });
      } catch (err) {
        return new Response(JSON.stringify({ error: err.message }), {
          status: 500,
          headers: corsHeaders,
        });
      }
    }

    // 4. 后台管理界面：GET /
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(renderAdminHTML(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    return new Response("Not Found", { status: 404 });
  },
};

// 嵌入式后台管理界面
function renderAdminHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>班级通知广播控制台</title>
  <style>
    :root {
      --bg: #f8fafc;
      --card-bg: #ffffff;
      --primary: #dc2626;
      --primary-hover: #b91c1c;
      --text: #1e293b;
      --text-muted: #64748b;
      --border: #e2e8f0;
    }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
      background: var(--bg);
      color: var(--text);
      display: flex;
      justify-content: center;
      padding: 24px 16px;
      min-height: 100vh;
    }
    .container {
      width: 100%;
      max-width: 560px;
    }
    .card {
      background: var(--card-bg);
      border-radius: 14px;
      padding: 24px;
      box-shadow: 0 4px 14px rgba(0,0,0,0.06);
      border: 1px solid var(--border);
      margin-bottom: 20px;
    }
    h1 {
      font-size: 1.35rem;
      font-weight: 700;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .field {
      margin-bottom: 18px;
    }
    label {
      display: block;
      font-size: 0.88rem;
      font-weight: 600;
      margin-bottom: 6px;
      color: var(--text);
    }
    input[type="password"], textarea {
      width: 100%;
      padding: 10px 12px;
      border: 1px solid var(--border);
      border-radius: 8px;
      font-size: 0.95rem;
      font-family: inherit;
      outline: none;
      transition: border 0.2s;
    }
    input[type="password"]:focus, textarea:focus {
      border-color: var(--primary);
    }
    textarea {
      min-height: 110px;
      resize: vertical;
    }
    .btn-group {
      display: flex;
      gap: 12px;
    }
    button {
      flex: 1;
      padding: 12px;
      border: none;
      border-radius: 8px;
      font-size: 0.95rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    .btn-primary {
      background: var(--primary);
      color: #fff;
    }
    .btn-primary:hover {
      background: var(--primary-hover);
    }
    .btn-clear {
      background: #e2e8f0;
      color: #334155;
    }
    .btn-clear:hover {
      background: #cbd5e1;
    }
    .status-box {
      background: #f1f5f9;
      border-radius: 8px;
      padding: 14px;
      margin-top: 12px;
      font-size: 0.9rem;
    }
    .status-tag {
      display: inline-block;
      padding: 3px 8px;
      border-radius: 4px;
      font-size: 0.78rem;
      font-weight: 700;
      margin-bottom: 8px;
    }
    .tag-active { background: #fee2e2; color: #dc2626; }
    .tag-none { background: #e2e8f0; color: #64748b; }
    .quick-tags {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      margin-top: 8px;
    }
    .quick-tag {
      background: #f1f5f9;
      border: 1px solid #cbd5e1;
      padding: 4px 8px;
      border-radius: 4px;
      font-size: 0.8rem;
      cursor: pointer;
      user-select: none;
    }
    .quick-tag:hover { background: #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <h1>🚨 班级大屏强提醒发布后台</h1>

      <div class="field">
        <label for="adminKey">管理密钥 (首次填写后自动保存)</label>
        <input type="password" id="adminKey" placeholder="默认 admin123" />
      </div>

      <div class="field">
        <label for="noticeText">通报内容</label>
        <textarea id="noticeText" placeholder="在此输入需要在大屏置顶弹出的通报内容..."></textarea>
        <div class="quick-tags">
          <span class="quick-tag" onclick="insertQuick('下课后请各组组长到讲台集合！')">组长集合</span>
          <span class="quick-tag" onclick="insertQuick('大课间操场集合，请迅速排队！')">课间集合</span>
          <span class="quick-tag" onclick="insertQuick('请课代表立刻收齐物理作业送至办公室！')">收作业</span>
          <span class="quick-tag" onclick="insertQuick('眼保健操时间，请全体起立保持安静！')">眼保健操</span>
        </div>
      </div>

      <div class="btn-group">
        <button class="btn-primary" onclick="publishNotice()">📢 立即全屏弹窗广播</button>
        <button class="btn-clear" onclick="clearNotice()">🔕 撤回/下线当前通知</button>
      </div>
    </div>

    <div class="card">
      <label>当前大屏生效状态</label>
      <div id="statusBox" class="status-box">正在读取当前状态...</div>
    </div>
  </div>

  <script>
    const keyInput = document.getElementById('adminKey');
    const textInput = document.getElementById('noticeText');
    const statusBox = document.getElementById('statusBox');

    // 本地持久化保存管理密码
    keyInput.value = localStorage.getItem('cf_notice_key') || '';
    keyInput.addEventListener('change', () => {
      localStorage.setItem('cf_notice_key', keyInput.value.trim());
    });

    function insertQuick(msg) {
      textInput.value = msg;
    }

    async function refreshStatus() {
      try {
        const res = await fetch('/api/data');
        const data = await res.json();
        if (data.urgent) {
          statusBox.innerHTML = \`
            <span class="status-tag tag-active">● 正在广播中 (ID: \${data.urgent.id})</span>
            <div style="font-weight:600; color:#dc2626; margin:4px 0;">\${data.urgent.text}</div>
            <div style="font-size:0.78rem; color:#64748b;">发布时间: \${data.updatedAt || '刚刚'}</div>
          \`;
        } else {
          statusBox.innerHTML = '<span class="status-tag tag-none">○ 当前无生效通报 (大屏静默)</span>';
        }
      } catch (e) {
        statusBox.innerText = '获取状态失败: ' + e.message;
      }
    }

    async function publishNotice() {
      const text = textInput.value.trim();
      const key = keyInput.value.trim();
      if (!text) return alert('请输入通报内容');

      try {
        const res = await fetch('/api/publish', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
          body: JSON.stringify({ text, key })
        });
        const resData = await res.json();
        if (res.ok) {
          alert('发布成功！大屏客户端在下一次轮询时将立即置顶弹窗。');
          refreshStatus();
        } else {
          alert('发布失败: ' + (resData.error || '未知错误'));
        }
      } catch (e) {
        alert('网络请求失败: ' + e.message);
      }
    }

    async function clearNotice() {
      const key = keyInput.value.trim();
      try {
        const res = await fetch('/api/clear', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-Admin-Key': key },
          body: JSON.stringify({ key })
        });
        const resData = await res.json();
        if (res.ok) {
          alert('通知已撤回/清空！');
          textInput.value = '';
          refreshStatus();
        } else {
          alert('撤回失败: ' + (resData.error || '未知错误'));
        }
      } catch (e) {
        alert('网络请求失败: ' + e.message);
      }
    }

    // 页面加载及每 5 秒刷新一次当前通报状态
    refreshStatus();
    setInterval(refreshStatus, 5000);
  </script>
</body>
</html>`;
}