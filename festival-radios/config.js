export const config = {
  api: "https://asia-northeast1-urakata-app.cloudfunctions.net/festivalRadioApi",
  authorize: "https://lmc-mobile.sorairosystem.com/radio-authorize.html",
  // 本番登録時に認証側のRADIO_REDIRECT_URIと同じURLへ設定する。
  redirect: "https://app.urakatabu.com/festival-radios/",
  ready: true,
};
