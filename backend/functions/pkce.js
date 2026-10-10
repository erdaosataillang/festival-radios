const {createHash,timingSafeEqual}=require("node:crypto");
function sha256Base64Url(value) {
  return createHash("sha256").update(value).digest("base64url");
}

function validPkceChallenge(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

function validPkceVerifier(value) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43,128}$/.test(value);
}

function safeEqual(left, right) {
  if (typeof left !== "string" || typeof right !== "string") return false;
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

module.exports={sha256Base64Url,validPkceChallenge,validPkceVerifier,safeEqual};
