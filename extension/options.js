const input = document.getElementById('appUrl');
browser.storage.local.get('appUrl').then(({ appUrl }) => { input.value = appUrl || ''; });
document.getElementById('save').addEventListener('click', async () => {
  const value = input.value.trim();
  if (value && !/^https:\/\//i.test(value)) { document.getElementById('status').textContent = 'Use an https:// address.'; return; }
  await browser.storage.local.set({ appUrl: value });
  document.getElementById('status').textContent = 'Saved.';
});
