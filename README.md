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

GitHub Pagesのカスタムドメインは `app.urakatabu.com` です。アプリファイルは `festival-radios/` に配置し、ワークフローがホストの同名フォルダーへ配信します。ルートURLはトランシーバー管理へ移動します。QRとログインの戻り先は `https://app.urakatabu.com/festival-radios/` です。
