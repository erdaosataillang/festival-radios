# 愛学祭 トランシーバー管理

閲覧はログイン不要。登録と編集には既存のアカウントが必要です。

公開URL: https://app.urakatabu.com/festival-radios/
サンプル表示: 公開URLに `?demo=1&radio=A-101` を追加します。サンプルは保存されません。

## 操作

- ログインし「機器を登録」から管理番号・部署・チャンネル・担当者・状態・備考を登録します。
- 機器詳細のQRを管理タグへ印刷してください。スマートフォンの標準カメラから詳細ページを開けます。
- 管理番号は登録後に変更できません。部署や担当者を変更してもQRのURLは変わりません。
- 担当者名と備考を含む機器情報は、リンクを持つ人がログインなしで閲覧できます。
- サンプル表示のQRはサンプルページに移動します。本番用には登録した機器のQRを使ってください。

## 既存アカウントとの連携

既存のFirebaseプロジェクト `urakata-app` のLINE認証を使います。認証側の `radio-authorize.html` が既存の `js/common.js` と `js/line-firebase-auth.js` を利用して本人確認し、60秒有効・一回限りのPKCE S256コードを発行します。アプリでコードを交換してFirebase Authにログインします。

専用API `festivalRadioApi` は閲覧のみ匿名で許可します。更新はトークン検証・LINE連携済み・登録済みクレーム・現時点の登録ユーザー存在・停止状態を毎回確認します。更新のバージョンが異なる場合は409で上書きを防ぎます。

データは `festivalRadios`、編集履歴は各機器の `history`、認証コードは `radioAuthorizationCodes` に保存します。既存のユーザー・バンド・予約・イベントは変更しません。既存Firestoreルールのデフォルト拒否によりブラウザからこのコレクションには直接書き込めません。

## 公開と検証

画面はGitHub Pagesで公開します。バックエンドのみの更新:

    cd backend
    npm --prefix functions ci
    firebase deploy --only functions:festivalRadioApi --project urakata-app

テスト:

    node --test backend/functions/radio-api.test.js backend/functions/radio-validation.test.js

QR生成は qrcode-generator 1.4.4 (MIT) を同梱しています。認証用の秘密鍵やトークンをフロントエンドやソースには保存しません。

## アプリホスト

GitHub Pagesのカスタムドメインは `app.urakatabu.com` です。アプリファイルは `festival-radios/` に配置し、ワークフローがホストの同名フォルダーへ配信します。ルートURLにはアプリ一覧を表示します。従来のルートURLに `radio` などが付いた機器リンクはトランシーバー管理へ転送します。QRとログインの戻り先は `https://app.urakatabu.com/festival-radios/` です。

## 管理画面とCSV

管理画面: https://app.urakatabu.com/festival-radios/?view=admin

ログイン後、機器一覧の表から個別編集できます。CSVテンプレートをダウンロードして `No.,管理番号,セクション,所属,名前,Ch.,備考` の順で入力するか、同じ列の既存表からCSVを書き出してください。Excel由来の前置き行・空列、UTF-8（BOM含む）・Shift_JIS、カンマや改行を含む引用符付きセルに対応します。

管理番号は必須、他のセルは空欄でも登録できます。CSVは2MB・200台までです。初期設定は新規登録のみで、既存の管理番号は対象外になります。更新モードでは空欄も含めCSVで置き換えます。既存機器の状態は維持し、新規は保管中になります。

プレビューのエラーがある場合は反映できません。サーバー側でも件数・重複・認証・更新バージョンを検証し、全行と変更履歴を一つのトランザクションで保存します。一行でも競合すると全件を保存せず、プレビューのやり直しを求めます。

テスト: `node --test tests/csv.test.mjs backend/functions/*.test.js`


## アプリ一覧と追加方法

- アプリ一覧: https://app.urakatabu.com/
- トランシーバー管理: https://app.urakatabu.com/festival-radios/
- 領収書: https://app.urakatabu.com/recipt/

`apps.json` にアプリを登録すると、一覧と公開対象の両方に反映されます。新しいアプリは、`id` と同じ名前のディレクトリーに `index.html` と静的ファイルを配置してください。各アプリ内のリンクやアセットは相対パスを使用します。`backend/` や `tests/` は公開されません。

配信ファイルの確認: `node scripts/prepare-pages.mjs`（生成先 `public/`）。mainへのpush後、GitHub Actionsで公開されます。

### 領収書

宛名・金額・発行者情報を入力し、領収書だけのA4 PDFを出力します。印鑑タブで丸印・角印を生成でき、PNG保存にも対応します。下書き・発行済み記録をFirestoreにアカウント別で保存します。公開版には見本の個人情報・印影は含みません。

電子署名は「印鑑 → PDFの電子署名」で秘密鍵付きRSA証明書（.p12／.pfx）を読み込むと利用できます。証明書とパスワードはサーバーに送信・保存せず、ブラウザのメモリー内でのみ使用します。署名はPKCS#7 detached形式でPDFに埋め込みます。信頼性の確認は対応するPDF閲覧ソフトで行ってください。認証局のタイムスタンプ・長期署名は未対応です。

暗号処理: node-forge 1.4.3（同梱ライセンス: `recipt/vendor/forge-LICENSE.txt`）。

## 領収書のログインと発行認証

領収書の操作画面は、登録済みの裏方アカウントでログインすると表示されます。GitHub Pagesの静的ファイル自体は公開配信です。発行APIはFirebase IDトークン、現時点の登録ユーザーと利用停止状態を毎回検証します。`users/{uid}.receiptAccess=false` のユーザーは利用できません。既存の無線APIは変更していません。

LMC側の `receipt-authorize.html` と、専用API `receiptApi` をPKCE S256の一度限りの短期認証コードで連携します。パスキー登録には5分以内の裏方アカウントログインが必要です。発行には、PDFのSHA-256に紐付いた2分有効の一度限りのWebAuthn認証が必要です。RP IDは `app.urakatabu.com`、OriginはHTTPSの同ホストに固定し、User Verificationを必須にしています。顔・指紋または端末のPINなど、実際の方法は端末に依存します。生体情報は取得しません。

保存先は専用の `receiptUsers`（公開鍵）、`receiptChallenges`（短期チャレンジ）、`receiptAuthorizationCodes`（ログインコード）、`receiptIssuances`（UID・PDFハッシュ・発行日時）です。PDFファイル本体は保存せず、宛名・金額・但し書き・発行者情報のスナップショットとPDFハッシュを保存します。履歴はFirestoreでアカウントごとに分離しています。パスキーは発行時の本人確認であり、証明書を埋め込むPDF電子署名とは別です。

専用APIのデプロイ:

    cd receipt-backend
    npm --prefix functions ci
    firebase deploy --only functions:receipt --project urakata-app --non-interactive

認証テスト:

    npm --prefix receipt-backend/functions test

スマホ画面は320px以上を対象に、入力欄、数字キーボード、Safe Area、操作ボタンと下部ナビ、プレビュー拡大を調整しています。

### 発行者登録と記録

初回ログイン後に発行者名（必須）・住所・電話番号を登録します。登録先は `receiptUsers/{uid}/settings/issuer` です。登録した情報は次回ログイン時・新規作成時・履歴からの複製時に自動入力します。変更は登録画面で行い、バージョンを確認して他端末との競合を拒否します。未登録では下書き保存・発行を許可しません。

下書きは `receiptUsers/{uid}/drafts` に保存し、同じ伝票No.・永久伝票No.の下書きは更新します。発行済みは `receiptUsers/{uid}/receipts` に新規記録し、従来の監査記録 `receiptIssuances` とパスキーカウンター更新を同じトランザクションで確定します。過去に発行した内容・発行者は後からのプロフィール変更で更新しません。履歴では最新100件の下書きと最新100件の発行済みを表示します。発行済みの「内容を複製」は新しい伝票番号の入力用コピーであり、過去の発行記録の書き換えではありません。

以前のブラウザ内履歴は削除しません。今回の変更以降に保存・発行した内容がFirebaseの記録対象です。

## 請求書アプリ

公開URL: https://app.urakatabu.com/invoice/ 。領収書とは別のフォルダー・入力画面・履歴を持ち、アプリ一覧から開けます。裏方アカウント、登録済み発行者とパスキーは共通です。請求書では振込先（銀行・支店・種別・口座番号・名義）を発行者プロフィールへ追加します。領収書からプロフィールを変更しても振込先を消しません。

数量・税抜単価から明細金額を算出し、税率0/8/10%を選択できます。数量は小数点以下3桁まで、明細と税額の円未満は切り捨て。ブラウザとAPIは同じ整数計算処理を使います。明細は25行までのA4・1ページです。例の59091円に10%を加えると税込65000円になります。口座番号は文字列で保存し先頭のゼロを保持します。

請求書の下書きは `receiptUsers/{uid}/invoiceDrafts`、発行済みは `receiptUsers/{uid}/invoices` に保存します。領収書の記録とは分離し、監査ログにはdocumentTypeを付けます。請求書専用の認証チャレンジを領収書の発行に流用できません。認証用ページはLMCリポジトリ内の `invoice-authorize.html` です。見本に含まれる個人情報・口座・印影は公開ソースに含めません。
