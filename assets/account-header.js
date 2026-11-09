class UrakataAccount extends HTMLElement {
  connectedCallback() {
    if (this.firstChild) return;
    this.innerHTML = `<details>
      <summary aria-label="裏方アカウント">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>
        <img alt="" referrerpolicy="no-referrer" hidden>
      </summary>
      <div class="account-popover">
        <span>裏方アカウント</span>
        <strong>未ログイン</strong>
        <button type="button">ログイン</button>
      </div>
    </details>`;
    this.querySelector('img').addEventListener('error', () => {
      this.querySelector('img').hidden = true;
      this.querySelector('svg').style.display = '';
    });
    this.querySelector('button').onclick = () => {
      this.querySelector('details').open = false;
      this.action?.();
    };
    this.addEventListener('keydown', event => {
      if (event.key === 'Escape' && this.querySelector('details').open) {
        this.querySelector('details').open = false;
        this.querySelector('summary').focus();
      }
    });
  }

  setProfile(profile, {login,logout}) {
    this.querySelector('strong').textContent = profile?.name || '未ログイン';
    this.querySelector('button').textContent = profile ? 'ログアウト' : 'ログイン';
    this.action = profile ? logout : login;
    let icon;
    try {
      const url = new URL(profile?.icon);
      if (url.protocol === 'https:' && !url.username && !url.password) icon = url.href;
    } catch {}
    const image = this.querySelector('img');
    image.hidden = !icon;
    this.querySelector('svg').style.display = icon ? 'none' : '';
    if (icon) image.src = icon;
    else image.removeAttribute('src');
  }
}

customElements.define('urakata-account', UrakataAccount);
