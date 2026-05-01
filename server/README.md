# OKITA Server

ローカル実行のFastAPIバックエンド。SQLite + JWT認証 + Expo Push通知。

## セットアップ

```sh
cd okita/server
uv venv .venv
source .venv/bin/activate
uv pip install -e ".[dev]"
cp .env.example .env
# SECRET_KEY を長いランダム文字列に書き換える
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload
```

WSL の場合、モバイル実機から接続するため `0.0.0.0` バインドが必須。
WSL の IP は `ip addr show eth0 | grep inet` で確認。

## API

| メソッド | パス                   | 用途                          |
| -------- | ---------------------- | ----------------------------- |
| POST     | `/auth/register`       | 新規登録                      |
| POST     | `/auth/login`          | ログイン (form)               |
| GET      | `/auth/me`             | 自分の情報                    |
| POST     | `/auth/push-token`     | Expo push token 登録          |
| GET      | `/pairs`               | ペア一覧                      |
| POST     | `/pairs/invite`        | 招待コード発行 (24h有効)      |
| POST     | `/pairs/redeem`        | 招待コードで相互ペア成立      |
| POST     | `/wakes`               | 起床確認を予約 (送信側のみ)   |
| GET      | `/wakes`               | 自分の関与する確認一覧        |
| POST     | `/wakes/{id}/respond`  | 受信側「起きました」          |
| POST     | `/wakes/{id}/cancel`   | 送信側キャンセル              |

OpenAPI: http://localhost:8765/docs
