import { API } from './api.js';
import { apiUrl, isNative } from './platform.js';

export function mealieMirrorImage(node, path) {
  let release;

  function update(path) {
    release?.();
    release = undefined;
    node.removeAttribute('src');
    node.hidden = false;
    if (!path) return;
    if (!isNative) {
      node.src = apiUrl(path);
      return;
    }

    // Android authenticates with a Bearer token, which an img tag cannot send.
    const controller = new AbortController();
    let objectUrl;
    let observer;
    async function load() {
      const blob = await API._fetchImageBlob(path, { signal: controller.signal });
      if (controller.signal.aborted) return;
      if (!blob) {
        node.hidden = true;
        return;
      }
      objectUrl = URL.createObjectURL(blob);
      node.src = objectUrl;
    }
    if (typeof IntersectionObserver === 'undefined') {
      void load();
    } else {
      observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        void load();
      });
      observer.observe(node);
    }
    release = () => {
      observer?.disconnect();
      controller.abort();
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }

  update(path);
  return { update, destroy: () => release?.() };
}
