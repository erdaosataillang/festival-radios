const bankName = document.getElementById('bank-name');
const branchCode = document.getElementById('bank-branch-code');
const branchName = document.getElementById('bank-branch');
const status = document.getElementById('bank-lookup-status');
const search = document.getElementById('bank-lookup');
let directoryRequest;

function directory() {
  directoryRequest ??= fetch(new URL('./bank-directory.json', import.meta.url))
    .then(response => {
      if (!response.ok) throw new Error('Bank directory unavailable');
      return response.json();
    })
    .catch(error => {
      directoryRequest = undefined;
      throw error;
    });
  return directoryRequest;
}

function normalize(name) {
  return name.normalize('NFKC').toLowerCase().replace(/\s/g, '')
    .replace(/[ァ-ヶ]/g, char => String.fromCharCode(char.charCodeAt(0) - 0x60))
    .replace(/銀行$/, '');
}

async function lookup() {
  const name = normalize(bankName.value);
  const code = branchCode.value.normalize('NFKC').trim();
  if (!name || !/^\d{3}$/.test(code)) {
    status.textContent = '銀行名と3桁の支店番号を入力してください。';
    return;
  }

  const input = [bankName.value, branchCode.value, branchName.value];
  const isCurrent = () => document.getElementById('issuer-dialog').open &&
    input.every((value, index) => value === [bankName.value, branchCode.value, branchName.value][index]);
  status.textContent = '支店を検索しています…';
  try {
    const banks = await directory();
    if (!isCurrent()) return;
    const exact = banks.filter(bank => bank.code === name || normalize(bank.name) === name);
    const matches = exact.length ? exact : banks.filter(bank => normalize(bank.hira) === name);
    if (matches.length !== 1) {
      status.textContent = '銀行を特定できません。正式名か4桁の金融機関コードで検索するか、支店名を直接入力してください。';
      return;
    }
    const branch = matches[0].branches[code];
    if (!branch) {
      status.textContent = '支店が見つかりません。番号を確認するか、支店名を直接入力してください。';
      return;
    }
    if (/^\d{4}$/.test(name)) bankName.value = matches[0].name;
    branchName.value = `${branch}（${code}）`;
    status.textContent = '支店名を入力しました。';
  } catch {
    if (isCurrent()) status.textContent = '支店を検索できませんでした。支店名を直接入力できます。';
  }
}

search.addEventListener('click', lookup);
for (const field of [bankName, branchCode, branchName]) {
  field.addEventListener('input', () => { status.textContent = ''; });
}
for (const field of [bankName, branchCode]) {
  field.addEventListener('change', () => {
    if (bankName.value.trim() && /^\d{3}$/.test(branchCode.value.normalize('NFKC').trim())) lookup();
  });
}
