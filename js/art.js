/* CardVal – sample card illustrations shown above the camera. */
(function (CV) {
  'use strict';

  var front =
    '<svg viewBox="0 0 63 88" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<linearGradient id="pf-in" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fbe98a"/><stop offset="1" stop-color="#f3d95c"/></linearGradient>' +
    '<linearGradient id="pf-art" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7cc8ff"/><stop offset="0.6" stop-color="#b8f0a8"/><stop offset="1" stop-color="#ffe27a"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="63" height="88" rx="3" fill="#f1cf2f"/>' +
    '<rect x="3" y="3" width="57" height="82" rx="1.5" fill="url(#pf-in)"/>' +
    '<text x="6" y="9.5" font-size="4.2" font-weight="700" font-family="Rubik, sans-serif" fill="#222" direction="ltr">Sparkmon</text>' +
    '<text x="45" y="9.5" font-size="3" font-weight="700" font-family="Rubik, sans-serif" fill="#c22" direction="ltr">HP</text>' +
    '<text x="49.5" y="9.5" font-size="4.4" font-weight="800" font-family="Rubik, sans-serif" fill="#222" direction="ltr">60</text>' +
    '<circle cx="57" cy="8" r="2.3" fill="#f7c600" stroke="#333" stroke-width="0.35"/>' +
    '<path d="M57.4 6.4l-1.4 1.9h1.2l-0.7 1.9 1.6-2.2h-1.2z" fill="#333"/>' +
    '<rect x="6" y="12" width="51" height="34" fill="url(#pf-art)" stroke="#b9a23a" stroke-width="0.8"/>' +
    '<ellipse cx="31.5" cy="34" rx="11" ry="9.5" fill="#ffd93b"/>' +
    '<path d="M22 28l-4-9 7 6zM41 28l4-9-7 6z" fill="#ffd93b"/>' +
    '<path d="M19 22l-1-3 2 2zM44 22l1-3-2 2z" fill="#333"/>' +
    '<circle cx="27.5" cy="32" r="1.4" fill="#222"/><circle cx="35.5" cy="32" r="1.4" fill="#222"/>' +
    '<circle cx="24.5" cy="36" r="2" fill="#f36"/><circle cx="38.5" cy="36" r="2" fill="#f36"/>' +
    '<path d="M29.5 37q2 1.5 4 0" fill="none" stroke="#222" stroke-width="0.6"/>' +
    '<rect x="9" y="47.5" width="45" height="2.6" rx="1.3" fill="#e2c04a"/>' +
    '<circle cx="9" cy="57" r="2" fill="#f7c600" stroke="#333" stroke-width="0.3"/>' +
    '<rect x="13" y="55.6" width="22" height="2.6" rx="0.6" fill="#333"/>' +
    '<text x="52" y="58.2" font-size="3.6" font-weight="800" font-family="Rubik, sans-serif" fill="#222" direction="ltr">20</text>' +
    '<rect x="8" y="61" width="47" height="1.2" rx="0.6" fill="#8a7a3a" opacity=".55"/>' +
    '<rect x="8" y="63.4" width="40" height="1.2" rx="0.6" fill="#8a7a3a" opacity=".55"/>' +
    '<circle cx="9" cy="69.5" r="2" fill="#f7c600" stroke="#333" stroke-width="0.3"/><circle cx="13.5" cy="69.5" r="2" fill="#ddd" stroke="#333" stroke-width="0.3"/>' +
    '<rect x="17.5" y="68.1" width="20" height="2.6" rx="0.6" fill="#333"/>' +
    '<text x="52" y="70.7" font-size="3.6" font-weight="800" font-family="Rubik, sans-serif" fill="#222" direction="ltr">50</text>' +
    '<rect x="6" y="76" width="51" height="0.5" fill="#b9a23a"/>' +
    '<rect x="8" y="78" width="12" height="1" fill="#555"/><rect x="25" y="78" width="12" height="1" fill="#555"/><rect x="43" y="78" width="12" height="1" fill="#555"/>' +
    '<rect x="8" y="81.3" width="30" height="0.9" fill="#777"/>' +
    '</svg>';

  var back =
    '<svg viewBox="0 0 63 88" xmlns="http://www.w3.org/2000/svg">' +
    '<defs>' +
    '<radialGradient id="pb-sw" cx="0.45" cy="0.45" r="0.7"><stop offset="0" stop-color="#7fb4f2"/><stop offset="0.45" stop-color="#3f7fd6"/><stop offset="1" stop-color="#1f4fa6"/></radialGradient>' +
    '<linearGradient id="pb-ball" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ff5a52"/><stop offset="1" stop-color="#c8171f"/></linearGradient>' +
    '</defs>' +
    '<rect x="0" y="0" width="63" height="88" rx="3" fill="#1d3f8f"/>' +
    '<rect x="3.2" y="3.2" width="56.6" height="81.6" rx="1.5" fill="url(#pb-sw)"/>' +
    '<g fill="none" stroke="#a9d0ff" stroke-width="1.6" opacity=".55">' +
    '<path d="M3 30Q20 10 45 18T60 10"/><path d="M3 64Q22 84 46 72T60 80"/>' +
    '<path d="M3 46Q12 22 34 26"/><path d="M60 42Q50 66 28 62"/>' +
    '</g>' +
    '<g fill="none" stroke="#163a86" stroke-width="2.2" opacity=".55">' +
    '<path d="M4 20Q26 2 59 22"/><path d="M4 70Q30 92 59 66"/>' +
    '</g>' +
    '<g transform="translate(31.5 46)">' +
    '<circle r="13" fill="#fff" stroke="#111" stroke-width="1.4"/>' +
    '<path d="M-13 0A13 13 0 0 1 13 0Z" fill="url(#pb-ball)" stroke="#111" stroke-width="1.4"/>' +
    '<rect x="-13" y="-1" width="26" height="2" fill="#111"/>' +
    '<circle r="4" fill="#fff" stroke="#111" stroke-width="1.4"/><circle r="2" fill="#fff" stroke="#bbb" stroke-width="0.5"/>' +
    '<path d="M-8 -9q4-3 8-2.5" stroke="#fff" stroke-width="1.2" fill="none" opacity=".7"/>' +
    '</g>' +
    '<g transform="translate(31.5 30) rotate(-8)">' +
    '<path d="M-21 -6q21-5 42 0l-2 11q-19-4-38 0z" fill="#ffcb05" stroke="#2a5db0" stroke-width="1.5" stroke-linejoin="round"/>' +
    '<text x="0" y="2.3" text-anchor="middle" font-size="7" font-weight="800" font-family="Rubik, sans-serif" fill="#2a5db0" direction="ltr" letter-spacing=".4">TCG</text>' +
    '</g>' +
    '</svg>';

  CV.art = { pokemon: { front: front, back: back } };
})(window.CardVal = window.CardVal || {});
