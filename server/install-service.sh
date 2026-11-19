#!/usr/bin/env bash
# 安裝 agvui-server 開機自動啟動（systemd）
# 用法：sudo ./install-service.sh
set -euo pipefail

cd "$(dirname "$0")"

BIN=dist/agvui-server
SERVICE=agvui-server.service

if [[ $EUID -ne 0 ]]; then
  echo "請用 sudo 執行：sudo $0" >&2
  exit 1
fi

if [[ ! -x $BIN ]]; then
  echo "找不到 $BIN，請先打包：.venv/bin/pyinstaller --onefile --name agvui-server --clean -y server.py" >&2
  exit 1
fi

if [[ ! -f /var/kenmec/agvui/index.html ]]; then
  echo "警告：/var/kenmec/agvui/index.html 不存在，服務會一直重啟直到前端部署完成" >&2
fi

install -m 755 "$BIN" /usr/local/bin/agvui-server
install -m 644 "$SERVICE" /etc/systemd/system/$SERVICE

systemctl daemon-reload
systemctl enable "$SERVICE"
systemctl restart "$SERVICE"

systemctl --no-pager status "$SERVICE" || true
echo
echo "完成：開機會自動啟動，網址 http://<這台的 IP>:8064"
