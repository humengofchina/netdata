import tkinter as tk
import requests
import winsound


# 你的专属接口地址
API_URL = "https://info.aihuihui.de5.net/api/data"
LAST_URGENT_ID = None

current_banner = None

def check_notice():
    global LAST_URGENT_ID
    try:
        res = requests.get(API_URL, timeout=4)
        if res.status_code == 200:
            data = res.json()
            urgent = data.get("urgent")
            # 发现新通知且未弹窗过
            if urgent and urgent.get("id") != LAST_URGENT_ID:
                LAST_URGENT_ID = urgent.get("id")
                show_adaptive_banner(urgent.get("text", "（无通知内容）"))
            elif not urgent:
                LAST_URGENT_ID = None
    except Exception:
        pass

    # 每隔 8 秒轮询一次
    root.after(8000, check_notice)

def show_adaptive_banner(text):
    global current_banner
    # 若上一条通知仍存在，安全销毁
    if current_banner and current_banner.winfo_exists():
        try:
            current_banner.destroy()
        except Exception:
            pass

    # 1. 播放系统警报提示音
    try:
        winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
    except Exception:
        pass

    # 2. 创建无边框置顶窗口
    banner = tk.Toplevel(root)
    current_banner = banner
    banner.overrideredirect(True)        # 去除系统默认窗口边框
    banner.attributes("-topmost", True)  # 强制最高层置顶显示

    # 屏幕比例计算：宽度占屏幕 72%（适中大气，不显臃肿），最小宽度 720
    screen_w = banner.winfo_screenwidth()
    banner_w = max(720, int(screen_w * 0.72))
    x = int((screen_w - banner_w) / 2)
    target_y = 28

    # 3. 外层主卡片（深曜黑底色 + 微光细边框）
    card = tk.Frame(
        banner,
        bg="#18181b",             # Zinc 深色现代质感背景
        highlightthickness=1,     # 1px 高级感外边框
        highlightbackground="#3f3f46",
        highlightcolor="#3f3f46",
        cursor="hand2"
    )
    card.pack(fill="both", expand=True)

    # 顶部红色高亮警示条（强化通报紧迫感）
    accent_bar = tk.Frame(card, bg="#ef4444", height=4)
    accent_bar.pack(fill="x", side="top")

    # 标题栏容器
    header_bar = tk.Frame(card, bg="#18181b")
    header_bar.pack(fill="x", padx=26, pady=(16, 8))

    # 胶囊式标签：🚨 班主任重要通报
    lbl_tag = tk.Label(
        header_bar,
        text=" 🚨 班主任重要通报 ",
        font=("微软雅黑", 10, "bold"),
        fg="#ffffff",
        bg="#dc2626",
        padx=8,
        pady=3
    )
    lbl_tag.pack(side="left")

    # 辅助提示文字
    lbl_sub = tk.Label(
        header_bar,
        text="（点击卡片任意位置关闭）",
        font=("微软雅黑", 9),
        fg="#a1a1aa",
        bg="#18181b"
    )
    lbl_sub.pack(side="left", padx=(10, 0))

    # 右上角快捷关闭按钮
    btn_close = tk.Label(
        header_bar,
        text=" ✕ 关闭 ",
        font=("微软雅黑", 10, "bold"),
        fg="#d4d4d8",
        bg="#27272a",
        padx=10,
        pady=3,
        cursor="hand2"
    )
    btn_close.pack(side="right")

    # 关闭按钮悬浮高亮效果
    def on_enter(e): btn_close.configure(fg="#ffffff", bg="#ef4444")
    def on_leave(e): btn_close.configure(fg="#d4d4d8", bg="#27272a")
    btn_close.bind("<Enter>", on_enter)
    btn_close.bind("<Leave>", on_leave)

    # 4. 正文文本：设置文本折行宽度，文字多时自动向下延伸
    lbl_text = tk.Label(
        card,
        text=text,
        font=("微软雅黑", 17, "bold"),
        fg="#fafafa",
        bg="#18181b",
        wraplength=banner_w - 60, # 文本宽度，留出两侧间距
        justify="left",
        anchor="w"
    )
    lbl_text.pack(fill="x", padx=26, pady=(4, 20), anchor="w")

    # 5. 【核心修复】：根据内部组件动态计算窗口实际所需高度
    banner.update_idletasks()
    banner_h = banner.winfo_reqheight()

    # 绑定全卡片点击关闭事件
    def close_window(e=None):
        if banner.winfo_exists():
            banner.destroy()

    for widget in (card, accent_bar, header_bar, lbl_tag, lbl_sub, lbl_text, btn_close):
        widget.bind("<Button-1>", close_window)

    # 6. 平滑下滑展开动效
    def slide_in(curr_y):
        if not banner.winfo_exists():
            return
        if curr_y < target_y:
            step = max(3, int((target_y - curr_y) * 0.45))
            new_y = curr_y + step
            if new_y > target_y:
                new_y = target_y
            banner.geometry(f"{banner_w}x{banner_h}+{x}+{new_y}")
            banner.after(14, lambda: slide_in(new_y))
        else:
            banner.geometry(f"{banner_w}x{banner_h}+{x}+{target_y}")

    slide_in(-banner_h)

if __name__ == "__main__":
    root = tk.Tk()
    root.withdraw()
    check_notice()
    root.mainloop()
