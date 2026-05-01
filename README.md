# OKITA

「起きた？」を 1 タップで。家族・友人向け 起床確認アプリ。
<img width="270" height="480" alt="okita-keyvisual" src="https://github.com/user-attachments/assets/6d4ac58d-d48b-42ef-9d1e-868364696c02" />

```
okita/
  server/    FastAPI + SQLite + JWT + Expo Push (ローカル実行)
  mobile/    Expo SDK 54 (React Native + TypeScript + expo-router)
  scripts/   Windows portproxy / FW を開閉する PowerShell ヘルパー
```

ライセンスは MIT。詳細は [LICENSE](./LICENSE) を参照。

---

## ⚡ 30 秒クイックスタート (PC Web モード)

Wi-Fi 不要・実機不要で **クローン → 5 コマンド** でブラウザに UI が出るまで。

```bash
git clone <this-repo> okita
cd okita

# サーバ (ターミナル A)
cd server && uv venv .venv && source .venv/bin/activate \
  && uv pip install -e ".[dev]" \
  && cp .env.example .env \
  && uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload

# モバイル (ターミナル B)
cd mobile && npm install --legacy-peer-deps \
  && npx expo start --clear --go
# ↑ 起動したら w キーで http://localhost:8081 が開く
```

`.env` は `cp .env.example .env` した直後でも動く (デフォルトで `SECRET_KEY=dev-insecure-key`)。
**公開デプロイする場合は必ず差し替え**:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

iOS 実機・Wi-Fi 経由・本番ビルド向けの詳しい手順は ↓ A〜H 章に進む。

---

## クローン後にチェックする箇所 (公開リポからフォークしたとき)

| 何 | どこ | 何のため |
|---|---|---|
| `server/.env` を作る | `cd server && cp .env.example .env` | DB / JWT / Expo Push の設定読み込み |
| `SECRET_KEY` を差し替え | `server/.env` | JWT 署名鍵。デフォルトのままだと全 JWT 偽造可能 |
| `mobile/app.json` の `extra.apiBaseUrl` | デフォルト `http://localhost:8765` | iOS 実機 (②) のときだけ Wi-Fi IP に変える (A-4) |
| `mobile/app.json` の `bundleIdentifier` / `android.package` | `dev.gaku.okita` のまま | **Expo Go では変更不要**。`eas build` で自分のアプリとして出すなら自分のドメインに変更 |
| `INVITE_BASE_URL` | `server/.env` | 招待リンクを自前ドメインで配るなら変更 (デフォルトは `https://okita.app`) |

---

## 動作環境

- Windows + WSL2 (Ubuntu) で開発
- Node.js 20.x 以上 / npm
- Python 3.10 以上 / [`uv`](https://docs.astral.sh/uv/)
- iOS 実機検証時のみ: Expo Go アプリ (App Store 最新版 = SDK 54 対応) + 同一 Wi-Fi

## 動作モード(用途別)

| モード | 必要なもの | 用途 |
|---|---|---|
| **① PC Web のみ** | サーバ + Expo (web) | UI 開発・サーバ動作確認・**Wi-Fi 不要** |
| **② iOS 実機 (Expo Go)** | + 同一 Wi-Fi + portproxy + `apiBaseUrl` 設定 | 実機の挙動確認 |
| **③ スマホ ブラウザ Web** | ② と同じ要件 | iOS Safari 等で確認 |

**`src/api.ts` は Web ブラウザがアクセスしているホストに合わせて API 接続先を自動切替**(localhost で開けば localhost、Wi-Fi IP で開けば Wi-Fi IP)。なので PC Web だけなら ② のネットワーク設定はすべてスキップ可能。

---

## A. 初回セットアップ

> 1 度だけ実行する手順。2 回目以降は **B. 毎回の起動手順** に飛ぶ。

### A-1. サーバ環境構築

```bash
cd okita/server

# Python 仮想環境
uv venv .venv
source .venv/bin/activate

# 依存インストール
uv pip install -e ".[dev]"

# 環境変数
cp .env.example .env
# .env を開いて SECRET_KEY を長いランダム文字列に置き換える
#   例) python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### A-2. モバイル環境構築

```bash
cd okita/mobile

# クリーンインストール (SDK54 は React 19 移行で peer 警告が残るため legacy フラグ)
rm -rf node_modules package-lock.json
npm install --legacy-peer-deps

# 依存バージョン整合性チェック
npx expo install --check
```

### A-3. (② / ③ のみ) ネットワーク設定値の確認

PC Web のみのモード ① では **不要**。スキップして B に進む。

WSL ターミナル:

```bash
hostname -I        # 例: 172.x.x.x  ← WSL の IP
```

Windows PowerShell:

```powershell
ipconfig           # Wi-Fi の IPv4 例: 192.168.x.x  ← Windows ホストの LAN IP
```

> どちらも Wi-Fi や WSL 再起動で変わることがあります。**変わったら毎回 B-2(②専用) をやり直す**。

### A-4. (② / ③ のみ) `app.json` の `apiBaseUrl` を Windows ホスト IP に固定

`okita/mobile/app.json`:

```json
"extra": {
  "apiBaseUrl": "http://192.168.x.x:8765"
}
```

> iOS Expo Go はこの値を使う。PC Web はこの値を **無視** して `window.location.hostname` を採用する(`src/api.ts` の挙動)。

### A-5. (② のみ) iOS 側で「ローカルネットワーク」権限を許可 ★ 必須

iPhone の **設定アプリ → Expo Go → ローカルネットワーク を ON**。

これが OFF だと iOS が全リクエストを無言で遮断し、Expo Go に "internet connection appears to be offline" と出ます。**最大のハマりどころ**。

---

## B. 毎回の起動手順

> ① の手順だけで動く。② / ③ をやるなら ① の上に追加で B-X 系を実行する。

### B-1. サーバ起動 (WSL ターミナル A) — 全モード共通

```bash
cd okita/server
source .venv/bin/activate
uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload
```

ブラウザで `http://localhost:8765/docs` が開けば OK。

### B-2. Expo 起動 (WSL ターミナル B) — 全モード共通

```bash
cd okita/mobile
npx expo start --clear --go
```

ターミナルに QR コードと操作キー一覧が出る。

---

## ① モード: PC Web で開発する (Wi-Fi 不要)

B-2 のターミナルで **`w` キー** を押す → ブラウザで `http://localhost:8081` が開く → そのままログイン画面が出る。
これで終わり。**portproxy も Wi-Fi も `apiBaseUrl` 設定も不要**。

`src/api.ts` がブラウザのホスト名(`localhost`)を見て API も `http://localhost:8765` を採用するため、サーバ⇔Web ともに WSL 内で完結する。

---

## ② モード: iOS 実機 (Expo Go) で動かす

### B-X1. WSL の現在 IP を取得

```bash
hostname -I        # 例: 172.x.x.x
```

### B-X2. Windows ポートフォワード起動 (管理者 PowerShell)

```powershell
# WSL_IP を上で取得した値に置き換える
$WSL_IP = "172.x.x.x"

netsh interface portproxy add v4tov4 listenport=8081 listenaddress=0.0.0.0 connectport=8081 connectaddress=$WSL_IP
netsh interface portproxy add v4tov4 listenport=8765 listenaddress=0.0.0.0 connectport=8765 connectaddress=$WSL_IP

New-NetFirewallRule -DisplayName "Expo Metro 8081" -Direction Inbound -LocalPort 8081 -Protocol TCP -Action Allow -Profile Private
New-NetFirewallRule -DisplayName "OKITA API 8765"  -Direction Inbound -LocalPort 8765 -Protocol TCP -Action Allow -Profile Private
```

> または `okita/scripts/okita-start.ps1 -WslIp 172.x.x.x` で D セクション参照。

確認:
```powershell
netsh interface portproxy show v4tov4
```

### B-X3. Expo を LAN モードで再起動

B-2 を Ctrl+C で止めてから:

```bash
cd okita/mobile
export REACT_NATIVE_PACKAGER_HOSTNAME=192.168.x.x   # Windows ホストの LAN IP
npx expo start --lan --clear --go
```

QR の URL が `exp://192.168.x.x:8081` になっていれば OK。

### B-X4. iOS Expo Go で接続

iPhone のカメラまたは Expo Go アプリで QR を読む。

### B-X5. iOS 「ローカルネットワーク」権限の最終確認

設定アプリ → Expo Go → ローカルネットワーク **ON**。
OFF のままだと "internet connection appears to be offline" になる。

---

## ③ モード: スマホ ブラウザの Web で確認

② の B-X1〜B-X3 を済ませた状態で、スマホ Safari で:

```
http://192.168.x.x:8081
```

を開く。`api.ts` の自動切替により、API も `http://192.168.x.x:8765` を使う。

---

## C. 終了手順 (★ セキュリティ上、毎回必須)

開発が終わったら **必ず以下を実行** して、外向きに開いた穴を塞ぐ。
特にカフェ・コワーキング・モバイルテザリングなど **自宅以外のネットワークに移動する前に必ず実施**。

### C-1. プロセス停止 (WSL)

```bash
# 各ターミナルで Ctrl+C
# それでも残っていたら:
pkill -f uvicorn
pkill -f "expo start"
```

`hostname -I` の WSL で 8081 / 8765 が掴まれていないことを確認:

```bash
ss -tlnp | grep -E '8081|8765'   # 何も出なければ OK
```

### C-2. Windows ポートフォワードを削除 (管理者 PowerShell)

```powershell
netsh interface portproxy delete v4tov4 listenport=8081 listenaddress=0.0.0.0
netsh interface portproxy delete v4tov4 listenport=8765 listenaddress=0.0.0.0

# 全部消したいなら一発で
netsh interface portproxy reset
```

### C-3. Windows ファイアウォール ルールを削除

```powershell
Remove-NetFirewallRule -DisplayName "Expo Metro 8081"
Remove-NetFirewallRule -DisplayName "OKITA API 8765"
```

### C-4. 確認

```powershell
netsh interface portproxy show v4tov4               # 何も表示されなければ OK
Get-NetFirewallRule -DisplayName "Expo*","OKITA*"   # 何もヒットしなければ OK
```

---

## D. 自動化スクリプト

`okita/scripts/` に PowerShell スクリプトを用意済み。**管理者 PowerShell から実行**。

| スクリプト | 用途 |
|---|---|
| `okita-start.ps1 -WslIp <WSL の IP>` | portproxy + FW ルールを Private プロファイル限定で開く |
| `okita-stop.ps1` | 上記で開いた穴を全部閉じる(終了時に必須) |
| `okita-status.ps1` | 現在の portproxy / FW ルール / ネットワーク プロファイル / LAN IP を一覧 |

使い方の例:

```powershell
cd C:\path\to\okita\scripts

# 起動 (WSL ターミナルで `hostname -I` した値を渡す)
.\okita-start.ps1 -WslIp 172.x.x.x

# 状態確認
.\okita-status.ps1

# 終了 (必ず!)
.\okita-stop.ps1
```

> 初回実行時に PowerShell の実行ポリシーで弾かれたら:
> `Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned`

---

## E. セキュリティ チェックリスト

| 項目 | 理由 |
|---|---|
| ファイアウォール ルールは `Profile Private` のみ | 公衆 Wi-Fi(Public プロファイル)で外部から覗かれない |
| 開発終了後は必ず C-2/C-3 を実行 | portproxy + FW 開放を放置しない |
| `.env` を git に入れない | `SECRET_KEY` 流出 = 全 JWT 偽造可能 |
| `SECRET_KEY` は `secrets.token_urlsafe(48)` 級のランダム値 | デフォルト値のままだと無意味 |
| `okita.db` に実データを溜めない(開発中は適宜 `rm`) | ローカル DB がバックアップで漏れることを防ぐ |
| 外で開発するときはモバイルテザリング内で完結 | 開発用ポートを公衆 Wi-Fi に晒さない |
| Expo の tunnel 機能は使わない | ngrok 経由で公開 URL に晒される(意図しない外部公開) |
| Windows のネットワーク プロファイルが P
rivate になっているか確認 | カフェで Private のまま繋いでしまうとルールが効いてしまう |

ネットワーク プロファイル確認:

```powershell
Get-NetConnectionProfile
# NetworkCategory が Public でない自宅 Wi-Fi のみ FW ルールが効く
```

### E-1. Wi-Fi が Public 判定に戻った時の戻し方

WSL 再起動・PC 再起動・ドライバ更新等の後、Windows がネットワークを再認識して
**自宅 Wi-Fi が Public 扱いに戻る**ことがある。すると Profile=Private のルールが
効かず、スマホから `192.168.x.x:8765` がタイムアウトする(本症状の典型)。

確認:
```powershell
Get-NetConnectionProfile | Select-Object Name,InterfaceAlias,NetworkCategory
```

`NetworkCategory` が `Public` の自宅 Wi-Fi に対し、**そのネットワークだけ**を
Private に戻す:
```powershell
Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private
```

> 何が変わるか: Windows 上で「このネットワークの種別」を Public→Private に
> ラベル替えするだけ。**ルーター側の設定や Wi-Fi パスワードには一切触れない**。
> 他のネットワーク・他端末にも影響なし。Private にしたいのは自宅の信頼できる
> Wi-Fi のみ。カフェ等は **Public のまま放置** が正しい(FW ルールが自動で
> 無効化される ≒ 安全側に倒れる)。

### E-2. (推奨) FW ルールを LocalSubnet に絞って二段防御

万一またネットワーク種別が Public に戻っても、**同一サブネット以外**からは
絶対届かなくなる。副作用なし(家のスマホは同サブネット内なので通常通り通る):

```powershell
Set-NetFirewallRule -DisplayName "OKITA API 8765"  -RemoteAddress LocalSubnet
Set-NetFirewallRule -DisplayName "Expo Metro 8081" -RemoteAddress LocalSubnet
```

戻す(全許可に):
```powershell
Set-NetFirewallRule -DisplayName "OKITA API 8765"  -RemoteAddress Any
Set-NetFirewallRule -DisplayName "Expo Metro 8081" -RemoteAddress Any
```

### E-3. ルール削除(完全クリーンアップ)

開発を完全にやめる時 / PC を譲渡する時など、ルール自体を消したい場合:
```powershell
Remove-NetFirewallRule -DisplayName "OKITA API 8765"
Remove-NetFirewallRule -DisplayName "Expo Metro 8081"
netsh interface portproxy reset
```

> 「次回また開発する」だけなら C-2/C-3(削除) ではなく **無効化**のほうが楽:
> ```powershell
> Disable-NetFirewallRule -DisplayName "OKITA API 8765"
> Disable-NetFirewallRule -DisplayName "Expo Metro 8081"
> # 開発再開時:
> Enable-NetFirewallRule  -DisplayName "OKITA API 8765"
> Enable-NetFirewallRule  -DisplayName "Expo Metro 8081"
> ```

---

## F. トラブルシューティング

| 症状 | 原因 | 対処 |
|---|---|---|
| **PC Web** で `failed to fetch` / `ERR_CONNECTION_REFUSED` | サーバが起動していない / 落ちている | B-1 を再実行。ターミナル A のスタックトレースを確認 |
| PC Web で `http://192.168...:8765` を叩こうとして失敗 | 古いキャッシュの JS を読んでいる | ブラウザの強制リロード(Cmd/Ctrl + Shift + R)+ Expo を `--clear` で再起動 |
| Expo Go で "internet connection appears to be offline" | iOS のローカルネットワーク権限 OFF | 設定 → Expo Go → ローカルネットワーク ON |
| iOS で "Network request timed out" | portproxy が落ちた / Wi-Fi の IP 変動 / Wi-Fi が公衆 (Public) プロファイル | `Get-NetConnectionProfile` で Wi-Fi が Public ならば `Set-NetConnectionProfile -InterfaceAlias "Wi-Fi" -NetworkCategory Private`(E-1)。それでも駄目なら B-X2 をやり直し |
| QR の URL が `exp://172.x.x.x:8081` のまま | `REACT_NATIVE_PACKAGER_HOSTNAME` が未設定 | B-X3 の export を確認、Expo を再起動 |
| スマホブラウザから `:8765/docs` 届かない | portproxy 未設定 / WSL IP 変更 / FW 未開放 | B-X2 をやり直し |
| スマホブラウザから `:8081` 届かない | 同上(8081 のルールだけ忘れがち) | B-X2 で 8081 も含めて両方追加 |
| サインアップで timeout | `app.json` の `apiBaseUrl` が `localhost` のまま | A-4 を確認後 Expo 再起動(extra は起動時のみ反映) |
| WSL 再起動後に繋がらない | WSL の IP 変動 | `hostname -I` 再取得 → `netsh interface portproxy reset` → B-X2 |
| `npm install` で peer error | SDK 54 + React 19 移行直後の peer 揺れ | `--legacy-peer-deps` を付ける |
| Expo Go が古い SDK だと言う | App Store の Expo Go が古い | 最新版にアップデート(SDK 54 対応版) |

---

## G. 動作確認フロー (新仕様)

1. 端末 A・B(または PC Web の別ブラウザプロファイル)でそれぞれサインアップ
2. A は B の `@handle` を検索 → フォロー。B も A をフォローして相互成立
3. A は「公開リスト」に B を追加(B が A の起床を見られるようになる)
4. A はホーム上部の起床予定時刻チップから曜日・時刻をセット(任意)
5. A が「おはよう」をタップ → B にプッシュ「A さんが起床」が届く
6. A の起床予定時刻 +15 分を過ぎても未タップなら、B に「A さんがまだ起きていません」が届く
7. A が「今日は休む」を ON にしていればそもそも届かない

> プッシュ通知は Expo Go では一部制限あり(SDK 53 以降の Android リモート通知など)。
> 完全な通知挙動を確認するには Development Build が必要。

---

## H. 開発メモ

- すべてローカル実行・SQLite 永続化(`okita/server/okita.db`)
- スケジューラは APScheduler が 60 秒ごとに **全ユーザの起床予定時刻 + 15 分** をスキャンし、未起床なら公開先へプッシュ
- 起床予定時刻は曜日別 (Mon..Sun)、未設定なら未起床通知は飛ばない
- Expo Push API は exp.host の公開エンドポイント経由(個人情報は送らない)
- Pro/Family 課金、HealthKit 連携、未起床エスカレーションは Week 3 以降で実装予定

### よく使うコマンド

```bash
# サーバ (全モード共通)
cd okita/server && source .venv/bin/activate && uvicorn app.main:app --host 0.0.0.0 --port 8765 --reload

# ① PC Web のみ (Wi-Fi 不要)
cd okita/mobile && npx expo start --clear --go
# → 起動後 `w` キーで http://localhost:8081 が開く

# ② iOS 実機 (Wi-Fi + portproxy 必須)
cd okita/mobile && export REACT_NATIVE_PACKAGER_HOSTNAME=192.168.x.x && npx expo start --lan --clear --go

# DB リセット (スキーマ変更時に必須)
rm okita/server/okita.db

# Expo の依存だけ整え直す
cd okita/mobile && npx expo install --check
```
