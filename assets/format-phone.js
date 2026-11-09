function formatIssuerPhone(value) {
  const digits = value.normalize('NFKC').replace(/\s/g, '');
  if (!/^0\d{9,10}$/.test(digits)) return value;
  const number = window.libphonenumber?.parsePhoneNumberFromString(digits, 'JP');
  return number?.isPossible() ? number.formatNational() : value;
}

const issuerPhoneInput = document.getElementById('profileIssuerPhone');
issuerPhoneInput.addEventListener('blur', () => {
  issuerPhoneInput.value = formatIssuerPhone(issuerPhoneInput.value);
});
