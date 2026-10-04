/* CardVal – image utilities (pure canvas, no dependencies).
 * Everything here works on a "card image": { w, h, data } where data is RGBA
 * (Uint8ClampedArray) of a perspective-free, upright crop of the card.
 */
(function (CV) {
  'use strict';

  // Normalised working size: 10 px per millimetre of a 63 x 88 mm card.
  var CARD_W = 630;
  var CARD_H = 880;
  var CARD_RATIO = 63 / 88;

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    return c;
  }

  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b);
    var d = max - min, h = 0;
    if (d > 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h *= 60;
      if (h < 0) h += 360;
    }
    return [h, max === 0 ? 0 : d / max, max];
  }

  function luma(r, g, b) {
    return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
  }

  function percentile(arr, p) {
    if (!arr.length) return NaN;
    var a = Array.prototype.slice.call(arr).sort(function (x, y) { return x - y; });
    var i = Math.min(a.length - 1, Math.max(0, Math.round((a.length - 1) * p)));
    return a[i];
  }

  function mean(arr) {
    if (!arr.length) return NaN;
    var s = 0;
    for (var i = 0; i < arr.length; i++) s += arr[i];
    return s / arr.length;
  }

  function std(arr) {
    if (arr.length < 2) return 0;
    var m = mean(arr), s = 0;
    for (var i = 0; i < arr.length; i++) s += (arr[i] - m) * (arr[i] - m);
    return Math.sqrt(s / arr.length);
  }

  // Circular statistics for hue (degrees).
  function hueMedian(hues) {
    if (!hues.length) return NaN;
    var sx = 0, sy = 0;
    for (var i = 0; i < hues.length; i++) {
      var a = hues[i] * Math.PI / 180;
      sx += Math.cos(a); sy += Math.sin(a);
    }
    var m = Math.atan2(sy, sx) * 180 / Math.PI;
    if (m < 0) m += 360;
    // Robust: median of offsets around the circular mean.
    var offs = hues.map(function (h) {
      var d = h - m;
      if (d > 180) d -= 360;
      if (d < -180) d += 360;
      return d;
    });
    var med = m + percentile(offs, 0.5);
    return (med + 360) % 360;
  }

  function hueDist(a, b) {
    var d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function grayOf(img) {
    var g = new Float32Array(img.w * img.h), d = img.data;
    for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = luma(d[j], d[j + 1], d[j + 2]);
    return g;
  }

  // Iterate pixels of a rectangle given in fractions of the card (x0,y0,x1,y1).
  function forRect(img, r, step, fn) {
    var x0 = Math.max(0, Math.floor(r[0] * img.w)), x1 = Math.min(img.w, Math.ceil(r[2] * img.w));
    var y0 = Math.max(0, Math.floor(r[1] * img.h)), y1 = Math.min(img.h, Math.ceil(r[3] * img.h));
    var d = img.data;
    for (var y = y0; y < y1; y += step) {
      for (var x = x0; x < x1; x += step) {
        var j = (y * img.w + x) * 4;
        fn(d[j], d[j + 1], d[j + 2], x, y);
      }
    }
  }

  // Pixels in a ring between two insets (fractions of card width).
  function forRing(img, inset0, inset1, step, fn) {
    var a = Math.round(inset0 * img.w), b = Math.round(inset1 * img.w), d = img.data;
    for (var y = 0; y < img.h; y += step) {
      for (var x = 0; x < img.w; x += step) {
        var e = Math.min(x, y, img.w - 1 - x, img.h - 1 - y);
        if (e < a || e >= b) continue;
        var j = (y * img.w + x) * 4;
        fn(d[j], d[j + 1], d[j + 2], x, y);
      }
    }
  }

  // Variance of the Laplacian – the classic focus / print-detail measure.
  function laplacianVariance(img, rect) {
    var g = grayOf(img), w = img.w;
    var x0 = Math.max(1, Math.floor(rect[0] * img.w)), x1 = Math.min(img.w - 1, Math.floor(rect[2] * img.w));
    var y0 = Math.max(1, Math.floor(rect[1] * img.h)), y1 = Math.min(img.h - 1, Math.floor(rect[3] * img.h));
    var vals = [];
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var i = y * w + x;
        vals.push(4 * g[i] - g[i - 1] - g[i + 1] - g[i - w] - g[i + w]);
      }
    }
    var s = std(vals);
    return s * s * 1e4;
  }

  // Fraction of pixels with a strong gradient (crisp lines/text) in a rect.
  function edgeDensity(img, rect, thr) {
    var g = grayOf(img), w = img.w, n = 0, strong = 0;
    var x0 = Math.max(1, Math.floor(rect[0] * img.w)), x1 = Math.min(img.w - 1, Math.floor(rect[2] * img.w));
    var y0 = Math.max(1, Math.floor(rect[1] * img.h)), y1 = Math.min(img.h - 1, Math.floor(rect[3] * img.h));
    for (var y = y0; y < y1; y++) {
      for (var x = x0; x < x1; x++) {
        var i = y * w + x;
        var gx = g[i + 1] - g[i - 1], gy = g[i + w] - g[i - w];
        n++;
        if (Math.sqrt(gx * gx + gy * gy) > thr) strong++;
      }
    }
    return n ? strong / n : 0;
  }

  /* Locate the card inside a source canvas region.
   * The user aligns the card to an on-screen guide, so we search for the
   * strongest straight edges near where the guide predicts them.
   * Returns { rect:[x,y,w,h] in source px, confident:boolean, aspect }.
   */
  function locateCard(src, guide) {
    // Work on a downscaled copy of the guide region plus a margin.
    var mx = guide.w * 0.12, my = guide.h * 0.12;
    var rx = Math.max(0, guide.x - mx), ry = Math.max(0, guide.y - my);
    var rw = Math.min(src.width - rx, guide.w + 2 * mx), rh = Math.min(src.height - ry, guide.h + 2 * my);
    var scale = 360 / rh;
    var W = Math.max(8, Math.round(rw * scale)), H = Math.max(8, Math.round(rh * scale));
    var c = makeCanvas(W, H), ctx = c.getContext('2d');
    ctx.drawImage(src, rx, ry, rw, rh, 0, 0, W, H);
    var d = ctx.getImageData(0, 0, W, H).data;
    var g = new Float32Array(W * H);
    for (var i = 0, j = 0; i < g.length; i++, j += 4) g[i] = luma(d[j], d[j + 1], d[j + 2]);

    // Column profile of |dx| over the middle rows, row profile of |dy| over the middle columns.
    var col = new Float32Array(W), row = new Float32Array(H);
    var ya = Math.floor(H * 0.25), yb = Math.floor(H * 0.75);
    var xa = Math.floor(W * 0.25), xb = Math.floor(W * 0.75);
    for (var y = ya; y < yb; y++) for (var x = 1; x < W - 1; x++) col[x] += Math.abs(g[y * W + x + 1] - g[y * W + x - 1]);
    for (var x2 = xa; x2 < xb; x2++) for (var y2 = 1; y2 < H - 1; y2++) row[y2] += Math.abs(g[(y2 + 1) * W + x2] - g[(y2 - 1) * W + x2]);

    function peak(profile, from, to) {
      var best = -1, bi = -1, sum = 0, n = 0;
      for (var k = Math.max(1, from); k < Math.min(profile.length - 1, to); k++) {
        var v = profile[k - 1] * 0.25 + profile[k] * 0.5 + profile[k + 1] * 0.25;
        sum += v; n++;
        if (v > best) { best = v; bi = k; }
      }
      return { i: bi, strength: n ? best / (sum / n + 1e-6) : 0 };
    }
    // Expected edge positions (guide edges) in the downscaled region.
    var ex0 = (guide.x - rx) * scale, ex1 = (guide.x + guide.w - rx) * scale;
    var ey0 = (guide.y - ry) * scale, ey1 = (guide.y + guide.h - ry) * scale;
    var bw = W * 0.16, bh = H * 0.13;
    var L = peak(col, Math.round(ex0 - bw), Math.round(ex0 + bw));
    var R = peak(col, Math.round(ex1 - bw), Math.round(ex1 + bw));
    var T = peak(row, Math.round(ey0 - bh), Math.round(ey0 + bh));
    var B = peak(row, Math.round(ey1 - bh), Math.round(ey1 + bh));

    var minStrength = Math.min(L.strength, R.strength, T.strength, B.strength);
    var cw = (R.i - L.i) / scale, ch = (B.i - T.i) / scale;
    var aspect = ch > 0 ? cw / ch : 0;
    var confident = minStrength > 2.2 && cw > guide.w * 0.7 && ch > guide.h * 0.7 &&
      Math.abs(aspect - CARD_RATIO) < 0.09;
    var rect = confident
      ? [rx + L.i / scale, ry + T.i / scale, cw, ch]
      : [guide.x, guide.y, guide.w, guide.h];
    return { rect: rect, confident: confident, aspect: aspect, edgeStrength: minStrength };
  }

  // Crop + resample a source region to the normalised card image.
  function extractCard(src, rect) {
    var c = makeCanvas(CARD_W, CARD_H), ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(src, rect[0], rect[1], rect[2], rect[3], 0, 0, CARD_W, CARD_H);
    var id = ctx.getImageData(0, 0, CARD_W, CARD_H);
    return { w: CARD_W, h: CARD_H, data: id.data, canvas: c };
  }

  // Photo-quality metrics used to decide how much to trust the analysis.
  function photoQuality(img) {
    var lum = [], clipped = 0, n = 0;
    forRect(img, [0.04, 0.04, 0.96, 0.96], 3, function (r, g, b) {
      lum.push(luma(r, g, b));
      if (r > 248 && g > 248 && b > 248) clipped++;
      n++;
    });
    var sharp = laplacianVariance(img, [0.1, 0.1, 0.9, 0.9]);
    return {
      brightness: mean(lum),
      glare: clipped / n,
      sharpness: sharp
    };
  }

  CV.img = {
    CARD_W: CARD_W, CARD_H: CARD_H, CARD_RATIO: CARD_RATIO,
    makeCanvas: makeCanvas, rgbToHsv: rgbToHsv, luma: luma,
    percentile: percentile, mean: mean, std: std,
    hueMedian: hueMedian, hueDist: hueDist,
    forRect: forRect, forRing: forRing,
    laplacianVariance: laplacianVariance, edgeDensity: edgeDensity,
    locateCard: locateCard, extractCard: extractCard, photoQuality: photoQuality
  };
})(window.CardVal = window.CardVal || {});
