```bash
$  python3 -m venv .venv
$  pip install -r requirements.txt
$ .venv/bin/pyinstaller --onefile --name agvui-server --clean -y server.py
```
## 開機自動啟動（systemd，port 8064）

前端檔案放在 `/var/kenmec/agvui`（要有 `index.html`），打包完後：

```bash
$ sudo ./install-service.sh
```

腳本會把 `dist/agvui-server` 複製到 `/usr/local/bin/`、安裝 `agvui-server.service` 並設為開機啟動。

常用指令：

```bash
$ systemctl status agvui-server        # 看狀態
$ journalctl -u agvui-server -f        # 看 log
$ sudo systemctl restart agvui-server  # 重啟
$ sudo systemctl disable --now agvui-server  # 停用開機啟動
```

更新版本：重新打包後再跑一次 `sudo ./install-service.sh`。
