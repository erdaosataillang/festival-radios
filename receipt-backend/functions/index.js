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
