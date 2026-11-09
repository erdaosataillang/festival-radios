const personIcon = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7"><circle cx="12" cy="8" r="3.5"/><path d="M5 21v-2a7 7 0 0 1 14 0v2"/></svg>';

class UrakataAccount extends HTMLElement {
  connectedCallback() {
    if (this.firstChild) return;
    this.innerHTML = `<button class="account-trigger" type="button" aria-label="裏方アカウント" aria-haspopup="dialog">
      ${personIcon}<img alt="" referrerpolicy="no-referrer" hidden>
    </button>`;
    this.dialog = document.createElement('dialog');
    this.dialog.className = 'urakata-profile-dialog';
    this.dialog.setAttribute('aria-label','裏方アカウント');
    this.dialog.innerHTML = `<div class="account-cover">
      <button class="account-close" type="button" aria-label="閉じる" autofocus>×</button>
    </div>
    <div class="account-body">
      <div class="account-avatar">${personIcon}<img alt="" referrerpolicy="no-referrer" hidden></div>
      <strong class="account-name">未ログイン</strong>
      <p class="account-subtitle">裏方アカウント</p>
      <a class="account-main-action" href="https://lmc-mobile.sorairosystem.com/mypage.html" hidden>マイページを開く</a>
      <button class="account-session-action" type="button">ログイン</button>
    </div>`;
    document.body.append(this.dialog);
    this.trigger = this.querySelector('button');
    this.trigger.onclick = () => {
      this.dialog.showModal();
      document.documentElement.classList.add('account-dialog-open');
    };
    this.dialog.querySelector('.account-close').onclick = () => this.dialog.close();
    this.dialog.querySelector('.account-session-action').onclick = () => {
      this.dialog.close();
      this.action?.();
    };
    this.dialog.addEventListener('click', event => {
      if (event.target !== this.dialog) return;
      const box = this.dialog.getBoundingClientRect();
      if (event.clientX < box.left || event.clientX > box.right ||
          event.clientY < box.top || event.clientY > box.bottom) this.dialog.close();
    });
    this.dialog.addEventListener('close', () => {
      document.documentElement.classList.remove('account-dialog-open');
      this.trigger.focus({preventScroll:true});
    });
    for (const root of [this.trigger,this.dialog.querySelector('.account-avatar')]) {
      root.querySelector('img').addEventListener('error', () => {
        root.querySelector('img').hidden = true;
        root.querySelector('svg').style.display = '';
      });
    }
  }

  setProfile(profile, {login,logout}) {
    this.dialog.querySelector('.account-name').textContent = profile?.name ? profile.name + ' さん' : '未ログイン';
    this.dialog.querySelector('.account-main-action').hidden = !profile;
    this.dialog.querySelector('.account-session-action').textContent = profile ? 'ログアウト' : 'ログイン';
    this.dialog.classList.toggle('signed-in', Boolean(profile));
    this.action = profile ? logout : login;
    let icon;
    try {
      const url = new URL(profile?.icon);
      if (url.protocol === 'https:' && !url.username && !url.password) icon = url.href;
    } catch {}
    for (const root of [this.trigger,this.dialog.querySelector('.account-avatar')]) {
      const image = root.querySelector('img');
      image.hidden = !icon;
      root.querySelector('svg').style.display = icon ? 'none' : '';
      if (icon) image.src = icon;
      else image.removeAttribute('src');
    }
  }
}

customElements.define('urakata-account', UrakataAccount);
