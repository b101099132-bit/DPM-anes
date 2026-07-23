// DPM-anes 前端共用：JSONP、通行碼、院區欄位設定
// （API_URL 由 config.js 提供）

var _jsonpSeq = 0;
function jsonp(params, onDone, onError) {
  var cbName = '_dpmCb' + (++_jsonpSeq);
  window[cbName] = function (res) {
    delete window[cbName];
    onDone(res);
  };
  var qs = Object.keys(params).map(function (k) {
    return k + '=' + encodeURIComponent(params[k]);
  }).join('&');
  var s = document.createElement('script');
  s.src = API_URL + '?' + qs + '&callback=' + cbName;
  s.onerror = function () { if (onError) onError(); };
  s.onload = function () { s.remove(); };
  document.body.appendChild(s);
}

// 通行碼放網址 hash（沿用既有系統慣例）
function getPasscode() {
  return decodeURIComponent((location.hash || '').replace(/^#/, ''));
}
function gotoPage(page, passcode) {
  location.href = page + '#' + encodeURIComponent(passcode);
}

// ===== 院區欄位設定（與後端 SITES.headers 對應）=====
var SITE_UI = {
  hq: {
    label: '總院（新店耕莘）',
    groups: [
      { title: '刀房業務', subtotal: '刀房業務',
        items: ['半身麻醉(96007)', '硬脊膜麻醉(96005)', '插管全身麻醉(96020)', 'LMA(96020)', '未插管全身麻醉(96017)', 'IVG(96004)'] },
      { title: '刀房自費', subtotal: null,
        items: ['刀房自費麻醉(Z674)'] },
      { title: '外圍業務', subtotal: '外圍業務',
        items: ['麻醉胃鏡(Z6701)', '麻醉大腸鏡(Z6702)', '麻醉腸胃鏡(Z6703)', '麻醉內視鏡超音波(Z6710)', 'ERCP', 'RFA', '心導管室'] }
    ],
    total: { key: '麻醉總數', sum: ['刀房業務', '刀房自費麻醉(Z674)', '外圍業務'] },
    extras: []
  },
  ak: {
    label: '安康院區',
    groups: [
      { title: '麻醉業務', subtotal: null,
        items: ['半身麻醉(96007)', '硬脊膜麻醉(96005)', '插管全身麻醉(96020)', '插管全身麻醉(96030)', 'LMA(96020)', '未插管全身麻醉(96017)', 'IVG(96004)', '麻醉胃鏡(Z6701)', '麻醉大腸鏡(Z6702)', '麻醉腸胃鏡(Z6703)', '麻醉內視鏡超音波(Z6710)'] }
    ],
    total: { key: '麻醉總數',
      sum: ['半身麻醉(96007)', '硬脊膜麻醉(96005)', '插管全身麻醉(96020)', '插管全身麻醉(96030)', 'LMA(96020)', '未插管全身麻醉(96017)', 'IVG(96004)', '麻醉胃鏡(Z6701)', '麻醉大腸鏡(Z6702)', '麻醉腸胃鏡(Z6703)', '麻醉內視鏡超音波(Z6710)'] },
    extras: ['不插管RCT', '所有RCT', '不插管上肢手術', '所有上肢手術'] // 特殊註記項目，不計入麻醉總數
  }
};

// 民國月份工具："115/06"
function rocMonth(date) {
  var y = date.getFullYear() - 1911;
  var m = ('0' + (date.getMonth() + 1)).slice(-2);
  return y + '/' + m;
}
function prevRocMonth() {
  var d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return rocMonth(d);
}
// "115/06" <-> input[type=month] "2026-06"
function rocToIso(roc) {
  var p = roc.split('/');
  return (parseInt(p[0], 10) + 1911) + '-' + p[1];
}
function isoToRoc(iso) {
  var p = iso.split('-');
  return (parseInt(p[0], 10) - 1911) + '/' + p[1];
}
