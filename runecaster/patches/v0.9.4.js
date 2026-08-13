/* Rune//Caster v0.9.4 display patch.
 * Keeps the entire native 960x640 game canvas visible at any window/fullscreen
 * size without distorting the 3:2 aspect ratio. The CSS display box is resized,
 * not the canvas backing buffer, so world coordinates and rendering stay intact.
 */
(() => {
  'use strict';

  const gameCanvas = document.getElementById('game');
  const gameWrap = document.getElementById('gameWrap');
  if (!gameCanvas || !gameWrap) return;

  const style = document.createElement('style');
  style.id = 'runecaster-v094-fit-style';
  style.textContent = `
    #gameWrap {
      display: grid !important;
      place-items: center !important;
      overflow: hidden !important;
      min-width: 0 !important;
      min-height: 0 !important;
    }
    #gameWrap > canvas#game {
      display: block !important;
      flex: none !important;
      max-width: 100% !important;
      max-height: 100% !important;
      image-rendering: pixelated;
    }
  `;
  document.head.appendChild(style);

  let raf = 0;
  function fitGameCanvas() {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      const rect = gameWrap.getBoundingClientRect();
      if (rect.width <= 1 || rect.height <= 1) return;

      const nativeW = gameCanvas.width || 960;
      const nativeH = gameCanvas.height || 640;
      const ratio = nativeW / nativeH;
      const availableRatio = rect.width / rect.height;

      let displayW;
      let displayH;
      if (availableRatio > ratio) {
        displayH = rect.height;
        displayW = displayH * ratio;
      } else {
        displayW = rect.width;
        displayH = displayW / ratio;
      }

      // Avoid fractional CSS pixels producing a one-pixel crop/blur at some zoom levels.
      displayW = Math.max(1, Math.floor(displayW));
      displayH = Math.max(1, Math.floor(displayH));
      gameCanvas.style.width = `${displayW}px`;
      gameCanvas.style.height = `${displayH}px`;
    });
  }

  if ('ResizeObserver' in window) {
    const observer = new ResizeObserver(fitGameCanvas);
    observer.observe(gameWrap);
  }
  window.addEventListener('resize', fitGameCanvas, { passive: true });
  document.addEventListener('fullscreenchange', fitGameCanvas);
  window.addEventListener('orientationchange', fitGameCanvas, { passive: true });

  // Refit after UI mode changes that alter the editor/game split.
  const main = document.querySelector('main');
  if (main && 'MutationObserver' in window) {
    new MutationObserver(fitGameCanvas).observe(main, {
      attributes: true,
      attributeFilter: ['class']
    });
  }

  fitGameCanvas();
  requestAnimationFrame(fitGameCanvas);
  setTimeout(fitGameCanvas, 120);

  window.RuneCasterDisplay = {
    fit: fitGameCanvas,
    version: '0.9.4'
  };
  console.info('Rune//Caster patch v0.9.4 loaded: fullscreen canvas fit');
})();
