export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "  在这里设置密码  ";

    // 1. 静态主页
    if (request.method === "GET" && url.pathname === "/") {
      return new Response(renderHTML(), {
        headers: { "Content-Type": "text/html; charset=utf-8" },
      });
    }

    // 2. 核心数据接口 (含周一到周五值日表、紧急广播)
    if (request.method === "GET" && url.pathname === "/api/data") {
      const records = JSON.parse((await env.LEAVE_KV.get("leave_records")) || "[]");
      const slides = JSON.parse((await env.LEAVE_KV.get("board_slides")) || "[]");
      const notice = (await env.LEAVE_KV.get("class_notice")) || "暂无最新班级公告。";
      const urgentStr = await env.LEAVE_KV.get("urgent_broadcast");
      const urgent = urgentStr ? JSON.parse(urgentStr) : null;
      
      // 默认周一到周五排班模板 (65人已分配，4人另行安排，卫生区全男生)
      const defaultWeeklyDuty = {
        1: {
          sweeping: "李彤珈",
          mopping: "李沐洋",
          blackboard: "支琼瑶",
          windows: "张盼盼",
          water: "付诗博",
          trash: "付思恩、苏雅琪",
          outdoor: "高林旭、王明哲、王涵乐、张景豪、孙敏浩、王耀康"
        },
        2: {
          sweeping: "姜思涵",
          mopping: "张慧莹",
          blackboard: "史雅欣",
          windows: "张畅畅",
          water: "郭施昂",
          trash: "康馨予、王静怡",
          outdoor: "王翔宇、查寅诚、杨双亮、杨绍博、李赫哲、华梦涛"
        },
        3: {
          sweeping: "任静茹",
          mopping: "杨梦圆",
          blackboard: "郭馨雨",
          windows: "吴梦瑶",
          water: "刘恩阳",
          trash: "王婧祎、陈梦霏",
          outdoor: "王子轩、李书研、许科航、魏家旺、李佳坤"
        },
        4: {
          sweeping: "胡梓钥",
          mopping: "张静蕾",
          blackboard: "王妙彤",
          windows: "张一珂",
          water: "雷岚岚",
          trash: "王含钰、苗林林",
          outdoor: "栾家乐、母高博、苏军豪、乔宇辰、王哲轩、刘帅豪"
        },
        5: {
          sweeping: "朱紫晗",
          mopping: "赵家欣",
          blackboard: "雷雨馨",
          windows: "李一诺",
          water: "位佳轩",
          trash: "单孟晴、张书珂",
          outdoor: "付政豪、苏世博、任科旭、高博望、董振鹏、喻昶沣"
        }
      };

      const dutyStr = await env.LEAVE_KV.get("weekly_duty_schedule_v6");
      const weeklyDuty = dutyStr ? JSON.parse(dutyStr) : defaultWeeklyDuty;

      return new Response(JSON.stringify({ records, slides, notice, urgent, weeklyDuty }), {
        headers: { "Content-Type": "application/json; charset=utf-8" },
      });
    }

    // 2.1 更新某一天的值日排班 (需密码，仅限周一到周五)
    if (request.method === "POST" && url.pathname === "/api/duty/update") {
      try {
        const { dayOfWeek, sweeping, mopping, blackboard, windows, water, trash, outdoor, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);

        const dutyStr = await env.LEAVE_KV.get("weekly_duty_schedule_v6");
        let weeklyDuty = dutyStr ? JSON.parse(dutyStr) : {};

        weeklyDuty[dayOfWeek] = {
          sweeping: (sweeping || "").trim(),
          mopping: (mopping || "").trim(),
          blackboard: (blackboard || "").trim(),
          windows: (windows || "").trim(),
          water: (water || "").trim(),
          trash: (trash || "").trim(),
          outdoor: (outdoor || "").trim()
        };

        await env.LEAVE_KV.put("weekly_duty_schedule_v6", JSON.stringify(weeklyDuty));
        return jsonRes({ success: true, message: "该日值日排班已成功保存！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 2.2 发布全屏紧急广播接口
    if (request.method === "POST" && url.pathname === "/api/broadcast/send") {
      try {
        const { text, durationMinutes, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        if (!text || !text.trim()) return jsonRes({ error: "广播内容不能为空！" }, 400);

        const duration = parseInt(durationMinutes, 10) || 10;
        const ttl = duration * 60;
        const broadcastData = {
          id: "broad_" + Date.now(),
          text: text.trim(),
          createdAt: new Date().toISOString(),
          expireAt: new Date(Date.now() + ttl * 1000).toISOString()
        };

        await env.LEAVE_KV.put("urgent_broadcast", JSON.stringify(broadcastData), { expirationTtl: ttl });
        return jsonRes({ success: true, message: `全屏广播已下发！预计持续展示 ${duration} 分钟。` });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 2.3 撤销全屏紧急广播接口
    if (request.method === "POST" && url.pathname === "/api/broadcast/clear") {
      try {
        const { password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        await env.LEAVE_KV.delete("urgent_broadcast");
        return jsonRes({ success: true, message: "全屏广播已撤销！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 3. 河南省周口市商水县专属天气代码: 101181406
    if (request.method === "GET" && url.pathname === "/api/weather") {
      try {
        const cacheKey = "shangshui_weather_cma_101181406_v12";
        const cached = await env.LEAVE_KV.get(cacheKey);
        if (cached) {
          return new Response(cached, { headers: { "Content-Type": "application/json; charset=utf-8" } });
        }

        let liveSk = { temp: "22", weather: "多云", WD: "偏南风", WS: "微风", aqi: "良" };
        try {
          const resSk = await fetch("http://d1.weather.com.cn/sk_2d/101181406.html", {
            headers: {
              "Referer": "http://www.weather.com.cn/",
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
            }
          });
          const rawSk = await resSk.text();
          liveSk = JSON.parse(rawSk.replace("var dataSK =", "").trim());
        } catch (e) {}

        const resHtml = await fetch("http://www.weather.com.cn/weather/101181406.shtml", {
          headers: {
            "Referer": "http://www.weather.com.cn/",
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"
          }
        });
        const html = await resHtml.text();

        const forecast = [];
        const ulMatch = html.match(/<ul class="t clearfix">([\s\S]*?)<\/ul>/);
        if (ulMatch) {
          const liMatches = ulMatch[1].match(/<li[\s\S]*?<\/li>/g) || [];
          const labels = ["今天", "明天", "后天"];

          liMatches.slice(0, 7).forEach((li, idx) => {
            const h1 = (li.match(/<h1>(.*?)<\/h1>/) || [])[1] || "";
            const wea = (li.match(/<p title="(.*?)" class="wea">/) || li.match(/<p class="wea".*?>(.*?)<\/p>/) || [])[1] || "多云";
            const highMatch = li.match(/<span>(.*?)<\/span>/);
            const lowMatch = li.match(/<i>(.*?)<\/i>/);

            const high = highMatch ? highMatch[1] : "";
            const low = lowMatch ? lowMatch[1] : "";

            let dayName = labels[idx];
            if (!dayName) {
              const dayPart = h1.split("（")[0].trim();
              dayName = dayPart.replace(/日/, "日");
            }

            const cleanWea = wea.replace(/<.*?>/g, "").trim();
            let cleanHigh = high.replace(/℃/g, "").trim();
            let cleanLow = low.replace(/℃/g, "").trim();

            if (!cleanHigh && cleanLow) {
              const liveTempNum = parseInt(liveSk.temp, 10) || 0;
              const lowNum = parseInt(cleanLow, 10) || 0;
              cleanHigh = String(Math.max(liveTempNum, lowNum + 4));
            } else if (cleanHigh && !cleanLow) {
              cleanLow = String(parseInt(cleanHigh, 10) - 6);
            }

            let minT = parseInt(cleanLow, 10) || 16;
            let maxT = parseInt(cleanHigh, 10) || 24;
            if (minT > maxT) [minT, maxT] = [maxT, minT];

            forecast.push({
              day: dayName,
              desc: cleanWea || "多云",
              icon: getChineseWeatherIcon(cleanWea),
              tempMax: maxT + "℃",
              tempMin: minT + "℃"
            });
          });
        }

        const currentIcon = getChineseWeatherIcon(liveSk.weather || (forecast[0] ? forecast[0].desc : "多云"));
        const weatherInfo = {
          city: "河南省周口市商水县",
          currentTemp: liveSk.temp || (forecast[0] ? forecast[0].tempMax.replace("℃", "") : "22"),
          currentWeather: liveSk.weather || (forecast[0] ? forecast[0].desc : "多云"),
          currentIcon: currentIcon,
          wind: (liveSk.WD || "偏南风") + " " + (liveSk.WS || "微风"),
          aqi: liveSk.aqi || "优良",
          forecast: forecast.length > 0 ? forecast : generateFallbackForecast()
        };

        const resultStr = JSON.stringify(weatherInfo);
        await env.LEAVE_KV.put(cacheKey, resultStr, { expirationTtl: 900 });
        return new Response(resultStr, { headers: { "Content-Type": "application/json; charset=utf-8" } });
      } catch (err) {
        return jsonRes({
          city: "河南省周口市商水县",
          currentTemp: 22,
          currentWeather: "多云",
          currentIcon: "⛅",
          wind: "偏南风 微风",
          aqi: "优良",
          forecast: generateFallbackForecast()
        });
      }
    }

    // 4. 更新公告 (需密码)
    if (request.method === "POST" && url.pathname === "/api/notice/update") {
      try {
        const { text, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        await env.LEAVE_KV.put("class_notice", (text || "").trim());
        return jsonRes({ success: true, message: "班级公告已更新！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 5. 上传轮播图 (需密码)
    if (request.method === "POST" && url.pathname === "/api/slides/upload") {
      try {
        const { imageBase64, note, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        if (!imageBase64) return jsonRes({ error: "图片无效" }, 400);

        let slides = JSON.parse((await env.LEAVE_KV.get("board_slides")) || "[]");
        slides.push({
          id: "slide_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          image: imageBase64,
          note: (note || "").trim(),
          createdAt: new Date().toISOString(),
        });
        if (slides.length > 8) slides.shift();

        await env.LEAVE_KV.put("board_slides", JSON.stringify(slides), { expirationTtl: 43200 });
        return jsonRes({ success: true, message: "图片已添加！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 6. 更新图注 (需密码)
    if (request.method === "POST" && url.pathname === "/api/slides/update-note") {
      try {
        const { slideId, note, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        let slides = JSON.parse((await env.LEAVE_KV.get("board_slides")) || "[]");
        slides = slides.map(s => s.id === slideId ? { ...s, note: (note || "").trim() } : s);
        await env.LEAVE_KV.put("board_slides", JSON.stringify(slides), { expirationTtl: 43200 });
        return jsonRes({ success: true, message: "说明已更新！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 7. 删除图片 (需密码)
    if (request.method === "POST" && url.pathname === "/api/slides/delete") {
      try {
        const { slideId, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        let slides = JSON.parse((await env.LEAVE_KV.get("board_slides")) || "[]");
        slides = slides.filter(s => s.id !== slideId);
        await env.LEAVE_KV.put("board_slides", JSON.stringify(slides), { expirationTtl: 43200 });
        return jsonRes({ success: true, message: "图片已删除！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 8. 登记请假 (需密码)
    if (request.method === "POST" && url.pathname === "/api/leave") {
      try {
        const { studentName, startTime, endTime, reason, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        if (!studentName || !startTime || !endTime) return jsonRes({ error: "必填项未填写" }, 400);

        const records = JSON.parse((await env.LEAVE_KV.get("leave_records")) || "[]");
        records.unshift({
          id: "rec_" + Date.now() + "_" + Math.random().toString(36).substring(2, 6),
          studentName: studentName.trim(),
          startTime,
          endTime,
          reason: (reason || "因事请假").trim(),
          status: "pending",
          createdAt: new Date().toISOString(),
          returnedAt: null,
        });
        await env.LEAVE_KV.put("leave_records", JSON.stringify(records));
        return jsonRes({ success: true, message: "登记成功！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    // 9. 销假 (需密码)
    if (request.method === "POST" && url.pathname === "/api/return") {
      try {
        const { recordId, password } = await request.json();
        if (password !== ADMIN_PASSWORD) return jsonRes({ error: "管理员密码错误！" }, 403);
        let records = JSON.parse((await env.LEAVE_KV.get("leave_records")) || "[]");
        let found = false;
        records = records.map((r) => {
          if (r.id === recordId) {
            found = true;
            return { ...r, status: "returned", returnedAt: new Date().toISOString() };
          }
          return r;
        });
        if (!found) return jsonRes({ error: "记录不存在" }, 404);
        await env.LEAVE_KV.put("leave_records", JSON.stringify(records));
        return jsonRes({ success: true, message: "销假完成！" });
      } catch (err) {
        return jsonRes({ error: err.message }, 500);
      }
    }

    return new Response("Not Found", { status: 404 });
  },
};

function getChineseWeatherIcon(desc) {
  if (!desc) return "⛅";
  if (desc.includes("晴")) return "☀️";
  if (desc.includes("多云")) return "⛅";
  if (desc.includes("阴")) return "☁️";
  if (desc.includes("雷")) return "⛈️";
  if (desc.includes("雨")) return "🌧️";
  if (desc.includes("雪")) return "🌨️";
  if (desc.includes("雾") || desc.includes("霾")) return "🌫️";
  return "🌤️";
}

function generateFallbackForecast() {
  const d = new Date();
  const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
  const bj = new Date(utc + 28800000);
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  const list = [];
  const labels = ["今天", "明天", "后天"];

  for (let i = 0; i < 7; i++) {
    const cur = new Date(bj.getTime() + i * 86400000);
    list.push({
      day: labels[i] || weekdays[cur.getDay()],
      desc: i % 2 === 0 ? "晴间多云" : "多云",
      icon: i % 2 === 0 ? "🌤️" : "⛅",
      tempMax: (24 - i % 3) + "℃",
      tempMin: (15 - i % 2) + "℃"
    });
  }
  return list;
}

function jsonRes(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8" },
  });
}

function renderHTML() {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>高一7班综合公示大屏</title>
  <style>
    :root {
      --primary: #1e40af;
      --danger: #dc2626;
      --bg: #f8fafc;
      --card: #ffffff;
      --border: #cbd5e1;
      --panel-h: 560px;
    }
    * { box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", sans-serif;
      background: var(--bg);
      margin: 0;
      padding: 16px;
      color: #0f172a;
    }
    .main-wrap {
      max-width: 1560px;
      margin: 0 auto;
      display: flex;
      flex-direction: column;
      gap: 14px;
    }

    /* 1. 走马灯横幅样式 (班级公告) */
    .marquee-banner {
      background: #fef2f2;
      border: 1.5px solid #fca5a5;
      border-left: 6px solid #ef4444;
      border-radius: 8px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(239, 68, 68, 0.08);
    }
    .marquee-label {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 18px;
      font-weight: 900;
      color: #991b1b;
      background: #fee2e2;
      border: 1px solid #fca5a5;
      padding: 5px 12px;
      border-radius: 6px;
      white-space: nowrap;
      margin-right: 16px;
      flex-shrink: 0;
      z-index: 2;
      letter-spacing: 1px;
    }
    .marquee-content-box {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      position: relative;
    }
    .marquee-track {
      display: inline-block;
      white-space: nowrap;
      padding-left: 100%;
      animation: marquee-scroll 100s linear infinite;
      font-size: 24px;
      font-weight: 700;
      color: #b91c1c;
      letter-spacing: 0.8px;
      line-height: 1.3;
    }
    .marquee-banner:hover .marquee-track {
      animation-play-state: paused;
    }
    @keyframes marquee-scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }

    /* 2. 今日卫生值日表横栏 (右向左平滑慢速滚动，速度比公告更慢) */
    .duty-banner {
      background: #eff6ff;
      border: 1.5px solid #bfdbfe;
      border-left: 6px solid #2563eb;
      border-radius: 8px;
      padding: 10px 16px;
      display: flex;
      align-items: center;
      overflow: hidden;
      box-shadow: 0 2px 6px rgba(37, 99, 235, 0.08);
    }
    .duty-title-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      font-size: 17px;
      font-weight: 800;
      color: #1e40af;
      background: #dbeafe;
      border: 1px solid #bfdbfe;
      padding: 5px 14px;
      border-radius: 6px;
      white-space: nowrap;
      margin-right: 16px;
      flex-shrink: 0;
      z-index: 2;
      letter-spacing: 0.6px;
    }
    .duty-content-box {
      flex: 1;
      overflow: hidden;
      white-space: nowrap;
      position: relative;
    }
    .duty-marquee-track {
      display: inline-block;
      white-space: nowrap;
      padding-left: 100%;
      /* 设定140秒，比公告的100秒更慢、更平稳易读 */
      animation: duty-marquee-scroll 60s linear infinite;
      font-size: 20px;
      font-weight: 700;
      color: #1e3a8a;
      line-height: 1.35;
    }
    .duty-banner:hover .duty-marquee-track {
      animation-play-state: paused;
    }
    @keyframes duty-marquee-scroll {
      0% { transform: translateX(0); }
      100% { transform: translateX(-100%); }
    }

    /* 值日岗位标签与分隔符 */
    .duty-item {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      vertical-align: middle;
    }
    .duty-tag {
      font-size: 13px;
      font-weight: 800;
      padding: 2px 8px;
      border-radius: 4px;
      white-space: nowrap;
    }
    .duty-person {
      font-size: 19px;
      font-weight: 700;
      color: #0f172a;
    }
    .tag-sweep { background: #fee2e2; color: #b91c1c; border: 1px solid #fca5a5; }
    .tag-mop { background: #e0e7ff; color: #4338ca; border: 1px solid #c7d2fe; }
    .tag-board { background: #fef3c7; color: #b45309; border: 1px solid #fde68a; }
    .tag-window { background: #e0f2fe; color: #0369a1; border: 1px solid #bae6fd; }
    .tag-water { background: #ccfbf1; color: #0f766e; border: 1px solid #99f6e4; }
    .tag-trash { background: #f3e8ff; color: #7e22ce; border: 1px solid #e9d5ff; }
    .tag-outdoor { background: #dcfce7; color: #15803d; border: 1px solid #86efac; }
    .duty-sep {
      color: #94a3b8;
      margin: 0 14px;
      font-weight: 400;
      font-size: 18px;
    }

    .duty-edit-btn {
      background: #ffffff;
      border: 1px solid #bfdbfe;
      color: #1e40af;
      font-size: 12px;
      font-weight: 700;
      padding: 6px 12px;
      border-radius: 6px;
      cursor: pointer;
      white-space: nowrap;
      transition: all 0.2s;
      flex-shrink: 0;
      margin-left: 14px;
      z-index: 2;
    }
    .duty-edit-btn:hover {
      background: #2563eb;
      color: #fff;
    }

    /* 3. 顶部四栏栅格大屏 */
    .top-grid {
      display: grid;
      grid-template-columns: 280px minmax(0, 1fr) 290px 240px;
      gap: 12px;
      height: var(--panel-h);
    }
    @media (max-width: 1200px) {
      .top-grid { grid-template-columns: 1fr 1fr; height: auto; }
    }

    .panel {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 12px;
      display: flex;
      flex-direction: column;
      height: 100%;
      min-height: 0;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
      overflow: hidden;
    }
    .panel-head {
      font-size: 13.5px;
      font-weight: 700;
      color: #1e293b;
      margin-bottom: 8px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      flex-shrink: 0;
    }

    /* 公告栏 */
    .notice-view {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      background: #fdfbf7;
      border: 1.5px solid #fef08a;
      border-left: 4px solid #eab308;
      border-radius: 6px;
      padding: 10px;
      font-size: 13.5px;
      line-height: 1.6;
      color: #334155;
      white-space: pre-wrap;
      word-break: break-all;
    }
    .notice-form { margin-top: 8px; flex-shrink: 0; display: flex; flex-direction: column; gap: 6px; }
    .notice-form textarea { width: 100%; height: 60px; padding: 6px; border: 1px solid var(--border); border-radius: 4px; font-size: 12px; resize: none; }

    /* 轮播大屏 */
    .carousel-view {
      position: relative;
      background: #0f172a;
      border-radius: 8px;
      flex: 1;
      min-height: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      cursor: pointer;
    }
    .carousel-slide { width: 100%; height: 100%; display: none; align-items: center; justify-content: center; }
    .carousel-slide.active { display: flex; }
    .carousel-slide img { max-width: 100%; max-height: 100%; object-fit: contain; }
    .carousel-arrow {
      position: absolute; top: 50%; transform: translateY(-50%);
      background: rgba(0,0,0,0.5); color: #fff; border: none; width: 32px; height: 32px;
      border-radius: 50%; cursor: pointer; font-size: 16px; display: flex; align-items: center; justify-content: center;
    }
    .arrow-left { left: 6px; } .arrow-right { right: 6px; }
    .carousel-dots { position: absolute; bottom: 8px; left: 50%; transform: translateX(-50%); display: flex; gap: 5px; }
    .dot { width: 6px; height: 6px; background: rgba(255,255,255,0.4); border-radius: 50%; cursor: pointer; }
    .dot.active { background: #38bdf8; width: 16px; border-radius: 3px; }
    .slide-info-wrap { margin-top: 8px; background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 6px; padding: 6px 8px; flex-shrink: 0; }
    .slide-banner-text { font-size: 13.5px; font-weight: 700; color: #1e40af; margin-bottom: 4px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .slide-upload-wrap { margin-top: 6px; padding-top: 6px; border-top: 1px dashed var(--border); flex-shrink: 0; }

    /* 时间与国内商水县天气 */
    .clock-weather-panel {
      background: linear-gradient(150deg, #1e293b 0%, #0f172a 100%);
      color: #fff;
      border-color: #334155;
    }
    .clock-box { text-align: center; padding: 4px 0 6px; border-bottom: 1px solid rgba(255,255,255,0.1); flex-shrink: 0; }
    .clock-digits { font-size: 44px; font-weight: 800; color: #ffffff; text-shadow: 0 2px 10px rgba(56, 189, 248, 0.4); line-height: 1; font-variant-numeric: tabular-nums; }
    .clock-solar { font-size: 12.5px; color: #cbd5e1; margin-top: 4px; font-weight: 700; }
    .clock-lunar { font-size: 12px; color: #38bdf8; margin-top: 2px; font-weight: 700; }

    .weather-box {
      flex: 1;
      min-height: 0;
      display: flex;
      flex-direction: column;
      padding-top: 6px;
    }
    .weather-loc {
      font-size: 13px;
      font-weight: 800;
      color: #fbbf24;
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .weather-now-row {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin: 2px 0 6px;
      padding-bottom: 6px;
      border-bottom: 1px dashed rgba(255,255,255,0.15);
    }
    .weather-now-left {
      display: flex;
      align-items: baseline;
      gap: 6px;
    }
    .weather-icon-big { font-size: 32px; line-height: 1; }
    .weather-temp-big { font-size: 34px; font-weight: 900; color: #ffffff; line-height: 1; }
    .weather-now-right { text-align: right; }
    .weather-cond-big { font-size: 17px; font-weight: 800; color: #38bdf8; margin-bottom: 2px; }
    .weather-wind-text { font-size: 11.5px; font-weight: 600; color: #94a3b8; }

    /* 7天预报列表 */
    .forecast-title-row {
      font-size: 11.5px;
      font-weight: 700;
      color: #94a3b8;
      margin-bottom: 4px;
      display: flex;
      justify-content: space-between;
    }
    .forecast-scroll-box {
      flex: 1;
      min-height: 0;
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
      padding-right: 2px;
    }
    .forecast-row-card {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 4px 6px;
      background: rgba(255, 255, 255, 0.05);
      border-radius: 4px;
      font-size: 13px;
      font-weight: 700;
      color: #f1f5f9;
    }
    .f-day { width: 42px; color: #e2e8f0; }
    .f-icon { font-size: 16px; margin: 0 4px; }
    .f-desc { flex: 1; color: #38bdf8; font-weight: 700; text-align: left; padding-left: 2px; }
    .f-temp { font-weight: 800; color: #f8fafc; font-size: 12.5px; }

    /* 请假名单 */
    .leave-panel { border-color: #fca5a5; }
    .leave-list-scroll { flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 6px; }
    .mini-card {
      background: #fff; border: 1px solid #fecaca; border-left: 3px solid #ef4444;
      border-radius: 5px; padding: 6px; display: flex; flex-direction: column; gap: 2px; font-size: 11.5px; flex-shrink: 0;
    }
    .mini-card.overdue { background: #fff1f2; border-left-color: #9f1239; }
    .mini-r1 { display: flex; justify-content: space-between; font-weight: 700; color: #881337; }
    .mini-r2 { display: flex; justify-content: space-between; color: #64748b; font-size: 11px; align-items: center; }

    /* 请假总流水台账 */
    .ledger-section {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 14px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }
    .ledger-head {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 10px;
    }
    table.excel-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 12.5px;
      text-align: left;
    }
    table.excel-table th {
      background: #f1f5f9;
      border: 1px solid var(--border);
      padding: 8px 10px;
      color: #334155;
    }
    table.excel-table td {
      border: 1px solid var(--border);
      padding: 7px 10px;
      color: #1e293b;
    }
    table.excel-table tr:hover { background: #f8fafc; }

    /* 页脚：高一7班莘莘学子 (69人) */
    .students-footer {
      background: var(--card);
      border: 1px solid var(--border);
      border-radius: 10px;
      padding: 18px 20px;
      box-shadow: 0 1px 4px rgba(0,0,0,0.04);
    }
    .students-title {
      font-size: 13.5px;
      font-weight: 700;
      color: #475569;
      text-align: center;
      margin-bottom: 14px;
      letter-spacing: 1.5px;
    }
    .students-grid {
      display: grid;
      grid-template-columns: repeat(7, 1fr);
      gap: 10px 8px;
      text-align: center;
    }
    .student-tag {
      font-size: 12.5px;
      color: #64748b;
      opacity: 0.65;
      transition: opacity 0.2s, color 0.2s;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }
    .student-tag:hover {
      opacity: 1;
      color: #1e40af;
      font-weight: 600;
    }

    /* 底部外链 */
    .footer-links-wrap {
      text-align: center;
      padding: 10px 0 6px;
      display: flex;
      justify-content: center;
      gap: 12px;
    }
    .footer-link {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      color: #64748b;
      font-size: 12.5px;
      text-decoration: none;
      font-weight: 600;
      padding: 6px 14px;
      border-radius: 20px;
      background: #f1f5f9;
      border: 1px solid var(--border);
      transition: all 0.2s ease;
    }
    .footer-link:hover {
      color: var(--primary);
      background: #e0f2fe;
      border-color: #bae6fd;
    }

    /* 通用组件 */
    .btn { background: var(--primary); color: #fff; border: none; padding: 5px 10px; border-radius: 4px; font-size: 12px; font-weight: 600; cursor: pointer; }
    .btn:hover { opacity: 0.9; }
    .btn-return { background: #059669; color: white; border: none; padding: 2px 6px; border-radius: 3px; font-size: 11px; cursor: pointer; }
    .status-tag { display: inline-block; padding: 1px 6px; border-radius: 3px; font-size: 11px; font-weight: 700; }
    .tag-out { background: #fee2e2; color: #b91c1c; }
    .tag-out-timeout { background: #9f1239; color: #ffffff; }
    .tag-returned { background: #dcfce7; color: #15803d; }
    .row-flex { display: flex; gap: 6px; align-items: center; }

    /* 弹窗通用 */
    .modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 100; }
    .modal { background: white; padding: 18px; border-radius: 8px; width: 420px; }
    .form-group { margin-bottom: 10px; }
    .form-group label { display: block; font-size: 12px; font-weight: 600; margin-bottom: 3px; }
    .form-group input, .form-group select { width: 100%; padding: 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 12px; }

    /* 全屏重要通知遮罩层 */
    .urgent-fullscreen-overlay {
      position: fixed;
      inset: 0;
      background: radial-gradient(circle, #1e293b 0%, #090d16 100%);
      z-index: 99999;
      display: none;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 40px 60px;
      text-align: center;
      box-shadow: inset 0 0 100px rgba(220, 38, 38, 0.35);
      animation: pulse-border 2.5s infinite alternate;
    }
    @keyframes pulse-border {
      0% { box-shadow: inset 0 0 40px rgba(220, 38, 38, 0.2); }
      100% { box-shadow: inset 0 0 140px rgba(220, 38, 38, 0.55); }
    }
    .urgent-header-tag {
      display: inline-flex;
      align-items: center;
      gap: 12px;
      font-size: 32px;
      font-weight: 900;
      color: #ffffff;
      background: #dc2626;
      border: 2px solid #f87171;
      padding: 8px 30px;
      border-radius: 40px;
      letter-spacing: 4px;
      margin-bottom: 36px;
      box-shadow: 0 8px 24px rgba(220, 38, 38, 0.6);
      animation: bounce 1.2s infinite;
    }
    @keyframes bounce {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-8px); }
    }
    .urgent-body-text {
      font-size: 48px;
      font-weight: 800;
      line-height: 1.5;
      color: #f8fafc;
      text-shadow: 0 4px 16px rgba(0, 0, 0, 0.8);
      max-width: 1300px;
      white-space: pre-wrap;
      word-break: break-all;
      margin-bottom: 40px;
    }
    .urgent-time-bar {
      font-size: 16px;
      font-weight: 600;
      color: #94a3b8;
      margin-bottom: 24px;
    }
    .urgent-dismiss-btn {
      background: rgba(255, 255, 255, 0.12);
      border: 1px solid rgba(255, 255, 255, 0.3);
      color: #f1f5f9;
      font-size: 18px;
      font-weight: 600;
      padding: 10px 32px;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }
    .urgent-dismiss-btn:hover {
      background: #dc2626;
      border-color: #ef4444;
      color: #fff;
    }
  </style>
</head>
<body>
  <!-- 全屏紧急通告大屏覆盖层 -->
  <div class="urgent-fullscreen-overlay" id="urgentOverlay">
    <div class="urgent-header-tag">班级重要通知</div>
    <div class="urgent-body-text" id="urgentText">正在加载重要通知...</div>
    <div class="urgent-time-bar" id="urgentMeta">班主任远程广播下发</div>
    <button class="urgent-dismiss-btn" onclick="dismissUrgentOverlay()">我已知晓（临时关闭大屏遮罩）</button>
  </div>

  <div class="main-wrap">
    <!-- 1. 班级公告流动横幅 (醒目大字慢速滚动) -->
    <div class="marquee-banner">
      <div class="marquee-label">📢 班级公告</div>
      <div class="marquee-content-box">
        <div class="marquee-track" id="noticeMarqueeTrack">加载最新班级公告中...</div>
      </div>
    </div>

    <!-- 2. 今日卫生值日表流动横幅 (由右向左慢速平滑滚动) -->
    <div class="duty-banner">
      <div class="duty-title-badge" id="dutyDayTitle">🧹 今日值日生</div>
      <div class="duty-content-box">
        <div class="duty-marquee-track" id="dutyMarqueeTrack">加载今日排班数据中...</div>
      </div>
      <button class="duty-edit-btn" onclick="openDutyModal()">✏️ 排班设置</button>
    </div>

    <!-- 3. 顶部四栏栅格大屏 -->
    <div class="top-grid">
      <!-- 1. 班级公告 (含全屏广播入口) -->
      <div class="panel">
        <div class="panel-head"><span>📢 班级重要公告</span></div>
        <div class="notice-view" id="noticeTextDisplay">加载公告中...</div>
        <div class="notice-form">
          <textarea id="noticeInput" placeholder="输入班级公告内容（支持换行）..."></textarea>
          <div class="row-flex">
            <input type="password" id="noticePwd" placeholder="🔑 管理员密码" style="flex:1; padding: 4px 6px; border: 1px solid #f87171; border-radius: 4px; font-size: 11.5px;" />
            <button class="btn" onclick="saveNotice()">发布公告</button>
          </div>
          <div class="row-flex" style="padding-top:4px; border-top:1px dashed #e2e8f0; margin-top:2px;">
            <button class="btn" style="background:#dc2626; flex:1;" onclick="openBroadcastModal()">🚨 发送全屏强提醒通报</button>
            <button class="btn" style="background:#64748b; font-size:11px;" onclick="clearUrgentBroadcast()">撤销全屏</button>
          </div>
        </div>
      </div>

      <!-- 2. 轮播大屏 -->
      <div class="panel">
        <div class="panel-head">
          <span>🖼️ 通报违纪 / 班级轮播</span>
          <span id="slideCounter" style="font-size: 11px; color: #64748b;">0 / 0</span>
        </div>
        <div class="carousel-view" id="carouselViewport" onclick="triggerPickImage(event)">
          <div id="emptyPrompt" style="color: #94a3b8; font-size: 12px; pointer-events: none; text-align: center;">
            📁 拖拽图片至此处加入轮播 (12h自动销毁)
          </div>
          <div id="slidesContainer" style="width:100%; height:100%;"></div>
          <button class="carousel-arrow arrow-left" onclick="prevSlide(event)">❮</button>
          <button class="carousel-arrow arrow-right" onclick="nextSlide(event)">❯</button>
          <div class="carousel-dots" id="dotsContainer"></div>
          <input type="file" id="fileInput" accept="image/*" style="display:none;" />
        </div>

        <div class="slide-info-wrap">
          <div class="slide-banner-text" id="currentSlideBanner">暂无图片说明</div>
          <div class="row-flex">
            <input type="text" id="editNoteInput" placeholder="修改当前图说明..." style="flex:1; padding: 4px 6px; border: 1px solid #cbd5e1; border-radius: 4px; font-size: 11.5px;" />
            <input type="password" id="editNotePwd" placeholder="🔑 密码" style="width: 65px; padding: 4px; border: 1px solid #f87171; border-radius: 4px; font-size: 11px;" />
            <button class="btn" style="padding: 4px 6px; font-size: 11px;" onclick="saveCurrentNote()">保存</button>
            <button class="btn" style="background:#ef4444; padding: 4px 6px; font-size: 11px;" onclick="deleteCurrentSlide()">删除</button>
          </div>
        </div>

        <div class="slide-upload-wrap row-flex">
          <input type="text" id="newImageNote" placeholder="新图说明..." style="flex:1; padding: 4px 6px; border: 1px solid var(--border); border-radius: 4px; font-size: 11.5px;" />
          <input type="password" id="newImagePwd" placeholder="🔑 密码" style="width: 65px; padding: 4px; border: 1px solid #f87171; border-radius: 4px; font-size: 11px;" />
          <button class="btn" style="padding: 4px 8px; font-size: 11px;" onclick="uploadPendingImage()">添加轮播</button>
        </div>
      </div>

      <!-- 3. 北京时间 + 中国天气网商水未来一周天气 (101181406) -->
      <div class="panel clock-weather-panel">
        <div class="clock-box">
          <div class="clock-digits" id="clockTime">--:--</div>
          <div class="clock-solar" id="clockDateSolar">--年--月--日 星期-</div>
          <div class="clock-lunar" id="clockDateLunar">农历 --年 ----</div>
        </div>

        <div class="weather-box">
          <div class="weather-loc">
            <span>📍 河南 · 周口 · 商水县</span>
            <span style="font-size: 11.5px; color:#38bdf8; font-weight:700;">中国天气网权威源</span>
          </div>
          
          <div class="weather-now-row">
            <div class="weather-now-left">
              <span class="weather-icon-big" id="wCurIcon">🌤️</span>
              <span class="weather-temp-big" id="wCurTemp">--℃</span>
            </div>
            <div class="weather-now-right">
              <div class="weather-cond-big" id="wCurDesc">加载中</div>
              <div class="weather-wind-text" id="wCurWind">--</div>
            </div>
          </div>

          <div class="forecast-title-row">
            <span>预报日期</span>
            <span>天气状况</span>
            <span>气温范围</span>
          </div>

          <div class="forecast-scroll-box" id="forecastGrid">
            <div style="font-size: 12px; color:#94a3b8; text-align:center; padding-top: 10px;">气象数据获取中...</div>
          </div>
        </div>
      </div>

      <!-- 4. 请假名单 (最右侧) -->
      <div class="panel leave-panel">
        <div class="panel-head" style="color: #b91c1c;">
          <span>📋 请假名单 (<span id="activeCount">0</span>)</span>
          <span style="font-size: 11px; color: #94a3b8; font-weight: normal;">需手动销假</span>
        </div>
        <div class="leave-list-scroll" id="activeList">
          <div style="color: #94a3b8; font-size: 12px; text-align: center; padding: 40px 0;">全员在校</div>
        </div>
      </div>
    </div>

    <!-- 请假总流水台账 -->
    <div class="ledger-section">
      <div class="ledger-head">
        <span style="font-size: 14px; font-weight: 700; color:#334155;">📋 请假总流水台账</span>
        <div style="display: flex; gap: 6px;">
          <button class="btn" onclick="openModal()">➕ 登记请假 (需密码)</button>
          <button class="btn" style="background:#64748b;" onclick="fetchData()">🔄 刷新</button>
        </div>
      </div>
      <table class="excel-table">
        <thead>
          <tr>
            <th style="width: 40px; text-align: center;">#</th>
            <th style="width: 100px;">学生姓名</th>
            <th style="width: 100px;">状态</th>
            <th style="width: 150px;">离校时间</th>
            <th style="width: 150px;">截至返校</th>
            <th>请假事由</th>
            <th style="width: 160px;">手动销假时间</th>
            <th style="width: 80px; text-align: center;">操作</th>
          </tr>
        </thead>
        <tbody id="tableBody">
          <tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 16px;">加载中...</td></tr>
        </tbody>
      </table>
    </div>

    <!-- 页脚：高一7班莘莘学子 (69人) -->
    <div class="students-footer">
      <div class="students-title">🎓 高一7班 · 共 68 人</div>
      <div class="students-grid" id="studentsContainer"></div>
    </div>

    <!-- 底部跳转外链条目 -->
    <div class="footer-links-wrap">
      <a class="footer-link" href="https://github.com/humengofchina/netdata" target="_blank" rel="noopener noreferrer">
        开放源代码 ↗
      </a>
      <a class="footer-link" href="https://name.aihuihui.de5.net/" target="_blank" rel="noopener noreferrer">
        高一7班随机抽签 ↗
      </a>
      <a class="footer-link" href="https://location.aihuihui.de5.net/" target="_blank" rel="noopener noreferrer">
        高一7班座次表 ↗
      </a>
      <a class="footer-link" href="https://exam.aihuihui.de5.net/" target="_blank" rel="noopener noreferrer">
        高一7班成绩统计与分析 ↗
      </a>
      <a class="footer-link" href="https://www.kimi.com/" target="_blank" rel="noopener noreferrer">
        北京月之暗面Moonshot AI Kimi ↗
      </a>
      <a class="footer-link" href="https://gaokao.chsi.com.cn/" target="_blank" rel="noopener noreferrer">
        阳光高考 ↗
      </a>
      <a class="footer-link" href="https://www.haeea.cn/" target="_blank" rel="noopener noreferrer">
        河南省教育考试院 ↗
      </a>
    </div>
  </div>

  <!-- 登记请假弹窗 -->
  <div class="modal-overlay" id="modal">
    <div class="modal">
      <h3 style="margin:0 0 10px; font-size:15px;">登记学生请假</h3>
      <div class="form-group">
        <label>学生姓名:</label>
        <input type="text" id="nameInput" placeholder="输入姓名">
      </div>
      <div class="form-group">
        <label>离校时间:</label>
        <input type="datetime-local" id="startTimeInput">
      </div>
      <div class="form-group">
        <label>截至返校时间:</label>
        <input type="datetime-local" id="endTimeInput">
      </div>
      <div class="form-group">
        <label>请假原因:</label>
        <input type="text" id="reasonInput" placeholder="事由">
      </div>
      <div class="form-group">
        <label style="color: #b91c1c;">🔐 管理员密码:</label>
        <input type="password" id="adminPwdInput" placeholder="输入密码授权">
      </div>
      <div style="display:flex; justify-content: flex-end; gap:6px; margin-top:12px;">
        <button class="btn" style="background: #94a3b8;" onclick="closeModal()">取消</button>
        <button class="btn" onclick="submitLeave()">确认提交</button>
      </div>
    </div>
  </div>

  <!-- 下发全屏广播弹窗 -->
  <div class="modal-overlay" id="broadcastModal">
    <div class="modal" style="width: 420px;">
      <h3 style="margin:0 0 10px; font-size:16px; color:#dc2626;">🚨 下发大屏全屏强提醒通报</h3>
      <div class="form-group">
        <label>通报正文（将以超大字号布满教室大屏）：</label>
        <textarea id="broadcastTextInput" style="width:100%; height:90px; padding:6px; border:1px solid #cbd5e1; border-radius:4px; font-size:13px; resize:none;" placeholder="如：班长立即到办公室开会！全班立刻停止讨论，保持绝对安静！"></textarea>
      </div>
      <div class="form-group">
        <label>大屏全屏展示时长：</label>
        <select id="broadcastDurationSelect">
          <option value="5">展示 5 分钟后自动解除</option>
          <option value="10" selected>展示 10 分钟后自动解除</option>
          <option value="20">展示 20 分钟后自动解除</option>
          <option value="45">展示 45 分钟（一节课）</option>
          <option value="120">展示 2 小时</option>
        </select>
      </div>
      <div class="form-group">
        <label style="color: #b91c1c;">🔐 管理员密码:</label>
        <input type="password" id="broadcastPwdInput" placeholder="输入密码授权发布">
      </div>
      <div style="display:flex; justify-content: flex-end; gap:6px; margin-top:12px;">
        <button class="btn" style="background: #94a3b8;" onclick="closeBroadcastModal()">取消</button>
        <button class="btn" style="background: #dc2626;" onclick="submitUrgentBroadcast()">确认全屏霸屏</button>
      </div>
    </div>
  </div>

  <!-- 设置排班值日生弹窗 (支持周一至周五 7 个岗位独立设置) -->
  <div class="modal-overlay" id="dutyModal">
    <div class="modal" style="width: 460px; max-height: 90vh; overflow-y: auto;">
      <h3 style="margin:0 0 10px; font-size:15px; color:#1e40af;">✏️ 设置周一至周五值日表 (每周循环)</h3>
      <div class="form-group">
        <label>选择星期进行排班：</label>
        <select id="dutySelectDay" onchange="onDutyDayChange()">
          <option value="1">星期一</option>
          <option value="2">星期二</option>
          <option value="3">星期三</option>
          <option value="4">星期四</option>
          <option value="5">星期五</option>
        </select>
      </div>
      <div class="form-group">
        <label>扫地 (1人):</label>
        <input type="text" id="dutySweepingInput" placeholder="如：李彤珈">
      </div>
      <div class="form-group">
        <label>拖地 (1人):</label>
        <input type="text" id="dutyMoppingInput" placeholder="如：李沐洋">
      </div>
      <div class="form-group">
        <label>擦黑板 (1人):</label>
        <input type="text" id="dutyBoardInput" placeholder="如：支琼瑶">
      </div>
      <div class="form-group">
        <label>擦墙壁与窗户 (1人):</label>
        <input type="text" id="dutyWindowsInput" placeholder="如：张盼盼">
      </div>
      <div class="form-group">
        <label>水桶换水 (1人):</label>
        <input type="text" id="dutyWaterInput" placeholder="如：付诗博">
      </div>
      <div class="form-group">
        <label>倒垃圾 (2人，顿号隔开):</label>
        <input type="text" id="dutyTrashInput" placeholder="如：付思恩、苏雅琪">
      </div>
      <div class="form-group">
        <label>卫生区 (6人，顿号隔开):</label>
        <input type="text" id="dutyOutdoorInput" placeholder="如：高林旭、王明哲、王涵乐、张景豪、孙敏浩、王耀康">
      </div>
      <div class="form-group">
        <label style="color: #b91c1c;">🔐 管理员密码:</label>
        <input type="password" id="dutyPwdInput" placeholder="输入密码授权保存">
      </div>
      <div style="display:flex; justify-content: flex-end; gap:6px; margin-top:12px;">
        <button class="btn" style="background: #94a3b8;" onclick="closeDutyModal()">取消</button>
        <button class="btn" onclick="submitDutyUpdate()">保存该日排班</button>
      </div>
    </div>
  </div>

  <script>
    const studentsRawText = \`
高林旭
王明哲
王涵乐
张景豪
孙敏浩
王耀康
王翔宇
查寅诚
杨双亮
杨绍博
李赫哲
华梦涛
王子轩
李书研
许科航
魏家旺
李佳坤
栾家乐
母高博
苏军豪
乔宇辰
王哲轩
刘帅豪
许秉坤
李彤珈
李沐洋
支琼瑶
张盼盼
付思恩
苏雅琪
姜思涵
张慧莹
史雅欣
张畅畅
康馨予
王静怡
任静茹
杨梦圆
郭馨雨
吴梦瑶
王婧祎
陈梦霏
胡梓钥
刘雅婷
张静蕾
王妙彤
张一珂
雷岚岚
王含钰
苗林林
朱紫晗
付政豪
苏世博
任科旭
高博望
董振鹏
喻昶沣
付诗博
郭施昂
赵家欣
刘苒苒
雷雨馨
李一诺
单孟晴
刘恩阳
王易涵
张书珂
位佳轩
\`;

    const classStudents = studentsRawText.trim().split('\\n').map(s => s.trim()).filter(Boolean);

    let cacheRecords = [];
    let slidesList = [];
    let currentSlideIndex = 0;
    let carouselTimer = null;
    let pendingUploadBase64 = null;
    let dismissedBroadcastId = null;
    let weeklyDutyData = {};

    window.addEventListener("DOMContentLoaded", () => {
      renderStudentsFooter();
      initDragDrop();
      fetchData();
      fetchWeather();
      updateBeijingClock();
      setInterval(updateBeijingClock, 1000);
      setInterval(fetchData, 15000);
      setInterval(fetchWeather, 600000);
      startCarouselTimer();
    });

    window.addEventListener("keydown", (e) => {
      if (e.key === "Escape") dismissUrgentOverlay();
    });

    function renderStudentsFooter() {
      const container = document.getElementById("studentsContainer");
      container.innerHTML = classStudents.map((name) => \`
        <div class="student-tag" title="\${name}">\${name}</div>
      \`).join("");
    }

    function getBeijingDayOfWeek() {
      const d = new Date();
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const bjDate = new Date(utc + 28800000);
      return bjDate.getDay(); // 0 是周日, 1-5 是周一至周五, 6 是周六
    }

    function updateBeijingClock() {
      const d = new Date();
      const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
      const bjDate = new Date(utc + 28800000);

      const h = String(bjDate.getHours()).padStart(2, '0');
      const m = String(bjDate.getMinutes()).padStart(2, '0');
      document.getElementById("clockTime").innerText = \`\${h}:\${m}\`;

      const weeks = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
      document.getElementById("clockDateSolar").innerText = \`\${bjDate.getFullYear()}年\${bjDate.getMonth() + 1}月\${bjDate.getDate()}日 \${weeks[bjDate.getDay()]}\`;

      try {
        const lunarFormatter = new Intl.DateTimeFormat('zh-Hans-CN-u-ca-chinese', {
          year: 'numeric',
          month: 'long',
          day: 'numeric'
        });
        document.getElementById("clockDateLunar").innerText = "农历 " + lunarFormatter.format(bjDate);
      } catch (e) {
        document.getElementById("clockDateLunar").innerText = "农历日期计算中";
      }
    }

    async function fetchWeather() {
      try {
        const res = await fetch("/api/weather");
        const data = await res.json();
        
        document.getElementById("wCurIcon").innerText = data.currentIcon || "🌤️";
        document.getElementById("wCurTemp").innerText = data.currentTemp + "℃";
        document.getElementById("wCurDesc").innerText = data.currentWeather;
        document.getElementById("wCurWind").innerText = data.wind;

        const grid = document.getElementById("forecastGrid");
        grid.innerHTML = "";
        (data.forecast || []).forEach(f => {
          const card = document.createElement("div");
          card.className = "forecast-row-card";
          card.innerHTML = \`
            <span class="f-day">\${f.day}</span>
            <span class="f-icon">\${f.icon}</span>
            <span class="f-desc">\${f.desc}</span>
            <span class="f-temp">\${f.tempMin} ~ \${f.tempMax}</span>
          \`;
          grid.appendChild(card);
        });
      } catch (e) {
        console.error("天气数据异常", e);
      }
    }

    function startCarouselTimer() {
      if (carouselTimer) clearInterval(carouselTimer);
      carouselTimer = setInterval(() => {
        if (slidesList.length > 1) {
          goToSlide((currentSlideIndex + 1) % slidesList.length);
        }
      }, 10000);
    }

    function initDragDrop() {
      const dropZone = document.getElementById("carouselViewport");
      const fileInput = document.getElementById("fileInput");

      ['dragenter', 'dragover'].forEach(n => {
        dropZone.addEventListener(n, (e) => { e.preventDefault(); e.stopPropagation(); });
      });

      dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        const files = e.dataTransfer.files;
        if (files.length > 0) handleFile(files[0]);
      });

      fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) handleFile(e.target.files[0]);
      });
    }

    function triggerPickImage(e) {
      if (e.target.classList.contains('carousel-arrow') || e.target.classList.contains('dot')) return;
      document.getElementById('fileInput').click();
    }

    function handleFile(file) {
      if (!file.type.startsWith('image/')) return alert('请选择图片！');
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          let width = img.width, height = img.height;
          const maxDim = 1200;
          if (width > maxDim || height > maxDim) {
            if (width > height) { height = Math.round((height * maxDim) / width); width = maxDim; }
            else { width = Math.round((width * maxDim) / height); height = maxDim; }
          }
          canvas.width = width; canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          pendingUploadBase64 = canvas.toDataURL('image/jpeg', 0.82);
          alert("图片读取成功！请填写说明与管理员密码，点击【添加轮播】。");
          document.getElementById('newImageNote').focus();
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    async function saveNotice() {
      const text = document.getElementById("noticeInput").value;
      const password = document.getElementById("noticePwd").value;
      if (!password) return alert("请输入管理员密码！");

      const res = await fetch("/api/notice/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert("公告更新成功！");
        document.getElementById("noticePwd").value = "";
        fetchData();
      }
    }

    // 今日值日生滚动横幅动态渲染
    function renderTodayDuty() {
      const todayNum = getBeijingDayOfWeek();
      const weekNames = ["星期日", "星期一", "星期二", "星期三", "星期四", "星期五", "星期六"];
      const trackEl = document.getElementById("dutyMarqueeTrack");

      // 若为周六(6)或周日(0)，友好提示双休
      if (todayNum === 0 || todayNum === 6) {
        document.getElementById("dutyDayTitle").innerText = \`🧹 今日值日生 (\${weekNames[todayNum]})\`;
        trackEl.innerHTML = \`<span style="color:#64748b; font-size:18px; font-weight:700;">🎉 周末若调休，周一至周五轮替值日，周末双休，全员休息 ｜ 请离校前关闭门窗与电源，保持教室内外整洁！</span>\`;
        return;
      }

      document.getElementById("dutyDayTitle").innerText = \`🧹 今日值日生 (\${weekNames[todayNum]})\`;
      const todayData = weeklyDutyData[todayNum] || {};

      const duties = [
        { tag: "扫地", cls: "tag-sweep", name: todayData.sweeping || "暂无安排" },
        { tag: "拖地", cls: "tag-mop", name: todayData.mopping || "暂无安排" },
        { tag: "擦黑板", cls: "tag-board", name: todayData.blackboard || "暂无安排" },
        { tag: "擦墙壁与窗户", cls: "tag-window", name: todayData.windows || "暂无安排" },
        { tag: "水桶换水", cls: "tag-water", name: todayData.water || "暂无安排" },
        { tag: "倒垃圾", cls: "tag-trash", name: todayData.trash || "暂无安排" },
        { tag: "卫生区", cls: "tag-outdoor", name: todayData.outdoor || "暂无安排" }
      ];

      trackEl.innerHTML = duties.map(d => \`
        <span class="duty-item">
          <span class="duty-tag \${d.cls}">\${d.tag}</span>
          <span class="duty-person">\${escapeHtml(d.name)}</span>
        </span>
      \`).join('<span class="duty-sep">｜</span>');
    }

    function openDutyModal() {
      document.getElementById("dutyModal").style.display = "flex";
      let todayNum = getBeijingDayOfWeek();
      if (todayNum === 0 || todayNum === 6) todayNum = 1; // 周末默认打开周一设置
      document.getElementById("dutySelectDay").value = todayNum;
      onDutyDayChange();
      document.getElementById("dutyPwdInput").value = "";
    }

    function closeDutyModal() {
      document.getElementById("dutyModal").style.display = "none";
    }

    function onDutyDayChange() {
      const selectedDay = document.getElementById("dutySelectDay").value;
      const dayData = weeklyDutyData[selectedDay] || {};
      document.getElementById("dutySweepingInput").value = dayData.sweeping || "";
      document.getElementById("dutyMoppingInput").value = dayData.mopping || "";
      document.getElementById("dutyBoardInput").value = dayData.blackboard || "";
      document.getElementById("dutyWindowsInput").value = dayData.windows || "";
      document.getElementById("dutyWaterInput").value = dayData.water || "";
      document.getElementById("dutyTrashInput").value = dayData.trash || "";
      document.getElementById("dutyOutdoorInput").value = dayData.outdoor || "";
    }

    async function submitDutyUpdate() {
      const dayOfWeek = document.getElementById("dutySelectDay").value;
      const sweeping = document.getElementById("dutySweepingInput").value;
      const mopping = document.getElementById("dutyMoppingInput").value;
      const blackboard = document.getElementById("dutyBoardInput").value;
      const windows = document.getElementById("dutyWindowsInput").value;
      const water = document.getElementById("dutyWaterInput").value;
      const trash = document.getElementById("dutyTrashInput").value;
      const outdoor = document.getElementById("dutyOutdoorInput").value;
      const password = document.getElementById("dutyPwdInput").value;

      if (!password) return alert("请输入管理员密码！");

      const res = await fetch("/api/duty/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dayOfWeek, sweeping, mopping, blackboard, windows, water, trash, outdoor, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert("该日值日排班已保存！");
        fetchData();
        closeDutyModal();
      }
    }

    // 全屏广播控制
    function openBroadcastModal() {
      document.getElementById("broadcastModal").style.display = "flex";
      document.getElementById("broadcastTextInput").focus();
    }
    function closeBroadcastModal() {
      document.getElementById("broadcastModal").style.display = "none";
    }

    async function submitUrgentBroadcast() {
      const text = document.getElementById("broadcastTextInput").value;
      const durationMinutes = document.getElementById("broadcastDurationSelect").value;
      const password = document.getElementById("broadcastPwdInput").value;

      if (!text.trim() || !password) return alert("广播正文和管理密码必填！");

      const res = await fetch("/api/broadcast/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, durationMinutes, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert(data.message);
        closeBroadcastModal();
        document.getElementById("broadcastTextInput").value = "";
        document.getElementById("broadcastPwdInput").value = "";
        fetchData();
      }
    }

    async function clearUrgentBroadcast() {
      const password = prompt("⚠️ 确认提前撤销当前全屏通报？请输入管理员密码：");
      if (!password) return;

      const res = await fetch("/api/broadcast/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert("已撤销全屏通报！");
        document.getElementById("urgentOverlay").style.display = "none";
        fetchData();
      }
    }

    function dismissUrgentOverlay() {
      const overlay = document.getElementById("urgentOverlay");
      overlay.style.display = "none";
      if (window.currentUrgentId) {
        dismissedBroadcastId = window.currentUrgentId;
      }
    }

    async function uploadPendingImage() {
      if (!pendingUploadBase64) return alert("请先选择图片！");
      const note = document.getElementById("newImageNote").value;
      const password = document.getElementById("newImagePwd").value;
      if (!password) return alert("请输入管理员密码！");

      const res = await fetch("/api/slides/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64: pendingUploadBase64, note, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert(data.message);
        pendingUploadBase64 = null;
        document.getElementById("newImageNote").value = "";
        document.getElementById("newImagePwd").value = "";
        fetchData();
      }
    }

    async function saveCurrentNote() {
      if (slidesList.length === 0) return;
      const current = slidesList[currentSlideIndex];
      const note = document.getElementById("editNoteInput").value;
      const password = document.getElementById("editNotePwd").value;
      if (!password) return alert("请输入管理员密码！");

      const res = await fetch("/api/slides/update-note", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId: current.id, note, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert("说明已更新！");
        document.getElementById("editNotePwd").value = "";
        fetchData();
      }
    }

    async function deleteCurrentSlide() {
      if (slidesList.length === 0) return;
      const current = slidesList[currentSlideIndex];
      const password = prompt("⚠️ 确认删除当前图片？请输入管理员密码：");
      if (!password) return;

      const res = await fetch("/api/slides/delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slideId: current.id, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert("已删除！");
        currentSlideIndex = 0;
        fetchData();
      }
    }

    function renderCarousel() {
      const container = document.getElementById("slidesContainer");
      const dots = document.getElementById("dotsContainer");
      const counter = document.getElementById("slideCounter");
      const emptyPrompt = document.getElementById("emptyPrompt");

      container.innerHTML = "";
      dots.innerHTML = "";

      if (slidesList.length === 0) {
        emptyPrompt.style.display = "block";
        counter.innerText = "0 / 0";
        document.getElementById("currentSlideBanner").innerText = "暂无通报/轮播图";
        document.getElementById("editNoteInput").value = "";
        return;
      }

      emptyPrompt.style.display = "none";
      if (currentSlideIndex >= slidesList.length) currentSlideIndex = 0;

      slidesList.forEach((slide, idx) => {
        const div = document.createElement("div");
        div.className = "carousel-slide " + (idx === currentSlideIndex ? "active" : "");
        div.innerHTML = \`<img src="\${slide.image}" alt="轮播图" />\`;
        container.appendChild(div);

        const dot = document.createElement("div");
        dot.className = "dot " + (idx === currentSlideIndex ? "active" : "");
        dot.onclick = (e) => { e.stopPropagation(); goToSlide(idx); };
        dots.appendChild(dot);
      });

      const current = slidesList[currentSlideIndex];
      counter.innerText = \`\${currentSlideIndex + 1} / \${slidesList.length}\`;
      document.getElementById("currentSlideBanner").innerText = current.note || "（未设置说明）";
      if (document.activeElement !== document.getElementById("editNoteInput")) {
        document.getElementById("editNoteInput").value = current.note || "";
      }
    }

    function goToSlide(idx) {
      currentSlideIndex = idx;
      renderCarousel();
      startCarouselTimer();
    }

    function prevSlide(e) {
      e.stopPropagation();
      if (slidesList.length <= 1) return;
      goToSlide((currentSlideIndex - 1 + slidesList.length) % slidesList.length);
    }

    function nextSlide(e) {
      e.stopPropagation();
      if (slidesList.length <= 1) return;
      goToSlide((currentSlideIndex + 1) % slidesList.length);
    }

    async function fetchData() {
      try {
        const res = await fetch("/api/data");
        const data = await res.json();
        cacheRecords = data.records || [];
        slidesList = data.slides || [];
        
        // 渲染班级重要公告
        const rawNotice = data.notice || "暂无最新公告。";
        document.getElementById("noticeTextDisplay").innerText = rawNotice;
        if (document.activeElement !== document.getElementById("noticeInput")) {
          document.getElementById("noticeInput").value = rawNotice;
        }

        // 同步更新自右向左跑马灯流动横幅
        const marqueeEl = document.getElementById("noticeMarqueeTrack");
        if (marqueeEl) {
          marqueeEl.innerText = rawNotice.replace(/\\r?\\n+/g, "  ｜  ");
        }

        // 保存周一至周五值日生数据并自动渲染今日值日横幅
        if (data.weeklyDuty) {
          weeklyDutyData = data.weeklyDuty;
          renderTodayDuty();
        }

        // 检查全屏通报
        const overlay = document.getElementById("urgentOverlay");
        if (data.urgent && data.urgent.text) {
          window.currentUrgentId = data.urgent.id;
          if (dismissedBroadcastId !== data.urgent.id) {
            document.getElementById("urgentText").innerText = data.urgent.text;
            const expTime = new Date(data.urgent.expireAt).toLocaleTimeString();
            document.getElementById("urgentMeta").innerText = \`下发时间：\${new Date(data.urgent.createdAt).toLocaleTimeString()} ｜ 预计有效至：\${expTime}\`;
            overlay.style.display = "flex";
          }
        } else {
          overlay.style.display = "none";
          window.currentUrgentId = null;
          dismissedBroadcastId = null;
        }

        renderCarousel();
        renderRecords();
      } catch (err) {
        console.error("加载失败:", err);
      }
    }

    function renderRecords() {
      const now = new Date();
      const activeList = [];
      const tbody = document.getElementById("tableBody");
      tbody.innerHTML = "";

      if (cacheRecords.length === 0) {
        tbody.innerHTML = '<tr><td colspan="8" style="text-align: center; color: #94a3b8; padding: 20px;">暂无请假记录</td></tr>';
      }

      cacheRecords.forEach((item, index) => {
        const end = new Date(item.endTime);
        const isOverdue = now > end;
        let statusTag = "";
        let actionBtn = "-";

        if (item.status === "returned") {
          statusTag = '<span class="status-tag tag-returned">已手动销假</span>';
          actionBtn = '<span style="color: #94a3b8; font-size: 11px;">已归校</span>';
        } else {
          activeList.push({ ...item, isOverdue });
          statusTag = isOverdue ? '<span class="status-tag tag-out-timeout">⚠️ 超时未归</span>' : '<span class="status-tag tag-out">请假中</span>';
          actionBtn = \`<button class="btn-return" onclick="returnStudent('\${item.id}')">销假</button>\`;
        }

        const tr = document.createElement("tr");
        tr.innerHTML = \`
          <td style="text-align: center; color: #64748b;">\${index + 1}</td>
          <td><b>\${escapeHtml(item.studentName)}</b></td>
          <td>\${statusTag}</td>
          <td>\${item.startTime.replace("T", " ")}</td>
          <td><b style="\${isOverdue && item.status !== 'returned' ? 'color: #b91c1c;' : ''}">\${item.endTime.replace("T", " ")}</b></td>
          <td>\${escapeHtml(item.reason)}</td>
          <td>\${item.returnedAt ? new Date(item.returnedAt).toLocaleString() : '<span style="color:#94a3b8;">-</span>'}</td>
          <td style="text-align: center;">\${actionBtn}</td>
        \`;
        tbody.appendChild(tr);
      });

      const activeContainer = document.getElementById("activeList");
      document.getElementById("activeCount").innerText = activeList.length;

      if (activeList.length === 0) {
        activeContainer.innerHTML = '<div style="color: #94a3b8; font-size: 12px; text-align: center; padding: 40px 0;">全员在校</div>';
      } else {
        activeContainer.innerHTML = activeList.map(item => \`
          <div class="mini-card \${item.isOverdue ? 'overdue' : ''}">
            <div class="mini-r1">
              <span>\${escapeHtml(item.studentName)}</span>
              <span style="font-size:11px;\${item.isOverdue ? 'color:#be123c;' : ''}">\${item.isOverdue ? '已超时' : item.endTime.slice(11, 16) + '止'}</span>
            </div>
            <div class="mini-r2">
              <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; max-width:120px;">\${escapeHtml(item.reason)}</span>
              <button class="btn-return" onclick="returnStudent('\${item.id}')">销假</button>
            </div>
          </div>
        \`).join("");
      }
    }

    function openModal() {
      document.getElementById("modal").style.display = "flex";
      const now = new Date();
      now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
      document.getElementById("startTimeInput").value = now.toISOString().slice(0, 16);
      const later = new Date(Date.now() + 2 * 3600 * 1000);
      later.setMinutes(later.getMinutes() - later.getTimezoneOffset());
      document.getElementById("endTimeInput").value = later.toISOString().slice(0, 16);
    }

    function closeModal() { document.getElementById("modal").style.display = "none"; }

    async function submitLeave() {
      const studentName = document.getElementById("nameInput").value;
      const startTime = document.getElementById("startTimeInput").value;
      const endTime = document.getElementById("endTimeInput").value;
      const reason = document.getElementById("reasonInput").value;
      const password = document.getElementById("adminPwdInput").value;

      if (!studentName || !password) return alert("姓名和管理员密码为必填项！");

      const res = await fetch("/api/leave", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ studentName, startTime, endTime, reason, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert("请假登记成功！");
        closeModal();
        document.getElementById("nameInput").value = "";
        document.getElementById("adminPwdInput").value = "";
        fetchData();
      }
    }

    async function returnStudent(recordId) {
      const password = prompt("⚠️ 确认该同学已返校？请输入管理员密码进行手动销假：");
      if (!password) return;

      const res = await fetch("/api/return", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ recordId, password })
      });
      const data = await res.json();
      if (data.error) alert(data.error);
      else {
        alert("销假成功！");
        fetchData();
      }
    }

    function escapeHtml(str) {
      return (str || "").replace(/[&<>'"]/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
      }[tag] || tag));
    }
  </script>
</body>
</html>`;
}
