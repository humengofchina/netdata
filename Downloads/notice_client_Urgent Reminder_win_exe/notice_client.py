import time
import requests
import tkinter as tk
from threading import Thread

API_URL = "https://7student.aihuihui.de5.net/api/data"  # 你的 Cloudflare Worker 地址
LAST_URGENT_ID = None

def show_floating_banner(text, expire_seconds=30):
    root = tk.Tk()
    root.overrideredirect(True)          # 隐藏窗口标题栏和边框
    root.attributes("-topmost", True)    # 强行置顶于所有软件（包括全屏 PPT）最上层
    
    # 屏幕顶部居中大横幅
    screen_w = root.winfo_screenwidth()
    banner_w, banner_h = int(screen_w * 0.8), 90
    x = int((screen_w - banner_w) / 2)
    root.geometry(f"{banner_w}x{banner_h}+{x}+20")
    root.configure(bg="#dc2626")         # 警示红底

    lbl_title = tk.Label(root, text="📢 班主任重要通知", font=("微软雅黑", 14, "bold"), fg="#fef08a", bg="#dc2626")
    lbl_title.pack(anchor="w", padx=16, pady=(4, 0))
    
    lbl_msg = tk.Label(root, text=text, font=("微软雅黑", 18, "bold"), fg="#ffffff", bg="#dc2626")
    lbl_msg.pack(anchor="w", padx=16)

    # 点击或倒计时自动关闭
    root.bind("<Button-1>", lambda e: root.destroy())
    root.after(expire_seconds * 1000, root.destroy)
    root.mainloop()

def worker():
    global LAST_URGENT_ID
    while True:
        try:
            res = requests.get(API_URL, timeout=5).json()
            urgent = res.get("urgent")
            if urgent and urgent.get("id") != LAST_URGENT_ID:
                LAST_URGENT_ID = urgent.get("id")
                # 弹出悬浮横幅展示通知
                show_floating_banner(urgent.get("text"), expire_seconds=45)
            elif not urgent:
                LAST_URGENT_ID = None
        except Exception:
            pass
        time.sleep(8)  # 每8秒轮询一次

if __name__ == "__main__":
    worker()