/**
 * 炫彩旋转线条 - 班级随机点名系统 (多班级+KV云端同步+老虎机视口重构版)
 * 单文件 Cloudflare Workers 部署
 */

const KV_KEY = "multi_class_students_data_v1";

// 默认班级数据（首次部署时使用）
const DEFAULT_DATA = {
  activeClass: "高一(1)班",
  classes: {
    "高一(1)班": ["张三", "李四", "王五", "赵六", "钱七", "孙八", "周九"],
    "高一(2)班": ["陈一", "褚二", "卫三", "蒋四", "沈五", "韩六"]
  }
};

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ---------------- API 1: 读取所有班级数据 ----------------
    if (url.pathname === "/api/get-classes" && request.method === "GET") {
      let data = await env.CLASS_KV.get(KV_KEY, { type: "json" });
      if (!data) {
        data = DEFAULT_DATA;
        await env.CLASS_KV.put(KV_KEY, JSON.stringify(data));
      }
      return new Response(JSON.stringify(data), {
        headers: { "Content-Type": "application/json; charset=utf-8" }
      });
    }

    // ---------------- API 2: 保存所有班级数据 ----------------
    if (url.pathname === "/api/save-classes" && request.method === "POST") {
      try {
        const body = await request.json();
        await env.CLASS_KV.put(KV_KEY, JSON.stringify(body));
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
        background: rgba(18, 18, 20, 0.94);
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
    </style>
  </head>
  <body class="bg-[#0a0a0a] text-white min-h-screen relative overflow-hidden font-sans flex flex-col justify-between select-none">
    
    <!-- 3200根炫彩旋转线条 Canvas 背景 -->
    <canvas id="starCanvas" class="fixed inset-0 -z-10 block pointer-events-none"></canvas>

    <!-- 顶部导航栏 -->
    <header class="w-full max-w-5xl mx-auto px-6 pt-8 flex justify-between items-center z-10">
      
      <!-- 多班级选择下拉框 -->
      <div class="flex items-center gap-3">
        <span class="text-xl">🎲</span>
        <select id="classSelect" onchange="switchClass(this.value)" class="glass px-4 py-2 rounded-full text-sm font-bold text-amber-200 bg-black/40 border-amber-300/30 focus:outline-none cursor-pointer">
          <option value="">正在加载班级...</option>
        </select>
      </div>

      <button onclick="openModal()" class="glass px-4 py-2 rounded-full text-xs font-medium text-amber-200 hover:bg-white/15 transition duration-200 flex items-center gap-1.5 border-amber-300/30">
        <span>⚙️</span> 管理班级与名单
      </button>
    </header>

    <!-- 中央核心点名区 -->
    <main class="flex-1 flex flex-col items-center justify-center px-4 z-10">
      <!-- 滚轮视口卡片：固定高度 240px，正好容纳 3 个 80px 高的元素 -->
      <div class="glass slot-box w-full max-w-md h-[240px] rounded-3xl shadow-2xl mb-8 border-white/20">
        
        <!-- 上下渐变遮罩：突出中间高亮部分 -->
        <div class="absolute inset-0 z-10 pointer-events-none bg-gradient-to-b from-[#0a0a0a]/85 via-transparent to-[#0a0a0a]/85"></div>

        <!-- 滚动列表容器 -->
        <div id="slotWrapper">
          <div class="h-[240px] flex items-center justify-center text-4xl sm:text-5xl font-black text-shimmer">准备就绪</div>
        </div>

      </div>

      <div id="subStatus" class="text-xs text-white/50 mb-8 tracking-widest font-mono">点击下方按钮开始 4 秒随机抽选</div>

      <!-- 抽签按钮 -->
      <button id="drawBtn" onclick="startDraw()" class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:scale-95 text-white font-bold text-xl px-12 py-4 rounded-full shadow-lg shadow-indigo-500/30 transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none">
        🎯 开始抽签
      </button>
    </main>

    <!-- 页脚 -->
    <footer class="pb-6 text-center text-xs text-white/30 z-10">
      云端 KV 持久化存储 · 多班级随机抽选
    </footer>

    <!-- 多班级与名单管理模态框 -->
    <div id="modal" class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 opacity-0 pointer-events-none transition-opacity duration-300">
      <div class="glass-modal w-full max-w-xl rounded-3xl p-6 shadow-2xl text-left border-white/20 max-h-[90vh] flex flex-col">
        
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-lg font-bold text-white flex items-center gap-2">
            <span>📋</span> 班级与学生名单管理
          </h3>
          <button onclick="closeModal()" class="text-white/50 hover:text-white text-xl font-bold">&times;</button>
        </div>

        <div class="flex-1 overflow-y-auto pr-1">
          <!-- 1. 新建/删除班级 -->
          <div class="mb-5 bg-white/5 p-4 rounded-2xl border border-white/10">
            <label class="block text-xs font-semibold text-amber-200 mb-2">切换或新增班级：</label>
            <div class="flex gap-2 mb-3">
              <select id="modalClassSelect" onchange="switchModalClass(this.value)" class="flex-1 bg-black/50 border border-white/20 rounded-xl px-3 py-2 text-sm text-white focus:outline-none">
              </select>
              <button onclick="deleteCurrentClass()" class="px-3 py-2 bg-rose-600/80 hover:bg-rose-600 text-white rounded-xl text-xs font-medium transition">删除此班级</button>
            </div>
            
            <div class="flex gap-2">
              <input id="newClassNameInput" type="text" placeholder="输入新班级名称（如：高一(3)班）" class="flex-1 bg-black/50 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-indigo-500" />
              <button onclick="addNewClass()" class="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-xs font-semibold transition">新增班级</button>
            </div>
          </div>

          <!-- 2. 编辑当前班级学生名单 -->
          <div class="mb-2">
            <label class="block text-xs font-semibold text-amber-200 mb-2">当前班级学生名单（支持换行或逗号分隔）：</label>
            <textarea id="studentInput" class="w-full h-44 bg-black/50 border border-white/10 rounded-2xl p-4 text-sm text-white placeholder-white/30 focus:outline-none focus:border-indigo-500 resize-none font-mono" placeholder="张三&#10;李四&#10;王五"></textarea>
          </div>
        </div>
        
        <div class="flex justify-end gap-3 pt-4 border-t border-white/10">
          <button onclick="closeModal()" class="px-5 py-2.5 rounded-xl bg-white/10 text-white/70 hover:bg-white/20 text-sm font-medium transition">取消</button>
          <button id="saveBtn" onclick="saveAllToKV()" class="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-semibold transition flex items-center gap-2">
            <span>💾</span> 保存并同步到云端
          </button>
        </div>
      </div>
    </div>

    <!-- 核心逻辑脚本 -->
    <script>
      // ---------------- 1. 3200根高密度旋转线条 Canvas ----------------
      const canvas = document.getElementById('starCanvas');
      const ctx = canvas.getContext('2d');
      let lines = [];
      let globalTime = 0;

      function initLines() {
        lines = [];
        const LINE_COUNT = 3200; 
        const maxDiagonal = Math.sqrt(Math.pow(window.innerWidth * 1.8, 2) + Math.pow(window.innerHeight * 1.8, 2));

        for (let i = 0; i < LINE_COUNT; i++) {
          const radius = 50 + Math.random() * maxDiagonal;
          const angle = Math.random() * Math.PI * 2;
          lines.push({
            angle: angle,
            radius: radius,
            length: (0.006 + Math.random() * 0.04) * (800 / radius),
            hue: Math.random() * 360,
            alpha: 0.45 + Math.random() * 0.5,
            speed: (0.00012 + Math.random() * 0.00018) * (1 / (radius / 600)),
            width: 1.1 + Math.random() * 0.7 
          });
        }
      }

      function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        initLines();
      }
      window.addEventListener('resize', resize);

      const getCenterX = () => canvas.width * 1.15;
      const getCenterY = () => canvas.height * -0.18;

      function renderCanvas() {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = "#0a0a0a";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        globalTime += 0.00018;

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          const startAngle = line.angle + globalTime * line.speed * 60;
          const endAngle = startAngle + line.length;

          const startX = getCenterX() + Math.cos(startAngle) * line.radius;
          const startY = getCenterY() + Math.sin(startAngle) * line.radius;
          const endX = getCenterX() + Math.cos(endAngle) * line.radius;
          const endY = getCenterY() + Math.sin(endAngle) * line.radius;

          const grad = ctx.createLinearGradient(startX, startY, endX, endY);
          grad.addColorStop(0, \`hsla(\${line.hue}, 90%, 68%, 0)\`);
          grad.addColorStop(0.4, \`hsla(\${line.hue}, 90%, 72%, \${line.alpha})\`);
          grad.addColorStop(1, \`hsla(\${(line.hue + 30) % 360}, 90%, 72%, \${line.alpha * 0.6})\`);

          ctx.beginPath();
          ctx.strokeStyle = grad;
          ctx.lineWidth = line.width;
          ctx.lineCap = "round";
          ctx.moveTo(startX, startY);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          line.angle += line.speed;
        }

        requestAnimationFrame(renderCanvas);
      }

      resize();
      requestAnimationFrame(renderCanvas);

      // ---------------- 2. 云端 KV 数据同步与班级管理 ----------------
      let appData = {
        activeClass: "",
        classes: {}
      };
      
      let editingModalClass = ""; // 模态框当前正在编辑的班级

      // 初始化：从 Workers KV 加载班级数据
      async function loadDataFromKV() {
        try {
          const res = await fetch('/api/get-classes');
          appData = await res.json();
          renderClassSelectors();
          updateMainDisplay();
        } catch(e) {
          console.error("加载云端 KV 失败", e);
        }
      }

      function renderClassSelectors() {
        const classNames = Object.keys(appData.classes);
        if (classNames.length === 0) return;

        if (!appData.activeClass || !appData.classes[appData.activeClass]) {
          appData.activeClass = classNames[0];
        }

        // 首页选择框
        const select = document.getElementById('classSelect');
        select.innerHTML = classNames.map(name => 
          \`<option value="\${name}" \${name === appData.activeClass ? 'selected' : ''}>\${name}</option>\`
        ).join('');

        // 弹窗选择框
        editingModalClass = appData.activeClass;
        renderModalClassSelect();
      }

      function renderModalClassSelect() {
        const classNames = Object.keys(appData.classes);
        const modalSelect = document.getElementById('modalClassSelect');
        modalSelect.innerHTML = classNames.map(name => 
          \`<option value="\${name}" \${name === editingModalClass ? 'selected' : ''}>\${name}</option>\`
        ).join('');

        const studentInput = document.getElementById('studentInput');
        const list = appData.classes[editingModalClass] || [];
        studentInput.value = list.join('\\n');
      }

      function switchClass(className) {
        if (!className || !appData.classes[className]) return;
        appData.activeClass = className;
        updateMainDisplay();
        // 保存当前选中的班级状态
        saveAllToKV(false);
      }

      function switchModalClass(className) {
        // 先暂存当前正在输入的文本
        saveCurrentInputToMemory();
        editingModalClass = className;
        renderModalClassSelect();
      }

      function saveCurrentInputToMemory() {
        if (!editingModalClass) return;
        const text = document.getElementById('studentInput').value.trim();
        const list = text ? text.split(/[\\n,，、]/).map(s => s.trim()).filter(s => s.length > 0) : [];
        appData.classes[editingModalClass] = list;
      }

      function addNewClass() {
        saveCurrentInputToMemory();
        const input = document.getElementById('newClassNameInput');
        const name = input.value.trim();
        if (!name) {
          alert("请输入新班级名称！");
          return;
        }
        if (appData.classes[name]) {
          alert("该班级名称已存在！");
          return;
        }
        appData.classes[name] = [];
        appData.activeClass = name;
        editingModalClass = name;
        input.value = "";
        renderClassSelectors();
      }

      function deleteCurrentClass() {
        const classNames = Object.keys(appData.classes);
        if (classNames.length <= 1) {
          alert("至少保留一个班级！");
          return;
        }
        if (confirm(\`确定要删除 "\${editingModalClass}" 吗？\`)) {
          delete appData.classes[editingModalClass];
          appData.activeClass = Object.keys(appData.classes)[0];
          editingModalClass = appData.activeClass;
          renderClassSelectors();
        }
      }

      async function saveAllToKV(closeModalAfter = true) {
        saveCurrentInputToMemory();
        
        const saveBtn = document.getElementById('saveBtn');
        saveBtn.innerText = "⏳ 保存中...";
        saveBtn.disabled = true;

        try {
          await fetch('/api/save-classes', {
            method: 'POST',
            body: JSON.stringify(appData)
          });
          renderClassSelectors();
          updateMainDisplay();
          if (closeModalAfter) closeModal();
        } catch(e) {
          alert("保存到云端失败，请重试！");
        } finally {
          saveBtn.innerText = "💾 保存并同步到云端";
          saveBtn.disabled = false;
        }
      }

      function updateMainDisplay() {
        const list = appData.classes[appData.activeClass] || [];
        const slotWrapper = document.getElementById('slotWrapper');
        slotWrapper.style.transition = 'none';
        slotWrapper.style.transform = 'translateY(0px)';
        slotWrapper.innerHTML = \`<div class="h-[240px] flex items-center justify-center text-4xl sm:text-5xl font-black text-shimmer">\${list.length > 0 ? "准备就绪" : "请先导入学生"}</div>\`;

        document.getElementById('subStatus').innerText = \`当前：\${appData.activeClass}（共 \${list.length} 人）\`;
        document.getElementById('drawBtn').innerText = "🎯 开始抽签";
      }

      // ---------------- 3. 老虎机视口重构（真正平滑居中+高亮放大+下方后续名字） ----------------
      let isSpinning = false;

      function startDraw() {
        if (isSpinning) return;
        const currentList = appData.classes[appData.activeClass] || [];
        if (currentList.length === 0) {
          alert("当前班级没有学生，请先点击右上角管理并添加学生！");
          openModal();
          return;
        }

        isSpinning = true;
        const slotWrapper = document.getElementById('slotWrapper');
        const subStatus = document.getElementById('subStatus');
        const drawBtn = document.getElementById('drawBtn');

        drawBtn.disabled = true;
        subStatus.innerText = "🎲 正在纵向滚动抽选...";

        // 1. 随机选出中选学生
        const winnerIndex = Math.floor(Math.random() * currentList.length);
        const winnerName = currentList[winnerIndex];

        // 2. 构造长滚动列表：确保 winnerName 在中间偏后，且其下方继续拼接完整的学生循环！
        const itemHeight = 80; // 每个名字占用 80px 高度
        let scrollSequence = [];
        
        // 前置滚动段：重复拼入约 60 个名字，保证 4 秒高速滚动的质感
        const minPrefix = 60;
        while (scrollSequence.length < minPrefix) {
          scrollSequence = scrollSequence.concat(currentList);
        }

        // 关键重构点：把 winnerName 放中间，下方继续追加至少 10 个名字，保证下方不空白！
        const winnerPosIndex = scrollSequence.length; // winner 在序列中的索引
        scrollSequence.push(winnerName);

        // 在 winnerName 下方追加后续学生名单（循环2次）
        scrollSequence = scrollSequence.concat(currentList).concat(currentList);

        // 3. 渲染 DOM
        slotWrapper.innerHTML = scrollSequence.map((name, idx) => {
          const isWinner = idx === winnerPosIndex;
          return \`<div class="h-[80px] flex items-center justify-center text-4xl sm:text-5xl tracking-wider transition-all duration-300 \${isWinner ? 'winner-target font-black text-shimmer scale-125' : 'text-white/40 font-semibold'}" style="height: \${itemHeight}px;">\${name}</div>\`;
        }).join('');

        // 4. 重置 Transform
        slotWrapper.style.transition = 'none';
        slotWrapper.style.transform = 'translateY(0px)';
        slotWrapper.offsetHeight; // 强制重绘

        // 5. 精确计算平移位置：
        // 容器高度 240px，居中目标线为 Y = 80px 处（第 2 个 80px 区域）。
        // 索引为 winnerPosIndex 的元素，在 wrapper 中的原始 Top = winnerPosIndex * 80px。
        // 要让它正好停在容器的 80px 处，wrapper 向上平移距离 = (winnerPosIndex - 1) * 80px。
        const targetTranslateY = -((winnerPosIndex - 1) * itemHeight);

        // 6. 4 秒（4000ms）自然减速
        const duration = 4000;
        slotWrapper.style.transition = \`transform \${duration}ms cubic-bezier(0.08, 0.82, 0.18, 1)\`;
        slotWrapper.style.transform = \`translateY(\${targetTranslateY}px)\`;

        // 7. 4 秒停止后的高亮效果
        setTimeout(() => {
          subStatus.innerText = \`🎉 恭喜 \${appData.activeClass} 的 \${winnerName} 同学！\`;
          drawBtn.disabled = false;
          drawBtn.innerText = "🎲 再抽一位";
          isSpinning = false;
        }, duration);
      }

      // ---------------- 4. 弹窗控制 ----------------
      function openModal() {
        const modal = document.getElementById('modal');
        renderClassSelectors();
        modal.classList.remove('opacity-0', 'pointer-events-none');
        modal.classList.add('opacity-100');
      }

      function closeModal() {
        const modal = document.getElementById('modal');
        modal.classList.remove('opacity-100');
        modal.classList.add('opacity-0', 'pointer-events-none');
      }

      // 页面加载入口
      window.onload = loadDataFromKV;
    </script>
  </body>
</html>`;