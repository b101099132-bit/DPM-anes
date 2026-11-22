// 護理師排班引擎（移植自 AI Studio「護理排班 AI 助手 PRO」SchedulerEngine，改用紙本班表代號）
// 純函式、無 DOM，供 nurse-admin.html 使用；node 也可直接載入測試
//
// 代號：平日白班序號 1~11（人多時續排 12、13…）、加班線 A／B／8"-4"(8半)、小夜 3-11、大夜 23-7、
//       週六假日白班 1（主值）／2、週日與平日國定假日白班 8-4、假日二線 OFF#、休假 OFF
// 流水線：手動/要休 > 夜班組（小夜一天＋隔天大夜，之後強制休）> 假日白班 > 假日二線 > 平日白班／加班線／補休
// 輪序：夜班組、假日二線、平日①② 由下往上；假日白班（週六、週日、平日國定假日）、加班線 由上往下
(function (root) {
  var E = '3-11', N = '23-7', OFF = 'OFF', H2 = 'OFF#', HD = '8-4', HALF = '8"-4"';
  var OT_LINES = ['A', 'B', HALF];
  var ROT_KEYS = {   // 輪序代號 → 方向
    night: 'desc', sat: 'asc', sun: 'asc', hol: 'asc', h2: 'desc', ot: 'asc', d1: 'desc', d2: 'desc'
  };
  var ROT_LABEL = { night: '夜班組（3-11＋23-7）', sat: '週六白班 1／2', sun: '週日白班 8-4', hol: '平日國定假日 8-4',
    h2: '假日二線 OFF#', ot: '加班線 A／B／8半', d1: '平日白班 1', d2: '平日白班 2' };
  var SKIP_KEYS = ['夜班', '假日白班', '假日二線', '加班線', '平日①②'];

  function isWork(v) { return !!v && v !== OFF && v !== '休'; }   // OFF# 依原系統算上班（假日二線不連七）
  function isWhiteNum(v) { return /^\d+$/.test(String(v)); }

  function create(o) {
    var Y = o.Y, M = o.M, DIM = new Date(Y, M, 0).getDate(), PDIM = new Date(Y, M - 1, 0).getDate();
    var holSet = {};
    (o.holidays || []).forEach(function (d) { holSet[d] = true; });
    function dow(d) { return new Date(Y, M - 1, d).getDay(); }
    function isHol(d) { var w = dow(d); return w === 0 || w === 6 || !!holSet[d]; }
    var ROT = o.rot.slice();          // 進輪序的護理師（依名單順序）
    var G = {};                      // 本月班表
    Object.keys(o.grid).forEach(function (n) { G[n] = o.grid[n].slice(0, 31); while (G[n].length < 31) G[n].push(''); });
    ROT.forEach(function (n) { if (!G[n]) G[n] = Array.from({ length: 31 }, function () { return ''; }); });
    var P = o.prevGrid || {};
    var skip = o.skip || {};
    var wishes = o.wishes || {};
    var noWishes = o.noWishes || {};   // 不加班許願：該日不排加班線（A／B／8半）
    function cell(n, d) {
      if (d >= 1 && d <= DIM) return G[n][d - 1] || '';
      if (d < 1) { var pr = P[n]; return pr ? String(pr[PDIM + d - 1] || '') : ''; }
      return '';
    }
    function skips(n, key) { return (skip[n] || []).indexOf(key) >= 0; }
    function holWhite(d, v) { return isHol(d) && (v === '1' || v === '2' || v === HD); }

    // ---- 指標（以「下一位」姓名延續；找不到就從名單底／頂開始）----
    var ptr = {};
    Object.keys(ROT_KEYS).forEach(function (k) {
      var s = (o.starts || {})[k], i = ROT.indexOf(s);
      ptr[k] = i >= 0 ? i : (ROT_KEYS[k] === 'desc' ? ROT.length - 1 : 0);
    });

    function streakPast(n, d) {
      var c = 0;
      for (var i = d - 1; i >= d - 7; i--) { if (isWork(cell(n, i))) c++; else break; }
      return c;
    }
    function wouldExceed(n, d, shift) {
      if (!isWork(shift)) return false;
      var fut = 0;
      if (shift === E) fut = 1;
      else for (var j = d + 1; j <= DIM; j++) { if (isWork(G[n][j - 1])) fut++; else break; }
      return streakPast(n, d) + 1 + fut > 6;
    }
    function skipKeyOf(d, shift) {
      if (shift === E || shift === N) return '夜班';
      if (shift === H2) return '假日二線';
      if (OT_LINES.indexOf(shift) >= 0 && !isHol(d)) return '加班線';
      if (isHol(d) && (shift === '1' || shift === '2' || shift === HD)) return '假日白班';
      if (!isHol(d) && (shift === '1' || shift === '2')) return '平日①②';
      return null;
    }

    function canWork(n, d, shift) {
      var cur = G[n][d - 1];
      if (cur) return cur === shift;
      if ((shift === H2 || shift === HD) && !isHol(d)) return false;
      var sk = skipKeyOf(d, shift);
      if (sk && skips(n, sk)) return false;
      if (sk === '加班線' && (noWishes[n] || []).indexOf(d) >= 0) return false;
      if (wouldExceed(n, d, shift)) return false;
      var y = cell(n, d - 1);
      if (y === E && shift !== N) return false;
      if (y === N && shift !== OFF) return false;
      if (d < DIM) {
        var t = G[n][d];
        if (shift === E && t && t !== N) return false;
        if (shift === N && t && t !== OFF) return false;
        if (!isHol(d) && (shift === '1' || shift === '2') && t === E) return false;   // 小夜前一天不排平日 1、2
      }
      // 假日白班：前一天或隔天已有 1/2/8-4、3-11、23-7 或休假者跳過
      if (isHol(d) && (shift === '1' || shift === '2' || shift === HD)) {
        var bad = ['1', '2', HD, E, N, OFF];
        if (bad.indexOf(cell(n, d - 1)) >= 0) return false;
        if (d < DIM && bad.indexOf(G[n][d]) >= 0) return false;
      }
      // 平日 1、2 不緊鄰假日白班
      if (!isHol(d) && (shift === '1' || shift === '2')) {
        if (d > 1 && holWhite(d - 1, cell(n, d - 1))) return false;
        if (d < DIM && holWhite(d + 1, G[n][d])) return false;
      }
      // 假日二線：隔天是假日且已排白班或小夜 → 跳過
      if (shift === H2 && d < DIM && isHol(d + 1)) {
        var tm = G[n][d];
        if (tm === HD || tm === '1' || tm === '2' || isWhiteNum(tm) || tm === E) return false;
      }
      return true;
    }

    function pick(key, d, shift, filter) {
      var len = ROT.length, dir = ROT_KEYS[key], cur = ptr[key];
      for (var i = 0; i < len; i++) {
        var idx = dir === 'asc' ? (cur + i) % len : (cur - i + len * 2) % len;
        var n = ROT[idx];
        if (filter && !filter(n)) continue;
        if (canWork(n, d, shift)) {
          G[n][d - 1] = shift;
          ptr[key] =dir === 'asc' ? (idx + 1) % len : (idx - 1 + len) % len;
          return n;
        }
      }
      return null;
    }
    function holder(d, shift) {
      for (var i = 0; i < ROT.length; i++) if (G[ROT[i]][d - 1] === shift) return ROT[i];
      return null;
    }
    function advanceFrom(key, n) {   // 手動已排者 → 指標移到他的下一位
      var i = ROT.indexOf(n); if (i < 0) return;
      ptr[key] = ROT_KEYS[key] === 'asc' ? (i + 1) % ROT.length : (i - 1 + ROT.length) % ROT.length;
    }
    function count(n, pred) { var c = 0; for (var d = 1; d <= DIM; d++) if (pred(G[n][d - 1], d)) c++; return c; }

    var warn = [];

    function generate() {
      // 0. 固定人員（不進輪序）：固定白班＝平日 8-4、假日 OFF；POR＝平日 8-4／8"-4" 每週交替、假日 OFF
      var por = (o.fixed || []).filter(function (f) { return f.cat === 'POR'; }).map(function (f) { return f.name; });
      (o.fixed || []).forEach(function (f) {
        if (!G[f.name]) G[f.name] = Array.from({ length: 31 }, function () { return ''; });
        for (var d = 1; d <= DIM; d++) {
          if (G[f.name][d - 1]) continue;
          if (isHol(d)) { G[f.name][d - 1] = OFF; continue; }
          if (f.cat === 'POR') {
            var wk = Math.floor((d + new Date(Y, M - 1, 1).getDay() + 6) / 7);   // 本月第幾週
            G[f.name][d - 1] = ((wk + por.indexOf(f.name)) % 2 === 0) ? HD : HALF;
          } else {
            G[f.name][d - 1] = HD;
          }
        }
      });

      // 1. 夜班組：昨天小夜 → 今天大夜；每天 1 小夜、1 大夜；大夜隔天強制休
      for (var d = 1; d <= DIM; d++) {
        ROT.forEach(function (n) { if (cell(n, d - 1) === E && !G[n][d - 1]) G[n][d - 1] = N; });
        var hN = holder(d, N);
        if (!hN) { if (!pick('night', d, N)) warn.push(d + '日 排不到大夜'); }
        var hE = holder(d, E);
        if (hE) advanceFrom('night', hE);
        else if (!pick('night', d, E)) warn.push(d + '日 排不到小夜');
        ROT.forEach(function (n) { if (cell(n, d - 1) === N && !G[n][d - 1]) G[n][d - 1] = OFF; });
      }
      // 月底小夜者的隔天（下月 1 日）大夜由下個月接續；本月最後一天大夜者下月 1 日休

      // 2. 假日白班：週六 1、2；週日 8-4；平日國定假日 8-4（三組輪序各自獨立，由上往下）
      for (var d2 = 1; d2 <= DIM; d2++) {
        if (!isHol(d2)) continue;
        var w = dow(d2), key = w === 6 ? 'sat' : (w === 0 ? 'sun' : 'hol');
        var shifts = w === 6 ? ['1', '2'] : [HD];
        shifts.forEach(function (s) {
          var h = holder(d2, s);
          if (h) { advanceFrom(key, h); return; }
          if (!pick(key, d2, s)) warn.push(d2 + '日 排不到假日白班 ' + s);
        });
      }
      // 3. 假日二線（由下往上）
      for (var d3 = 1; d3 <= DIM; d3++) {
        if (!isHol(d3)) continue;
        var h2 = holder(d3, H2);
        if (h2) { advanceFrom('h2', h2); continue; }
        if (!pick('h2', d3, H2)) warn.push(d3 + '日 排不到假日二線');
      }
      // 4. 假日其餘人員休
      for (var d4 = 1; d4 <= DIM; d4++) {
        if (!isHol(d4)) continue;
        ROT.forEach(function (n) { if (!G[n][d4 - 1]) G[n][d4 - 1] = OFF; });
      }

      // 5. 平日：加班線（許願優先）→ 1、2 → 補休 → 3~11（序號平均）
      var need = 0;
      for (var dd = 1; dd <= DIM; dd++) if (isHol(dd)) need++;   // 應休天數＝本月假日數
      var numCnt = {};
      ROT.forEach(function (n) { numCnt[n] = {}; });
      for (var d5 = 1; d5 <= DIM; d5++) {
        if (isHol(d5)) continue;
        OT_LINES.forEach(function (s) {
          var h = holder(d5, s);
          if (h) { advanceFrom('ot', h); return; }
          var wish = ROT.filter(function (n) { return (wishes[n] || []).indexOf(d5) >= 0 && canWork(n, d5, s); });
          if (wish.length) {
            wish.sort(function (a, b) { return count(a, function (v) { return OT_LINES.indexOf(v) >= 0; }) - count(b, function (v) { return OT_LINES.indexOf(v) >= 0; }); });
            G[wish[0]][d5 - 1] = s;
            return;
          }
          if (!pick('ot', d5, s, function (n) { return count(n, function (v) { return v === s; }) < 2; }) &&
              !pick('ot', d5, s)) warn.push(d5 + '日 排不到加班線 ' + s);
        });
        ['1', '2'].forEach(function (s, i) {
          var key = i === 0 ? 'd1' : 'd2';
          var h = holder(d5, s);
          if (h) { advanceFrom(key, h); return; }
          if (!pick(key, d5, s)) warn.push(d5 + '日 排不到白班 ' + s);
        });
        // 剩下的人：連上快七天者必休；人多於序號 3~11 時，休假天數最不足者先補休
        var rest = ROT.filter(function (n) { return !G[n][d5 - 1]; });
        var able = rest.filter(function (n) { return canWork(n, d5, '3'); });
        rest.forEach(function (n) { if (able.indexOf(n) < 0) G[n][d5 - 1] = OFF; });
        var extra = able.length - 9;
        if (extra > 0) {
          var def = able.map(function (n) {
            return { n: n, lack: need - count(n, function (v) { return v === OFF; }), run: streakPast(n, d5) };
          }).filter(function (x) { return x.lack > 0; })
            .sort(function (a, b) { return (b.lack - a.lack) || (b.run - a.run); });
          def.slice(0, extra).forEach(function (x) { G[x.n][d5 - 1] = OFF; });
          able = able.filter(function (n) { return !G[n][d5 - 1]; });
        }
        var used = {};
        ROT.forEach(function (n) { var v = G[n][d5 - 1]; if (isWhiteNum(v)) used[v] = true; });
        var num = 3;
        while (able.length) {
          while (used[String(num)]) num++;
          var s5 = String(num);
          able.sort(function (a, b) {
            return ((numCnt[a][s5] || 0) - (numCnt[b][s5] || 0)) ||
              (count(a, function (v) { return isWhiteNum(v); }) - count(b, function (v) { return isWhiteNum(v); })) ||
              (ROT.indexOf(a) - ROT.indexOf(b));
          });
          var who = able.shift();
          G[who][d5 - 1] = s5;
          numCnt[who][s5] = (numCnt[who][s5] || 0) + 1;
          used[s5] = true;
        }
        for (var k = 3; k <= 11; k++) if (!used[String(k)]) warn.push(d5 + '日 白班 ' + k + ' 無人');
      }
      // 6. 其餘空格 → OFF
      ROT.forEach(function (n) { for (var d6 = 1; d6 <= DIM; d6++) if (!G[n][d6 - 1]) G[n][d6 - 1] = OFF; });
      return { grid: G, warn: warn };
    }

    return { generate: generate, canWork: canWork, isHol: isHol, DIM: DIM };
  }

  // 由一個月的班表推算「下一位」（跨月延續用）：找本月最後一次排到的人，取其下一位
  function nextStarts(o) {
    var Y = o.Y, M = o.M, DIM = new Date(Y, M, 0).getDate(), ROT = o.rot, G = o.grid || {};
    var holSet = {};
    (o.holidays || []).forEach(function (d) { holSet[d] = true; });
    function dow(d) { return new Date(Y, M - 1, d).getDay(); }
    function isHol(d) { var w = dow(d); return w === 0 || w === 6 || !!holSet[d]; }
    function lastWho(test, shifts) {
      for (var d = DIM; d >= 1; d--) {
        if (!test(d)) continue;
        for (var s = 0; s < shifts.length; s++) {
          for (var i = 0; i < ROT.length; i++) {
            var row = G[ROT[i]];
            if (row && String(row[d - 1] || '') === shifts[s]) return ROT[i];
          }
        }
      }
      return null;
    }
    function nxt(key, n) {
      if (!n) return (o.carry || {})[key] || '';
      var i = ROT.indexOf(n), L = ROT.length;
      return ROT[ROT_KEYS[key] === 'asc' ? (i + 1) % L : (i - 1 + L) % L];
    }
    var wd = function (d) { return !isHol(d); };
    return {
      night: nxt('night', lastWho(function () { return true; }, [E])),
      sat: nxt('sat', lastWho(function (d) { return dow(d) === 6; }, ['2', '1'])),
      sun: nxt('sun', lastWho(function (d) { return dow(d) === 0; }, [HD])),
      hol: nxt('hol', lastWho(function (d) { return holSet[d] && dow(d) !== 0 && dow(d) !== 6; }, [HD])),
      h2: nxt('h2', lastWho(isHol, [H2])),
      ot: nxt('ot', lastWho(wd, [HALF, 'B', 'A'])),
      d1: nxt('d1', lastWho(wd, ['1'])),
      d2: nxt('d2', lastWho(wd, ['2']))
    };
  }

  var api = { create: create, nextStarts: nextStarts, ROT_KEYS: ROT_KEYS, ROT_LABEL: ROT_LABEL, SKIP_KEYS: SKIP_KEYS,
    isWork: isWork, OT_LINES: OT_LINES };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.NurseEngine = api;
})(this);
