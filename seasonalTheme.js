const seasonsConfig = {
  spring: {
    bg: 'linear-gradient(135deg, #fdf2f8 0%, #fce7f3 100%)',
    particleCount: 45,
    createParticle: (canvas) => {
      const colors = ['#f472b6', '#f9a8d4', '#fbcfe8', '#fda4af'];
      return {
        isFlower: Math.random() > 0.85,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 4 + 4,
        speedY: Math.random() * 0.8 + 0.5,
        speedX: (Math.random() - 0.5) * 1,
        angle: Math.random() * 360,
        spin: (Math.random() - 0.5) * 0.03,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: Math.random() * 0.03 + 0.01,
        drift: Math.random() * Math.PI * 2,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.5 + 0.5
      };
    },
    draw: (p, ctx) => {
      p.flip += p.flipSpeed;
      p.drift += 0.015;
      p.x += Math.sin(p.drift) * 0.5;

      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.scale(1, Math.abs(Math.sin(p.flip)) + 0.2);

      ctx.shadowBlur = 5;
      ctx.shadowColor = 'rgba(244, 114, 182, 0.4)';
      ctx.globalAlpha = p.opacity;

      if (p.isFlower) {
        for (let i = 0; i < 5; i++) {
          ctx.rotate((Math.PI * 2) / 5);
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.bezierCurveTo(p.size * 0.8, p.size * 0.2, p.size * 1.2, p.size * 1.2, p.size * 0.3, p.size * 1.8);
          ctx.lineTo(0, p.size * 1.4);
          ctx.lineTo(-p.size * 0.3, p.size * 1.8);
          ctx.bezierCurveTo(-p.size * 1.2, p.size * 1.2, -p.size * 0.8, p.size * 0.2, 0, 0);
          ctx.fillStyle = p.color;
          ctx.fill();

          ctx.strokeStyle = 'rgba(219, 39, 119, 0.4)';
          ctx.lineWidth = p.size * 0.1;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(0, p.size * 1.2);
          ctx.stroke();
        }
        ctx.fillStyle = '#be185d';
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.3, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const grad = ctx.createLinearGradient(0, p.size, 0, -p.size);
        grad.addColorStop(0, p.color);
        grad.addColorStop(1, '#fff1f2');
        ctx.fillStyle = grad;

        ctx.beginPath();
        ctx.moveTo(0, p.size);
        ctx.bezierCurveTo(p.size * 1.3, p.size * 0.4, p.size * 0.9, -p.size, p.size * 0.2, -p.size * 0.8);
        ctx.lineTo(0, -p.size * 0.4);
        ctx.lineTo(-p.size * 0.2, -p.size * 0.8);
        ctx.bezierCurveTo(-p.size * 0.9, -p.size, -p.size * 1.3, p.size * 0.4, 0, p.size);
        ctx.fill();

        ctx.strokeStyle = 'rgba(219, 39, 119, 0.2)';
        ctx.lineWidth = p.size * 0.1;
        ctx.beginPath();
        ctx.moveTo(0, p.size * 0.8);
        ctx.lineTo(0, 0);
        ctx.stroke();
      }

      ctx.restore();
    }
  },
  summer: {
    bg: 'linear-gradient(135deg, #38bdf8 0%, #fef08a 100%)',
    particleCount: 40,
    createParticle: (canvas) => {
      const isBokeh = Math.random() > 0.6;
      return {
        isBokeh,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height + canvas.height,
        size: isBokeh ? Math.random() * 30 + 15 : Math.random() * 3 + 1.5,
        speedY: isBokeh ? -(Math.random() * 0.4 + 0.2) : -(Math.random() * 1.2 + 0.6),
        speedX: (Math.random() - 0.5) * 0.5,
        phase: Math.random() * Math.PI * 2,
        opacity: isBokeh ? Math.random() * 0.15 + 0.05 : Math.random() * 0.6 + 0.3,
        color: isBokeh
          ? ['255, 255, 255', '253, 224, 71', '186, 230, 253'][Math.floor(Math.random() * 3)]
          : '255, 255, 255'
      };
    },
    draw: (p, ctx) => {
      p.phase += 0.015;
      p.x += Math.sin(p.phase) * 0.5;

      ctx.save();
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);

      if (p.isBokeh) {
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity + Math.sin(p.phase) * 0.05})`;
        ctx.fill();
        ctx.lineWidth = 1;
        ctx.strokeStyle = `rgba(${p.color}, ${p.opacity + 0.1})`;
        ctx.stroke();
      } else {
        ctx.shadowBlur = 10;
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
        ctx.fill();
      }

      ctx.restore();
    }
  },
  autumn: {
    bg: 'linear-gradient(135deg, #ffedd5 0%, #ffc82c 100%)',
    particleCount: 20,
    createParticle: (canvas) => {
      const colors = ['#ea580c', '#c2410c', '#b45309', '#9a3412'];
      return {
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: Math.random() * 5 + 4,
        speedY: Math.random() * 1.5 + 0.8,
        speedX: (Math.random() - 0.5) * 2,
        angle: Math.random() * 360,
        spin: (Math.random() - 0.5) * 0.05,
        flip: Math.random() * Math.PI * 2,
        flipSpeed: Math.random() * 0.04 + 0.01,
        color: colors[Math.floor(Math.random() * colors.length)],
        opacity: Math.random() * 0.8 + 0.2
      };
    },
    draw: (p, ctx) => {
      p.flip += p.flipSpeed;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      ctx.scale(Math.sin(p.flip), Math.cos(p.flip * 0.5));

      ctx.globalAlpha = p.opacity;
      ctx.fillStyle = p.color;

      ctx.beginPath();
      ctx.moveTo(0, -p.size * 1.2);
      ctx.bezierCurveTo(p.size * 1.5, -p.size * 0.5, p.size * 0.8, p.size, 0, p.size * 1.2);
      ctx.bezierCurveTo(-p.size * 0.8, p.size, -p.size * 1.5, -p.size * 0.5, 0, -p.size * 1.2);
      ctx.fill();

      ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
      ctx.lineWidth = p.size * 0.15;
      ctx.lineCap = 'round';

      ctx.beginPath();
      ctx.moveTo(0, p.size * 1.2);
      ctx.lineTo(0, p.size * 1.6);
      ctx.moveTo(0, p.size * 1.2);
      ctx.lineTo(0, -p.size * 0.8);
      ctx.stroke();

      ctx.lineWidth = p.size * 0.08;
      ctx.beginPath();
      ctx.moveTo(0, p.size * 0.5); ctx.lineTo(p.size * 0.5, 0);
      ctx.moveTo(0, p.size * 0.5); ctx.lineTo(-p.size * 0.5, 0);
      ctx.moveTo(0, -p.size * 0.1); ctx.lineTo(p.size * 0.4, -p.size * 0.5);
      ctx.moveTo(0, -p.size * 0.1); ctx.lineTo(-p.size * 0.4, -p.size * 0.5);
      ctx.stroke();

      ctx.restore();
    }
  },
  winter: {
    bg: 'linear-gradient(135deg, #e0f2fe 0%, #bae6fd 100%)',
    particleCount: 45,
    createParticle: (canvas) => {
      const isDetailed = Math.random() > 0.6;
      return {
        isDetailed,
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        size: isDetailed ? Math.random() * 8 + 6 : Math.random() * 5 + 2,
        speedY: isDetailed ? Math.random() * 0.8 + 0.4 : Math.random() * 1.2 + 0.6,
        speedX: (Math.random() - 0.5) * 0.5,
        angle: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 0.02,
        opacity: isDetailed ? Math.random() * 0.5 + 0.3 : Math.random() * 0.5 + 0.2
      };
    },
    draw: (p, ctx) => {
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);

      if (p.isDetailed) {
        ctx.strokeStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.lineWidth = p.size * 0.15;
        ctx.lineCap = 'round';

        ctx.beginPath();
        for (let i = 0; i < 6; i++) {
          ctx.moveTo(0, 0);
          ctx.lineTo(0, -p.size);
          ctx.moveTo(0, -p.size * 0.4);
          ctx.lineTo(p.size * 0.3, -p.size * 0.7);
          ctx.moveTo(0, -p.size * 0.4);
          ctx.lineTo(-p.size * 0.3, -p.size * 0.7);
          ctx.rotate(Math.PI / 3);
        }
        ctx.stroke();

        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(0, 0, p.size * 0.2, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.shadowBlur = p.size * 2;
        ctx.shadowColor = 'white';
        ctx.fillStyle = `rgba(255, 255, 255, ${p.opacity})`;
        ctx.beginPath();
        ctx.arc(0, 0, p.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  },
  classic: {
    bg: 'linear-gradient(135deg, #E6F3FF 0%, #B0E0E6 50%, #F0F8FF 100%)',
    particleCount: 0,
    createParticle: () => ({
      x: 0,
      y: 0,
      size: 0,
      speedY: 0,
      speedX: 0
    }),
    draw: () => {}
  }
};

export function getSeasonByDate(date = new Date()) {
  const month = date.getMonth();
  if (month >= 2 && month <= 4) return 'spring';
  if (month >= 5 && month <= 7) return 'summer';
  if (month >= 8 && month <= 10) return 'autumn';
  return 'winter';
}

export async function initSeasonalTheme() {
  const canvas = document.getElementById('seasonal-canvas');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  const root = document.body;
  let currentSeason = getSeasonByDate();
  let particles = [];
  let animationId;

  function resizeCanvas() {
    const width = root.clientWidth || 320;
    const height = root.clientHeight || 500;
    if (canvas.width === width && canvas.height === height) return;
    canvas.width = width;
    canvas.height = height;
    if (particles.length) {
      initParticles();
    }
  }

  function initParticles() {
    const config = seasonsConfig[currentSeason];
    particles = [];
    const count = config?.particleCount || 0;
    for (let i = 0; i < count; i++) {
      const particle = config.createParticle(canvas);
      particle.y = Math.random() * canvas.height;
      particles.push(particle);
    }
  }

  function updateSwitcher() {
    document.querySelectorAll('#seasonSwitcher [data-season]').forEach((button) => {
      button.classList.toggle('active', button.dataset.season === currentSeason);
    });
  }

  function setSeason(season) {
    currentSeason = seasonsConfig[season] ? season : 'classic';
    root.style.background = seasonsConfig[currentSeason].bg;
    root.dataset.season = currentSeason;
    initParticles();
    updateSwitcher();
  }

  async function rememberSeason(season) {
    try {
      await chrome.storage.local.set({
        seasonalTheme: season,
        seasonalThemeBucket: getSeasonByDate()
      });
    } catch {
      // storage is optional for the live preview
    }
  }

  function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const config = seasonsConfig[currentSeason];
    if (!config || !config.particleCount) {
      animationId = requestAnimationFrame(animate);
      return;
    }

    particles.forEach((p) => {
      p.y += p.speedY;
      p.x += p.speedX;
      if (p.angle !== undefined) p.angle += p.spin;

      if (p.y > canvas.height + 20 || p.x > canvas.width + 20 || p.x < -20 || p.y < -20) {
        Object.assign(p, config.createParticle(canvas));
        if (currentSeason === 'summer') {
          p.y = canvas.height + 20;
        } else {
          p.y = -20;
        }
      }

      config.draw(p, ctx);
    });

    animationId = requestAnimationFrame(animate);
  }

  document.querySelectorAll('#seasonSwitcher [data-season]').forEach((button) => {
    button.addEventListener('click', () => {
      setSeason(button.dataset.season);
      rememberSeason(button.dataset.season);
    });
  });

  resizeCanvas();

  let initialSeason = getSeasonByDate();
  try {
    const stored = await chrome.storage.local.get(['seasonalTheme', 'seasonalThemeBucket']);
    const currentBucket = getSeasonByDate();
    if (stored.seasonalTheme === 'classic' && seasonsConfig.classic) {
      initialSeason = 'classic';
    } else if (stored.seasonalTheme && stored.seasonalThemeBucket === currentBucket && seasonsConfig[stored.seasonalTheme]) {
      initialSeason = stored.seasonalTheme;
    }
  } catch {
    // fall back to calendar season
  }

  setSeason(initialSeason);
  animate();

  window.addEventListener('resize', resizeCanvas);
  if (typeof ResizeObserver !== 'undefined') {
    const observer = new ResizeObserver(resizeCanvas);
    observer.observe(root);
  }

  return () => {
    cancelAnimationFrame(animationId);
  };
}
