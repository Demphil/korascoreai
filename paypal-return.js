// Run before analytics. Payment identifiers remain inside this browser session.
(() => {
  const url = new URL(location.href);
  const keys = ['paypal_return', 'paypal_cancel', 'token', 'PayerID', 'payerID'];
  if (!keys.some(key => url.searchParams.has(key))) return;
  for (const action of ['return', 'cancel']) {
    const id = url.searchParams.get('paypal_' + action);
    if (id && /^[a-f0-9]{32}$/.test(id)) {
      try { sessionStorage.setItem('ks-paypal-' + action, id); } catch {}
    }
  }
  for (const key of keys) url.searchParams.delete(key);
  history.replaceState(history.state, '', url.pathname + url.search + url.hash);
})();
