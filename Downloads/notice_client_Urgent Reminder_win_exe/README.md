一步步完成整个流程。你的电脑已经装好了 Python 3.13 和 PyInstaller，只需按顺序执行以下 5 个步骤，就能制作出一个即使老师在放全屏 PPT 也能强行置顶弹出的通知小程序。

### 第一步：安装网络请求库 `requests`

打开你的终端（就是你刚才运行命令的窗口），执行以下命令安装请求库：

PowerShell

```
pip install requests
```

### 第二步：创建 `notice_client.py` 文件

刚才报错是因为终端所在的 `test` 文件夹里还没有这个文件。我们在终端里直接创建它：

1. 在终端中输入以下命令并回车，会弹出一个记事本窗口提示“找不到文件，是否创建”，点击 **“是”**：

   PowerShell

   ```
   notepad notice_client.py
   ```

2. 将以下完整代码复制并粘贴到记事本中（**已填好你的网页 API 接口地址**）：

Python

```
import tkinter as tk
import requests
import winsound

# 你的专属接口地址
API_URL = "我的网址/api/data"
LAST_URGENT_ID = None

def check_notice():
    global LAST_URGENT_ID
    try:
        # 向 Worker 接口拉取最新数据（超时时间设为4秒）
        res = requests.get(API_URL, timeout=4)
        if res.status_code == 200:
            data = res.json()
            urgent = data.get("urgent")
            # 发现新下发的通知且未弹窗过
            if urgent and urgent.get("id") != LAST_URGENT_ID:
                LAST_URGENT_ID = urgent.get("id")
                show_banner(urgent.get("text", "（无通知内容）"))
            elif not urgent:
                LAST_URGENT_ID = None
    except Exception:
        # 网络波动时不报错、不弹窗，静默跳过
        pass

    # 每隔 8 秒自动轮询一次
    root.after(8000, check_notice)

def show_banner(text):
    # 1. 播放 Windows 系统提示音引起注意
    try:
        winsound.MessageBeep(winsound.MB_ICONEXCLAMATION)
    except Exception:
        pass

    # 2. 创建置顶横幅
    banner = tk.Toplevel(root)
    banner.overrideredirect(True)        # 去除边框和叉号标题栏
    banner.attributes("-topmost", True)  # 强制置顶于所有软件（包括全屏 PPT、白板）最顶层

    # 计算屏幕尺寸：横幅占屏幕宽度的 85%，顶部居中
    screen_w = banner.winfo_screenwidth()
    banner_w = int(screen_w * 0.85)
    banner_h = 110
    x = int((screen_w - banner_w) / 2)
    banner.geometry(f"{banner_w}x{banner_h}+{x}+24")
    banner.configure(bg="#dc2626")       # 醒目红底

    # 标题说明
    lbl_head = tk.Label(banner, text="🚨 班主任重要通报 (点击横幅任意位置即可关闭)", font=("微软雅黑", 12, "bold"), fg="#fef08a", bg="#dc2626")
    lbl_head.pack(anchor="w", padx=20, pady=(8, 2))

    # 通报正文大字
    lbl_text = tk.Label(banner, text=text, font=("微软雅黑", 18, "bold"), fg="#ffffff", bg="#dc2626", wraplength=banner_w - 40, justify="left")
    lbl_text.pack(anchor="w", padx=20)

    # 点击横幅的任意位置即可关闭
    banner.bind("<Button-1>", lambda e: banner.destroy())
    lbl_head.bind("<Button-1>", lambda e: banner.destroy())
    lbl_text.bind("<Button-1>", lambda e: banner.destroy())

    # 60 秒后自动淡出关闭，不耽误老师继续讲课
    banner.after(60000, banner.destroy)

if __name__ == "__main__":
    root = tk.Tk()
    root.withdraw() # 隐藏控制主窗口，平时无感知静默常驻后台
    check_notice()  # 启动首次检查与轮询
    root.mainloop()
```

1. 按 `Ctrl + S` 保存记事本，然后关闭记事本。

### 第三步：在本地运行测试

在终端运行以下命令启动脚本：

PowerShell

```
python notice_client.py
```

- 此时终端处于等待状态，没有任何多余窗口（说明后台隐藏成功）。
- 打开手机或电脑上的班级网页后台，点击 **“🚨 发送全屏强提醒通报”** 发一条测试内容。
- **等待 8 秒内**，你的电脑屏幕正上方会“叮”一声弹出一个醒目的红色大字横幅。
- 用鼠标点一下横幅，横幅立即消失。
- 测试成功后，回到终端按快捷键 `Ctrl + C` 退出测试。

### 第四步：打包成免安装的 `.exe`

在终端中执行打包命令：

PowerShell

```
pyinstaller -F -w notice_client.py
```

> **参数解释**：
>
> - `-F`：打包为单个独立的 `.exe` 文件。
> - `-w`：运行时完全隐藏黑色控制台窗口。

等待 10~20 秒打包完成，在当前目录下的 **`dist`** 文件夹里就会生成一个 **`notice_client.exe`**。这个程序已经包含了所有运行环境，即便一体机上没有装 Python 也能直接运行。

### 第五步：部署到班级大屏一体机并设置“开机自启”

1. 用 U 盘或微信把 `notice_client.exe` 拷到班级一体机上（建议放到不易被误删的位置，比如 `D:\ClassTools\`）。

2. 在一体机上按下键盘的快捷键 **`Win + R`** 打开“运行”窗口。

3. 输入以下命令并回车，会打开 Windows 的开机启动文件夹：

   Plaintext

   ```
   shell:startup
   ```

4. 将 `notice_client.exe` 的**快捷方式**（右键该 exe -> 发送到 -> 桌面快捷方式，再剪切过来；或者直接拖进该文件夹并选择“在当前位置创建快捷方式”）粘贴到这个启动文件夹内。

5. 双击运行一次 `notice_client.exe`（此时它已经静默进驻系统后台，打开任务管理器可以看到该进程，占用内存仅约十几兆）。

### 最终效果

以后不管班级一体机是否打开浏览器，也不管其他老师是否正在全屏播放 PPT 或使用希沃白板，只要你在手机端发布全屏广播，一体机屏幕顶端就会强制覆盖弹出大字通告并伴随提示音，60 秒后自动消失，或者任课老师伸手点一下屏幕也能随手关掉。