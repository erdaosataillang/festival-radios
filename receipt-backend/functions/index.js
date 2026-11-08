'use strict';
require('firebase-admin/app').initializeApp();
const {onRequest}=require('firebase-functions/v2/https');
const {createHandler}=require('./receipt-api');
exports.receiptApi=onRequest({region:'asia-northeast1',memory:'256MiB',timeoutSeconds:30,maxInstances:5},createHandler({
  auth:require('firebase-admin/auth').getAuth(),
  db:require('firebase-admin/firestore').getFirestore(),
  Timestamp:require('firebase-admin/firestore').Timestamp,
  webauthn:require('@simplewebauthn/server'),
}));

const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {defineSecret}=require('firebase-functions/params');
const {notifyIssuance}=require('./discord-issuance');
const discordWebhook=defineSecret('ISSUANCE_DISCORD_WEBHOOK');
exports.notifyDiscordIssuance=onDocumentCreated({
  document:'receiptIssuances/{issuanceId}',
  region:'asia-northeast1',
  secrets:[discordWebhook],
}, async event=>{
  if (!event.data) return;
  try {
    await notifyIssuance(discordWebhook.value(),event.data.data());
  } catch (error) {
    // Do not log the webhook URL or the underlying network error.
    console.error('帳票の発行通知を送信できませんでした。',{eventId:event.id});
  }
});
