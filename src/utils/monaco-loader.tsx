export function loadMonacoLoader(): Promise<typeof window.require> {
    return new Promise((resolve, reject) => {
      if (window.require) return resolve(window.require);
  
      const script = document.createElement('script');
      script.src = '/vs/loader.js'; // ← served directly from node_modules
      script.onload = () => {
        if (!window.require) return reject('RequireJS not available');
        window.require.config({ paths: { vs: '/vs' } });
        resolve(window.require);
      };
      script.onerror = reject;
      document.body.appendChild(script);
    });
  }
  
  