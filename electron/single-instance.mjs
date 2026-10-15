// Keep startup behind the lock, including readiness, path resolution and child setup.
export function startSingleInstance(app, start, onError) {
  if (!app.requestSingleInstanceLock()) {
    app.quit();
    return;
  }
  let window;
  let pendingFocus = false;
  const focusWindow = () => {
    if (!window || window.isDestroyed()) {
      pendingFocus = true;
      return;
    }
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
    pendingFocus = false;
  };
  app.on('second-instance', focusWindow);
  const setWindow = value => {
    window = value;
    if (pendingFocus) focusWindow();
  };
  return app.whenReady().then(() => start(setWindow)).catch(onError);
}
