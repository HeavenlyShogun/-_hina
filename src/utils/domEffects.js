export function toggleKeyDOM(keyK, isActive) {
  const element = document.getElementById(`key-${keyK}`);
  if (!element) return;
  if (isActive) element.classList.add('playing-active');
  else element.classList.remove('playing-active');
}

export function createRippleDOM(keyK) {
  const container = document.getElementById(`key-container-${keyK}`);
  if (!container) return;
  const ripple = document.createElement('div');
  ripple.className = 'absolute inset-0 rounded-full border-2 border-emerald-400/60 animate-ping pointer-events-none';
  container.appendChild(ripple);
  setTimeout(() => {
    if (container.contains(ripple)) container.removeChild(ripple);
  }, 800);
}
