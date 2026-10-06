/**
 * 经典星轨背景 - 班级随机点名系统 (多年份/学校/班级 + 严格密码鉴权管理 + 老虎机版)
 * 单文件 Cloudflare Workers 部署
 */

const KV_KEY = "multi_class_students_data_v2";

// 默认多层级数据结构（首次部署或数据为空时使用）
const DEFAULT_DATA = {
  activeYear: "2026年",
  activeSchool: "实验中学",
  activeClass: "高一(1)班",
  data: {
    "2026年": {
      "实验中学": {
        "高一(1)班": ["张三", "李四", "王五", "赵六", "钱七", "孙八", "周九"],
        "高一(2)班": ["陈一", "褚二", "卫三", "蒋四", "沈五", "韩六"]
      }
    }
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const expectedPass = env.BASICS_PASS || " 在这里设置管理员密码 ";

    // ---------------- API 1: 读取所有数据（抽签使用，无需密码） ----------------
    if (url.pathname === "/api/get-classes" && request.method === "GET") {
      let data = await env.CLASS_KV.get(KV_KEY, { type: "json" });
      
      if (!data) {
        data = DEFAULT_DATA;
        await env.CLASS_KV.put(KV_KEY, JSON.stringify(data));
      } else if (data.classes && !data.data) {
        data = {
          activeYear: "2026年",
          activeSchool: "默认学校",
          activeClass: data.activeClass || Object.keys(data.classes)[0] || "高一(1)班",
          data: {
            "2026年": {
              "默认学校": data.classes
            }
          }
        };
      }

      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // ---------------- API 2: 验证管理员密码 ----------------
    if (url.pathname === "/api/verify-pass" && request.method === "POST") {
      try {
        const body = await request.json();
        if (body.password === expectedPass) {
          return new Response(JSON.stringify({ success: true }), {
            headers: { "Content-Type": "application/json; charset=utf-8" }
          });
        } else {
          return new Response(JSON.stringify({ success: false, error: "密码错误！" }), {
            status: 401,
            headers: { "Content-Type": "application/json; charset=utf-8" }
          });
        }
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    // ---------------- API 3: 保存所有数据（需要密码保护） ----------------
    if (url.pathname === "/api/save-classes" && request.method === "POST") {
      try {
        const body = await request.json();

        if (body.password !== expectedPass) {
          return new Response(JSON.stringify({ success: false, error: "密码错误！修改未保存。" }), {
            status: 401,
            headers: { "Content-Type": "application/json; charset=utf-8" }
          });
        }

        await env.CLASS_KV.put(KV_KEY, JSON.stringify(body.data));
        return new Response(JSON.stringify({ success: true }), {
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      } catch (e) {
        return new Response(JSON.stringify({ success: false, error: e.message }), {
          status: 500,
          headers: { "Content-Type": "application/json; charset=utf-8" }
        });
      }
    }

    // ---------------- 主 HTML 页面 ----------------
    return new Response(HTML_CONTENT, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Content-Type-Options': 'nosniff'
      }
    });
  }
};

const HTML_CONTENT = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
    <title>班级随机点名系统</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
      .text-shimmer {
        background: linear-gradient(90deg, #fff, #fde68a, #fff, #fde68a, #fff);
        background-size: 200% auto;
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        animation: shimmer 6s linear infinite;
      }
      @keyframes shimmer {
        0% { background-position: -200% center; }
        100% { background-position: 200% center; }
      }
      .glass {
        background: rgba(255, 255, 255, 0.08);
        backdrop-filter: blur(16px);
        -webkit-backdrop-filter: blur(16px);
        border: 1px solid rgba(255, 255, 255, 0.15);
      }
      .glass-modal {
        background: rgba(18, 18, 20, 0.95);
        backdrop-filter: blur(25px);
        -webkit-backdrop-filter: blur(25px);
        border: 1px solid rgba(255, 255, 255, 0.18);
      }
      .slot-box {
        position: relative;
        overflow: hidden;
      }
      #slotWrapper {
        position: absolute;
        width: 100%;
        top: 0;
        left: 0;
        will-change: transform;
      }
      /* 星轨背景容器样式 */
      .star-background {
        position: fixed;
        top: 0;
        left: 0;
        width: 100vw;
        height: 100vh;
        z-index: -10;
      }
      #startrack {
        display: block;
        width: 100%;
        height: 100%;
      }
      .star-cover {
        position: absolute;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background-image: radial-gradient(rgba(0, 0, 0, 0) 0%, rgba(0, 0, 0, 0.8) 100%);
        pointer-events: none;
      }
    </style>
  </head>
  <body class="bg-[#151515] text-white min-h-screen relative overflow-hidden font-sans flex flex-col justify-between select-none">
    
    <!-- 经典星轨背景容器 -->
    <div class="star-background">
      <canvas id="startrack"></canvas>
      <div class="star-cover"></div>
    </div>

    <!-- 顶部导航栏 -->
    <header class="w-full max-w-5xl mx-auto px-6 pt-8 flex flex-wrap justify-between items-center gap-4 z-10">
      <div class="flex flex-wrap items-center gap-2">
        <span class="text-xl">🎲</span>
        <select id="mainYearSelect" onchange="onMainYearChange(this.value)" class="glass px-3 py-1.5 rounded-full text-xs font-bold text-amber-200 bg-black/40 border-amber-300/30 focus:outline-none cursor-pointer">
          <option>加载年份...</option>
        </select>
        <select id="mainSchoolSelect" onchange="onMainSchoolChange(this.value)" class="glass px-3 py-1.5 rounded-full text-xs font-bold text-amber-200 bg-black/40 border-amber-300/30 focus:outline-none cursor-pointer">
          <option>加载学校...</option>
        </select>
        <select id="mainClassSelect" onchange="onMainClassChange(this.value)" class="glass px-3 py-1.5 rounded-full text-xs font-bold text-amber-200 bg-black/40 border-amber-300/30 focus:outline-none cursor-pointer">
          <option>加载班级...</option>
        </select>
      </div>

      <!-- 点击后先触发密码验证 -->
      <button onclick="requestAdminAuth()" class="glass px-4 py-2 rounded-full text-xs font-medium text-amber-200 hover:bg-white/15 transition duration-200 flex items-center gap-1.5 border-amber-300/30">
        <span>⚙️</span> 管理与编辑名单
      </button>
    </header>

    <!-- 中央核心点名区 -->
    <main class="flex-1 flex flex-col items-center justify-center px-4 z-10">
      <div class="glass slot-box w-full max-w-md h-[240px] rounded-3xl shadow-2xl mb-8 border-white/20">
        <div class="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-[#151515]/85 via-transparent to-[#151515]/85"></div>

        <div id="slotWrapper">
          <div class="h-[240px] flex items-center justify-center text-4xl sm:text-5xl font-black text-shimmer">准备就绪</div>
        </div>
      </div>

      <div id="subStatus" class="text-xs text-white/50 mb-8 tracking-widest font-mono">点击下方按钮开始 4 秒随机抽选</div>

      <button id="drawBtn" onclick="startDraw()" class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xl px-12 py-4 rounded-full shadow-lg shadow-indigo-500/30 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
        🎯 开始抽签
      </button>
    </main>

    <!-- 页脚 -->
    <footer class="pb-6 text-center text-xs text-white/30 z-10">
      高一7班·共68人
    </footer>

    <!-- 弹窗 1：前置管理员密码验证框 -->
    <div id="authModal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-opacity duration-300">
      <div class="glass-modal w-full max-w-sm rounded-3xl p-6 shadow-2xl text-center border-white/20 flex flex-col items-center">
        <div class="text-3xl mb-2">🔒</div>
        <h3 class="text-base font-bold text-white mb-2">管理员权限验证</h3>
        <p class="text-xs text-white/50 mb-4">编辑名单需要管理员身份，请输入密码：</p>
        
        <input id="authPasswordInput" type="password" placeholder="请输入管理员密码" class="w-full bg-black/60 border border-white/20 rounded-xl px-4 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-amber-400 mb-4 text-center" onkeydown="if(event.key==='Enter') verifyAdminAuth()" />

        <div class="flex gap-3 w-full">
          <button onclick="closeAuthModal()" class="flex-1 py-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 text-xs font-medium transition">取消</button>
          <button id="authBtn" onclick="verifyAdminAuth()" class="flex-1 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 text-black font-bold text-xs transition">验证并进入</button>
        </div>
      </div>
    </div>

    <!-- 弹窗 2：多层级与名单管理模态框 -->
    <div id="modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-opacity duration-300">
      <div class="glass-modal w-full max-w-2xl rounded-3xl p-6 shadow-2xl text-left border-white/20 max-h-[90vh] flex flex-col">
        
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <span>📋</span> 年份 / 学校 / 班级与名单管理
          </h3>
          <button onclick="closeModal()" class="text-white/50 hover:text-white text-xl font-bold">&times;</button>
        </div>

        <div class="flex-1 overflow-y-auto pr-1 space-y-4">
          
          <!-- 1. 年份管理 -->
          <div class="bg-white/5 p-3 rounded-2xl border border-white/10">
            <label class="block text-xs font-semibold text-amber-200 mb-1.5">1. 选择或创建年份：</label>
            <div class="flex gap-2 mb-2">
              <select id="modalYearSelect" onchange="onModalYearChange(this.value)" class="flex-1 bg-black/50 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"></select>
              <button onclick="deleteCurrentYear()" class="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs transition">删除该年份</button>
            </div>
            <div class="flex gap-2">
              <input id="newYearInput" type="text" placeholder="新年份名称（如：2026年）" class="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none" />
              <button onclick="addNewYear()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition">新增年份</button>
            </div>
          </div>

          <!-- 2. 学校管理 -->
          <div class="bg-white/5 p-3 rounded-2xl border border-white/10">
            <label class="block text-xs font-semibold text-amber-200 mb-1.5">2. 选择或创建学校：</label>
            <div class="flex gap-2 mb-2">
              <select id="modalSchoolSelect" onchange="onModalSchoolChange(this.value)" class="flex-1 bg-black/50 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"></select>
              <button onclick="deleteCurrentSchool()" class="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs transition">删除该学校</button>
            </div>
            <div class="flex gap-2">
              <input id="newSchoolInput" type="text" placeholder="新学校名称（如：第一中学）" class="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none" />
              <button onclick="addNewSchool()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition">新增学校</button>
            </div>
          </div>

          <!-- 3. 班级管理 -->
          <div class="bg-white/5 p-3 rounded-2xl border border-white/10">
            <label class="block text-xs font-semibold text-amber-200 mb-1.5">3. 选择或创建班级：</label>
            <div class="flex gap-2 mb-2">
              <select id="modalClassSelect" onchange="onModalClassChange(this.value)" class="flex-1 bg-black/50 border border-white/20 rounded-xl px-3 py-1.5 text-xs text-white focus:outline-none"></select>
              <button onclick="deleteCurrentClass()" class="px-3 py-1.5 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs transition">删除该班级</button>
            </div>
            <div class="flex gap-2">
              <input id="newClassInput" type="text" placeholder="新班级名称（如：高一(3)班）" class="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none" />
              <button onclick="addNewClass()" class="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition">新增班级</button>
            </div>
          </div>

          <!-- 4. 学生名单编辑 -->
          <div>
            <label class="block text-xs font-semibold text-amber-200 mb-1.5">4. 编辑当前班级学生名单（支持换行或逗号分隔）：</label>
            <textarea id="studentInput" class="w-full h-32 bg-black/50 border border-white/10 rounded-2xl p-3 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 resize-none font-mono" placeholder="张三&#10;李四&#10;王五"></textarea>
          </div>
        </div>
        
        <div class="flex justify-end gap-3 pt-4 border-t border-white/10">
          <button onclick="closeModal()" class="px-5 py-2 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 text-xs font-medium transition">取消</button>
          <button id="saveBtn" onclick="saveAllToKV()" class="px-6 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition flex items-center gap-2">
            <span>💾</span> 保存并同步到云端
          </button>
        </div>
      </div>
    </div>

    <!-- 脚本逻辑 -->
    <script>
      // ---------------- 1. 经典星轨 Canvas 背景渲染引擎 ----------------
      (function () {
        var canvas = document.getElementById("startrack");
        var ctx = canvas.getContext("2d");
        var offCanvas = document.createElement("canvas");
        var offCtx = offCanvas.getContext("2d");
        var width, height, maxSide;
        var stars = [];
        var frameCount = 0;

        function random(min, max) {
          return min + Math.round(Math.random() * (max - min));
        }

        function initStars() {
          width = canvas.width = window.innerWidth;
          height = canvas.height = window.innerHeight;
          maxSide = Math.max(width, height);
          offCanvas.width = 2.6 * maxSide;
          offCanvas.height = 2.6 * maxSide;
          ctx.fillStyle = "rgba(21, 21, 21, 1)";
          ctx.fillRect(0, 0, width, height);
          ctx.lineCap = "round";
          ctx.translate(width, 0);

          stars = [];
          for (var i = 20000; i--;) {
            var r = random(120, 255);
            var g = random(120, 255);
            var b = random(120, 255);
            var a = random(30, 100) / 100;
            stars.push({
              x: random(-offCanvas.width, offCanvas.width),
              y: random(-offCanvas.height, offCanvas.height),
              size: 1.2,
              color: "rgba(" + r + "," + g + "," + b + "," + a + ")"
            });
          }

          for (var j = stars.length; j--;) {
            var s = stars[j];
            offCtx.beginPath();
            offCtx.arc(s.x, s.y, s.size, 0, 2 * Math.PI, true);
            offCtx.fillStyle = s.color;
            offCtx.closePath();
            offCtx.fill();
          }
        }

        function drawStars() {
          ctx.drawImage(offCanvas, -offCanvas.width / 2, -offCanvas.height / 2);
          frameCount++;
          if (frameCount > 150 && frameCount % 8 === 0) {
            ctx.fillStyle = "rgba(0, 0, 0, 0.04)";
            ctx.fillRect(-3 * maxSide, -3 * maxSide, 6 * maxSide, 6 * maxSide);
          }
          ctx.rotate((0.025 * Math.PI) / 180);
        }

        function loopStars() {
          drawStars();
          requestAnimationFrame(loopStars);
        }

        window.addEventListener("resize", function () {
          width = canvas.width = window.innerWidth;
          height = canvas.height = window.innerHeight;
          maxSide = Math.max(width, height);
          ctx.fillStyle = "rgba(21, 21, 21, 1)";
          ctx.fillRect(0, 0, width, height);
          ctx.translate(width, 0);
        });

        initStars();
        loopStars();
      })();

      // ---------------- 2. 数据与全局状态 ----------------
      let appData = {
        activeYear: "",
        activeSchool: "",
        activeClass: "",
        data: {}
      };

      let currentPassToken = ""; // 缓存本次验证通过的密码
      let editingYear = "";
      let editingSchool = "";
      let editingClass = "";

      async function loadDataFromKV() {
        try {
          const res = await fetch('/api/get-classes');
          appData = await res.json();
          sanitizeSelections();
          renderMainSelectors();
          updateMainDisplay();
        } catch(e) {
          console.error("加载云端 KV 失败", e);
        }
      }

      function sanitizeSelections() {
        if (!appData.data || Object.keys(appData.data).length === 0) {
          appData.data = { "2026年": { "实验中学": { "高一(1)班": [] } } };
        }
        const years = Object.keys(appData.data);
        if (!years.includes(appData.activeYear)) appData.activeYear = years[0];

        const schools = Object.keys(appData.data[appData.activeYear] || {});
        if (!schools.includes(appData.activeSchool)) appData.activeSchool = schools[0] || "";

        const classes = Object.keys(appData.data[appData.activeYear]?.[appData.activeSchool] || {});
        if (!classes.includes(appData.activeClass)) appData.activeClass = classes[0] || "";
      }

      function renderMainSelectors() {
        sanitizeSelections();
        const years = Object.keys(appData.data);
        const schools = Object.keys(appData.data[appData.activeYear] || {});
        const classes = Object.keys(appData.data[appData.activeYear]?.[appData.activeSchool] || {});

        document.getElementById('mainYearSelect').innerHTML = years.map(y => 
          \`<option value="\${y}" \${y === appData.activeYear ? 'selected' : ''}>\${y}</option>\`
        ).join('');

        document.getElementById('mainSchoolSelect').innerHTML = schools.map(s => 
          \`<option value="\${s}" \${s === appData.activeSchool ? 'selected' : ''}>\${s}</option>\`
        ).join('');

        document.getElementById('mainClassSelect').innerHTML = classes.map(c => 
          \`<option value="\${c}" \${c === appData.activeClass ? 'selected' : ''}>\${c}</option>\`
        ).join('');
      }

      function onMainYearChange(val) {
        appData.activeYear = val;
        const schools = Object.keys(appData.data[val] || {});
        appData.activeSchool = schools[0] || "";
        const classes = Object.keys(appData.data[val]?.[appData.activeSchool] || {});
        appData.activeClass = classes[0] || "";
        renderMainSelectors();
        updateMainDisplay();
      }

      function onMainSchoolChange(val) {
        appData.activeSchool = val;
        const classes = Object.keys(appData.data[appData.activeYear]?.[val] || {});
        appData.activeClass = classes[0] || "";
        renderMainSelectors();
        updateMainDisplay();
      }

      function onMainClassChange(val) {
        appData.activeClass = val;
        updateMainDisplay();
      }

      function getActiveStudentList() {
        return appData.data?.[appData.activeYear]?.[appData.activeSchool]?.[appData.activeClass] || [];
      }

      function updateMainDisplay() {
        const list = getActiveStudentList();
        const slotWrapper = document.getElementById('slotWrapper');
        slotWrapper.style.transition = 'none';
        slotWrapper.style.transform = 'translateY(0px)';
        slotWrapper.innerHTML = \`<div class="h-[240px] flex items-center justify-center text-4xl sm:text-5xl font-black text-shimmer">\${list.length > 0 ? "准备就绪" : "无学生名单"}</div>\`;

        document.getElementById('subStatus').innerText = \`当前：\${appData.activeYear} · \${appData.activeSchool} · \${appData.activeClass}（共 \${list.length} 人）\`;
        document.getElementById('drawBtn').innerText = "🎯 开始抽签";
      }

      // ---------------- 3. 前置密码校验逻辑 ----------------
      function requestAdminAuth() {
        if (currentPassToken) {
          openModal();
          return;
        }
        const authModal = document.getElementById('authModal');
        document.getElementById('authPasswordInput').value = "";
        authModal.classList.remove('opacity-0', 'pointer-events-none');
        authModal.classList.add('opacity-100');
        setTimeout(() => document.getElementById('authPasswordInput').focus(), 100);
      }

      function closeAuthModal() {
        const authModal = document.getElementById('authModal');
        authModal.classList.remove('opacity-100');
        authModal.classList.add('opacity-0', 'pointer-events-none');
      }

      async function verifyAdminAuth() {
        const passInput = document.getElementById('authPasswordInput');
        const pass = passInput.value.trim();
        if (!pass) {
          alert("请输入密码！");
          return;
        }

        const authBtn = document.getElementById('authBtn');
        authBtn.innerText = "验证中...";
        authBtn.disabled = true;

        try {
          const res = await fetch('/api/verify-pass', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: pass })
          });
          
          if (res.ok) {
            currentPassToken = pass;
            closeAuthModal();
            openModal();
          } else {
            alert("密码错误！无法进行管理。");
          }
        } catch(e) {
          alert("网络错误，验证失败！");
        } finally {
          authBtn.innerText = "验证并进入";
          authBtn.disabled = false;
        }
      }

      // ---------------- 4. 模态框管理逻辑 ----------------
      function openModal() {
        editingYear = appData.activeYear;
        editingSchool = appData.activeSchool;
        editingClass = appData.activeClass;
        
        renderModalSelectors();

        const modal = document.getElementById('modal');
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100');
      }

      function closeModal() {
        const modal = document.getElementById('modal');
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0', 'pointer-events-none');
      }

      function saveModalTextareaToMemory() {
        if (!editingYear || !editingSchool || !editingClass) return;
        const text = document.getElementById('studentInput').value.trim();
        const list = text ? text.split(/[\\n,，、]/).map(s => s.trim()).filter(s => s.length > 0) : [];
        if (!appData.data[editingYear]) appData.data[editingYear] = {};
        if (!appData.data[editingYear][editingSchool]) appData.data[editingYear][editingSchool] = {};
        appData.data[editingYear][editingSchool][editingClass] = list;
      }

      function sanitizeEditingSelections() {
        const years = Object.keys(appData.data);
        if (!years.includes(editingYear)) editingYear = years[0] || "";
        
        const schools = Object.keys(appData.data[editingYear] || {});
        if (!schools.includes(editingSchool)) editingSchool = schools[0] || "";

        const classes = Object.keys(appData.data[editingYear]?.[editingSchool] || {});
        if (!classes.includes(editingClass)) editingClass = classes[0] || "";
      }

      function renderModalSelectors() {
        sanitizeEditingSelections();

        const years = Object.keys(appData.data);
        const schools = Object.keys(appData.data[editingYear] || {});
        const classes = Object.keys(appData.data[editingYear]?.[editingSchool] || {});

        document.getElementById('modalYearSelect').innerHTML = years.map(y => 
          \`<option value="\${y}" \${y === editingYear ? 'selected' : ''}>\${y}</option>\`
        ).join('');

        document.getElementById('modalSchoolSelect').innerHTML = schools.map(s => 
          \`<option value="\${s}" \${s === editingSchool ? 'selected' : ''}>\${s}</option>\`
        ).join('');

        document.getElementById('modalClassSelect').innerHTML = classes.map(c => 
          \`<option value="\${c}" \${c === editingClass ? 'selected' : ''}>\${c}</option>\`
        ).join('');

        const currentList = appData.data?.[editingYear]?.[editingSchool]?.[editingClass] || [];
        document.getElementById('studentInput').value = currentList.join('\\n');
      }

      function onModalYearChange(val) {
        saveModalTextareaToMemory();
        editingYear = val;
        editingSchool = Object.keys(appData.data[val] || {})[0] || "";
        editingClass = Object.keys(appData.data[val]?.[editingSchool] || {})[0] || "";
        renderModalSelectors();
      }

      function onModalSchoolChange(val) {
        saveModalTextareaToMemory();
        editingSchool = val;
        editingClass = Object.keys(appData.data[editingYear]?.[val] || {})[0] || "";
        renderModalSelectors();
      }

      function onModalClassChange(val) {
        saveModalTextareaToMemory();
        editingClass = val;
        renderModalSelectors();
      }

      function addNewYear() {
        saveModalTextareaToMemory();
        const input = document.getElementById('newYearInput');
        const val = input.value.trim();
        if (!val) return alert("请输入年份名称！");
        if (appData.data[val]) return alert("该年份已存在！");
        appData.data[val] = { "默认学校": { "高一(1)班": [] } };
        editingYear = val;
        editingSchool = "默认学校";
        editingClass = "高一(1)班";
        input.value = "";
        renderModalSelectors();
      }

      function deleteCurrentYear() {
        if (Object.keys(appData.data).length <= 1) return alert("至少保留一个年份！");
        if (confirm(\`确定要删除 "\${editingYear}" 及其下所有学校和班级吗？\`)) {
          delete appData.data[editingYear];
          renderModalSelectors();
        }
      }

      function addNewSchool() {
        saveModalTextareaToMemory();
        const input = document.getElementById('newSchoolInput');
        const val = input.value.trim();
        if (!val) return alert("请输入学校名称！");
        if (appData.data[editingYear][val]) return alert("该学校在当前年份已存在！");
        appData.data[editingYear][val] = { "高一(1)班": [] };
        editingSchool = val;
        editingClass = "高一(1)班";
        input.value = "";
        renderModalSelectors();
      }

      function deleteCurrentSchool() {
        if (Object.keys(appData.data[editingYear]).length <= 1) return alert("当前年份下至少保留一个学校！");
        if (confirm(\`确定要删除 "\${editingSchool}" 及其下所有班级吗？\`)) {
          delete appData.data[editingYear][editingSchool];
          renderModalSelectors();
        }
      }

      function addNewClass() {
        saveModalTextareaToMemory();
        const input = document.getElementById('newClassInput');
        const val = input.value.trim();
        if (!val) return alert("请输入班级名称！");
        if (appData.data[editingYear][editingSchool][val]) return alert("该班级在此学校已存在！");
        appData.data[editingYear][editingSchool][val] = [];
        editingClass = val;
        input.value = "";
        renderModalSelectors();
      }

      function deleteCurrentClass() {
        if (Object.keys(appData.data[editingYear][editingSchool]).length <= 1) return alert("当前学校下至少保留一个班级！");
        if (confirm(\`确定要删除 "\${editingClass}" 吗？\`)) {
          delete appData.data[editingYear][editingSchool][editingClass];
          renderModalSelectors();
        }
      }

      async function saveAllToKV() {
        saveModalTextareaToMemory();

        const saveBtn = document.getElementById('saveBtn');
        saveBtn.innerText = "⏳ 保存中...";
        saveBtn.disabled = true;

        try {
          const res = await fetch('/api/save-classes', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: currentPassToken, data: appData })
          });

          const result = await res.json();
          if (res.ok && result.success) {
            alert("保存并成功同步至云端！");
            renderMainSelectors();
            updateMainDisplay();
            closeModal();
          } else {
            alert(result.error || "保存失败，请重新输入密码！");
            currentPassToken = ""; 
          }
        } catch(e) {
          alert("保存到云端失败，请检查网络！");
        } finally {
          saveBtn.innerText = "💾 保存并同步到云端";
          saveBtn.disabled = false;
        }
      }

      // ---------------- 5. 抽选逻辑 ----------------
      let isSpinning = false;

      function startDraw() {
        if (isSpinning) return;
        const currentList = getActiveStudentList();
        if (currentList.length === 0) {
          alert("当前班级没有学生，请先联系管理员添加学生！");
          return;
        }

        isSpinning = true;
        const slotWrapper = document.getElementById('slotWrapper');
        const subStatus = document.getElementById('subStatus');
        const drawBtn = document.getElementById('drawBtn');

        drawBtn.disabled = true;
        subStatus.innerText = "🎲 正在纵向滚动抽选...";

        const winnerIndex = Math.floor(Math.random() * currentList.length);
        const winnerName = currentList[winnerIndex];

        const itemHeight = 80;
        let scrollSequence = [];
        
        const minPrefix = 60;
        while (scrollSequence.length < minPrefix) {
          scrollSequence = scrollSequence.concat(currentList);
        }

        const winnerPosIndex = scrollSequence.length;
        scrollSequence.push(winnerName);
        scrollSequence = scrollSequence.concat(currentList).concat(currentList);

        slotWrapper.innerHTML = scrollSequence.map((name, idx) => {
          const isWinner = idx === winnerPosIndex;
          return \`<div class="h-[80px] flex items-center justify-center text-4xl sm:text-5xl tracking-wider transition-all duration-300 \${isWinner ? 'winner-target font-black text-shimmer scale-125' : 'text-white/40 font-semibold'}" style="height: \${itemHeight}px;">\${name}</div>\`;
        }).join('');

        slotWrapper.style.transition = 'none';
        slotWrapper.style.transform = 'translateY(0px)';
        slotWrapper.offsetHeight;

        const targetTranslateY = -((winnerPosIndex - 1) * itemHeight);
        const duration = 4000;
        slotWrapper.style.transition = \`transform \${duration}ms cubic-bezier(0.08, 0.82, 0.18, 1)\`;
        slotWrapper.style.transform = \`translateY(\${targetTranslateY}px)\`;

        setTimeout(() => {
          subStatus.innerText = \`🎉 恭喜 \${appData.activeYear} \${appData.activeSchool} \${appData.activeClass} 的 \${winnerName} 同学！\`;
          drawBtn.disabled = false;
          drawBtn.innerText = "🎲 再抽一位";
          isSpinning = false;
        }, duration);
      }

      window.onload = loadDataFromKV;
    </script>
  </body>
</html>`;
