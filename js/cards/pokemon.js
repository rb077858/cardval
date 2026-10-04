/* CardVal – Pokémon TCG profile.
 *
 * Every automatic check below is derived from published authentication
 * guides (see docs/pokemon-authentication.md). Thresholds are deliberately
 * tolerant because phone cameras shift colours; each check returns a score
 * between 0 (looks fake) and 1 (looks genuine), plus a weight.
 */
(function (CV) {
  'use strict';
  var I = CV.img;

  // 1 inside [okLo, okHi], linearly falling to 0 at badLo / badHi.
  function band(x, badLo, okLo, okHi, badHi) {
    if (isNaN(x)) return null;
    if (x >= okLo && x <= okHi) return 1;
    if (x < okLo) return x <= badLo ? 0 : (x - badLo) / (okLo - badLo);
    return x >= badHi ? 0 : (badHi - x) / (badHi - okHi);
  }
  function ramp(x, bad, good) {
    if (isNaN(x)) return null;
    var t = (x - bad) / (good - bad);
    return Math.max(0, Math.min(1, t));
  }
  function pct(x) { return Math.round(x * 100) + '%'; }
  function deg(x) { return Math.round(x) + '°'; }
  function hex(rgb) {
    return '#' + rgb.map(function (v) {
      var s = Math.max(0, Math.min(255, Math.round(v))).toString(16);
      return s.length < 2 ? '0' + s : s;
    }).join('');
  }

  // Gray-world style white balance taken from neutral (white/grey) pixels
  // inside a rect – on the back these are the Poké Ball's white half.
  function whiteBalance(img, rect) {
    var sr = 0, sg = 0, sb = 0, n = 0, total = 0;
    I.forRect(img, rect, 2, function (r, g, b) {
      total++;
      var hsv = I.rgbToHsv(r, g, b);
      if (hsv[1] < 0.14 && hsv[2] > 0.55 && hsv[2] < 0.98) { sr += r; sg += g; sb += b; n++; }
    });
    if (n < total * 0.01) return { gains: [1, 1, 1], found: false };
    var ar = sr / n, ag = sg / n, ab = sb / n, avg = (ar + ag + ab) / 3;
    function clamp(v) { return Math.max(0.8, Math.min(1.25, v)); }
    return { gains: [clamp(avg / ar), clamp(avg / ag), clamp(avg / ab)], found: true };
  }

  function collect(img, iter, gains, filter) {
    var out = { h: [], s: [], v: [], rgb: [0, 0, 0], n: 0, total: 0 };
    iter(function (r, g, b, x, y) {
      out.total++;
      r = Math.min(255, r * gains[0]); g = Math.min(255, g * gains[1]); b = Math.min(255, b * gains[2]);
      var hsv = I.rgbToHsv(r, g, b);
      if (!filter(hsv, x, y)) return;
      out.h.push(hsv[0]); out.s.push(hsv[1]); out.v.push(hsv[2]);
      out.rgb[0] += r; out.rgb[1] += g; out.rgb[2] += b; out.n++;
    });
    if (out.n) out.rgb = out.rgb.map(function (v) { return v / out.n; });
    out.frac = out.total ? out.n / out.total : 0;
    return out;
  }

  function isBlue(hsv) { return hsv[0] >= 180 && hsv[0] <= 265 && hsv[1] > 0.22 && hsv[2] > 0.1; }
  function isRed(hsv) { return (hsv[0] < 18 || hsv[0] > 335) && hsv[1] > 0.45 && hsv[2] > 0.28; }
  function isYellow(hsv) { return hsv[0] >= 38 && hsv[0] <= 68 && hsv[1] > 0.42 && hsv[2] > 0.45; }

  /* ---------------------------------------------------------------- BACK */
  function quickBack(img) {
    var blue = collect(img, function (f) { I.forRect(img, [0.03, 0.03, 0.97, 0.97], 4, f); }, [1, 1, 1], isBlue);
    return blue.frac;
  }

  function analyzeBack(img) {
    var checks = [], facts = [];
    var wb = whiteBalance(img, [0.3, 0.35, 0.7, 0.72]);
    var G = wb.gains;

    var all = collect(img, function (f) { I.forRect(img, [0.03, 0.03, 0.97, 0.97], 3, f); }, G, isBlue);
    var border = collect(img, function (f) { I.forRing(img, 0.02, 0.065, 2, f); }, G, isBlue);
    var inner = collect(img, function (f) { I.forRect(img, [0.12, 0.1, 0.88, 0.9], 3, f); }, G, function (hsv, x, y) {
      var dx = x / img.w - 0.5, dy = y / img.h - 0.5;
      return isBlue(hsv) && (dx * dx + dy * dy) > 0.06; // skip the Poké Ball area
    });
    var red = collect(img, function (f) { I.forRect(img, [0.2, 0.2, 0.8, 0.8], 2, f); }, G, isRed);
    var yellow = collect(img, function (f) { I.forRect(img, [0.05, 0.05, 0.95, 0.95], 3, f); }, G, isYellow);

    var recognised = all.frac > 0.32;

    // 1. Is this a Pokémon back at all (blue-dominant, red ball, yellow logo)?
    var featureScore = (ramp(all.frac, 0.25, 0.5) + ramp(red.frac, 0.002, 0.012) + ramp(yellow.frac, 0.002, 0.01)) / 3;
    checks.push({
      id: 'back-layout', side: 'back', weight: 1.5,
      title: 'מבנה הגב: כחול, כדור פוקה אדום ולוגו צהוב',
      score: featureScore,
      detail: 'כיסוי כחול ' + pct(all.frac) + ', אדום במרכז ' + pct(red.frac) + ', צהוב (לוגו) ' + pct(yellow.frac) +
        '. בגב מקורי הכחול שולט, ויש כדור פוקה אדום-לבן ולוגו צהוב עם מתאר כחול.'
    });

    // 2. Hue of the blue frame – fakes drift to purple or teal.
    var hue = I.hueMedian(border.n > 50 ? border.h : all.h);
    checks.push({
      id: 'back-hue', side: 'back', weight: 3,
      title: 'גוון הכחול במסגרת הגב',
      score: band(hue, 188, 203, 228, 245),
      detail: 'גוון שנמדד: ' + deg(hue) + ' (טווח מקורי משוער ‎203°–228°). ' +
        (hue > 228 ? 'נוטה לסגול – סימן מוכר לזיופים.' : hue < 203 ? 'נוטה לטורקיז/תכלת – סימן מוכר לזיופים.' : 'גוון כחול עמוק תקין.'),
      swatch: { measured: hex(border.n ? border.rgb : all.rgb), reference: '#1d3f8f' }
    });

    // 3. Saturation – fakes look washed out.
    var sat = I.percentile(border.n > 50 ? border.s : all.s, 0.5);
    checks.push({
      id: 'back-sat', side: 'back', weight: 2,
      title: 'רוויית הצבע (צבע "דהוי" או "חי")',
      score: band(sat, 0.3, 0.5, 1.01, 1.02),
      detail: 'רוויה חציונית: ' + pct(sat) + '. בקלפים מקוריים הכחול עשיר ורווי; בזיופים הוא לרוב דהוי או אפרפר.'
    });

    // 4. Two-tone depth: dark navy frame + lighter swirl, with real contrast.
    var vb = I.percentile(border.v, 0.5);
    var lo = I.percentile(inner.v, 0.12), hi = I.percentile(inner.v, 0.88);
    var spread = hi - lo;
    var twoTone = (ramp(spread, 0.12, 0.28) * 0.6) + (ramp(hi - vb, -0.02, 0.12) * 0.4);
    checks.push({
      id: 'back-contrast', side: 'back', weight: 2,
      title: 'ניגודיות ועומק הכחול (מסגרת כהה + מערבולת בהירה)',
      score: inner.n > 100 ? twoTone : null,
      detail: 'טווח בהירות במערבולת: ' + pct(spread) + ', הפרש בין המערבולת הבהירה למסגרת: ' + pct(hi - vb) +
        '. גב מקורי מראה שני גוונים ברורים; בזיופים התמונה "בוצית" ושטוחה.'
    });

    // 5. Frame uniformity – the frame is one even shade all around.
    var segs = [];
    for (var s = 0; s < 8; s++) {
      (function (s) {
        var c = collect(img, function (f) {
          I.forRing(img, 0.02, 0.065, 3, function (r, g, b, x, y) {
            var a = Math.atan2(y - img.h / 2, x - img.w / 2);
            var k = Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8) % 8;
            if (k === s) f(r, g, b, x, y);
          });
        }, G, isBlue);
        if (c.n > 20) segs.push(I.hueMedian(c.h));
      })(s);
    }
    var maxDev = 0;
    var ref = I.hueMedian(segs);
    segs.forEach(function (h) { maxDev = Math.max(maxDev, I.hueDist(h, ref)); });
    checks.push({
      id: 'back-uniform', side: 'back', weight: 1,
      title: 'אחידות הצבע לאורך המסגרת',
      score: segs.length >= 6 ? ramp(maxDev, 18, 6) : null,
      detail: 'סטייה מקסימלית בגוון בין חלקי המסגרת: ' + deg(maxDev) + '.'
    });

    // 6. Poké Ball red – genuine red is a clean scarlet, fakes go pink/orange.
    var redHue = I.hueMedian(red.h);
    var redOff = isNaN(redHue) ? NaN : I.hueDist(redHue, 355);
    checks.push({
      id: 'back-red', side: 'back', weight: 1,
      title: 'אדום של כדור הפוקה',
      score: red.n > 30 ? band(redOff, -1, 0, 14, 28) : null,
      detail: red.n > 30 ? 'גוון האדום: ' + deg(redHue) + '. אדום מקורי נקי, לא ורדרד ולא כתמתם.' : 'לא נמצא מספיק אדום לבדיקה.',
      swatch: red.n > 30 ? { measured: hex(red.rgb), reference: '#d8262e' } : null
    });

    // 7. Print crispness of the Poké Ball & swirl lines.
    var crisp = I.laplacianVariance(img, [0.25, 0.3, 0.75, 0.7]);
    checks.push({
      id: 'back-crisp', side: 'back', weight: 1.2,
      title: 'חדות ההדפסה בגב (קווי כדור הפוקה)',
      score: ramp(crisp, 1.5, 8),
      detail: 'מדד חדות: ' + crisp.toFixed(1) + '. בזיופים כמעט תמיד כדור הפוקה וקווי המערבולת מטושטשים. (צילום מטושטש מוריד גם הוא את המדד – צלם בפוקוס.)'
    });

    facts.push({ label: 'גוון כחול בגב', value: deg(hue) });
    facts.push({ label: 'איזון לבן', value: wb.found ? 'כויל לפי הלבן של כדור הפוקה' : 'לא כויל (לא נמצא לבן)' });
    return { checks: checks, facts: facts, recognised: recognised };
  }

  /* --------------------------------------------------------------- FRONT */
  function classifyBorder(img) {
    var ring = collect(img, function (f) { I.forRing(img, 0.012, 0.03, 2, f); }, [1, 1, 1], function () { return true; });
    var yellowN = 0, silverN = 0;
    for (var i = 0; i < ring.n; i++) {
      if (ring.h[i] >= 36 && ring.h[i] <= 70 && ring.s[i] > 0.35 && ring.v[i] > 0.4) yellowN++;
      else if (ring.s[i] < 0.2 && ring.v[i] > 0.35) silverN++;
    }
    var type = yellowN / ring.n > 0.5 ? 'yellow' : silverN / ring.n > 0.5 ? 'silver' : 'other';
    return { type: type, ring: ring, yellowFrac: yellowN / ring.n, silverFrac: silverN / ring.n };
  }

  function quickFront(img) { return classifyBorder(img).type; }

  // Measure border width on each side by walking inward until the colour changes.
  function measureBorders(img, refRgb) {
    var d = img.data, w = img.w, h = img.h;
    function dist(x, y) {
      var j = (y * w + x) * 4;
      var dr = d[j] - refRgb[0], dg = d[j + 1] - refRgb[1], db = d[j + 2] - refRgb[2];
      return Math.sqrt(dr * dr + dg * dg + db * db);
    }
    function walk(x0, y0, dx, dy, maxSteps) {
      var run = 0;
      for (var k = 0; k < maxSteps; k++) {
        var x = x0 + dx * k, y = y0 + dy * k;
        if (dist(x, y) > 70) { run++; if (run >= 3) return k - 2; } else run = 0;
      }
      return NaN;
    }
    var res = {}, sides = {
      left: function (t) { return walk(Math.round(0.006 * w), Math.round(t * h), 1, 0, Math.round(0.14 * w)); },
      right: function (t) { return walk(w - 1 - Math.round(0.006 * w), Math.round(t * h), -1, 0, Math.round(0.14 * w)); },
      top: function (t) { return walk(Math.round(t * w), Math.round(0.006 * w), 0, 1, Math.round(0.14 * w)); },
      bottom: function (t) { return walk(Math.round(t * w), h - 1 - Math.round(0.006 * w), 0, -1, Math.round(0.14 * w)); }
    };
    Object.keys(sides).forEach(function (k) {
      var vals = [];
      for (var t = 0.2; t <= 0.8; t += 0.03) {
        var v = sides[k](t);
        if (!isNaN(v)) vals.push(v + Math.round(0.006 * w));
      }
      res[k] = vals.length >= 8 ? I.percentile(vals, 0.5) : NaN;
    });
    return res;
  }

  function analyzeFront(img, quality) {
    var checks = [], facts = [];
    var cls = classifyBorder(img);
    var ring = cls.ring;

    // 1. Border colour.
    var yel = collect(img, function (f) { I.forRing(img, 0.012, 0.03, 2, f); }, [1, 1, 1], function (hsv) {
      return hsv[0] >= 30 && hsv[0] <= 75 && hsv[1] > 0.3;
    });
    var bHue = I.hueMedian(yel.h), bSat = I.percentile(yel.s, 0.5);
    if (cls.type === 'yellow') {
      checks.push({
        id: 'front-border', side: 'front', weight: 2.5,
        title: 'צבע המסגרת הצהובה',
        score: band(bHue, 32, 42, 58, 70) * 0.65 + band(bSat, 0.3, 0.5, 1.01, 1.02) * 0.35,
        detail: 'גוון ' + deg(bHue) + ', רוויה ' + pct(bSat) + '. מסגרת מקורית בצבע צהוב-זהוב אחיד; בזיופים היא לרוב כתומה, חיוורת או "מלוכלכת".',
        swatch: { measured: hex(yel.rgb), reference: '#f1cf2f' }
      });
    } else if (cls.type === 'silver') {
      checks.push({
        id: 'front-border', side: 'front', weight: 1.2,
        title: 'מסגרת כסופה (סדרות Scarlet & Violet ואילך)',
        score: 0.85,
        detail: 'זוהתה מסגרת כסופה/אפורה – תקין לקלפים באנגלית מ-2023 ואילך. ודא שהקלף שייך לסדרה חדשה (בדוק את סמל הסט ותאריך ה-©).'
      });
    } else {
      checks.push({
        id: 'front-border', side: 'front', weight: 2,
        title: 'צבע המסגרת',
        score: 0.25,
        detail: 'המסגרת אינה צהובה ואינה כסופה (צהוב ' + pct(cls.yellowFrac) + ', כסוף ' + pct(cls.silverFrac) +
          '). ייתכן שהקלף לא מיושר למסגרת במסך, או שזה קלף חריג/מזויף. נסה לצלם שוב.'
      });
    }

    // 2. Border evenness around the card.
    var segs = [];
    for (var s = 0; s < 8; s++) {
      (function (s) {
        var c = collect(img, function (f) {
          I.forRing(img, 0.012, 0.03, 3, function (r, g, b, x, y) {
            var a = Math.atan2(y - img.h / 2, x - img.w / 2);
            if (Math.floor(((a + Math.PI) / (2 * Math.PI)) * 8) % 8 === s) f(r, g, b, x, y);
          });
        }, [1, 1, 1], function () { return true; });
        segs.push(c.rgb);
      })(s);
    }
    var segSpread = 0;
    for (var a = 0; a < segs.length; a++) {
      for (var b = a + 1; b < segs.length; b++) {
        // ignore pure brightness change from lighting by normalising to the sum
        var sa = segs[a][0] + segs[a][1] + segs[a][2] + 1, sb2 = segs[b][0] + segs[b][1] + segs[b][2] + 1;
        var chroma = 0;
        for (var ch2 = 0; ch2 < 3; ch2++) chroma += Math.abs(segs[a][ch2] / sa - segs[b][ch2] / sb2);
        segSpread = Math.max(segSpread, chroma * 100);
      }
    }
    checks.push({
      id: 'front-border-even', side: 'front', weight: 1,
      title: 'אחידות המסגרת',
      score: ramp(segSpread, 9, 3),
      detail: 'שונות כרומטית בין צדדי המסגרת: ' + segSpread.toFixed(1) + '. מסגרת מקורית אחידה ונקייה, בלי קצוות "מרוחים".'
    });

    // 3. Centering.
    var bw = measureBorders(img, cls.type === 'yellow' && yel.n ? yel.rgb : ring.rgb);
    var lr = Math.min(bw.left, bw.right) / Math.max(bw.left, bw.right);
    var tb = Math.min(bw.top, bw.bottom) / Math.max(bw.top, bw.bottom);
    var centerOk = !isNaN(lr) && !isNaN(tb);
    var worst = Math.min(lr, tb);
    function ratioText(a, b) { var t = a + b; return Math.round(a / t * 100) + '/' + Math.round(b / t * 100); }
    checks.push({
      id: 'front-centering', side: 'front', weight: 1.2,
      title: 'מרכוז (רוחב המסגרת בכל צד)',
      score: centerOk ? ramp(worst, 0.35, 0.65) : null,
      detail: centerOk
        ? 'ימין/שמאל ' + ratioText(bw.left, bw.right) + ', למעלה/למטה ' + ratioText(bw.top, bw.bottom) +
          '. מרכוז גרוע אינו הוכחה לזיוף (גם במקוריים יש חיתוכים עקומים), אבל זיופים לרוב חתוכים עקום מאוד.'
        : 'לא הצלחתי למדוד את רוחב המסגרת בכל הצדדים. ודא שכל הקלף בתוך המסגרת ושאין השתקפויות.'
    });
    if (centerOk) facts.push({ label: 'מרכוז', value: 'L/R ' + ratioText(bw.left, bw.right) + ' · T/B ' + ratioText(bw.top, bw.bottom) });

    // 4. Border thickness vs card width (≈ 3 mm of 63 mm on genuine cards).
    if (centerOk && cls.type !== 'other') {
      var avgSide = (bw.left + bw.right) / 2 / img.w * 63;
      checks.push({
        id: 'front-border-width', side: 'front', weight: 1,
        title: 'עובי המסגרת ביחס לגודל הקלף',
        score: band(avgSide, 1.4, 2.2, 4.4, 5.6),
        detail: 'עובי ממוצע בצדדים: כ-' + avgSide.toFixed(1) + ' מ"מ (בקלף מקורי בערך 3 מ"מ). מסגרת עבה או דקה מדי היא סימן מוכר לזיוף.'
      });
      facts.push({ label: 'עובי מסגרת', value: avgSide.toFixed(1) + ' מ"מ' });
    }

    // 5. Artwork colour – fakes are often over-saturated or faded.
    var art = collect(img, function (f) { I.forRect(img, [0.12, 0.12, 0.88, 0.48], 3, f); }, [1, 1, 1], function () { return true; });
    var artSat = I.percentile(art.s, 0.5);
    checks.push({
      id: 'front-art', side: 'front', weight: 1,
      title: 'צבעוניות האיור',
      score: band(artSat, 0.06, 0.16, 0.7, 0.9),
      detail: 'רוויה חציונית באיור: ' + pct(artSat) + '. זיופים נוטים לצבעים רוויים מדי ("זרחניים") או דהויים מדי.'
    });

    // 6. Text crispness (attack text, HP, set info).
    var textCrisp = I.laplacianVariance(img, [0.08, 0.55, 0.92, 0.93]);
    checks.push({
      id: 'front-text', side: 'front', weight: 1.2,
      title: 'חדות הטקסט והסמלים',
      score: ramp(textCrisp, 2, 10),
      detail: 'מדד חדות באזור הטקסט: ' + textCrisp.toFixed(1) + '. זיופים מודפסים ברזולוציה נמוכה – טקסט מטושטש ועבה.'
    });

    // 7. Gloss – very shiny, plastic-like surface is a known counterfeit trait.
    checks.push({
      id: 'front-gloss', side: 'front', weight: 0.6,
      title: 'ברק השטח',
      score: ramp(quality.glare, 0.12, 0.03),
      detail: 'שטח "שרוף" מהשתקפות: ' + pct(quality.glare) + '. זיופים זולים מבריקים מאוד כמו פלסטיק – אבל זה תלוי גם בתאורה, אז זה סימן חלש.'
    });

    facts.push({
      label: 'סוג מסגרת',
      value: cls.type === 'yellow' ? 'צהובה (קלאסית, עד 2023)' : cls.type === 'silver' ? 'כסופה (Scarlet & Violet, 2023+)' : 'לא מזוהה'
    });
    return { checks: checks, facts: facts };
  }

  /* --------------------------------------------------------------- TOOLS */
  var manualChecks = [
    { id: 'light', weight: 3, critical: true, title: 'מבחן האור',
      how: 'בחדר חשוך, הצמד את פנס הטלפון לגב הקלף. בקלף מקורי יש שכבה כהה באמצע שחוסמת את רוב האור – רואים רק זוהר עמום ואחיד. אם האור עובר בקלות או רואים דרכו – כנראה זיוף.' },
    { id: 'core', weight: 2.5, critical: true, title: 'שכבה כהה בשולי הקלף',
      how: 'הסתכל על דופן הקלף מקרוב (עדיף עם זכוכית מגדלת). בקלף מקורי רואים קו דק שחור/כחול כהה בין שתי שכבות לבנות.' },
    { id: 'font', weight: 2, title: 'פונט ושגיאות כתיב',
      how: 'בדוק שאין שגיאות כתיב, שה-é ב-Pokémon עם הסימן, שה-HP ומספרי הנזק בפונט הנכון ולא עבים או דקים מדי.' },
    { id: 'rosette', weight: 2, title: 'דפוס נקודות ההדפסה (רוזטה)',
      how: 'בזום מאקרו או זכוכית מגדלת x30–x60: בקלף מקורי רואים נקודות צבע קטנות בעיגולים (דפוס אופסט). בזיוף – צבע שטוח או פיקסלים של מדפסת דיגיטלית.' },
    { id: 'texture', weight: 1.5, title: 'מרקם ותחושה',
      how: 'קלף מקורי מרגיש קשיח-גמיש עם מרקם עדין. זיוף מרגיש חלק, שעווני או מבריק כמו פלסטיק, או רך ודק מדי.' },
    { id: 'energy', weight: 1.5, title: 'סמלי אנרגיה',
      how: 'השווה לתמונה של הקלף המקורי: בזיופים צבע הסמלים שונה, הציור הפנימי גדול מדי או מטושטש, והם לא ממוקמים נכון.' },
    { id: 'holo', weight: 1.5, title: 'דפוס הולוגרפי (אם יש)',
      how: 'בקלף הולו מקורי האפקט מופיע רק באזורים הנכונים ובדפוס הספציפי של הסט. ברק קשת גנרי על כל הקלף – סימן לזיוף.' },
    { id: 'info', weight: 1.5, title: 'סמל סט, מספר קלף ושורת ©',
      how: 'בתחתית הקלף: סמל הסט, מספר (למשל 25/198) ושורת זכויות יוצרים. חפש את הקלף באתר רשמי ובדוק שהכול תואם.' },
    { id: 'weight', weight: 1, title: 'משקל ועובי',
      how: 'קלף מקורי שוקל כ-1.8 גרם ועוביו כ-0.3 מ"מ. השווה לקלף שאתה בטוח שהוא מקורי.' },
    { id: 'corners', weight: 1, title: 'פינות וחיתוך',
      how: 'פינות מעוגלות באחידות (רדיוס כ-3 מ"מ), חיתוך נקי. גודל 63×88 מ"מ בדיוק.' }
  ];

  CV.cardTypes = CV.cardTypes || {};
  CV.cardTypes.pokemon = {
    id: 'pokemon',
    name: 'קלף פוקימון',
    subtitle: 'Pokémon TCG – אנגלית / בינלאומי',
    sides: [
      { id: 'front', name: 'צד קדמי', the: 'הצד הקדמי', hint: 'יישר את הקלף כך שהמסגרת הצהובה/כסופה צמודה לקו המסגרת.' },
      { id: 'back', name: 'צד אחורי', the: 'הצד האחורי', hint: 'יישר את הגב הכחול עם כדור הפוקה במרכז המסגרת.' }
    ],
    validate: function (side, img) {
      if (side === 'back') {
        var f = quickBack(img);
        if (f < 0.3) return { ok: false, message: 'לא זיהיתי גב כחול של קלף פוקימון. ודא שצילמת את הגב, שהוא ממלא את המסגרת ושיש תאורה טובה.' };
      } else {
        if (quickBack(img) > 0.6) return { ok: false, message: 'נראה שצילמת את הגב במקום הצד הקדמי. הפוך את הקלף ונסה שוב.' };
        if (quickFront(img) === 'other') return { ok: false, soft: true, message: 'לא זיהיתי מסגרת צהובה או כסופה. ודא שהקלף מיושר בדיוק לקו המסגרת.' };
      }
      return { ok: true };
    },
    analyze: function (sides) {
      var front = analyzeFront(sides.front.img, sides.front.quality);
      var back = analyzeBack(sides.back.img);
      var checks = front.checks.concat(back.checks);

      // Proportions (63 x 88 mm), only when the edges were detected reliably.
      ['front', 'back'].forEach(function (k) {
        var loc = sides[k].loc;
        if (loc && loc.confident) {
          var err = Math.abs(loc.aspect - I.CARD_RATIO) / I.CARD_RATIO;
          checks.push({
            id: k + '-aspect', side: k, weight: 0.8,
            title: 'יחס גובה-רוחב (63×88 מ"מ) – ' + (k === 'front' ? 'קדמי' : 'אחורי'),
            score: ramp(err, 0.08, 0.025),
            detail: 'יחס שנמדד ' + loc.aspect.toFixed(3) + ' (מקורי 0.716). צילום בזווית משפיע על המדידה – צלם ישר מלמעלה.'
          });
        }
      });

      return {
        checks: checks,
        facts: front.facts.concat(back.facts),
        backRecognised: back.recognised
      };
    },
    manualChecks: manualChecks,
    sources: [
      { title: 'TCGplayer – How to Spot Fake Pokémon Cards', url: 'https://www.tcgplayer.com/content/article/How-to-Spot-Fake-Pok%C3%A9mon-Cards/0b3c551c-39e2-4949-ac46-3cb27e215b04/' },
      { title: "JustInBasil – How to Identify Fake Pokémon Cards", url: 'https://www.justinbasil.com/guide/fakes' },
      { title: 'TCGrader – Real vs Fake side-by-side', url: 'https://www.tcgrader.com/blog/real-vs-fake-pokemon-cards-side-by-side-comparison' },
      { title: 'PokéWallet – 10 authentication tests', url: 'https://www.pokewallet.io/blog/how-to-spot-fake-pokemon-cards-authentication-guide' },
      { title: 'TCG Protectors – 7 essential tips', url: 'https://tcgprotectors.com/blogs/pokemon-collectors-corner/how-to-spot-fake-pokemon-cards-guide' },
      { title: 'Folio – Pokémon card dimensions', url: 'https://folio.fyi/blog/pokemon-card-dimensions' }
    ]
  };
})(window.CardVal = window.CardVal || {});
