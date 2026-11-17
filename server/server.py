from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse

WEB_ROOT = Path("/var/kenmec/agvui").resolve()
INDEX = WEB_ROOT / "index.html"

app = FastAPI()

# 之後如果要加 API，寫在這段 catch-all 之前，例如：
# @app.get("/api/status")
# def status(): return {"ok": True}


@app.get("/{full_path:path}")
def serve_spa(full_path: str):
    file = (WEB_ROOT / full_path).resolve()

    # 防止 ../ 路徑穿越
    # （Python 3.8 沒有 Path.is_relative_to，改用 parents 判斷）
    if file != WEB_ROOT and WEB_ROOT not in file.parents:
        raise HTTPException(status_code=404)

    if file.is_file():
        # /assets/ 底下的檔名有 hash，可以放心長期快取
        headers = (
            {"Cache-Control": "public, max-age=31536000, immutable"}
            if full_path.startswith("assets/")
            else {}
        )
        return FileResponse(file, headers=headers)

    # 帶副檔名卻找不到（例如 /foo.png）就回 404，不要回 index.html
    if Path(full_path).suffix:
        raise HTTPException(status_code=404)

    # 其他路徑都交給 React Router 處理
    # index.html 不快取，確保每次部署後瀏覽器都會拿到新版
    return FileResponse(INDEX, headers={"Cache-Control": "no-cache"})


def main():
    import argparse

    import uvicorn

    parser = argparse.ArgumentParser(description="AGV UI web server")
    parser.add_argument("-p", "--port", type=int, default=8080, help="監聽的 port（預設 8080）")
    parser.add_argument("--host", default="0.0.0.0", help="監聽的位址（預設 0.0.0.0）")
    args = parser.parse_args()

    if not INDEX.is_file():
        parser.exit(1, f"找不到 {INDEX}，請先部署前端檔案\n")

    # 直接傳 app 物件（不是 "server:app" 字串），打包成單一執行檔後才不會找不到模組
    uvicorn.run(app, host=args.host, port=args.port)


if __name__ == "__main__":
    main()
