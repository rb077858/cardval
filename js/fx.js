/* CardVal – "magic dust" sparkle effect drawn on a canvas overlay. */
(function (CV) {
  'use strict';

  var COLORS = ['#fff7c2', '#ffe066', '#ffffff', '#9be7ff', '#d9b3ff', '#ffd1f0'];

  function fitCanvas(canvas) {
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var r = canvas.getBoundingClientRect();
    canvas.width = Math.max(1, Math.round(r.width * dpr));
    canvas.height = Math.max(1, Math.round(r.height * dpr));
    var ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { ctx: ctx, w: r.width, h: r.height };
  }

  function star(ctx, x, y, r) {
    ctx.beginPath();
    ctx.moveTo(x, y - r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.quadraticCurveTo(x, y, x, y + r);
    ctx.quadraticCurveTo(x, y, x - r, y);
    ctx.quadraticCurveTo(x, y, x, y - r);
    ctx.fill();
  }

  function makeParticle(x, y, spread) {
    return {
      x: x + (Math.random() - 0.5) * spread,
      y: y + (Math.random() - 0.5) * 10,
      vx: (Math.random() - 0.5) * 30,
      vy: -10 - Math.random() * 40,
      r: 0.8 + Math.random() * 2.4,
      star: Math.random() < 0.18,
      c: COLORS[(Math.random() * COLORS.length) | 0],
      life: 0,
      max: 0.6 + Math.random() * 0.9,
      tw: Math.random() * 6
    };
  }

  function drawParticles(ctx, ps, dt) {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = ps.length - 1; i >= 0; i--) {
      var p = ps[i];
      p.life += dt;
      if (p.life > p.max) { ps.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 8 * dt;
      var t = p.life / p.max;
      var a = Math.sin(t * Math.PI) * (0.6 + 0.4 * Math.sin(p.tw + p.life * 18));
      ctx.globalAlpha = Math.max(0, a);
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c;
      ctx.shadowBlur = 8;
      if (p.star) star(ctx, p.x, p.y, p.r * 3);
      else { ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalAlpha = 1;
    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
  }

  /* Sweep of glitter across a rectangle (screen coords relative to canvas). */
  function scan(canvas, rect, duration) {
    return new Promise(function (resolve) {
      var f = fitCanvas(canvas), ctx = f.ctx;
      var ps = [], start = performance.now(), last = start;
      function frame(now) {
        var dt = Math.min(0.05, (now - last) / 1000); last = now;
        var t = (now - start) / duration;
        ctx.clearRect(0, 0, f.w, f.h);
        if (t < 1) {
          // Scan beam moves down then back up.
          var phase = t < 0.6 ? t / 0.6 : 1 - (t - 0.6) / 0.4;
          var y = rect.y + rect.h * phase;
          var g = ctx.createLinearGradient(0, y - 30, 0, y + 30);
          g.addColorStop(0, 'rgba(155,231,255,0)');
          g.addColorStop(0.5, 'rgba(220,240,255,0.55)');
          g.addColorStop(1, 'rgba(155,231,255,0)');
          ctx.fillStyle = g;
          ctx.fillRect(rect.x, y - 30, rect.w, 60);
          for (var k = 0; k < 9; k++) ps.push(makeParticle(rect.x + Math.random() * rect.w, y, 6));
          // A few twinkles anywhere on the card.
          for (var k2 = 0; k2 < 2; k2++) ps.push(makeParticle(rect.x + Math.random() * rect.w, rect.y + Math.random() * rect.h, 4));
        }
        drawParticles(ctx, ps, dt);
        if (t < 1.3 && (t < 1 || ps.length)) requestAnimationFrame(frame);
        else { ctx.clearRect(0, 0, f.w, f.h); resolve(); }
      }
      requestAnimationFrame(frame);
    });
  }

  /* Endless gentle sparkles (for the "thinking" screen). Returns stop(). */
  function ambient(canvas) {
    var f = fitCanvas(canvas), ctx = f.ctx, ps = [], last = performance.now(), on = true;
    function frame(now) {
      if (!on) { ctx.clearRect(0, 0, f.w, f.h); return; }
      var dt = Math.min(0.05, (now - last) / 1000); last = now;
      ctx.clearRect(0, 0, f.w, f.h);
      for (var k = 0; k < 3; k++) {
        var a = Math.random() * Math.PI * 2, r = f.w * (0.25 + Math.random() * 0.25);
        ps.push(makeParticle(f.w / 2 + Math.cos(a) * r, f.h / 2 + Math.sin(a) * r * 1.3, 4));
      }
      drawParticles(ctx, ps, dt);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
    return function () { on = false; };
  }

  CV.fx = { scan: scan, ambient: ambient };
})(window.CardVal = window.CardVal || {});
