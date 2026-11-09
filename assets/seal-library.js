export function setupSealLibrary(api) {
  const el = id => document.getElementById(id);
  const choice = el('seal-choice');
  const form = el('seal-registration');
  const status = el('seal-status');
  let seals = [];

  function rebuild() {
    choice.replaceChildren(
      new Option('なし', ''),
      ...seals.map(seal => new Option(seal.name, seal.id)),
      new Option('新しい印鑑を登録…', 'new'),
    );
  }

  function apply(seal) {
    el('seal').value = seal ? 'generated' : 'hide';
    el('sealName').value = seal?.sealName ?? '';
    el('sealShape').value = seal?.sealShape ?? 'round';
    el('sealFont').value = seal?.sealFont ?? 'mincho';
    choice.value = seal?.id ?? '';
    form.hidden = true;
    window.render();
  }

  function previewNew() {
    drawGeneratedSeal(el('seal-preview'), el('seal-text').value, el('seal-shape').value, el('seal-font').value);
  }

  choice.onchange = () => {
    status.textContent = '';
    if (choice.value === 'new') {
      form.hidden = false;
      previewNew();
      el('seal-label').focus();
    } else if (choice.value !== 'snapshot') {
      apply(seals.find(seal => seal.id === choice.value));
    }
  };
  form.oninput = previewNew;
  form.onsubmit = async event => {
    event.preventDefault();
    const button = form.querySelector('button');
    if (button.disabled) return;
    button.disabled = true;
    choice.disabled = true;
    status.textContent = '登録しています…';
    const name = el('seal-label').value.trim();
    const seal = {sealName:el('seal-text').value,sealShape:el('seal-shape').value,sealFont:el('seal-font').value};
    try {
      const result = await api('/seals', {name,seal});
      seals = result.seals;
      rebuild();
      apply(seals.find(item => item.name === name));
      form.reset();
      status.textContent = '印鑑を登録しました。';
    } catch (error) {
      status.textContent = error.message;
    } finally {
      button.disabled = false;
      choice.disabled = false;
    }
  };

  window.syncSealChoice = () => {
    if (!form.hidden) return;
    rebuild();
    if (el('seal').value !== 'generated') return;
    const selected = seals.find(seal => ['sealName','sealShape','sealFont'].every(key => seal[key] === el(key).value));
    if (selected) choice.value = selected.id;
    else {
      choice.add(new Option(el('sealName').value + '（帳票に保存済み）', 'snapshot'));
      choice.value = 'snapshot';
    }
  };

  return {
    load(saved) {
      seals = saved?.seals ?? (saved?.sealName ? [{...saved,id:'legacy',name:saved.sealName}] : []);
      rebuild();
      apply(seals.find(seal => seal.id === 'legacy'));
    },
    clear() {
      seals = [];
      rebuild();
      form.reset();
      form.hidden = true;
    },
  };
}
