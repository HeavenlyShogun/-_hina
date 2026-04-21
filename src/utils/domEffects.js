const elementCache = new Map();
const rippleCache = new Map();
const activeKeyElements = new Set();

function getCachedElement(id) {
  const cached = elementCache.get(id);
  if (cached?.isConnected) return cached;
  const element = document.getElementById(id);
  if (element) elementCache.set(id, element);
  return element;
}

export function toggleKeyDOM(keyK, isActive) {
  const element = getCachedElement(`key-${keyK}`);
  if (!element) return;

  if (isActive) {
    element.classList.add('playing-active');
    activeKeyElements.add(element);
    return;
  }

  element.classList.remove('playing-active');
  activeKeyElements.delete(element);
}

export function clearActiveKeysDOM() {
  activeKeyElements.forEach((element) => element.classList.remove('playing-active'));
  activeKeyElements.clear();
}

export function createRippleDOM(keyK) {
  const container = getCachedElement(`key-container-${keyK}`);
  if (!container) return;

  let ripple = rippleCache.get(keyK);
  if (!ripple?.isConnected) {
    ripple = document.createElement('div');
    ripple.className = 'key-ripple-layer absolute inset-0 rounded-full pointer-events-none';
    container.appendChild(ripple);
    rippleCache.set(keyK, ripple);
  }

  ripple.classList.remove('ripple-active');
  void ripple.offsetWidth;
  ripple.classList.add('ripple-active');
}
