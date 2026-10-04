/* CardVal – app flow: choose type → scan sides → think → result. */
(function (CV) {
  'use strict';
  var I = CV.img;
  var $ = function (id) { return document.getElementById(id); };

  var state = {
    type: null,
    sideIdx: 0,
    sides: {},          // id -> { img, quality, loc, thumb }
    stream: null,
    facing: 'environment',
    busy: false,
    pending: null,      // capture awaiting toast decision
    manual: {},         // manual check id -> 'pass' | 'fail'
    result: null
  };

  /* ------------------------------------------------------------ screens */
  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.classList.toggle('active', s.id === id); });
    $('btn-home').hidden = id === 'screen-select';
    window.scrollTo(0, 0);
  }

  function renderTypes() {
    var grid = $('type-grid');
    grid.innerHTML = '';
    Object.keys(CV.cardTypes).forEach(function (k) {
      var t = CV.cardTypes[k];
      var b = document.createElement('button');
      b.className = 'type-tile';
      b.innerHTML =
        '<div class="type-art"><div class="mini back">' + CV.art[k].back + '</div><div class="mini front">' + CV.art[k].front + '</div></div>' +
        '<div class="type-name">' + t.name + '</div><div class="type-sub">' + t.subtitle + '</div>';
      b.addEventListener('click', function () { startScan(k); });
      grid.appendChild(b);
    });
    var soon = document.createElement('div');
    soon.className = 'type-tile soon';
    soon.innerHTML = '<div class="type-name">סוגים נוספים</div><div class="type-sub">בקרוב</div>';
    grid.appendChild(soon);
  }

  /* --------------------------------------------------------------- scan */
  function startScan(typeId) {
    state.type = CV.cardTypes[typeId];
    state.sideIdx = 0;
    state.sides = {};
    state.manual = {};
    show('screen-scan');
    renderSides();
    startCamera();
  }

  function renderSides() {
    var t = state.type, box = $('sides');
    box.innerHTML = '';
    t.sides.forEach(function (s, i) {
      var el = document.createElement('div');
      var done = !!state.sides[s.id];
      el.className = 'side' + (i === state.sideIdx ? ' current' : '') + (done ? ' done' : '');
      el.innerHTML = '<div class="side-card">' +
        (done ? '<img alt="" src="' + state.sides[s.id].thumb + '">' : CV.art[t.id][s.id]) +
        '</div><div class="side-name">' + (done ? '✓ ' : '') + s.name + '</div>';
      box.appendChild(el);
    });
    var side = t.sides[state.sideIdx];
    $('step-label').textContent = 'שלב ' + (state.sideIdx + 1) + ' מתוך ' + t.sides.length + ': צלם את ' + side.the;
    $('hint').textContent = side.hint;
  }

  function stopCamera() {
    if (state.stream) state.stream.getTracks().forEach(function (tr) { tr.stop(); });
    state.stream = null;
  }

  function startCamera() {
    var video = $('video'), msg = $('cam-msg');
    stopCamera();
    $('frozen').hidden = true;
    msg.hidden = true;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      camError('הדפדפן לא מאפשר גישה למצלמה (נדרש HTTPS). אפשר להעלות תמונה מהגלריה.');
      return;
    }
    navigator.mediaDevices.getUserMedia({
      video: { facingMode: { ideal: state.facing }, width: { ideal: 1920 }, height: { ideal: 1080 } },
      audio: false
    }).then(function (stream) {
      state.stream = stream;
      video.srcObject = stream;
      video.classList.toggle('mirror', state.facing === 'user');
      return video.play();
    }).catch(function () {
      camError('אין גישה למצלמה. אשר הרשאת מצלמה, או העלה תמונה מהגלריה.');
    });
  }

  function camError(text) {
    var msg = $('cam-msg');
    msg.textContent = text;
    msg.hidden = false;
  }

  // Guide rectangle mapped from screen to video pixels (video uses object-fit: cover).
  function guideInVideo() {
    var video = $('video'), vp = $('viewport').getBoundingClientRect(), g = $('guide').getBoundingClientRect();
    var VW = video.videoWidth, VH = video.videoHeight;
    var s = Math.max(vp.width / VW, vp.height / VH);
    var ox = (vp.width - VW * s) / 2, oy = (vp.height - VH * s) / 2;
    var gx = g.left - vp.left, gy = g.top - vp.top;
    if (video.classList.contains('mirror')) gx = vp.width - gx - g.width;
    return { x: (gx - ox) / s, y: (gy - oy) / s, w: g.width / s, h: g.height / s };
  }

  function captureFromVideo() {
    var video = $('video');
    if (!state.stream || !video.videoWidth) {
      $('file-input').click();
      return;
    }
    var c = I.makeCanvas(video.videoWidth, video.videoHeight);
    c.getContext('2d').drawImage(video, 0, 0);
    processCapture(c, guideInVideo(), true);
  }

  function captureFromFile(file) {
    if (!file) return;
    var url = URL.createObjectURL(file), im = new Image();
    im.onload = function () {
      var maxSide = 2200, sc = Math.min(1, maxSide / Math.max(im.width, im.height));
      var c = I.makeCanvas(Math.round(im.width * sc), Math.round(im.height * sc));
      c.getContext('2d').drawImage(im, 0, 0, c.width, c.height);
      URL.revokeObjectURL(url);
      // Assume the card fills most of the picture; search around a centred guide.
      var gh = c.height * 0.86, gw = gh * I.CARD_RATIO;
      if (gw > c.width * 0.86) { gw = c.width * 0.86; gh = gw / I.CARD_RATIO; }
      processCapture(c, { x: (c.width - gw) / 2, y: (c.height - gh) / 2, w: gw, h: gh }, false);
    };
    im.onerror = function () { URL.revokeObjectURL(url); showToast('לא הצלחתי לקרוא את התמונה.', false); };
    im.src = url;
  }

  function processCapture(src, guide, fromCamera) {
    if (state.busy) return;
    state.busy = true;
    $('viewport').classList.add('busy');
    var side = state.type.sides[state.sideIdx];
    var loc = I.locateCard(src, guide);
    var img = I.extractCard(src, loc.rect);
    var quality = I.photoQuality(img);
    var capture = { img: img, quality: quality, loc: loc, thumb: img.canvas.toDataURL('image/jpeg', 0.85) };

    // Freeze the frame on screen.
    var frozen = $('frozen');
    frozen.src = fromCamera ? src.toDataURL('image/jpeg', 0.9) : capture.thumb;
    frozen.classList.toggle('mirror', fromCamera && state.facing === 'user');
    frozen.classList.toggle('contain', !fromCamera);
    frozen.hidden = false;
    $('cam-msg').classList.add('hide');

    var vp = $('viewport').getBoundingClientRect(), g = $('guide').getBoundingClientRect();
    var rect = { x: g.left - vp.left, y: g.top - vp.top, w: g.width, h: g.height };

    CV.fx.scan($('fx'), rect, 1900).then(function () {
      state.busy = false;
      $('viewport').classList.remove('busy');
      var v = state.type.validate(side.id, img);
      var problems = [];
      if (quality.brightness < 0.16) problems.push('התמונה חשוכה מדי');
      if (quality.sharpness < 1.2) problems.push('התמונה מטושטשת');
      if (quality.glare > 0.18) problems.push('יש השתקפות חזקה על הקלף');
      if (!v.ok) {
        showToast(v.message, !!v.soft, capture);
      } else if (problems.length) {
        showToast(problems.join(', ') + '. מומלץ לצלם שוב לתוצאה מדויקת.', true, capture);
      } else {
        acceptCapture(capture);
      }
    });
  }

  function showToast(text, canContinue, capture) {
    state.pending = capture || null;
    $('toast-text').textContent = text;
    $('toast-continue').hidden = !canContinue;
    $('toast').hidden = false;
  }

  function hideToast() {
    $('toast').hidden = true;
    $('frozen').hidden = true;
    $('cam-msg').classList.remove('hide');
    state.pending = null;
  }

  function acceptCapture(capture) {
    var side = state.type.sides[state.sideIdx];
    state.sides[side.id] = capture;
    $('frozen').hidden = true;
    $('cam-msg').classList.remove('hide');
    if (state.sideIdx < state.type.sides.length - 1) {
      state.sideIdx++;
      renderSides();
      flash();
    } else {
      renderSides();
      stopCamera();
      think();
    }
  }

  function flash() {
    var vp = $('viewport');
    vp.classList.remove('flip');
    void vp.offsetWidth;
    vp.classList.add('flip');
  }

  /* ------------------------------------------------------------ thinking */
  var THINK_STEPS = [
    'מאתר את גבולות הקלף',
    'מכייל איזון לבן לפי כדור הפוקה',
    'משווה את גוון הכחול בגב לקלף מקורי',
    'בודק רוויה ועומק צבע',
    'מודד מסגרת ומרכוז בצד הקדמי',
    'בודק חדות הדפסה וטקסט',
    'מחשב ציון סופי'
  ];

  function think() {
    show('screen-thinking');
    var list = $('think-steps');
    list.innerHTML = '';
    var stop = CV.fx.ambient($('think-fx'));
    var result;
    try {
      result = state.type.analyze(state.sides);
    } catch (e) {
      console.error(e);
      result = { checks: [], facts: [], backRecognised: false, error: true };
    }
    var i = 0;
    (function next() {
      if (i > 0) list.children[i - 1].classList.add('done');
      if (i < THINK_STEPS.length) {
        var li = document.createElement('li');
        li.textContent = THINK_STEPS[i];
        list.appendChild(li);
        i++;
        setTimeout(next, 520 + Math.random() * 380);
      } else {
        setTimeout(function () { stop(); showResult(result); }, 450);
      }
    })();
  }

  /* -------------------------------------------------------------- result */
  function confidenceOf() {
    var c = 1, notes = [];
    ['front', 'back'].forEach(function (k) {
      var s = state.sides[k];
      if (!s) return;
      if (s.quality.sharpness < 2) { c -= 0.15; notes.push('תמונה לא חדה'); }
      if (s.quality.brightness < 0.22 || s.quality.brightness > 0.9) { c -= 0.1; notes.push('תאורה לא אידאלית'); }
      if (s.quality.glare > 0.1) { c -= 0.1; notes.push('השתקפויות'); }
      if (!s.loc.confident) { c -= 0.08; notes.push('גבולות הקלף זוהו לפי המסגרת במסך'); }
    });
    return { value: Math.max(0.35, c), notes: notes.filter(function (n, i, a) { return a.indexOf(n) === i; }) };
  }

  function computeScore() {
    var r = state.result, conf = confidenceOf();
    var sw = 0, ss = 0, redFlag = false, severe = false;
    r.checks.forEach(function (c) {
      if (c.score === null || c.score === undefined || isNaN(c.score)) return;
      sw += c.weight; ss += c.weight * c.score;
      if (c.weight >= 2 && c.score < 0.15) severe = true;
      else if (c.weight >= 2 && c.score < 0.35) redFlag = true;
    });
    var auto = sw ? ss / sw : 0.5;
    var autoW = 8 * conf.value, num = auto * autoW, den = autoW, criticalFail = false, answered = 0;
    state.type.manualChecks.forEach(function (m) {
      var a = state.manual[m.id];
      if (!a) return;
      answered++;
      den += m.weight;
      if (a === 'pass') num += m.weight;
      else if (m.critical) criticalFail = true;
    });
    var score = num / den;
    if (severe) score = Math.min(score, 0.45);
    else if (redFlag) score = Math.min(score, 0.62);
    redFlag = redFlag || severe;
    if (!r.backRecognised) score = Math.min(score, 0.3);
    if (criticalFail) score = Math.min(score, 0.2);
    return { score: score, auto: auto, conf: conf, answered: answered, redFlag: redFlag, criticalFail: criticalFail };
  }

  function statusOf(score) {
    if (score === null || score === undefined || isNaN(score)) return 'na';
    return score >= 0.7 ? 'pass' : score >= 0.4 ? 'warn' : 'fail';
  }

  function updateVerdict() {
    var s = computeScore(), r = state.result;
    var pctv = Math.round(s.score * 100);
    var cls = s.score >= 0.75 ? 'good' : s.score >= 0.5 ? 'mid' : 'bad';
    var v = $('verdict');
    v.className = 'verdict ' + cls;
    var circ = 2 * Math.PI * 52;
    var fg = $('gauge-fg');
    fg.style.strokeDasharray = circ;
    fg.style.strokeDashoffset = circ * (1 - s.score);
    animateNumber($('gauge-num'), pctv);

    var title, sub;
    if (!r.backRecognised) {
      title = 'לא זוהה גב של קלף פוקימון';
      sub = 'הגב שצולם לא תואם לגב מקורי (כחול עם כדור פוקה). או שהצילום לא טוב, או שהקלף מזויף. נסה לצלם שוב באור טוב.';
    } else if (cls === 'good') {
      title = 'נראה מקורי ✓';
      sub = 'רוב המאפיינים בצילום תואמים לקלף פוקימון מקורי.';
    } else if (cls === 'mid') {
      title = 'לא חד-משמעי';
      sub = 'יש מאפיינים חשודים. מומלץ לבצע את הבדיקות הידניות למטה, בעיקר מבחן האור.';
    } else {
      title = 'חשד גבוה לזיוף ✕';
      sub = 'כמה מהסימנים המוכרים של זיופים הופיעו בצילום.';
    }
    if (s.criticalFail) sub = 'נכשל במבחן פיזי קריטי (אור / שכבה כהה) – זה הסימן החזק ביותר לזיוף.';
    else if (s.redFlag && cls !== 'bad') sub += ' שים לב: לפחות בדיקה חשובה אחת נכשלה.';
    $('verdict-title').textContent = title;
    $('verdict-sub').textContent = sub;
    var confLabel = s.conf.value >= 0.85 ? 'גבוהה' : s.conf.value >= 0.65 ? 'בינונית' : 'נמוכה';
    $('confidence').textContent = 'איכות הצילום: ' + confLabel + (s.conf.notes.length ? ' (' + s.conf.notes.join(', ') + ')' : '') +
      ' · בדיקות ידניות: ' + s.answered + '/' + state.type.manualChecks.length;
  }

  function animateNumber(el, to) {
    var from = parseInt(el.textContent, 10) || 0, start = performance.now();
    (function step(now) {
      var t = Math.min(1, (now - start) / 700);
      el.textContent = Math.round(from + (to - from) * (1 - Math.pow(1 - t, 3)));
      if (t < 1) requestAnimationFrame(step);
    })(start);
  }

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; });
  }

  function showResult(result) {
    state.result = result;
    show('screen-result');

    var photos = $('photos');
    photos.innerHTML = '';
    state.type.sides.forEach(function (s) {
      var d = state.sides[s.id];
      photos.insertAdjacentHTML('beforeend', '<figure><img alt="" src="' + d.thumb + '"><figcaption>' + s.name + '</figcaption></figure>');
    });

    var facts = $('facts');
    facts.innerHTML = '<div><dt>סוג</dt><dd>' + esc(state.type.name) + '</dd></div>';
    result.facts.forEach(function (f) {
      facts.insertAdjacentHTML('beforeend', '<div><dt>' + esc(f.label) + '</dt><dd>' + esc(f.value) + '</dd></div>');
    });

    var list = $('checks');
    list.innerHTML = '';
    var order = { fail: 0, warn: 1, pass: 2, na: 3 };
    result.checks.slice().sort(function (a, b) { return order[statusOf(a.score)] - order[statusOf(b.score)] || b.weight - a.weight; })
      .forEach(function (c) {
        var st = statusOf(c.score);
        var icon = { pass: '✓', warn: '!', fail: '✕', na: '–' }[st];
        var sw = c.swatch ? '<div class="swatches"><span><i style="background:' + c.swatch.measured + '"></i>נמדד</span><span><i style="background:' + c.swatch.reference + '"></i>מקורי (בקירוב)</span></div>' : '';
        list.insertAdjacentHTML('beforeend',
          '<li class="check ' + st + '"><span class="ico">' + icon + '</span><div><b>' + esc(c.title) +
          '</b><span class="side-tag">' + (c.side === 'front' ? 'קדמי' : 'אחורי') + '</span><p>' + esc(c.detail) + '</p>' + sw + '</div></li>');
      });
    if (result.error) list.innerHTML = '<li class="check fail"><span class="ico">✕</span><div><b>שגיאה בניתוח</b><p>נסה לצלם שוב.</p></div></li>';

    var manual = $('manual');
    manual.innerHTML = '';
    state.type.manualChecks.forEach(function (m) {
      var li = document.createElement('li');
      li.className = 'mcheck';
      li.innerHTML = '<div class="mhead"><b>' + esc(m.title) + (m.critical ? ' <span class="crit">קריטי</span>' : '') + '</b>' +
        '<div class="seg"><button data-v="pass">עבר</button><button data-v="fail">נכשל</button></div></div><p>' + esc(m.how) + '</p>';
      li.querySelectorAll('button').forEach(function (b) {
        b.addEventListener('click', function () {
          var v = b.getAttribute('data-v');
          state.manual[m.id] = state.manual[m.id] === v ? undefined : v;
          li.querySelectorAll('button').forEach(function (x) { x.classList.toggle('on', state.manual[m.id] === x.getAttribute('data-v')); });
          li.className = 'mcheck ' + (state.manual[m.id] || '');
          updateVerdict();
        });
      });
      manual.appendChild(li);
    });

    $('sources').innerHTML = state.type.sources.map(function (s) {
      return '<li><a href="' + s.url + '" target="_blank" rel="noopener">' + esc(s.title) + '</a></li>';
    }).join('');

    $('gauge-num').textContent = '0';
    requestAnimationFrame(updateVerdict);
  }

  /* -------------------------------------------------------------- wiring */
  $('btn-capture').addEventListener('click', captureFromVideo);
  $('file-input').addEventListener('change', function (e) {
    captureFromFile(e.target.files[0]);
    e.target.value = '';
  });
  $('btn-flip').addEventListener('click', function () {
    state.facing = state.facing === 'environment' ? 'user' : 'environment';
    startCamera();
  });
  $('toast-retry').addEventListener('click', hideToast);
  $('toast-continue').addEventListener('click', function () {
    var c = state.pending;
    hideToast();
    if (c) acceptCapture(c);
  });
  $('btn-home').addEventListener('click', function () { stopCamera(); hideToast(); show('screen-select'); });
  $('btn-again').addEventListener('click', function () { show('screen-select'); });
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) stopCamera();
    else if ($('screen-scan').classList.contains('active') && !state.stream) startCamera();
  });

  renderTypes();
  CV.app = { state: state, processCapture: processCapture, captureFromFile: captureFromFile };
})(window.CardVal = window.CardVal || {});
