/**
 * ===================================================================
 * SKグループ 営業会議システム - 統合スプレッドシート版GASコード
 * ===================================================================
 * 統合スプレッドシートID: 1pvCvTXBPX28-DgzGmRQMTESUkFcBS_yfk_SWQmIcYgY
 *
 * 【高速化のポイント】
 * 旧版：8部署×openById() = 8回のネットワーク通信
 * 本版：openById() 1回 → getSheetByName() で各シートを取得
 *       → 処理速度が大幅に向上（目標：全部署10秒以内）
 *
 * 【シート構成（統合スプレッドシート内）】
 * 実績_地域インフラ共創部1課 / 実績_地域インフラ共創部2課
 * 実績_感動デザイン課_機密書類 / 実績_感動デザイン課_新規案件
 * 実績_トータルメンテナンス課 / 実績_バース仙台港
 * 実績_バース仙台岩切 / 実績_バース仙台扇町
 * 人事_（全8部署）
 * ===================================================================
 */

const SPREADSHEET_ID = "1pvCvTXBPX28-DgzGmRQMTESUkFcBS_yfk_SWQmIcYgY";

const DEPT_CONFIG = {
  "地域インフラ共創部1課": {
    perfSheet: "実績_地域インフラ共創部1課",
    hrSheet:   "人事_地域インフラ共創部1課",
    hrUnitMode: true, // 人事シートC列に「部署」（ユニット）列を追加したため
    hrUnitOptions: ["ユニット1", "ユニット2", "ユニット3"],
    extractor: "extractChiiki1_"
  },
  "地域インフラ共創部2課": {
    perfSheet: "実績_地域インフラ共創部2課",
    hrSheet:   "人事_地域インフラ共創部2課",
    hrUnitMode: true, // 人事シートC列に「部署」（ユニット）列を追加したため
    hrUnitOptions: ["ユニット4", "ユニット5"],
    extractor: "extractChiiki2_"
  },
  "感動デザイン課": {
    perfSheet: "実績_感動デザイン課_機密書類",
    hrSheet:   "人事_感動デザイン課",
    hrUnitMode: false,
    extractor: "extractKando_"
  },
  "総合クリエイト課": {
    perfSheet: null,
    hrSheet:   "人事_総合クリエイト課",
    hrUnitMode: false,
    extractor: null
  },
  "トータルメンテナンス課": {
    perfSheet: "実績_トータルメンテナンス課",
    hrSheet:   "人事_トータルメンテナンス課",
    hrUnitMode: false,
    extractor: "extractTotalMente_"
  },
  "Re\"バース仙台港": {
    perfSheet: "実績_バース仙台港",
    hrSheet:   "人事_バース仙台港",
    hrUnitMode: false,
    extractor: "extractMinato_"
  },
  "Re\"バース仙台岩切": {
    perfSheet: "実績_バース仙台岩切",
    hrSheet:   "人事_バース仙台岩切",
    hrUnitMode: false,
    extractor: "extractIwakiri_"
  },
  "Re\"バース仙台扇町": {
    perfSheet: "実績_バース仙台扇町",
    hrSheet:   "人事_バース仙台扇町",
    hrUnitMode: false,
    extractor: "extractOugimachi_"
  },
  "KAIZEN室": {
    perfSheet: null, // 実績シートは無く、人事のみ
    hrSheet:   "人事_KAIZEN室",
    hrUnitMode: false,
    extractor: null
  }
};

// 各部署の主要指標（サマリー集計用）
const DEPT_MAIN_METRIC = {
  "地域インフラ共創部1課":  { metric: "粗利益", unit: "千円" },
  "地域インフラ共創部2課":  { metric: "数量",   unit: "t"    },
  "感動デザイン課":         { metric: "数量",   unit: "t"    },
  "総合クリエイト課":       { metric: null,     unit: null   },
  "トータルメンテナンス課": { metric: null,     unit: null   },
  "Re\"バース仙台港":       { metric: "数量",   unit: "t"    },
  "Re\"バース仙台岩切":     { metric: "数量",   unit: "t"    },
  "Re\"バース仙台扇町":     { metric: "数量",   unit: "t"    },
};

const MONTH_LABELS = ["4月","5月","6月","7月","8月","9月","10月","11月","12月","1月","2月","3月"];
const ROWS_PER_MONTH = 10;
const HR_HEADER_ROW = 4;
const CACHE_EXPIRE_SEC = 3600;

// 定期バックアップ：保持日数（これより古いバックアップは自動削除）
const BACKUP_RETENTION_DAYS = 31;

// エラー通知：宛先とクールダウン（同一エラーでの連続通知を防ぐための最短間隔・分）
const ERROR_NOTIFY_EMAIL = "k-kasuya@kk-saikoh.co.jp";
const ERROR_NOTIFY_COOLDOWN_MINUTES = 60;

// ============================================================
// 年度切替の仕組み：FY_STARTはコードに直接書かず、スクリプトプロパティで管理する。
// 未設定時は2026をデフォルトとする（初回セットアップ不要のための保険）。
// これにより、来年度以降は「メニューから年度を切り替える」だけでよく、
// コードの再デプロイが不要になる。
// ============================================================
var _fyStartCache = null;
function getFyStart_() {
  if (_fyStartCache === null) {
    const prop = PropertiesService.getScriptProperties().getProperty("FY_START");
    _fyStartCache = prop ? parseInt(prop, 10) : 2026;
  }
  return _fyStartCache;
}

// 指定した年度開始年(fy)の「YYYY-MM」を4月始まりで12ヶ月分生成
function getFiscalYearMonths_(fy) {
  const months = [];
  for (var m = 4; m <= 12; m++) months.push(fy + "-" + ("0" + m).slice(-2));
  for (var m = 1; m <= 3; m++)  months.push((fy + 1) + "-" + ("0" + m).slice(-2));
  return months;
}

// ============================================================
// スプレッドシートを1回だけ開くキャッシュ（実行単位で使いまわす）
// ============================================================
let _ss = null;
function getSpreadsheet_() {
  if (!_ss) _ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  return _ss;
}

function getSheetData_(sheetName) {
  const ws = getSpreadsheet_().getSheetByName(sheetName);
  if (!ws) return null;
  const lastRow = ws.getLastRow();
  const lastCol = ws.getLastColumn();
  if (lastRow < 1 || lastCol < 1) return [];
  return ws.getRange(1, 1, lastRow, lastCol).getValues();
}

// ============================================================
// キャッシュユーティリティ
// ============================================================
function cacheGet_(key) {
  try {
    const cache = CacheService.getScriptCache();
    const chunks = [];
    for (var i = 0; i < 20; i++) {
      const chunk = cache.get(key + '_' + i);
      if (!chunk) break;
      chunks.push(chunk);
    }
    if (chunks.length === 0) return null;
    return JSON.parse(chunks.join(''));
  } catch(e) { return null; }
}

function cachePut_(key, data, ttlSeconds) {
  try {
    const cache = CacheService.getScriptCache();
    const json = JSON.stringify(data);
    const CHUNK_SIZE = 90000;
    const obj = {};
    for (var i = 0; i * CHUNK_SIZE < json.length; i++) {
      obj[key + '_' + i] = json.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
    }
    cache.putAll(obj, ttlSeconds || CACHE_EXPIRE_SEC);
  } catch(e) { Logger.log('cacheエラー: ' + e.toString()); }
}

// 分割キャッシュ(cachePut_で書いたキー)をまとめて削除する
function cacheRemove_(key) {
  const cache = CacheService.getScriptCache();
  const keys = [];
  for (var i = 0; i < 20; i++) keys.push(key + '_' + i);
  cache.removeAll(keys);
}

// ============================================================
// 【Step3追加】読み取りキャッシュのTTL設定(秒)
// 更新頻度・リアルタイム性を踏まえて設定(詳細はCACHE_RULES設計を参照)
// ============================================================
const CACHE_TTL = {
  trend_flat:       300,   // 部署別実績の月次推移
  fiscal_years:      21600, // 年度選択プルダウン(年1回更新)
  infographic:       1800,  // 月次インフォグラフィック(月1回手動更新)
  shinki_anken:      600,   // 感動デザイン課:新規案件
  actions:           120,   // 次回アクション(会議前後の更新に配慮し短め)
  totalmente_years:  3600,  // トータルメンテナンス課:事故件数全年度比較
  juchu_rows:        300,   // 受注案件_入力(ranking/monthlyで共有)
  kengaku_all:       900,   // 施設見学
  ukakezan_all:      300    // 売掛残物件
};

// ============================================================
// 【Step3追加】汎用キャッシュラッパー
// キャッシュミス時のみLockServiceで排他制御しつつシートを読み、
// 同時アクセスによるキャッシュの二重生成(cache stampede)を防ぐ。
// ============================================================
function getOrFetchWithCache_(cacheKey, ttlSeconds, fetchFn) {
  const cached = cacheGet_(cacheKey);
  if (cached !== null) return cached;

  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    // ロック取得までの間に他の実行がキャッシュを作っていないか再確認
    const cachedAfterLock = cacheGet_(cacheKey);
    if (cachedAfterLock !== null) return cachedAfterLock;

    const data = fetchFn();
    cachePut_(cacheKey, data, ttlSeconds);
    return data;
  } finally {
    lock.releaseLock();
  }
}

// ============================================================
// 【追加機能】エラー発生時のメール通知
// ============================================================
// warmUpCache・scheduledBackup_ など「インストーラブルトリガー」で動く処理の失敗は、
// Apps Scriptエディタの「トリガー」画面側の通知設定（各トリガーの鉛筆アイコン→通知設定）で
// 無料でカバーできるため、ここでは対象にしない。
// ここでは、トリガー経由ではない doGet（Webアプリとしてのアクセス時のエラー）のみを対象とする。
// 同じエラーで通知が連続しないよう、ERROR_NOTIFY_COOLDOWN_MINUTES分に1回までに制限する。
// ============================================================
function notifyError_(context, err) {
  try {
    const props = PropertiesService.getScriptProperties();
    const lastNotifiedStr = props.getProperty("LAST_ERROR_NOTIFIED_AT");
    const now = new Date();
    if (lastNotifiedStr) {
      const diffMinutes = (now - new Date(lastNotifiedStr)) / 60000;
      if (diffMinutes < ERROR_NOTIFY_COOLDOWN_MINUTES) {
        Logger.log("エラー通知はクールダウン中のためスキップ: " + context);
        return;
      }
    }
    const timestamp = Utilities.formatDate(now, Session.getScriptTimeZone(), "yyyy-MM-dd HH:mm:ss");
    const subject = "【SKGダッシュボード】エラー通知：" + context;
    const body =
      "以下のエラーが発生しました。\n\n" +
      "発生箇所：" + context + "\n" +
      "発生時刻：" + timestamp + "\n" +
      "エラー内容：" + (err && err.toString ? err.toString() : String(err)) + "\n\n" +
      "※このメールは" + ERROR_NOTIFY_COOLDOWN_MINUTES + "分に1回までの通知制限がかかっています。\n" +
      "同じエラーが続いている場合、次のメールは制限時間経過後に送信されます。";
    MailApp.sendEmail(ERROR_NOTIFY_EMAIL, subject, body);
    props.setProperty("LAST_ERROR_NOTIFIED_AT", now.toISOString());
  } catch (mailErr) {
    Logger.log("エラー通知メールの送信に失敗: " + mailErr.toString());
  }
}

function monthToYm_(label, fy) {
  const n = label.replace(/[０-９]/g, function(c){
    return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
  });
  const m = parseInt(n.replace("月",""), 10);
  if (isNaN(m)) return null;
  return ((m >= 4) ? fy : fy + 1) + "-" + ("0" + m).slice(-2);
}

// ============================================================
// doGet：JSONP対応 + キャッシュ対応
// ============================================================
function doGet(e) {
  const callback = (e&&e.parameter&&e.parameter.callback) ? e.parameter.callback : null;
  const type     = (e&&e.parameter&&e.parameter.type)     ? e.parameter.type     : "all";
  const page     = (e&&e.parameter&&e.parameter.page)     ? e.parameter.page     : "";
  const ym       = (e&&e.parameter&&e.parameter.ym)       ? e.parameter.ym       : "";
  const dept     = (e&&e.parameter&&e.parameter.dept)     ? e.parameter.dept     : "";
  const fy       = (e&&e.parameter&&e.parameter.fy)       ? e.parameter.fy       : "";
  const key      = (e&&e.parameter&&e.parameter.key)      ? e.parameter.key      : "";

  // 簡易アクセスキーチェック（URLを知らない第三者からのアクセスを防ぐための軽い抑止。
  // index.htmlはソースが公開されているため、本格的な認証ではないことに注意）
  const requiredKey = PropertiesService.getScriptProperties().getProperty("DASHBOARD_ACCESS_KEY");
  if (requiredKey && key !== requiredKey) {
    const errJson = JSON.stringify({ status: "error", message: "アクセスキーが正しくありません" });
    if (callback) {
      return ContentService.createTextOutput(callback + "(" + errJson + ")")
        .setMimeType(ContentService.MimeType.JAVASCRIPT);
    }
    return ContentService.createTextOutput(errJson)
      .setMimeType(ContentService.MimeType.JSON);
  }

  let result = {};
  try {
    if (type === "months") {
      result = { months: getAvailableMonths_() };
    } else if (type === "all_flat") {
      // フラットログから全部署・指定月のデータを取得（メインエンドポイント・超高速）
      result = getFromFlatLog_(ym);
    } else if (type === "trend_flat") {
      // フラットログ（または年度が違えばアーカイブ）から指定部署の全月推移を取得
      result = dept ? getTrendFromFlatLog_(dept, fy) : { trend: [], dept: "" };
    } else if (type === "fiscal_years") {
      // 部署別実績の年度選択プルダウン用：選択可能な年度の一覧
      result = getAvailableFiscalYears_();
    } else if (type === "reports") {
      // 月次AIレポート（手動生成・貼り付け方式）を取得
      result = getReportsForYm_(ym);
    } else if (type === "infographic") {
      // 月次インフォグラフィック（グループ全体・画像＋文章）を取得
      result = getInfographicForYm_(ym);
    } else if (type === "shinki_anken") {
      // 感動デザイン課：新規案件情報
      result = getShinkiAnkenList_();
    } else if (type === "actions") {
      // 次回までのアクション一覧
      result = getActionsList_();
    } else if (type === "totalmente_years") {
      // トータルメンテナンス課：事故件数の全年度比較
      result = getTotalMenteAllYears_();
    } else if (type === "juchu_ranking") {
      // 受注案件：年度累計・担当者別ランキング
      result = getJuchuRanking_();
    } else if (type === "juchu_monthly") {
      // 受注案件：指定月の大型案件情報・主な受注案件
      result = getJuchuMonthly_(ym);
    } else if (type === "kengaku_all") {
      // 施設見学：全件データ（画面側で月ごとに絞り込む）
      result = getKengakuAll_();
    } else if (type === "ukakezan_all") {
      // 売掛残物件：全件データ（画面側で未解決/月ごとに絞り込む）
      result = getUkakezanAll_();
    } else if (type === "fuel_all") {
      // 燃料：全件データ（画面側で区分・品目ごとに絞り込む）
      result = getFuelAll_();
    } else {
      // 旧方式（フォールバック・フラットログがまだない場合用）
      result = {
        perf: (type==="perf"||type==="all") ? getAllPerf_(ym) : [],
        hr:   (type==="hr"  ||type==="all") ? getAllHr_(ym)   : [],
        ym: ym
      };
    }
    result.status = "ok";
  } catch(err) {
    result = { status: "error", message: err.toString() };
    notifyError_("doGet（type=" + type + "）", err);
  }

  const json = JSON.stringify(result);
  if (callback) {
    return ContentService.createTextOutput(callback + "(" + json + ")")
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json)
    .setMimeType(ContentService.MimeType.JSON);
}

// ============================================================
// 指定部署の全12ヶ月データをキャッシュから一括返却（グラフ用）
// ============================================================
function getDeptAllMonths_(dept, nocache) {
  const ALL_MONTHS = getFiscalYearMonths_(getFyStart_());
  const allPerf = [];

  ALL_MONTHS.forEach(function(ym) {
    const cacheKey = 'v2_dept_' + dept + '_' + ym + '_all';

    if (nocache) {
      for (var i = 0; i < 20; i++) CacheService.getScriptCache().remove(cacheKey + '_' + i);
    }

    const cached = nocache ? null : cacheGet_(cacheKey);
    if (cached) {
      (cached.perf || []).forEach(function(r){ allPerf.push(r); });
    } else {
      // キャッシュなし：スプレッドシートから読んで保存
      try {
        const data = getPerfAndHrForDept_(dept, ym, 'all');
        (data.perf || []).forEach(function(r){ allPerf.push(r); });
        data.status = 'ok';
        cachePut_(cacheKey, data);
      } catch(err) {
        Logger.log('月次取得エラー[' + dept + '/' + ym + ']: ' + err.toString());
      }
    }
  });

  return { perf: allPerf, dept: dept };
}

// ============================================================
// 指定部署の全月推移データを返す（グラフ用）
// ============================================================
function getTrendForDept_(dept, nocache) {
  const cacheKey = 'v2_trend_' + dept;
  if (!nocache) {
    const cached = cacheGet_(cacheKey);
    if (cached) return cached;
  } else {
    for (var i = 0; i < 20; i++) CacheService.getScriptCache().remove(cacheKey + '_' + i);
  }

  const cfg = DEPT_CONFIG[dept];
  if (!cfg) return { trend: [], dept: dept };

  var records = [];
  if (cfg.extractor && cfg.perfSheet) {
    try {
      const data = getSheetData_(cfg.perfSheet);
      if (data) records = eval(cfg.extractor + "(data, dept, null)");
    } catch(err) { Logger.log("trend取得エラー[" + dept + "]: " + err.toString()); }
  }

  const result = { trend: records, dept: dept };
  cachePut_(cacheKey, result);
  return result;
}

// ============================================================
// 全部署キャッシュを1回で一括返却（高速版・Webアプリの主要エンドポイント）
// ============================================================
function getAllCached_(ym, nocache) {
  const allPerf = [], allHr = [];
  var anyCacheMiss = false;

  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const cacheKey = 'v2_dept_' + dept + '_' + ym + '_all';

    // nocache=trueの場合は既存キャッシュを削除して必ず再取得
    if (nocache) {
      for (var i = 0; i < 20; i++) {
        CacheService.getScriptCache().remove(cacheKey + '_' + i);
      }
    }

    const cached = nocache ? null : cacheGet_(cacheKey);
    if (cached) {
      (cached.perf || []).forEach(function(r){ allPerf.push(r); });
      (cached.hr   || []).forEach(function(r){ allHr.push(r);   });
    } else {
      // キャッシュなし：その場でスプレッドシートを読んでキャッシュに保存
      anyCacheMiss = true;
      try {
        const data = getPerfAndHrForDept_(dept, ym, 'all');
        (data.perf || []).forEach(function(r){ allPerf.push(r); });
        (data.hr   || []).forEach(function(r){ allHr.push(r);   });
        data.status = 'ok';
        cachePut_(cacheKey, data);
      } catch(err) {
        Logger.log('キャッシュミス取得エラー[' + dept + ']: ' + err.toString());
      }
    }
  });

  return { perf: allPerf, hr: allHr, ym: ym, anyCacheMiss: anyCacheMiss };
}

// ============================================================
// 1部署分のデータを返す
// ============================================================
function getPerfAndHrForDept_(dept, ym, type) {
  const cfg = DEPT_CONFIG[dept];
  if (!cfg) return { perf: [], hr: [], dept: dept, ym: ym };
  const perf = [], hr = [];

  if ((type==="perf"||type==="all") && cfg.extractor && cfg.perfSheet) {
    try {
      const data = getSheetData_(cfg.perfSheet);
      if (data) {
        eval(cfg.extractor + "(data, dept, ym)").forEach(function(r){ perf.push(r); });
      }
    } catch(err) { Logger.log("実績エラー[" + dept + "]: " + err.toString()); }
  }

  if ((type==="hr"||type==="all") && cfg.hrSheet) {
    try {
      const data = getSheetData_(cfg.hrSheet);
      if (data) {
        extractHr_(data, dept, cfg.hrUnitMode, ym, cfg.hrSheet).forEach(function(r){ hr.push(r); });
      }
    } catch(err) { Logger.log("人事エラー[" + dept + "]: " + err.toString()); }
  }

  return { perf: perf, hr: hr, dept: dept, ym: ym };
}

// ============================================================
// 全部署まとめて取得（warmUpCache用）
// ============================================================
function getAllPerf_(filterYm) {
  const all = [];
  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const cfg = DEPT_CONFIG[dept];
    if (!cfg.extractor || !cfg.perfSheet) return;
    try {
      const data = getSheetData_(cfg.perfSheet);
      if (data) eval(cfg.extractor + "(data, dept, filterYm)").forEach(function(r){ all.push(r); });
    } catch(err) { Logger.log("実績エラー[" + dept + "]: " + err.toString()); }
  });
  return all;
}

function getAllHr_(filterYm) {
  const all = [];
  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const cfg = DEPT_CONFIG[dept];
    if (!cfg.hrSheet) return;
    try {
      const data = getSheetData_(cfg.hrSheet);
      if (data) extractHr_(data, dept, cfg.hrUnitMode, filterYm, cfg.hrSheet).forEach(function(r){ all.push(r); });
    } catch(err) { Logger.log("人事エラー[" + dept + "]: " + err.toString()); }
  });
  return all;
}

// ============================================================
// 年月一覧（FY_STARTスクリプトプロパティに連動。年度切替メニューで自動更新される）
// ============================================================
function getAvailableMonths_() {
  return getFiscalYearMonths_(getFyStart_());
}

// ============================================================
// 人事データ抽出
// ============================================================
// Google DriveのURL（どの形式でも）から、ファイルIDだけを抽出する
function extractDriveImageId_(url) {
  if (!url) return "";
  const match = String(url).match(/[-\w]{25,}/);
  return match ? match[0] : "";
}

// Google DriveのURL（どの形式でも）から、<img>タグで直接表示できる
// 画像URLを組み立てる（閲覧リンク・共有リンク・IDそのものの貼り付け、いずれにも対応）
// ※このURLが機能するには、ドライブ側で「リンクを知っている全員」に共有設定する必要がある
function extractDriveImageUrl_(url) {
  const id = extractDriveImageId_(url);
  return id ? "https://lh3.googleusercontent.com/d/" + id : "";
}

function extractHr_(data, dept, unitMode, filterYm, sheetName) {
  const records = [];

  // 「内容」欄のリッチテキスト（太字・文字色）を取得する。
  // 取得できない場合（sheetName未指定・エラー時など）は通常表示にフォールバックする。
  const numDataRows = data.length - HR_HEADER_ROW;
  let richRuns = null;
  if (sheetName && numDataRows > 0) {
    try {
      const ws = getSpreadsheet_().getSheetByName(sheetName);
      if (ws) {
        const contentSheetCol = unitMode ? 5 : 4; // 部署列ありならE列、無ければD列
        const richValues = ws.getRange(HR_HEADER_ROW + 1, contentSheetCol, numDataRows, 1).getRichTextValues();
        richRuns = richValues.map(function(rowArr) {
          const rtv = rowArr[0];
          if (!rtv) return null;
          const runs = rtv.getRuns();
          if (!runs || !runs.length) return null;
          return runs.map(function(run) {
            const style = run.getTextStyle();
            const colorObj = style.getForegroundColorObject();
            let color = null;
            if (colorObj && colorObj.getColorType() === SpreadsheetApp.ColorType.RGB) {
              color = colorObj.asRgbColor().asHexString();
            }
            return { text: run.getText(), bold: !!style.isBold(), color: color };
          });
        });
      }
    } catch (e) {
      richRuns = null; // 取得に失敗しても通常表示にフォールバックする
    }
  }

  for (var r = HR_HEADER_ROW; r < data.length; r++) {
    const row = data[r];
    const contentRuns = richRuns ? richRuns[r - HR_HEADER_ROW] : null;
    if (unitMode) {
      const ym=row[0], cat=row[1], unit=row[2], person=row[3], content=row[4], status=row[5];
      if (!ym && !cat && !content) continue;
      if (filterYm && ym !== filterYm) continue;
      records.push({ym:ym, dept:dept, unit:unit||"", category:cat||"",
                    targetPerson:person||"", content:content||"", status:status||"",
                    contentRuns: contentRuns,
                    photo1: extractDriveImageUrl_(row[6]),
                    photo2: extractDriveImageUrl_(row[7]),
                    photo3: extractDriveImageUrl_(row[8])});
    } else {
      const ym=row[0], cat=row[1], person=row[2], content=row[3], status=row[4];
      if (!ym && !cat && !content) continue;
      if (filterYm && ym !== filterYm) continue;
      records.push({ym:ym, dept:dept, unit:"", category:cat||"",
                    targetPerson:person||"", content:content||"", status:status||"",
                    contentRuns: contentRuns,
                    photo1: extractDriveImageUrl_(row[5]),
                    photo2: extractDriveImageUrl_(row[6]),
                    photo3: extractDriveImageUrl_(row[7])});
    }
  }
  return records;
}

// ============================================================
// 共通ヘルパー：「分析」欄（自由記述）の取得
// ============================================================
// 指定行（0-indexed）のA列が「分析」であれば、B列のテキストを返す。
// どの部署の抽出関数からも呼び出せる汎用関数（今後、他部署に「分析」欄が
// 追加された場合も、この関数を呼ぶだけで対応できる）。
// ============================================================
function extractAnalysisNote_(data, row) {
  if (row < 0 || row >= data.length) return null;
  const label = String((data[row] || [])[0] || "").trim();
  if (label !== "分析") return null;
  const text = data[row][1];
  return text ? String(text) : null;
}

// ============================================================
// 共通ヘルパー：月×品目ブロック抽出
// ============================================================
function extractMonthlyBlocks_(data, dept, filterYm, blocks, unit) {
  const records = [];
  MONTH_LABELS.forEach(function(label, i) {
    const col = i + 1;
    const ym = monthToYm_(label, getFyStart_());
    if (filterYm && ym !== filterYm) return;
    blocks.forEach(function(def) {
      const target   = def.targetR ? data[def.targetR-1][col] : null;
      const actual   = data[def.actualR-1][col];
      const prevYear = def.prevR   ? data[def.prevR-1][col]   : null;
      if ((target===""||target===null) && (actual===""||actual===null)) return;
      records.push({
        ym:ym, dept:dept, category:def.cat, item:def.item,
        metric:"数量", target:target, actual:actual,
        prevYear:(typeof prevYear==="number") ? prevYear : null,
        unit:unit,
        achieveRate:(target&&actual&&typeof target==="number"&&typeof actual==="number")
          ? Math.round(actual/target*1000)/10 : null
      });
    });
  });
  return records;
}

// ============================================================
// 各部署の実績抽出関数
// ============================================================
function extractOugimachi_(data, dept, filterYm) {
  return extractMonthlyBlocks_(data, dept, filterYm, [
    {item:"段ボール",    cat:"古紙",       targetR:3,    actualR:4,  prevR:7  },
    {item:"新聞",        cat:"古紙",       targetR:11,   actualR:12, prevR:15 },
    {item:"雑誌",        cat:"古紙",       targetR:19,   actualR:20, prevR:23 },
    {item:"チラシ",      cat:"古紙",       targetR:27,   actualR:28, prevR:31 },
    {item:"その他古紙",  cat:"古紙",       targetR:35,   actualR:36, prevR:39 },
    {item:"古紙合計",    cat:"古紙",       targetR:43,   actualR:44, prevR:47 },
    {item:"代納",        cat:"古紙",       targetR:null, actualR:51, prevR:52 },
    {item:"廃棄物",      cat:"産業廃棄物", targetR:56,   actualR:57, prevR:60 },
  ], "t");
}

function extractIwakiri_(data, dept, filterYm) {
  const recs1 = extractMonthlyBlocks_(data, dept, filterYm, [
    {item:"段ボール",     cat:"古紙", targetR:3,  actualR:4,  prevR:7 },
  ], "t");
  const recs2 = extractMonthlyBlocks_(data, dept, filterYm, [
    {item:"ペットボトル", cat:"古紙", targetR:13, actualR:14, prevR:17},
  ], "kg");
  return recs1.concat(recs2);
}

function extractMinato_(data, dept, filterYm) {
  // 実際のシートは各設備が8行間隔で並んでいる（以前は7行間隔という誤った前提で
  // 行番号を計算しており、一軸破砕機以外の4設備は違う行を読んでいた）
  const ITEMS = [
    {item:"一軸破砕機",      targetR:3,  prevR:4,  actualR:5,  rateR:8  },
    {item:"機密破砕機",      targetR:11, prevR:12, actualR:13, rateR:16 },
    {item:"発泡溶融機",      targetR:19, prevR:20, actualR:21, rateR:24 },
    {item:"缶リサイクル施設",targetR:27, prevR:28, actualR:29, rateR:32 },
    {item:"廃棄物",          targetR:35, prevR:36, actualR:37, rateR:40 },
  ];
  const records = [];
  MONTH_LABELS.forEach(function(label, i) {
    const col = i + 1;
    const ym = monthToYm_(label, getFyStart_());
    if (filterYm && ym !== filterYm) return;
    ITEMS.forEach(function(def) {
      const target   = data[def.targetR-1][col];
      const actual   = data[def.actualR-1][col];
      const prevYear = data[def.prevR-1][col];
      const rate     = data[def.rateR-1][col];
      if (actual !== "" && actual !== 0) {
        records.push({ym:ym, dept:dept, category:"設備稼働", item:def.item,
                      metric:"数量",
                      target: (typeof target === "number") ? Math.round(target / 1000 * 10) / 10 : null,
                      actual: (typeof actual === "number") ? Math.round(actual / 1000 * 10) / 10 : actual,
                      prevYear: (typeof prevYear === "number") ? Math.round(prevYear / 1000 * 10) / 10 : (prevYear || null),
                      unit:"t"});
      }
      if (typeof rate === "number" && rate > 0) {
        records.push({ym:ym, dept:dept, category:"設備稼働", item:def.item,
                      metric:"稼働率", target:null, actual:Math.round(rate*1000)/10,
                      prevYear:null, unit:"%"});
      }
    });
  });
  return records;
}

// ============================================================
// トータルメンテナンス課：車輌事故・労働災害事故の件数を抽出
// シート「実績_トータルメンテナンス課」
// 車輌事故発生状況：4行目=令和8年（当年度）、5行目=令和7年（前年度）
// 労働災害事故（怪我）：15行目=令和8年（当年度）、16行目=令和7年（前年度）
// ※目標の概念が無いため target は常に null
// ============================================================
// 「・車輌事故発生状況」「・労働災害事故」等の見出し文字列を探し、
// その2行下＝当年度、3行下＝前年度　として位置を特定する。
// 来年度以降、見出しの直後に新しい年度の行を1行挿入するだけで、
// コード（行番号）の修正が一切不要になる。
function findTotalMenteBlocks_(data) {
  const sectionMarkers = [
    { marker: "車輌事故",     category: "車輌事故"     },
    { marker: "労働災害事故", category: "労働災害事故" },
  ];
  const blocks = [];
  sectionMarkers.forEach(function(sec) {
    for (var r = 0; r < data.length; r++) {
      const cellA = String((data[r] || [])[0] || "");
      if (cellA.indexOf(sec.marker) > -1) {
        const headerRow = r + 2; // 見出し行の次（1-indexed）＝「年度／月」の行
        blocks.push({ category: sec.category, actualR: headerRow + 1, prevR: headerRow + 2, dataStartRow: headerRow + 1 });
        break;
      }
    }
  });
  return blocks;
}

function extractTotalMente_(data, dept, filterYm) {
  const blocks = findTotalMenteBlocks_(data);
  const records = [];
  MONTH_LABELS.forEach(function(label, i) {
    // 実際のシートは4月がC列（0-indexedで2）から始まるため、+2で補正する
    // （以前は+1としており、全ての月が1列ズレて読み取られていた）
    const col = i + 2;
    const ym = monthToYm_(label, getFyStart_());
    if (filterYm && ym !== filterYm) return;
    blocks.forEach(function(def) {
      const actual   = (data[def.actualR-1] || [])[col];
      const prevYear = (data[def.prevR-1]   || [])[col];
      // 0件（事故なし）は意味のあるデータなので、空欄の場合のみスキップする
      if (actual !== "" && actual !== null && actual !== undefined) {
        records.push({ym:ym, dept:dept, category:"労務管理", item:def.category,
                      metric:"件数", target:null,
                      actual: (typeof actual === "number") ? actual : 0,
                      prevYear: (typeof prevYear === "number") ? prevYear : null,
                      unit:"件"});
      }
    });
  });
  return records;
}

// ============================================================
// トータルメンテナンス課：事故件数の全年度比較（フラットログとは別ルート）
// シート「実績_トータルメンテナンス課」を直接読み取り、
// 年度ごとの月次件数をそのまま返す（グラフの複数年比較表示用）
// ※見出し文字列を検索して開始位置を特定し、以降は空行が出るまで読む方式のため、
//   来年度以降に年度の行が増えても、この関数の修正は不要。
// ============================================================
function getTotalMenteAllYears_() {
  return getOrFetchWithCache_('totalmente_years_v1', CACHE_TTL.totalmente_years, function() {
    const ss = getSpreadsheet_();
    const ws = ss.getSheetByName("実績_トータルメンテナンス課");
    if (!ws) return { categories: [] };

    const data = ws.getDataRange().getValues();
    const blocks = findTotalMenteBlocks_(data);

    const categories = blocks.map(function(block) {
      const years = [];
      for (var r = block.dataStartRow; r <= data.length; r++) {
        const row = data[r - 1];
        if (!row || !row[0]) break; // 空行に達したら終了
        const monthly = [];
        // 実際のシートは4月がC列（0-indexedで2）から始まるため、2〜13を読む
        // （以前は1〜12としており、全ての月が1列ズレて読み取られていた）
        for (var c = 2; c <= 13; c++) {
          const v = row[c];
          monthly.push(typeof v === "number" ? v : null);
        }
        years.push({ year: String(row[0]), monthly: monthly });
      }
      return { category: block.category, years: years };
    });

    return { categories: categories };
  });
}

function extractKando_(data, dept, filterYm) {
  const recs1 = extractMonthlyBlocks_(data, dept, filterYm, [
    {item:"キング", cat:"機密書類", targetR:3, actualR:4, prevR:7},
  ], "t");
  const recs2 = extractMonthlyBlocks_(data, dept, filterYm, [
    {item:"BOX", cat:"機密書類", targetR:11, actualR:12, prevR:15},
  ], "箱");
  return recs1.concat(recs2);
}

function extractChiiki1_(data, dept, filterYm) {
  const records = [];
  function parseBlock(headerRow, dataStartRow, catFn) {
    const items = [];
    let c = 3;
    while (c < (data[headerRow-1] || []).length) {
      const name = data[headerRow-1][c];
      if (!name) break;
      items.push({name:String(name), col:c});
      c += 3;
    }
    let r = dataStartRow - 1;
    for (var i = 0; i < 12; i++) {
      if (r >= data.length) break;
      const labelRaw = data[r][0];
      if (!labelRaw) break;
      const label = String(labelRaw).replace("合計","").trim();
      const ym = monthToYm_(label, getFyStart_());
      if (!ym) { r += 3; continue; }
      if (filterYm && ym !== filterYm) { r += 3; continue; }
      ["売上","処分料","粗利益"].forEach(function(metric, mi) {
        items.forEach(function(item) {
          if (r+mi >= data.length) return;
          const target = data[r+mi][item.col];
          const actual = data[r+mi][item.col+1];
          if (target===""&&actual==="") return;
          records.push({ym:ym, dept:dept, category:catFn(item.name), item:item.name,
                        metric:metric, target:target||0, actual:actual||0, prevYear:null, unit:"千円"});
        });
      });
      r += 3;
    }
  }
  parseBlock(1, 3, function(){ return "産業廃棄物"; });
  parseBlock(44, 46, function(n){
    return (n==="空缶"||n.indexOf("一廃")===0) ? "一般廃棄物" : "産業廃棄物";
  });
  return records;
}

function extractChiiki2_(data, dept, filterYm) {
  const records = [];

  // 各グループの取得列定義（実際のシート構造に合わせて確定）
  // ・主要3品その他：段ボール/新聞/雑誌/その他古紙/全体合計（全体合計＝残り11項目の合計というチェック用数値）
  // ・まるひろ資源回収：段ボール/新聞/雑誌/牛乳パック
  // ・RPS：段ボール/新聞/雑誌（合計列は無く、他グループと同じくC・F・I列から始まる）
  const GROUPS = [
    {
      offset: 0, // 月ラベル行から0行下がヘッダー、+2が数値行
      items: ["段ボール","新聞","雑誌","その他古紙","全体合計"],
      cols: [{t:2,a:3},{t:5,a:6},{t:8,a:9},{t:11,a:12},{t:15,a:16}],
    },
    {
      offset: 3,
      items: ["段ボール","新聞","雑誌","牛乳パック"],
      cols: [{t:2,a:3},{t:5,a:6},{t:8,a:9},{t:11,a:12}],
    },
    {
      offset: 6,
      items: ["段ボール","新聞","雑誌"],
      cols: [{t:2,a:3},{t:5,a:6},{t:8,a:9}],
    },
  ];

  for (var r = 0; r < data.length; r++) {
    const labelRaw = data[r][0];
    if (!labelRaw) continue;
    const ym = monthToYm_(String(labelRaw), getFyStart_());
    if (!ym) continue;
    if (filterYm && ym !== filterYm) continue;

    GROUPS.forEach(function(g) {
      const headerRow = r + g.offset;
      const dataRow   = r + g.offset + 2;
      if (dataRow >= data.length) return;
      const subgroup = data[headerRow][1];
      if (!subgroup) return;

      g.cols.forEach(function(cols, i) {
        const target = data[dataRow][cols.t];
        const actual = data[dataRow][cols.a];
        if (target === "" && actual === "") return;
        if (typeof target !== "number" && typeof actual !== "number") return;
        // 「全体合計」は残り11項目の合計というチェック用の数値のため、
        // どのグループの内訳かを示す接頭辞は付けず、単独の項目として扱う
        const itemName = (g.items[i] === "全体合計")
          ? "全体合計"
          : String(subgroup) + "_" + g.items[i];
        records.push({
          ym: ym, dept: dept, category: "古紙",
          item: itemName,
          metric: "数量",
          target: (typeof target === "number") ? Math.round(target / 1000 * 10) / 10 : 0,
          actual: (typeof actual === "number") ? Math.round(actual / 1000 * 10) / 10 : 0,
          prevYear: null, unit: "t"
        });
      });
    });

    // 「分析」欄（3グループの数値行の直後＝offset+9）を取得
    const note = extractAnalysisNote_(data, r + 9);
    if (note) {
      records.push({
        ym: ym, dept: dept, category: "分析", item: "分析",
        metric: null, target: null, actual: null, prevYear: null, unit: null,
        note: note
      });
    }

    r += 9;
  }
  return records;
}

// ============================================================
// 指定部署の全12ヶ月キャッシュを1回で返す（グラフ用・高速）
// ============================================================
function getTrendFromCache_(dept) {
  const FY_ALL = getFiscalYearMonths_(getFyStart_());
  const allRecs = [];
  FY_ALL.forEach(function(ym) {
    const cacheKey = 'v2_dept_' + dept + '_' + ym + '_all';
    const cached = cacheGet_(cacheKey);
    if (cached && cached.perf) {
      cached.perf.forEach(function(r){ allRecs.push(r); });
    } else {
      try {
        const data = getPerfAndHrForDept_(dept, ym, 'all');
        if (data.perf) data.perf.forEach(function(r){ allRecs.push(r); });
        data.status = 'ok';
        cachePut_(cacheKey, data);
      } catch(e) { Logger.log('trend取得エラー['+dept+'/'+ym+']: '+e.toString()); }
    }
  });
  return { trend: allRecs, dept: dept };
}

// ============================================================
// キャッシュウォームアップ（毎時トリガー推奨）
// ============================================================
function warmUpCache() {
  const ALL_MONTHS = getFiscalYearMonths_(getFyStart_());
  const start = new Date();

  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    ALL_MONTHS.forEach(function(ym) {
      try {
        const cacheKey = 'v2_dept_' + dept + '_' + ym + '_all';
        const existing = cacheGet_(cacheKey);
        if (existing) {
          Logger.log('スキップ（キャッシュ済み）: ' + dept + ' / ' + ym);
          return; // 既存キャッシュは再作成しない
        }
        const data = getPerfAndHrForDept_(dept, ym, 'all');
        data.status = 'ok';
        data._cached = false;
        cachePut_(cacheKey, data);
        Logger.log('キャッシュ更新: ' + dept + ' / ' + ym);
      } catch(err) {
        Logger.log('エラー[' + dept + '/' + ym + ']: ' + err.toString());
      }
    });
  });

  Logger.log('ウォームアップ完了: ' + ((new Date()-start)/1000) + '秒');
}

// ============================================================
// 【追加機能】DEPT_CONFIGに追加したが、まだ実体のないシートを自動作成する
// ============================================================
// ・見出し（タイトル・注意書き・列見出し）を既存の人事シートと同じスタイルで作成
// ・作成後、既存の仕組み（addMonthlyHrRowsAll / setupHrDropdowns）をそのまま再利用して
//   当月分の入力行・プルダウンまで自動で設定する
// ・今後、新しい部署を追加する際にも繰り返し使える
// ============================================================
function createMissingHrSheets_() {
  const ss = getSpreadsheet_();
  let createdCount = 0;

  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const cfg = DEPT_CONFIG[dept];
    if (!cfg.hrSheet) return;
    if (ss.getSheetByName(cfg.hrSheet)) return; // 既存シートはスキップ

    const ws = ss.insertSheet(cfg.hrSheet);
    createdCount++;

    ws.getRange(1, 1).setValue(dept + "　報告").setFontWeight("bold").setFontSize(12);
    ws.getRange(2, 1).setValue(
      "カテゴリ・対応状況は黄色セルのプルダウンから選択してください。毎月1日に新しい月の入力行が自動追加されます。"
    ).setFontColor("#CC0000");

    const headerCols = cfg.hrUnitMode
      ? ["年月\n(YYYY-MM)", "カテゴリ", "部署", "対象者名", "内容", "対応状況", "写真1", "写真2", "写真3"]
      : ["年月\n(YYYY-MM)", "カテゴリ", "対象者名", "内容", "対応状況", "写真1", "写真2", "写真3"];

    const headerRange = ws.getRange(HR_HEADER_ROW, 1, 1, headerCols.length);
    headerRange.setValues([headerCols]);
    headerRange.setBackground("#1F4E78").setFontColor("#FFFFFF").setFontWeight("bold")
      .setHorizontalAlignment("center").setVerticalAlignment("middle").setWrap(true);

    ws.setFrozenRows(HR_HEADER_ROW);
    ws.setColumnWidth(1, 90);
    ws.setColumnWidth(2, 130);
    for (var c = 3; c <= headerCols.length; c++) {
      ws.setColumnWidth(c, 140);
    }

    Logger.log("新規人事シート作成: " + cfg.hrSheet);
  });

  if (createdCount > 0) {
    addMonthlyHrRowsAll(); // 当月分の入力行を追加（既存ロジックを再利用）
    setupHrDropdowns();    // カテゴリ・対応状況（・部署）のプルダウンを設定
  }

  return createdCount;
}

function createMissingHrSheetsUI_() {
  const ui = SpreadsheetApp.getUi();
  try {
    const n = createMissingHrSheets_();
    if (n > 0) {
      ui.alert(
        "✅ 新しい人事シートを" + n + "件作成しました。\n\n" +
        "見出し・当月分の入力行・プルダウンまで自動で設定済みです。"
      );
    } else {
      ui.alert("追加が必要な人事シートは見つかりませんでした（すでにすべて作成済みです）。");
    }
  } catch (err) {
    ui.alert("❌ シート作成に失敗しました。\n\n" + err.toString());
  }
}

// ============================================================
// 毎月1日：全部署の人事シートに新しい月の行を追加
// ============================================================
function addMonthlyHrRowsAll() {
  const now = new Date();
  const ym = now.getFullYear() + "-" + ("0"+(now.getMonth()+1)).slice(-2);
  const ss = getSpreadsheet_();

  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const cfg = DEPT_CONFIG[dept];
    if (!cfg.hrSheet) return;
    try {
      const ws = ss.getSheetByName(cfg.hrSheet);
      if (!ws) return;
      const lastRow = ws.getLastRow();
      if (lastRow > HR_HEADER_ROW) {
        const existing = ws.getRange(HR_HEADER_ROW+1, 1, lastRow-HR_HEADER_ROW, 1).getValues();
        if (existing.some(function(r){ return r[0]===ym; })) return;
      }
      const insertRow = ws.getLastRow() + 1;
      for (var i = 0; i < ROWS_PER_MONTH; i++) {
        const r = insertRow + i;
        ws.getRange(r,1).setValue(ym).setBackground("#EBF3FB");
        ws.getRange(r,2).setBackground("#FFF2CC");
        const lastCol = cfg.hrUnitMode ? 6 : 5;
        ws.getRange(r,lastCol).setBackground("#FFF2CC");
        for (var c=1; c<=lastCol; c++) {
          ws.getRange(r,c).setBorder(true,true,true,true,null,null,
            "#BFBFBF", SpreadsheetApp.BorderStyle.SOLID);
        }
      }
      Logger.log(dept + " [" + ym + "] " + ROWS_PER_MONTH + "行追加");

      // スクリプトによる行追加はonEditが発火しないため、ここで明示的にフラットログを同期する
      updateFlatLogForDept_(dept);
      clearDeptCache_(dept);
    } catch(err) {
      Logger.log("月次追加エラー[" + dept + "]: " + err.toString());
    }
  });
}

// ============================================================
// テスト用（手動実行で動作確認）
// ============================================================
function testApi() {
  const start = new Date();
  const result = getAllPerf_("2026-05");
  const elapsed = (new Date()-start)/1000;
  Logger.log("実績件数: " + result.length + " / 処理時間: " + elapsed + "秒");
}

function testSingleDept() {
  const start = new Date();
  const result = getPerfAndHrForDept_("Re\"バース仙台扇町", "2026-05", "all");
  const elapsed = (new Date()-start)/1000;
  Logger.log("扇町 perf:" + result.perf.length + " hr:" + result.hr.length + " / " + elapsed + "秒");
}

function testChiiki2() {
  const data = getSheetData_("実績_地域インフラ共創部2課");
  if (!data) { Logger.log("シートが見つかりません"); return; }
  Logger.log("総行数: " + data.length);
  Logger.log("行2 A列: " + data[1][0] + " B列: " + data[1][1]);
  Logger.log("行4 C列(目標): " + data[3][2] + " D列(実績): " + data[3][3]);
  const recs = extractChiiki2_(data, "地域インフラ共創部2課", "2026-04");
  Logger.log("抽出件数: " + recs.length);
  if (recs.length > 0) {
    recs.forEach(function(r){ Logger.log(r.item + " 目標:" + r.target + " 実績:" + r.actual); });
  }
}

// ============================================================
// 全部署の人事シートにドロップダウンを一括設定
// ============================================================
function setupHrDropdowns() {
  const ss = getSpreadsheet_();
  const CATEGORY_OPTIONS = ["頑張り・好事例","問題行動・クレーム","安全衛生","入退社・異動","その他"];
  const STATUS_OPTIONS   = ["完了","対応中","未対応"];

  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const cfg = DEPT_CONFIG[dept];
    if (!cfg.hrSheet) return;
    try {
      const ws = ss.getSheetByName(cfg.hrSheet);
      if (!ws) { Logger.log("シートなし: " + cfg.hrSheet); return; }

      const lastRow = Math.max(ws.getLastRow(), HR_HEADER_ROW + 1);
      const dataRows = lastRow - HR_HEADER_ROW;
      if (dataRows <= 0) return;

      // 列番号（1-indexed）
      // unitMode（該当部署がある場合）: A=年月 B=カテゴリ C=ユニット D=対象者 E=内容 F=対応状況
      // 通常:                              A=年月 B=カテゴリ C=対象者 D=内容 E=対応状況
      const categoryCol = 2; // B列（共通）
      const statusCol   = cfg.hrUnitMode ? 6 : 5;

      const startRow = HR_HEADER_ROW + 1;

      // カテゴリのドロップダウン
      const catRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(CATEGORY_OPTIONS, true)
        .setAllowInvalid(false)
        .build();
      ws.getRange(startRow, categoryCol, dataRows, 1).setDataValidation(catRule);

      // 部署（ユニット）のドロップダウン（部署ごとに選択肢が異なるため hrUnitOptions を使う）
      if (cfg.hrUnitMode && cfg.hrUnitOptions && cfg.hrUnitOptions.length) {
        const unitRule = SpreadsheetApp.newDataValidation()
          .requireValueInList(cfg.hrUnitOptions, true)
          .setAllowInvalid(false)
          .build();
        ws.getRange(startRow, 3, dataRows, 1).setDataValidation(unitRule); // C列
      }

      // 対応状況のドロップダウン
      const statusRule = SpreadsheetApp.newDataValidation()
        .requireValueInList(STATUS_OPTIONS, true)
        .setAllowInvalid(false)
        .build();
      ws.getRange(startRow, statusCol, dataRows, 1).setDataValidation(statusRule);

      Logger.log("設定完了: " + cfg.hrSheet);
    } catch(err) {
      Logger.log("エラー[" + cfg.hrSheet + "]: " + err.toString());
    }
  });
  Logger.log("全部署のドロップダウン設定が完了しました");
}

function resetAllHrCache() {
  const cache = CacheService.getScriptCache();
  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    getFiscalYearMonths_(getFyStart_()).forEach(function(ym) {
      for (var i = 0; i < 10; i++) {
        cache.remove("v2_dept_" + dept + "_" + ym + "_all_" + i);
      }
    });
  });
  Logger.log("全人事キャッシュをリセットしました");
}

function testCacheCheck() {
  const cache = CacheService.getScriptCache();
  const key = "v2_dept_感動デザイン課_2026-05_all_0";
  const val = cache.get(key);
  Logger.log("キャッシュ存在: " + (val ? "あり（" + val.length + "文字）" : "なし"));
}

function testHr() {
  const data = getSheetData_("人事_感動デザイン課");
  if (!data) { Logger.log("シートなし"); return; }
  Logger.log("総行数: " + data.length);
  Logger.log("行5 A列: [" + data[4][0] + "] 型: " + typeof data[4][0]);
  for (var r = 4; r < data.length; r++) {
    if (data[r][3]) Logger.log("行" + (r+1) + " content: " + data[r][3] + " ym: " + data[r][0]);
  }
  const recs = extractHr_(data, "感動デザイン課", false, "2026-05", "人事_感動デザイン課");
  Logger.log("抽出件数: " + recs.length);
}

// ===================================================================
// フラットログ方式（高速化のための裏側自動フラット化）
// ===================================================================
const FLAT_PERF_SHEET = "フラットログ_実績";
const FLAT_HR_SHEET   = "フラットログ_人事";
const FLAT_PERF_COLS  = ["dept","ym","category","item","metric","target","actual","unit","prevYear","note"];
const FLAT_HR_COLS    = ["dept","ym","unit_","category","targetPerson","content","status","photo1","photo2","photo3","contentRuns"];

// ============================================================
// onEditInstallable：シート編集を検知して該当部署だけフラットログを再生成
// ※スタンドアロンスクリプトのためシンプルトリガーは動作しない。
//   下記 setupEditTrigger() を一度手動実行してインストーラブル
//   トリガーとして登録する必要がある。
// ============================================================
// 実績・人事シート以外で、独自キャッシュを持つシート名 → 無効化すべきキャッシュキーの対応表
// (Step3でキャッシュを追加した際に、対象シートをここへ追加する)
function getOtherCacheSheetMap_() {
  const map = {};
  map[SHINKI_SHEET]   = ['shinki_v1'];
  map[ACTION_SHEET]   = ['actions_v1'];
  map[JUCHU_SHEET]    = ['juchu_rows_v1'];
  map[KENGAKU_SHEET]  = ['kengaku_v1'];
  map[UKAKEZAN_SHEET] = ['ukakezan_v1'];
  return map;
}

function onEditInstallable(e) {
  try {
    if (!e || !e.range) return;
    const sheetName = e.range.getSheet().getName();

    // フラットログシート自身の編集は無視（無限ループ防止）
    if (sheetName === FLAT_PERF_SHEET || sheetName === FLAT_HR_SHEET) return;

    // 実績・人事シート以外の、独自キャッシュを持つシートの編集を検知
    const otherCacheKeys = getOtherCacheSheetMap_()[sheetName];
    if (otherCacheKeys) {
      otherCacheKeys.forEach(cacheRemove_);
      return;
    }

    // 編集されたシートがどの部署のものか判定
    let targetDept = null;
    Object.keys(DEPT_CONFIG).forEach(function(dept) {
      const cfg = DEPT_CONFIG[dept];
      if (cfg.perfSheet === sheetName || cfg.hrSheet === sheetName) {
        targetDept = dept;
      }
    });
    if (!targetDept) return; // 関係ないシートなら何もしない

    updateFlatLogForDept_(targetDept);
    clearDeptCache_(targetDept);

    // トータルメンテナンス課の実績シート編集時は、全年度比較キャッシュも無効化する
    if (DEPT_CONFIG[targetDept].perfSheet === "実績_トータルメンテナンス課") {
      cacheRemove_('totalmente_years_v1');
    }
  } catch (err) {
    Logger.log("onEditInstallableエラー: " + err.toString());
  }
}

// ============================================================
// インストーラブルトリガーのセットアップ（初回のみ手動実行）
// ============================================================
function setupEditTrigger() {
  // 既存の同名トリガーを一旦削除（重複登録防止）
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onEditInstallable') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ScriptApp.newTrigger('onEditInstallable')
    .forSpreadsheet(ss)
    .onEdit()
    .create();

  Logger.log("編集トリガーを設定しました。以後、スプレッドシート編集で自動的にフラットログが更新されます。");
}

// ============================================================
// 指定部署のみ再パースしてフラットログを更新
// ============================================================
function updateFlatLogForDept_(dept) {
  const cfg = DEPT_CONFIG[dept];
  if (!cfg) return;

  var perfRecords = [];
  if (cfg.extractor && cfg.perfSheet) {
    const data = getSheetData_(cfg.perfSheet);
    if (data) perfRecords = eval(cfg.extractor + "(data, dept, null)"); // 全月分
  }

  var hrRecords = [];
  if (cfg.hrSheet) {
    const data = getSheetData_(cfg.hrSheet);
    if (data) hrRecords = extractHr_(data, dept, cfg.hrUnitMode, null, cfg.hrSheet); // 全月分
  }

  writeFlatLog_(FLAT_PERF_SHEET, FLAT_PERF_COLS, dept, perfRecords);
  writeFlatLog_(FLAT_HR_SHEET, FLAT_HR_COLS, dept, hrRecords.map(function(r){
    return { dept:r.dept, ym:r.ym, unit_:r.unit, category:r.category,
             targetPerson:r.targetPerson, content:r.content, status:r.status,
             photo1:r.photo1||"", photo2:r.photo2||"", photo3:r.photo3||"",
             contentRuns: r.contentRuns ? JSON.stringify(r.contentRuns) : "" };
  }));

  Logger.log("フラットログ更新: " + dept + "（実績" + perfRecords.length + "件・人事" + hrRecords.length + "件）");
}

// ============================================================
// 年月の値を必ず文字列(YYYY-MM)に正規化（Date型変換の防止・対策）
// ============================================================
function normalizeYm_(val) {
  if (val instanceof Date) {
    return val.getFullYear() + "-" + ("0"+(val.getMonth()+1)).slice(-2);
  }
  return String(val || "");
}

// ============================================================
// フラットログシートへの書き込み（該当部署の行だけ洗い替え）
// ============================================================
function writeFlatLog_(sheetName, columns, dept, records) {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(sheetName);
  if (!ws) {
    ws = ss.insertSheet(sheetName);
    ws.getRange(1, 1, 1, columns.length).setValues([columns]);
  }

  // ym列をテキスト形式に強制（自動で日付変換されるのを防ぐ）
  const ymColIndex = columns.indexOf("ym") + 1; // 1-indexed
  if (ymColIndex > 0) {
    ws.getRange(1, ymColIndex, Math.max(ws.getMaxRows(),1000), 1).setNumberFormat("@");
  }

  const lastRow = ws.getLastRow();
  var existingData = [];
  if (lastRow > 1) {
    existingData = ws.getRange(2, 1, lastRow - 1, columns.length).getValues();
  }

  // 該当部署以外の既存データを残す（ym正規化も同時に行う）
  const deptIdx = columns.indexOf("dept");
  const otherDeptRows = existingData.filter(function(row) {
    return row[deptIdx] !== dept;
  }).map(function(row) {
    if (ymColIndex > 0) row[ymColIndex-1] = normalizeYm_(row[ymColIndex-1]);
    return row;
  });

  // 新しいレコードを配列化（ymは文字列として明示的に書き込む）
  const newRows = records.map(function(r) {
    return columns.map(function(col) {
      var v = r[col];
      if (col === "ym") v = normalizeYm_(v);
      return (v === undefined || v === null) ? "" : v;
    });
  });

  const allRows = otherDeptRows.concat(newRows);

  ws.clearContents();
  ws.getRange(1, 1, 1, columns.length).setValues([columns]);
  if (ymColIndex > 0) {
    ws.getRange(1, ymColIndex, Math.max(ws.getMaxRows(),1000), 1).setNumberFormat("@");
  }
  if (allRows.length > 0) {
    ws.getRange(2, 1, allRows.length, columns.length).setValues(allRows);
  }

  // フラットログが更新されたので、getFromFlatLog_のキャッシュを無効化する
  // （5分待たずに、編集内容がすぐダッシュボードへ反映されるようにするため）
  if (sheetName === FLAT_PERF_SHEET || sheetName === FLAT_HR_SHEET) {
    invalidateFlatLogCache_();
  }
  // 実績データが更新されたので、その部署・当年度分のtrendキャッシュも無効化する
  if (sheetName === FLAT_PERF_SHEET) {
    cacheRemove_('trend_v1_' + dept + '_' + getFyStart_());
  }
}

// 当年度の全月分＋"all"のキャッシュキーをまとめて無効化する
function invalidateFlatLogCache_() {
  const months = getFiscalYearMonths_(getFyStart_());
  const keys = months.map(function(m) { return "flatlog_v1_" + m; });
  keys.push("flatlog_v1_all");
  CacheService.getScriptCache().removeAll(keys);
}

// ============================================================
// 全部署フラットログを一括再生成（初回セットアップ・手動実行用）
// ============================================================
function rebuildFlatLog() {
  const start = new Date();
  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    updateFlatLogForDept_(dept);
  });
  Logger.log("全部署フラットログ再生成完了: " + ((new Date()-start)/1000) + "秒");
}

// ============================================================
// フラットログから読み取り（Webアプリ用・超高速）
// ============================================================
function getFromFlatLog_(ym) {
  // 短時間のキャッシュ（5分）：同じ月への短時間の再アクセスを高速化する。
  // データはonEdit時にフラットログへ書き込まれる仕組みのため、
  // 最大5分程度の反映遅延は実運用上問題にならないと判断し、あえて即時無効化はしていない。
  const cache = CacheService.getScriptCache();
  const cacheKey = "flatlog_v1_" + (ym || "all");
  const cached = cache.get(cacheKey);
  if (cached) {
    try { return JSON.parse(cached); } catch (e) { /* パース失敗時は無視して読み直す */ }
  }

  const ss = getSpreadsheet_();
  const perfWs = ss.getSheetByName(FLAT_PERF_SHEET);
  const hrWs   = ss.getSheetByName(FLAT_HR_SHEET);

  const perfData = perfWs && perfWs.getLastRow() > 1
    ? perfWs.getRange(2, 1, perfWs.getLastRow()-1, FLAT_PERF_COLS.length).getValues() : [];
  const hrData = hrWs && hrWs.getLastRow() > 1
    ? hrWs.getRange(2, 1, hrWs.getLastRow()-1, FLAT_HR_COLS.length).getValues() : [];

  const perf = perfData
    .map(function(row){
      return { dept:row[0], ym:normalizeYm_(row[1]), category:row[2], item:row[3], metric:row[4],
               target:row[5], actual:row[6], unit:row[7], prevYear:row[8] || null };
    })
    .filter(function(r){ return !ym || r.ym === ym; })
    .filter(function(r){ return r.category !== "分析"; }); // 分析コメントは部署別実績タブでのみ扱うため除外

  const hr = hrData
    .map(function(row){
      let contentRuns = null;
      if (row[10]) {
        try { contentRuns = JSON.parse(row[10]); } catch (e) { contentRuns = null; }
      }
      return { dept:row[0], ym:normalizeYm_(row[1]), unit:row[2], category:row[3],
               targetPerson:row[4], content:row[5], status:row[6],
               photo1:row[7]||"", photo2:row[8]||"", photo3:row[9]||"",
               contentRuns: contentRuns };
    })
    .filter(function(r){ return !ym || r.ym === ym; });

  const result = { perf: perf, hr: hr, ym: ym };

  try {
    cache.put(cacheKey, JSON.stringify(result), 300); // 5分間キャッシュ
  } catch (e) {
    // サイズ超過等でキャッシュに失敗しても、通常のレスポンスは返す
  }

  return result;
}

// ============================================================
// フラットログから部署の全月推移を取得（グラフ用・超高速）
// ============================================================
// dept: 部署名 / fy: 年度（省略時は現在の年度）。
// 現在の年度が指定された場合は「フラットログ_実績」を、
// それ以外（過去年度）が指定された場合は「アーカイブ_実績_全年度」を読みに行く。
// アーカイブは複数年度分が混在しているため、該当年度の月だけに絞り込む。
function getTrendFromFlatLog_(dept, fy) {
  const currentFy = getFyStart_();
  const targetFy = fy ? Number(fy) : currentFy;
  const cacheKey = 'trend_v1_' + dept + '_' + targetFy;

  return getOrFetchWithCache_(cacheKey, CACHE_TTL.trend_flat, function() {
    const ss = getSpreadsheet_();
    const useArchive = targetFy !== currentFy;

    const ws = ss.getSheetByName(useArchive ? ARCHIVE_SHEET : FLAT_PERF_SHEET);
    const perfData = ws && ws.getLastRow() > 1
      ? ws.getRange(2, 1, ws.getLastRow()-1, FLAT_PERF_COLS.length).getValues() : [];

    const fyMonths = getFiscalYearMonths_(targetFy);

    const trend = perfData
      .filter(function(row){ return row[0] === dept; })
      .map(function(row){
        return { dept:row[0], ym:normalizeYm_(row[1]), category:row[2], item:row[3], metric:row[4],
                 target:row[5], actual:row[6], unit:row[7], prevYear:row[8] || null, note:row[9] || null };
      })
      .filter(function(r){ return fyMonths.indexOf(r.ym) > -1; });

    return { trend: trend, dept: dept, fy: targetFy };
  });
}

// ダッシュボードの年度選択プルダウン用：現在の年度＋アーカイブに存在する年度の一覧を返す
function getAvailableFiscalYears_() {
  return getOrFetchWithCache_('fiscalyears_v1', CACHE_TTL.fiscal_years, function() {
    const ss = getSpreadsheet_();
    const currentFy = getFyStart_();
    const years = {};
    years[currentFy] = true;

    const archiveWs = ss.getSheetByName(ARCHIVE_SHEET);
    if (archiveWs && archiveWs.getLastRow() > 1) {
      const ymIdx = FLAT_PERF_COLS.indexOf("ym");
      const data = archiveWs.getRange(2, ymIdx + 1, archiveWs.getLastRow() - 1, 1).getValues();
      data.forEach(function(row) {
        const ym = normalizeYm_(row[0]);
        if (!ym) return;
        const year  = Number(ym.slice(0, 4));
        const month = Number(ym.slice(5, 7));
        // 4月始まりの年度のため、1〜3月は前年度扱いにする
        const fy = month >= 4 ? year : year - 1;
        years[fy] = true;
      });
    }

    const list = Object.keys(years).map(Number).sort(function(a, b) { return b - a; });
    return { years: list, currentFy: currentFy };
  });
}

// ============================================================
// 部署のキャッシュをクリア（onEdit時に呼ばれる）
// ============================================================
function clearDeptCache_(dept) {
  const cache = CacheService.getScriptCache();
  const ALL_YM = getFiscalYearMonths_(getFyStart_());
  ALL_YM.forEach(function(ym) {
    for (var i = 0; i < 10; i++) {
      cache.remove('v2_dept_' + dept + '_' + ym + '_all_' + i);
    }
  });
}

function testGrossProfitApr() {
  const result = getTrendFromFlatLog_("地域インフラ共創部1課");
  const aprRecords = result.trend.filter(function(r){
    return r.ym === "2026-04" && r.metric === "粗利益";
  });
  Logger.log("2026-04の粗利益レコード数: " + aprRecords.length);
  let totalTarget = 0, totalActual = 0;
  aprRecords.forEach(function(r) {
    Logger.log(r.item + ": 目標=" + r.target + " 実績=" + r.actual);
    totalTarget += (typeof r.target === "number" ? r.target : 0);
    totalActual += (typeof r.actual === "number" ? r.actual : 0);
  });
  Logger.log("--- 合計 --- 目標:" + totalTarget + " 実績:" + totalActual);
}

function testAllDeptSummary() {
  const ym = "2026-05";
  const flatData = getFromFlatLog_(ym);

  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const deptRecs = flatData.perf.filter(function(r){ return r.dept === dept; });
    const mainDef = DEPT_MAIN_METRIC[dept] || { metric: "数量", unit: null };

    let totalTarget = 0, totalActual = 0, itemCount = 0;
    deptRecs.forEach(function(r) {
      const metricMatch = !mainDef.metric || r.metric === mainDef.metric;
      const unitMatch   = !mainDef.unit   || r.unit   === mainDef.unit;
      if (metricMatch && unitMatch) {
        if (typeof r.target === "number" && r.target > 0) totalTarget += r.target;
        if (typeof r.actual === "number" && r.actual > 0) totalActual += r.actual;
        itemCount++;
      }
    });
    const rate = totalTarget > 0 ? Math.round(totalActual/totalTarget*1000)/10 : null;
    Logger.log(dept + " [" + (mainDef.metric||"-") + "・" + (mainDef.unit||"-") + "] "
      + "目標=" + totalTarget + " 実績=" + totalActual
      + " 達成率=" + (rate!==null ? rate+"%" : "-") + " (品目数:" + itemCount + ")");
  });
}

// ===================================================================
// 【追加機能】月次AIレポート支援（無料・手動貼り付け方式）
// ===================================================================
// データ集計とプロンプト文の組み立ては自動、Claude.aiへの貼り付け・
// 回答取得は手動（無料）で行う。保存した回答はダッシュボードの
// 「AIレポート」タブに自動反映される。
//
// ※保存ステップはダイアログを使わず、シートのセルへの直接貼り付け＋
//   メニュークリックのみで完結する方式（安定性重視）。
//
// 【初回セットアップ】
// 1. setupOpenTrigger を一度手動実行
// 2. 統合スプレッドシートを開き直す
//    → メニューバーに「📝 AIレポート作成」が表示されればOK
// ===================================================================

const REPORT_SHEET = "月次AIレポート";
const REPORT_COLS  = ["dept", "ym", "generatedAt", "reportText"];
const DRAFT_SHEET  = "AIレポート下書き";

// 月次インフォグラフィック（グループ全体・画像＋文章）関連
const GROUP_REPORT_LABEL       = "全体（グループ）";
const INFOGRAPHIC_SHEET        = "月次インフォグラフィック";
const INFOGRAPHIC_COLS         = ["ym", "imageFileId", "reportText", "generatedAt"];
const INFOGRAPHIC_DRIVE_FOLDER = "SKグループ_月次インフォグラフィック";

// ============================================================
// 「AIレポート下書き」シートを取得（なければ作成）
// レイアウト：
//   B1 = 部署（ドロップダウン）
//   B2 = 対象年月（例: 2026-06）
//   B9 = Claude.aiの回答を貼り付ける欄
// ============================================================
function getOrCreateDraftSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(DRAFT_SHEET);
  if (!ws) {
    ws = ss.insertSheet(DRAFT_SHEET);
    ws.getRange("A1").setValue("部署");
    ws.getRange("A2").setValue("対象年月（例: 2026-06）");
    ws.getRange("A4").setValue(
      "使い方：①B1で部署を選択 → ②B2に年月を入力 → " +
      "③メニュー「①プロンプトを生成」でコピー → ④Claude.aiに貼り付けて回答を取得 → " +
      "⑤回答をB9セルに貼り付け → ⑥メニュー「②回答を保存」をクリック\n" +
      "※B1で「" + GROUP_REPORT_LABEL + "」を選んだ場合のみ、B10にインフォグラフィック画像のGoogleドライブ共有リンクも貼り付けられます（任意）。"
    );
    ws.getRange("A8").setValue("Claude.aiの回答をここ（B9）に貼り付けてください ▼");
    ws.getRange("A10").setValue("画像リンク（" + GROUP_REPORT_LABEL + "選択時のみ・任意）▼");

    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(Object.keys(DEPT_CONFIG).concat([GROUP_REPORT_LABEL]), true)
      .setAllowInvalid(false)
      .build();
    ws.getRange("B1").setDataValidation(rule);

    ws.setColumnWidth(1, 260);
    ws.setColumnWidth(2, 500);
    ws.setRowHeight(9, 300);
    ws.getRange("B9").setWrap(true).setVerticalAlignment("top");
  }
  return ws;
}

// ============================================================
// メニュー表示（スプレッドシートを開いたときに自動実行）
// ============================================================
function onOpenInstallable_(e) {
  const ui = SpreadsheetApp.getUi();

  ui.createMenu('📝 AIレポート作成')
    .addItem('① プロンプトを生成してコピー', 'showPromptDialog_')
    .addItem('② 回答を保存してダッシュボードに反映', 'saveReportFromSheet_')
    .addSeparator()
    .addItem('③ NotebookLM用CSVを出力（全部署・全期間）', 'exportFlatLogForNotebookLM_')
    .addSeparator()
    .addItem('④ シートの行構成をチェック（行削除・挿入の前後に実行推奨）', 'checkAllSheetLayoutsUI_')
    .addSeparator()
    .addItem('⑤ 年度を切り替える（毎年4月・新年度開始時に実行）', 'switchFiscalYear_')
    .addSeparator()
    .addItem('⑥ 今すぐバックアップを作成', 'backupSpreadsheetNowUI_')
    .addSeparator()
    .addItem('⑦ 「全体（グループ）」選択肢を下書きシートに追加（初回のみ実行）', 'addGroupOptionToDraftSheetValidation_')
    .addSeparator()
    .addItem('⑧ 定期バックアップ・キャッシュ自動更新を設定する（初回のみ実行）', 'setupMaintenanceTriggers_')
    .addSeparator()
    .addItem('⑨ 受注案件シートを作成する（初回のみ実行）', 'setupJuchuSheetUI_')
    .addSeparator()
    .addItem('⑩ 施設見学シートを作成する（初回のみ実行）', 'setupKengakuSheetUI_')
    .addSeparator()
    .addItem('⑪ 目次シートを作成する（初回のみ実行）', 'setupIndexSheetUI_')
    .addSeparator()
    .addItem('⑫ 燃料シートを作成する（初回のみ実行）', 'setupFuelSheetUI_')
    .addSeparator()
    .addItem('⑬ 新規部署の人事シートを作成する（DEPT_CONFIG追加後に実行）', 'createMissingHrSheetsUI_')
    .addSeparator()
    .addItem('⑭ 売掛残物件シートを作成する（初回のみ実行）', 'setupUkakezanSheetUI_')
    .addToUi();

  // 「📝 AIレポート作成」の右隣に、独立した新規メニューとして設置
  ui.createMenu('🏠 目次に戻る')
    .addItem('目次シートへ移動', 'goToIndexSheet_')
    .addToUi();
}

// ============================================================
// 【一回限りの移行用】既存の「AIレポート下書き」シートのB1に、
// 「全体（グループ）」を選択肢として追加する。
// getOrCreateDraftSheet_()のデータ検証は新規作成時にしか設定されないため、
// 既にシートが存在する場合はこの関数を一度だけ手動実行する必要がある。
// ============================================================
function addGroupOptionToDraftSheetValidation_() {
  const ws = getOrCreateDraftSheet_();
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(Object.keys(DEPT_CONFIG).concat([GROUP_REPORT_LABEL]), true)
    .setAllowInvalid(false)
    .build();
  ws.getRange("B1").setDataValidation(rule);
  ws.getRange("A10").setValue("画像リンク（" + GROUP_REPORT_LABEL + "選択時のみ・任意）▼");
  SpreadsheetApp.getUi().alert("✅「AIレポート下書き」シートのB1に「" + GROUP_REPORT_LABEL + "」を選択肢として追加し、B10（画像リンク欄）も用意しました。この操作は一度だけで大丈夫です。");
}

// ============================================================
// メニュー用インストーラブルトリガー登録（初回のみ手動実行）
// ============================================================
function setupOpenTrigger() {
  ScriptApp.getProjectTriggers().forEach(function(t) {
    if (t.getHandlerFunction() === 'onOpenInstallable_') {
      ScriptApp.deleteTrigger(t);
    }
  });

  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  ScriptApp.newTrigger('onOpenInstallable_')
    .forSpreadsheet(ss)
    .onOpen()
    .create();

  Logger.log("メニュー表示用のトリガーを設定しました。スプレッドシートを開き直すとメニューが表示されます。");
}

// ============================================================
// ①プロンプトを生成してダイアログ表示（コピー用・読み取り専用なので安定）
// ============================================================
function showPromptDialog_() {
  const ws = getOrCreateDraftSheet_();
  const dept = ws.getRange("B1").getValue();
  const ym   = normalizeYm_(ws.getRange("B2").getValue());

  if (!dept || !ym) {
    SpreadsheetApp.getUi().alert("「AIレポート下書き」シートのB1(部署)とB2(年月)を入力してから実行してください。");
    return;
  }

  // 「全体（グループ）」が選ばれている場合は、全部署をまとめたプロンプトを生成
  if (dept === GROUP_REPORT_LABEL) {
    const groupPrompt = buildGroupReportPromptForYm_(ym);
    if (!groupPrompt) {
      SpreadsheetApp.getUi().alert("指定した年月のデータが見つかりません。年月の表記（例: 2026-06）を確認してください。");
      return;
    }
    const escapedGroup = groupPrompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    const htmlGroup = HtmlService.createHtmlOutput(
      '<textarea id="t" style="width:100%;height:380px;font-size:12px;box-sizing:border-box;">' +
      escapedGroup +
      '</textarea>' +
      '<p style="font-size:12px;color:#666;">↑ 全文が選択された状態です。Ctrl+C（Macは⌘+C）でコピーし、Claude.aiに貼り付けてください。</p>' +
      '<script>' +
      'const t=document.getElementById("t"); t.focus(); t.select();' +
      '</script>'
    ).setWidth(520).setHeight(500);
    SpreadsheetApp.getUi().showModalDialog(htmlGroup, "① Claude.aiに貼り付けるプロンプト（全体（グループ） / " + ym + "）");
    return;
  }

  const trendData = getTrendFromFlatLog_(dept).trend;
  const currentRecs = trendData.filter(function(r) { return r.ym === ym; });

  if (currentRecs.length === 0) {
    SpreadsheetApp.getUi().alert("指定した部署・年月のデータが見つかりません。年月の表記（例: 2026-06）を確認してください。");
    return;
  }

  const prevYm     = shiftYm_(ym, -1);
  const prevYearYm = shiftYm_(ym, -12);
  const prevRecs     = trendData.filter(function(r) { return r.ym === prevYm; });
  const prevYearRecs = trendData.filter(function(r) { return r.ym === prevYearYm; });

  const prompt = buildReportPrompt_(dept, ym, currentRecs, prevRecs, prevYearRecs);
  const escaped = prompt.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const html = HtmlService.createHtmlOutput(
    '<textarea id="t" style="width:100%;height:380px;font-size:12px;box-sizing:border-box;">' +
    escaped +
    '</textarea>' +
    '<p style="font-size:12px;color:#666;">↑ 全文が選択された状態です。Ctrl+C（Macは⌘+C）でコピーし、Claude.aiに貼り付けてください。</p>' +
    '<script>' +
    'const t=document.getElementById("t"); t.focus(); t.select();' +
    '</script>'
  ).setWidth(520).setHeight(500);

  SpreadsheetApp.getUi().showModalDialog(html, "① Claude.aiに貼り付けるプロンプト（" + dept + " / " + ym + "）");
}

// ============================================================
// ②シートのB9セルに貼り付けられた回答を保存（ダイアログ不使用・安定重視）
// ============================================================
function saveReportFromSheet_() {
  const ws = getOrCreateDraftSheet_();
  const dept = ws.getRange("B1").getValue();
  const ym   = normalizeYm_(ws.getRange("B2").getValue());
  const text = ws.getRange("B9").getValue();

  if (!dept || !ym) {
    SpreadsheetApp.getUi().alert("B1(部署)とB2(年月)を入力してから実行してください。");
    return;
  }
  if (!text) {
    SpreadsheetApp.getUi().alert("B9セルにClaude.aiの回答を貼り付けてから実行してください。");
    return;
  }

  if (dept === GROUP_REPORT_LABEL) {
    const imageUrlRaw = ws.getRange("B10").getValue();
    saveInfographicTextAndImage_(ym, text, imageUrlRaw);
    SpreadsheetApp.getUi().alert("保存しました。ダッシュボードの「AIレポート」タブ（グループ全体）に反映されます。");
    return;
  }

  saveReport_(dept, ym, text);
  SpreadsheetApp.getUi().alert("保存しました。ダッシュボードの「AIレポート」タブに反映されます。");
}

// ============================================================
// ③NotebookLM用：フラットログ_実績（全部署・全期間）をCSVでエクスポート
// ※人事コメント（個人名を含む）は含めない。数値実績データのみ。
// ============================================================
function exportFlatLogForNotebookLM_() {
  const ss = getSpreadsheet_();
  const ws = ss.getSheetByName(FLAT_PERF_SHEET);
  if (!ws || ws.getLastRow() <= 1) {
    SpreadsheetApp.getUi().alert("フラットログ_実績にデータがありません。先に onEditInstallable が一度動くよう、いずれかの実績シートを編集してください。");
    return;
  }

  const ymIdx = FLAT_PERF_COLS.indexOf("ym");

  // 今年度分
  const currentData = ws.getRange(2, 1, ws.getLastRow() - 1, FLAT_PERF_COLS.length).getValues();

  // アーカイブ済みの過去年度分（無ければ空のまま）
  const archiveWs = ss.getSheetByName(ARCHIVE_SHEET);
  const archiveData = (archiveWs && archiveWs.getLastRow() > 1)
    ? archiveWs.getRange(2, 1, archiveWs.getLastRow() - 1, FLAT_PERF_COLS.length).getValues()
    : [];

  // 結合し、年月順に並べ替え
  const allData = archiveData.concat(currentData).map(function(row) {
    const copy = row.slice();
    copy[ymIdx] = normalizeYm_(copy[ymIdx]);
    return copy;
  }).sort(function(a, b) { return a[ymIdx] < b[ymIdx] ? -1 : 1; });

  const normalized = [FLAT_PERF_COLS].concat(allData);

  // CSVエスケープ処理
  const csv = normalized.map(function(row) {
    return row.map(function(cell) {
      var v = (cell === null || cell === undefined) ? "" : String(cell);
      if (v.indexOf(',') > -1 || v.indexOf('"') > -1 || v.indexOf('\n') > -1) {
        v = '"' + v.replace(/"/g, '""') + '"';
      }
      return v;
    }).join(',');
  }).join('\n');

  // 文字化け防止のためBOMを付与
  const csvWithBom = '﻿' + csv;

  const fileName = "SKグループ_実績データ_全部署全期間_" +
    Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss") + ".csv";
  const blob = Utilities.newBlob(csvWithBom, "text/csv", fileName);
  const file = DriveApp.createFile(blob);

  const html = HtmlService.createHtmlOutput(
    '<p style="font-size:13px;">CSVファイルをGoogleドライブに作成しました。</p>' +
    '<p style="font-size:12px;color:#666;">今年度：' + currentData.length + '件 ／ アーカイブ（過去年度）：' + archiveData.length + '件 ／ 合計：' + allData.length + '件</p>' +
    '<p><a href="' + file.getUrl() + '" target="_blank">' + fileName + '</a></p>' +
    '<p style="font-size:12px;color:#666;">↑ リンクを開き、右上のダウンロードアイコンからパソコンに保存してください。' +
    'そのファイルをNotebookLMの「ソースを追加」からアップロードしてください。' +
    '（人事コメントは含まれておらず、実績の数値データのみです）</p>'
  ).setWidth(500).setHeight(240);

  SpreadsheetApp.getUi().showModalDialog(html, "③ NotebookLM用CSVエクスポート完了");
}

// ============================================================
// 年月をnヶ月シフト（"2026-06" → deltaMonths=-1 → "2026-05"）
// ============================================================
function shiftYm_(ym, deltaMonths) {
  const parts = ym.split("-");
  const d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1 + deltaMonths, 1);
  return d.getFullYear() + "-" + ("0" + (d.getMonth() + 1)).slice(-2);
}

// ============================================================
// Claude.aiに貼り付けるプロンプト文を組み立てる
// ============================================================
function buildReportPrompt_(dept, ym, currentRecs, prevRecs, prevYearRecs) {
  function summarize(recs) {
    return recs.map(function(r) {
      return r.item + "（" + r.metric + "）: 目標=" + r.target + " 実績=" + r.actual + r.unit;
    }).join("\n");
  }

  return "あなたは製造・リサイクル業の経営会議向けアナリストです。\n" +
    "以下は「" + dept + "」の" + ym + "の実績データです。社内の数値の増減のみを分析対象とし、外部市場データとの比較は行わないでください。\n\n" +
    "【当月実績】\n" + summarize(currentRecs) + "\n\n" +
    "【前月実績】\n" + (prevRecs.length ? summarize(prevRecs) : "データなし") + "\n\n" +
    "【前年同月実績】\n" + (prevYearRecs.length ? summarize(prevYearRecs) : "データなし") + "\n\n" +
    "上記データをもとに、以下の構成で日本語のレポートを作成してください。\n" +
    "1. 今月のサマリー（3行程度）\n" +
    "2. 目立った増減とその品目\n" +
    "3. 前月・前年同月との比較で見える傾向\n" +
    "4. 来月に向けての注意点（推測は「〜と考えられます」等、断定を避ける表現にすること）\n" +
    "文体は簡潔な敬語。絵文字や過度な強調は使わないこと。";
}

// ============================================================
// レポートをシートに保存（同じdept×ymがあれば上書き、なければ追加）
// ============================================================
function saveReport_(dept, ym, reportText) {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(REPORT_SHEET);
  if (!ws) {
    ws = ss.insertSheet(REPORT_SHEET);
    ws.getRange(1, 1, 1, REPORT_COLS.length).setValues([REPORT_COLS]);
  }

  const lastRow = ws.getLastRow();
  const generatedAt = new Date();
  var targetRow = -1;

  if (lastRow > 1) {
    const existing = ws.getRange(2, 1, lastRow - 1, REPORT_COLS.length).getValues();
    for (var i = 0; i < existing.length; i++) {
      if (existing[i][0] === dept && existing[i][1] === ym) {
        targetRow = i + 2;
        break;
      }
    }
  }

  const row = [dept, ym, generatedAt, reportText];
  if (targetRow > 0) {
    ws.getRange(targetRow, 1, 1, REPORT_COLS.length).setValues([row]);
  } else {
    ws.appendRow(row);
  }
}

// ============================================================
// doGetから呼ばれる：指定月の全部署レポートを返す
// ============================================================
function getReportsForYm_(ym) {
  const ss = getSpreadsheet_();
  const ws = ss.getSheetByName(REPORT_SHEET);
  if (!ws || ws.getLastRow() <= 1) return { reports: [], ym: ym };

  const data = ws.getRange(2, 1, ws.getLastRow() - 1, REPORT_COLS.length).getValues();
  const reports = data
    .filter(function(row) { return !ym || normalizeYm_(row[1]) === ym; })
    .map(function(row) {
      return {
        dept: row[0],
        ym: normalizeYm_(row[1]),
        generatedAt: row[2] instanceof Date ? row[2].toISOString() : String(row[2]),
        reportText: row[3]
      };
    });

  return { reports: reports, ym: ym };
}

// ===================================================================
// 【追加機能】月次インフォグラフィック（グループ全体・画像＋文章）
// ===================================================================
// シート「月次インフォグラフィック」：ym×1行、画像ファイルID・文章を保持
// ===================================================================

function getOrCreateInfographicSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(INFOGRAPHIC_SHEET);
  if (!ws) {
    ws = ss.insertSheet(INFOGRAPHIC_SHEET);
    ws.getRange(1, 1, 1, INFOGRAPHIC_COLS.length).setValues([INFOGRAPHIC_COLS]);
  }
  return ws;
}

// 指定ymの行番号を検索（なければ-1）
function findInfographicRowIndex_(ws, ym) {
  const lastRow = ws.getLastRow();
  if (lastRow <= 1) return -1;
  const data = ws.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < data.length; i++) {
    if (normalizeYm_(data[i][0]) === ym) return i + 2; // 1-indexedの実際の行番号
  }
  return -1;
}

// doGetから呼ばれる：指定月の画像ID・文章を返す
function getInfographicForYm_(ym) {
  return getOrFetchWithCache_('infographic_v1_' + ym, CACHE_TTL.infographic, function() {
    const ws = getOrCreateInfographicSheet_();
    const rowIdx = findInfographicRowIndex_(ws, ym);
    if (rowIdx === -1) {
      return { ym: ym, imageFileId: "", reportText: "", generatedAt: "" };
    }
    const row = ws.getRange(rowIdx, 1, 1, INFOGRAPHIC_COLS.length).getValues()[0];
    return {
      ym: normalizeYm_(row[0]),
      imageFileId: row[1] || "",
      reportText: row[2] || "",
      generatedAt: row[3] ? (row[3] instanceof Date ? row[3].toISOString() : String(row[3])) : ""
    };
  });
}

// 「全体（グループ）」の文章＋画像リンクをまとめて保存する
// （画像はGoogleドライブに手動アップロード＋共有リンク貼り付け方式）
function saveInfographicTextAndImage_(ym, text, imageUrlRaw) {
  const ws = getOrCreateInfographicSheet_();
  const rowIdx = findInfographicRowIndex_(ws, ym);
  const generatedAt = new Date();
  const imageFileId = imageUrlRaw ? extractDriveImageId_(imageUrlRaw) : "";

  if (rowIdx === -1) {
    ws.appendRow([ym, imageFileId, text, generatedAt]);
  } else {
    if (imageFileId) ws.getRange(rowIdx, 2).setValue(imageFileId); // imageFileId列（貼り付けがあった時だけ更新）
    ws.getRange(rowIdx, 3).setValue(text);
    ws.getRange(rowIdx, 4).setValue(generatedAt);
  }

  cacheRemove_('infographic_v1_' + ym);
}

// ============================================================
// 「全体（グループ）」向けAIレポートのプロンプトを組み立てる
// 全部署のtrendデータを集計し、好調部門・課題部門を部門名付きでまとめる
// ============================================================
function buildGroupReportPromptForYm_(ym) {
  const prevYm = shiftYm_(ym, -1);
  const deptSummaries = [];

  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const trendData = getTrendFromFlatLog_(dept).trend;
    const currentRecs = trendData.filter(function(r) { return r.ym === ym; });
    if (!currentRecs.length) return;

    var totalTarget = 0, totalActual = 0;
    currentRecs.forEach(function(r) {
      if (typeof r.target === "number" && r.target > 0) totalTarget += r.target;
      if (typeof r.actual === "number" && r.actual > 0) totalActual += r.actual;
    });
    const rate = totalTarget > 0 ? Math.round(totalActual / totalTarget * 100) : null;

    const prevRecs = trendData.filter(function(r) { return r.ym === prevYm; });
    var prevTarget = 0, prevActual = 0;
    prevRecs.forEach(function(r) {
      if (typeof r.target === "number" && r.target > 0) prevTarget += r.target;
      if (typeof r.actual === "number" && r.actual > 0) prevActual += r.actual;
    });
    const prevRate = prevTarget > 0 ? Math.round(prevActual / prevTarget * 100) : null;

    var line = "・" + dept + "：実績" + totalActual + " / 目標" + totalTarget;
    if (rate !== null) line += "（達成率" + rate + "%）";
    if (rate !== null && prevRate !== null) line += "　※前月達成率" + prevRate + "%";
    deptSummaries.push(line);
  });

  if (!deptSummaries.length) return null;

  return "あなたは製造・リサイクル業の経営会議向けアナリストです。\n" +
    "以下は" + ym + "の、SKグループ全部署（8部門）の実績データです。社内の数値の増減のみを分析対象とし、外部市場データとの比較は行わないでください。\n\n" +
    "【部署別実績】\n" + deptSummaries.join("\n") + "\n\n" +
    "上記データをもとに、グループ全体を俯瞰した日本語のレポートを、以下の構成で作成してください。\n" +
    "1. 今月のグループ全体サマリー（3〜4行程度）\n" +
    "2. 好調な部門とその要因（部門名を挙げて具体的に）\n" +
    "3. 課題のある部門とその要因（部門名を挙げて具体的に）\n" +
    "4. 来月に向けてグループ全体で注意すべき点（推測は「〜と考えられます」等、断定を避ける表現にすること）\n" +
    "文体は簡潔な敬語。絵文字や過度な強調は使わないこと。";
}

// ===================================================================
// 【追加機能】感動デザイン課：新規案件情報
// ===================================================================
// シート「実績_感動デザイン課_新規案件」
// ヘッダー行：8行目 / データ開始：9行目
// A:№ B:発見日 C:情報提供者 D:(未使用) E:情報源 F:場所 G:物件名
// H:ランク I:現場状況 J:住所 K:営業担当 L:先方担当者 M:初回確認日
// N:オープン予定 O:進捗詳細 P:結果
// ===================================================================

const SHINKI_SHEET = "実績_感動デザイン課_新規案件";
const SHINKI_HEADER_ROW = 2;
const SHINKI_DATA_START_ROW = 3;
const SHINKI_COL_COUNT = 16; // A〜P列

function getShinkiAnkenList_() {
  return getOrFetchWithCache_('shinki_v1', CACHE_TTL.shinki_anken, function() {
    const ss = getSpreadsheet_();
    const ws = ss.getSheetByName(SHINKI_SHEET);
    if (!ws) return { list: [] };

    const lastRow = ws.getLastRow();
    if (lastRow < SHINKI_DATA_START_ROW) return { list: [] };

    const numRows = lastRow - SHINKI_DATA_START_ROW + 1;
    const data = ws.getRange(SHINKI_DATA_START_ROW, 1, numRows, SHINKI_COL_COUNT).getValues();
    const tz = Session.getScriptTimeZone();

    const list = [];
    data.forEach(function(row) {
      const dateVal = row[1]; // B列：発見日
      if (!dateVal) return;
      const date = (dateVal instanceof Date) ? dateVal : new Date(dateVal);
      if (isNaN(date.getTime())) return;

      list.push({
        no:           row[0],
        date:         Utilities.formatDate(date, tz, "yyyy-MM-dd"),
        ym:           Utilities.formatDate(date, tz, "yyyy-MM"),
        provider:     row[2],  // C列：情報提供者
        source:       row[4],  // E列：情報源
        place:        row[5],  // F列：場所
        propertyName: row[6],  // G列：物件名
        rank:         row[7],  // H列：ランク
        siteStatus:   row[8],  // I列：現場状況
        salesPerson:  row[10], // K列：営業担当
        result:       row[15]  // P列：結果
      });
    });

    // 発見日が新しい順に並べる
    list.sort(function(a, b) { return a.date < b.date ? 1 : -1; });

    return { list: list };
  });
}

// ===================================================================
// 【追加機能】次回までのアクション管理
// ===================================================================
// シート「次回アクション」（無ければ自動作成）
// A:部署 B:決定年月 C:内容 D:状態（未着手／対応中／完了）
// ダッシュボードのサマリーカードに、未完了のアクションを表示するために使用
// ===================================================================

const ACTION_SHEET = "次回アクション";
const ACTION_COLS  = ["部署", "決定年月", "内容", "状態"];

function getOrCreateActionSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(ACTION_SHEET);
  if (!ws) {
    ws = ss.insertSheet(ACTION_SHEET);
    ws.getRange(1, 1, 1, ACTION_COLS.length).setValues([ACTION_COLS]);
    ws.setColumnWidth(1, 200);
    ws.setColumnWidth(2, 100);
    ws.setColumnWidth(3, 400);
    ws.setColumnWidth(4, 100);

    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["未着手", "対応中", "完了"], true)
      .setAllowInvalid(false)
      .build();
    ws.getRange(2, 4, 200, 1).setDataValidation(rule);
  }
  return ws;
}

function getActionsList_() {
  return getOrFetchWithCache_('actions_v1', CACHE_TTL.actions, function() {
    const ws = getOrCreateActionSheet_();
    if (ws.getLastRow() <= 1) return { list: [] };

    const data = ws.getRange(2, 1, ws.getLastRow() - 1, ACTION_COLS.length).getValues();
    const list = data
      .filter(function(row) { return row[0]; })
      .map(function(row) {
        return {
          dept:   row[0],
          ym:     normalizeYm_(row[1]),
          text:   row[2],
          status: row[3] || "未着手"
        };
      });

    return { list: list };
  });
}

// ===================================================================
// 【追加機能】受注案件管理（年度累計・営業マン別ランキング）
// ===================================================================
// シート「受注案件_入力」（無ければ自動作成）
// A:区分（受注案件／大型案件） B:月（例:2026-04） C:物件名 D:品目
// E:対応日 F:金額 G:担当者 H:内容（大型案件のみ・自由記述）
//
// ・「受注案件」行のみを年度累計ランキング（担当者別・金額合計）の対象とする
// ・「大型案件」行は金額・担当者を空欄でよく、月ごとの案件情報として表示のみ行う
// ・行番号はハードコードせず、常に最終行まで読む（行の削除・挿入に強い設計）
// ===================================================================

const JUCHU_SHEET = "受注案件_入力";
const JUCHU_COLS  = ["区分", "月（例:2026-04）", "物件名", "品目", "対応日", "金額", "担当者", "内容（大型案件のみ）"];

function getOrCreateJuchuSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(JUCHU_SHEET);
  if (!ws) {
    ws = ss.insertSheet(JUCHU_SHEET);
    ws.getRange(1, 1, 1, JUCHU_COLS.length).setValues([JUCHU_COLS]);
    ws.setFrozenRows(1);
    ws.setColumnWidth(1, 110);
    ws.setColumnWidth(2, 120);
    ws.setColumnWidth(3, 220);
    ws.setColumnWidth(4, 110);
    ws.setColumnWidth(5, 110);
    ws.setColumnWidth(6, 110);
    ws.setColumnWidth(7, 100);
    ws.setColumnWidth(8, 320);

    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(["受注案件", "大型案件"], true)
      .setAllowInvalid(false)
      .build();
    ws.getRange(2, 1, 500, 1).setDataValidation(rule);
  }

  // B列（月）が「2026-04」のような文字列でも日付として自動変換されないよう、
  // プレーンテキスト形式を強制する（新規作成時だけでなく、既存シートにも毎回適用）
  ws.getRange(2, 2, Math.max(ws.getMaxRows() - 1, 500), 1).setNumberFormat("@");

  return ws;
}

function setupJuchuSheetUI_() {
  const ui = SpreadsheetApp.getUi();
  try {
    getOrCreateJuchuSheet_();
    ui.alert(
      "✅「" + JUCHU_SHEET + "」シートを準備しました。\n\n" +
      "A列（区分）はプルダウンから「受注案件」または「大型案件」を選んで入力してください。\n\n" +
      "・受注案件：物件名・品目・対応日・金額・担当者を入力（金額がランキングに集計されます）\n" +
      "・大型案件：物件名・内容（自由記述）のみ入力でOK（金額・担当者は空欄のままで構いません）"
    );
  } catch (err) {
    ui.alert("❌ シート準備に失敗しました。\n\n" + err.toString());
  }
}

// シートの全行を読み、区分ごとに使うオブジェクトへ変換する
function getJuchuRows_() {
  const ws = getSpreadsheet_().getSheetByName(JUCHU_SHEET);
  if (!ws) return [];
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return [];

  const data = ws.getRange(2, 1, lastRow - 1, JUCHU_COLS.length).getValues();
  const tz = Session.getScriptTimeZone();
  const rows = [];
  data.forEach(function(r) {
    const kind = r[0], ym = r[1], name = r[2], item = r[3], dateVal = r[4], amount = r[5], person = r[6], content = r[7];
    if (!kind || !ym) return; // 空行はスキップ
    const dateStr = (dateVal instanceof Date)
      ? Utilities.formatDate(dateVal, tz, "yyyy-MM-dd")
      : (dateVal ? String(dateVal) : "");
    rows.push({
      kind:    String(kind).trim(),
      ym:      normalizeYm_(ym),
      name:    name || "",
      item:    item || "",
      date:    dateStr,
      amount:  Number(amount) || 0,
      person:  person || "",
      content: content || ""
    });
  });
  return rows;
}

// getJuchuRows_をキャッシュ経由で取得（getJuchuRanking_とgetJuchuMonthly_で共有し、
// 同一シートの二重読み取りを避ける）
function getJuchuRowsCached_() {
  return getOrFetchWithCache_('juchu_rows_v1', CACHE_TTL.juchu_rows, getJuchuRows_);
}

// 年度累計・担当者別ランキング（「受注案件」行の金額のみを集計対象とする）
function getJuchuRanking_() {
  const fy = getFyStart_();
  const fyMonths = getFiscalYearMonths_(fy);
  const rows = getJuchuRowsCached_().filter(function(r) {
    return r.kind === "受注案件" && fyMonths.indexOf(r.ym) > -1 && r.person;
  });

  const byPerson = {};
  rows.forEach(function(r) {
    if (!byPerson[r.person]) byPerson[r.person] = { person: r.person, total: 0, cases: [] };
    byPerson[r.person].total += r.amount;
    byPerson[r.person].cases.push({
      ym: r.ym, name: r.name, item: r.item, date: r.date, amount: r.amount
    });
  });

  const ranking = Object.keys(byPerson).map(function(person) { return byPerson[person]; });
  ranking.sort(function(a, b) { return b.total - a.total; });
  // 各担当者内の案件は、月→金額の大きい順で並べる
  ranking.forEach(function(r) {
    r.cases.sort(function(a, b) {
      if (a.ym !== b.ym) return a.ym < b.ym ? -1 : 1;
      return b.amount - a.amount;
    });
  });

  return { ranking: ranking, fy: fy };
}

// 指定月の「大型案件情報」「主な受注案件」を返す
function getJuchuMonthly_(ym) {
  if (!ym) return { juchu: [], large: [] };
  const rows = getJuchuRowsCached_().filter(function(r) { return r.ym === ym; });
  return {
    juchu: rows.filter(function(r) { return r.kind === "受注案件"; }),
    large: rows.filter(function(r) { return r.kind === "大型案件"; })
  };
}

// ===================================================================
// 【追加機能】施設見学管理（月ごとの一覧表示）
// ===================================================================
// シート「施設見学_入力」（無ければ自動作成）
// A:月（例:2026-04） B:見学日 C:対象企業名 D:見学施設 E:担当者
// ・見学施設が複数ある場合は、1セルにカンマ等で並べて入力する想定（自由記述）
// ・行番号はハードコードせず、常に最終行まで読む
// ===================================================================

const KENGAKU_SHEET = "施設見学_入力";
const KENGAKU_COLS  = ["月（例:2026-04）", "見学日", "対象企業名", "見学施設", "担当者"];

function getOrCreateKengakuSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(KENGAKU_SHEET);
  if (!ws) {
    ws = ss.insertSheet(KENGAKU_SHEET);
    ws.getRange(1, 1, 1, KENGAKU_COLS.length).setValues([KENGAKU_COLS]);
    ws.setFrozenRows(1);
    ws.setColumnWidth(1, 120);
    ws.setColumnWidth(2, 110);
    ws.setColumnWidth(3, 220);
    ws.setColumnWidth(4, 320);
    ws.setColumnWidth(5, 100);
  }

  // A列（月）が「2026-04」のような文字列でも日付として自動変換されないよう、
  // プレーンテキスト形式を強制する（新規作成時だけでなく、既存シートにも毎回適用）
  ws.getRange(2, 1, Math.max(ws.getMaxRows() - 1, 500), 1).setNumberFormat("@");

  return ws;
}

function setupKengakuSheetUI_() {
  const ui = SpreadsheetApp.getUi();
  try {
    getOrCreateKengakuSheet_();
    ui.alert(
      "✅「" + KENGAKU_SHEET + "」シートを準備しました。\n\n" +
      "月・見学日・対象企業名・見学施設・担当者を入力してください。\n" +
      "見学施設が複数ある場合は、1つのセルにそのまま並べて入力していただいて構いません。"
    );
  } catch (err) {
    ui.alert("❌ シート準備に失敗しました。\n\n" + err.toString());
  }
}

// シートの全行を読み、オブジェクトへ変換する
function getKengakuRows_() {
  const ws = getSpreadsheet_().getSheetByName(KENGAKU_SHEET);
  if (!ws) return [];
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return [];

  const data = ws.getRange(2, 1, lastRow - 1, KENGAKU_COLS.length).getValues();
  const tz = Session.getScriptTimeZone();
  const rows = [];
  data.forEach(function(r) {
    const ym = r[0], visitDate = r[1], company = r[2], facility = r[3], person = r[4];
    if (!ym) return; // 空行はスキップ
    const dateStr = (visitDate instanceof Date)
      ? Utilities.formatDate(visitDate, tz, "yyyy-MM-dd")
      : (visitDate ? String(visitDate) : "");
    rows.push({
      ym:       normalizeYm_(ym),
      date:     dateStr,
      company:  company || "",
      facility: facility || "",
      person:   person || ""
    });
  });
  return rows;
}

// 施設見学の全件を返す（デフォルトは全件一覧、月での絞り込みは画面側で行う）
function getKengakuAll_() {
  return getOrFetchWithCache_('kengaku_v1', CACHE_TTL.kengaku_all, function() {
    return { list: getKengakuRows_() };
  });
}

// ===================================================================
// 【追加機能】売掛残物件管理（感動デザイン課・現在未解決の一覧＋月別絞り込み）
// ===================================================================
// シート「売掛残物件_入力」（無ければ自動作成）
// A:月（例:2026-07） B:指摘日 C:コード D:顧客名 E:請求日 F:理由
// G:返答 H:営業確認 I:入金確認 J:結果（"済"以外は未解決として扱う） K:備考
// ・ダッシュボードのデフォルト表示は「結果が済以外＝現在未解決」の一覧
// ・月を選ぶと、その月に指摘された案件を（解決・未解決問わず）全件表示する
// ・行番号はハードコードせず、常に最終行まで読む
// ===================================================================

const UKAKEZAN_SHEET = "売掛残物件_入力";
const UKAKEZAN_COLS  = ["月", "指摘日", "コード", "顧客名", "請求日", "理由", "返答", "営業確認", "入金確認", "結果", "備考"];

function getOrCreateUkakezanSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(UKAKEZAN_SHEET);
  if (!ws) {
    ws = ss.insertSheet(UKAKEZAN_SHEET);
    ws.getRange(1, 1, 1, UKAKEZAN_COLS.length).setValues([UKAKEZAN_COLS]);
    ws.setFrozenRows(1);
    ws.setColumnWidth(1, 90);
    ws.setColumnWidth(2, 100);
    ws.setColumnWidth(3, 100);
    ws.setColumnWidth(4, 180);
    ws.setColumnWidth(5, 90);
    ws.setColumnWidth(6, 220);
    ws.setColumnWidth(7, 220);
    ws.setColumnWidth(8, 220);
    ws.setColumnWidth(9, 150);
    ws.setColumnWidth(10, 80);
    ws.setColumnWidth(11, 220);
  }

  // A列（月）が「2026-07」のような文字列でも日付として自動変換されないよう、
  // プレーンテキスト形式を強制する（新規作成時だけでなく、既存シートにも毎回適用）
  ws.getRange(2, 1, Math.max(ws.getMaxRows() - 1, 2000), 1).setNumberFormat("@");

  return ws;
}

function setupUkakezanSheetUI_() {
  const ui = SpreadsheetApp.getUi();
  try {
    getOrCreateUkakezanSheet_();
    ui.alert(
      "✅「" + UKAKEZAN_SHEET + "」を準備しました。\n\n" +
      "月・指摘日・コード・顧客名・請求日・理由・返答・営業確認・入金確認・結果・備考の形式で入力してください。\n" +
      "「結果」に「済」と入力されていない行は、ダッシュボードで「未解決」として表示されます。"
    );
  } catch (err) {
    ui.alert("❌ シート準備に失敗しました。\n\n" + err.toString());
  }
}

// シートの全行を読み、オブジェクトへ変換する
function getUkakezanRows_() {
  const ws = getSpreadsheet_().getSheetByName(UKAKEZAN_SHEET);
  if (!ws) return [];
  const lastRow = ws.getLastRow();
  if (lastRow < 2) return [];

  const data = ws.getRange(2, 1, lastRow - 1, UKAKEZAN_COLS.length).getValues();
  const rows = [];
  data.forEach(function(r) {
    const ym = r[0], flagDate = r[1], code = r[2], customer = r[3], billing = r[4],
          reason = r[5], response = r[6], salesCheck = r[7], payCheck = r[8], result = r[9], note = r[10];
    if (!ym || !customer) return; // 空行はスキップ
    rows.push({
      ym:         normalizeYm_(ym),
      flagDate:   flagDate ? String(flagDate) : "",
      code:       code ? String(code) : "",
      customer:   String(customer),
      billing:    billing ? String(billing) : "",
      reason:     reason ? String(reason) : "",
      response:   response ? String(response) : "",
      salesCheck: salesCheck ? String(salesCheck) : "",
      payCheck:   payCheck ? String(payCheck) : "",
      result:     result ? String(result) : "",
      note:       note ? String(note) : "",
      resolved:   String(result || "").trim() === "済"
    });
  });
  return rows;
}

// 売掛残物件の全件を返す（デフォルト＝未解決のみ／月絞り込みは画面側で行う）
function getUkakezanAll_() {
  return getOrFetchWithCache_('ukakezan_v1', CACHE_TTL.ukakezan_all, function() {
    return { list: getUkakezanRows_() };
  });
}

// ===================================================================
// 【追加機能】燃料管理（トータルメンテナンス課・単価/使用量の推移）
// ===================================================================
// シート「燃料_トータルメンテナンス課」（無ければ自動作成）
// A:区分（給油先単価／宇佐美価格／県内相場／使用量）
// B:品目（AMS・宇佐美・コスモ／軽油・レギュラー・ハイオク・灯油／給油量(ℓ)・人数・カード所持者）
// C:項目（消費税抜／消費税込／比較／使用量は空欄）
// D列以降：月ごとに1列（見出しは「2026-06」のようなシンプルな1行表記）
//
// ・元のエクセルに近い「給油先・品目が行、月が列」の見た目のまま、
//   入力担当者が今まで通り「右端に1列足すだけ」で更新できるようにしている
// ・GAS側（getFuelRows_）でこの横長の表を読み取り、ダッシュボード用に
//   {ym, kubun, hinmoku, koumoku, value} の形へ内部変換する
//   （ダッシュボード側のコードは変更不要）
// ===================================================================

const FUEL_SHEET = "燃料_トータルメンテナンス課";

function getOrCreateFuelSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(FUEL_SHEET);
  if (!ws) {
    ws = ss.insertSheet(FUEL_SHEET);
  }
  ws.setColumnWidth(1, 110);
  ws.setColumnWidth(2, 120);
  ws.setColumnWidth(3, 90);
  ws.setFrozenRows(1);
  ws.setFrozenColumns(3);

  // 月の見出し行（1行目、D列以降）が「2026-06」等の文字列でも日付に自動変換
  // されないよう、今後の列追加に備えて広めの範囲にプレーンテキスト形式を適用する
  ws.getRange(1, 4, 1, 500).setNumberFormat("@");

  return ws;
}

function setupFuelSheetUI_() {
  const ui = SpreadsheetApp.getUi();
  try {
    getOrCreateFuelSheet_();
    ui.alert(
      "✅「" + FUEL_SHEET + "」を準備しました。\n\n" +
      "・1行目：区分／品目／項目の見出し＋月（例:2026-06）を横に並べる形式です\n" +
      "・2行目以降：給油先・品目ごとの実績を、元のエクセルと同じ考え方で入力できます\n" +
      "・毎月の更新は、一番右に新しい月の列を1つ追加するだけでOKです"
    );
  } catch (err) {
    ui.alert("❌ シート準備に失敗しました。\n\n" + err.toString());
  }
}

// 横長の表（区分・品目・項目が行、月が列）を読み取り、
// ダッシュボード用に {ym, kubun, hinmoku, koumoku, value} の配列へ変換する
function getFuelRows_() {
  const ws = getSpreadsheet_().getSheetByName(FUEL_SHEET);
  if (!ws) return [];
  const lastRow = ws.getLastRow();
  const lastCol = ws.getLastColumn();
  if (lastRow < 2 || lastCol < 4) return [];

  // D1以降の見出し行から年月一覧を取得
  const header = ws.getRange(1, 4, 1, lastCol - 3).getValues()[0];
  const yms = header.map(function(v) { return v ? normalizeYm_(v) : ""; });

  const data = ws.getRange(2, 1, lastRow - 1, lastCol).getValues();
  const rows = [];
  data.forEach(function(r) {
    const kubun = r[0], hinmoku = r[1], koumoku = r[2];
    if (!kubun || !hinmoku) return; // 空行はスキップ
    for (var i = 0; i < yms.length; i++) {
      const ym = yms[i];
      if (!ym) continue;
      const value = r[3 + i];
      if (value === "" || value === null || value === undefined) continue; // 未入力はスキップ
      rows.push({
        ym:      ym,
        kubun:   String(kubun).trim(),
        hinmoku: String(hinmoku).trim(),
        koumoku: koumoku ? String(koumoku).trim() : "",
        value:   value // 数値のほか、まれに文字列（例："68名"）が入る場合がある
      });
    }
  });
  return rows;
}

// 燃料データを全件返す（区分・品目ごとの絞り込みはダッシュボード側で行う）
// データ量が多く、シート読み取り＋変換の負荷が高いため、CACHE_EXPIRE_SEC（1時間）でキャッシュする
function getFuelAll_() {
  const cacheKey = 'v1_fuel_all';
  const cached = cacheGet_(cacheKey);
  if (cached) return cached;

  const result = { rows: getFuelRows_() };
  cachePut_(cacheKey, result);
  return result;
}

// ===================================================================
// 【追加機能】目次シート（入力担当者の負担軽減）
// ===================================================================
// ・「📇 目次」シートを一番左に作成し、プルダウンでシート名を選ぶと
//   自動でそのシートへ移動できるようにする（onEditInstallable_で処理）
// ・入力用シートと自動生成シートを分けて一覧表示する
// ・フラットログ系など、人が直接編集する必要のないシートは非表示にする
// ・いずれもGASの読み込み（doGet）とは別経路のため、ダッシュボードの
//   表示速度には一切影響しない
// ===================================================================

const INDEX_SHEET = "📇 目次";

function getOrCreateIndexSheet_() {
  const ss = getSpreadsheet_();
  var ws = ss.getSheetByName(INDEX_SHEET);
  if (!ws) {
    ws = ss.insertSheet(INDEX_SHEET, 0);
  } else {
    ss.setActiveSheet(ws);
    ss.moveActiveSheet(1);
  }
  ws.clear();
  // ws.clear()は「内容」と「書式」のみが対象で、データの入力規則（プルダウン）は
  // 消えないため、以前B1に設定していたプルダウンをここで明示的に削除する
  ws.getRange("B1").clearDataValidations();
  ws.setColumnWidth(1, 260);
  ws.setColumnWidth(2, 220);

  ws.getRange("A1").setValue("📇 目次").setFontWeight("bold").setFontSize(13);
  ws.setFrozenRows(1);

  let row = 3;
  ws.getRange(row, 1).setValue("■ 入力用シート（ここに入力してください）").setFontWeight("bold");
  row++;

  const inputSheetNames = []; // 各要素: { name: 実際のシート名, label: 表示ラベル（省略時はnameと同じ） }
  Object.keys(DEPT_CONFIG).forEach(function(dept) {
    const cfg = DEPT_CONFIG[dept];

    if (dept === "感動デザイン課") {
      // 実績データは地域インフラ共創部1課の数値だが、入力・会議報告は感動デザイン課が行うため、
      // 感動デザイン課の項目の直前に、注記付きで配置する（リンク先のシート自体は変更しない）
      inputSheetNames.push({
        name: "実績_地域インフラ共創部1課",
        label: "実績_地域インフラ共創部1課　※感動デザイン課が入力"
      });
    }

    // 地域インフラ共創部1課の実績シートは、上ですでに感動デザイン課の直前に
    // 注記付きで表示済みのため、通常位置では重複表示しない
    if (cfg.perfSheet && dept !== "地域インフラ共創部1課") {
      inputSheetNames.push({ name: cfg.perfSheet });
    }
    if (cfg.hrSheet) inputSheetNames.push({ name: cfg.hrSheet });

    // 感動デザイン課の直下に、新規案件・受注案件・施設見学をまとめて表示する
    if (dept === "感動デザイン課") {
      inputSheetNames.push({ name: SHINKI_SHEET }, { name: JUCHU_SHEET }, { name: KENGAKU_SHEET }, { name: UKAKEZAN_SHEET });
    }

    // トータルメンテナンス課の直下に、燃料シートを表示する
    if (dept === "トータルメンテナンス課") {
      inputSheetNames.push({ name: FUEL_SHEET });
    }
  });
  [ACTION_SHEET, DRAFT_SHEET, INFOGRAPHIC_SHEET]
    .forEach(function(name) { inputSheetNames.push({ name: name }); });

  inputSheetNames.forEach(function(item) {
    const target = ss.getSheetByName(item.name);
    if (!target) return; // 実在しないシート名はスキップ
    const label = item.label || item.name;
    ws.getRange(row, 1).setFormula(
      '=HYPERLINK("#gid=' + target.getSheetId() + '", "' + label.replace(/"/g, '""') + '")'
    );
    row++;
  });

  row++;
  ws.getRange(row, 1).setValue("■ 自動生成シート（通常は触らないでください）").setFontWeight("bold");
  row++;
  [FLAT_PERF_SHEET, FLAT_HR_SHEET, ARCHIVE_SHEET, REPORT_SHEET].forEach(function(name) {
    const target = ss.getSheetByName(name);
    if (!target) return;
    ws.getRange(row, 1).setFormula(
      '=HYPERLINK("#gid=' + target.getSheetId() + '", "' + name.replace(/"/g, '""') + '")'
    );
    row++;
  });

  return ws;
}

// フラットログ系（人が直接編集する必要のないシート）を非表示にする
function hideInternalSheets_() {
  const ss = getSpreadsheet_();
  [FLAT_PERF_SHEET, FLAT_HR_SHEET].forEach(function(name) {
    const ws = ss.getSheetByName(name);
    if (ws && !ws.isSheetHidden()) ws.hideSheet();
  });
}

function setupIndexSheetUI_() {
  const ui = SpreadsheetApp.getUi();
  try {
    getOrCreateIndexSheet_();
    hideInternalSheets_();
    ui.alert(
      "✅「" + INDEX_SHEET + "」を一番左に作成しました。\n\n" +
      "・シート名のリンクをクリックすると、そのシートへ移動します\n" +
      "・「フラットログ_実績」「フラットログ_人事」は非表示にしました\n" +
      "　（再表示したい場合は、シートタブを右クリック→「シートの再表示」）"
    );
  } catch (err) {
    ui.alert("❌ 目次シートの作成に失敗しました。\n\n" + err.toString());
  }
}

// どのシートを開いていても、メニューから1クリックで目次シートへ戻る
function goToIndexSheet_() {
  const ss = SpreadsheetApp.getActive();
  const ws = ss.getSheetByName(INDEX_SHEET);
  if (ws) {
    ss.setActiveSheet(ws);
  } else {
    SpreadsheetApp.getUi().alert(
      "「" + INDEX_SHEET + "」シートが見つかりません。\n" +
      "メニューの「⑪ 目次シートを作成する」を先に実行してください。"
    );
  }
}

// ===================================================================
// 【追加機能】シート行構成の整合性チェック
// ===================================================================
// 各抽出関数が「決まった行に決まった見出しがある」前提で作られているため、
// 行の削除・挿入で想定がズレていないかをまとめて確認する。
// 行を編集する前後に手動実行することを推奨。
// ===================================================================

function checkAllSheetLayoutsUI_() {
  const results = checkAllSheetLayouts_();
  const ui = SpreadsheetApp.getUi();
  if (results.length === 0) {
    ui.alert("✅ 問題ありませんでした。すべてのシートの行構成は想定通りです。");
  } else {
    ui.alert("⚠ 行構成の不一致が " + results.length + " 件見つかりました。\n\n" + results.join("\n\n"));
  }
}

function checkAllSheetLayouts_() {
  const ss = getSpreadsheet_();

  // [シート名, 行番号, 想定キーワード（いずれかを含めばOK）, 説明]
  const checks = [
    ["実績_感動デザイン課_機密書類", 3,  ["目標"],        "キング/目標行"],
    ["実績_感動デザイン課_機密書類", 4,  ["実績"],        "キング/実績行"],
    ["実績_感動デザイン課_機密書類", 7,  ["昨年","前年"], "キング/前年行"],
    ["実績_感動デザイン課_機密書類", 11, ["目標"],        "BOX/目標行"],
    ["実績_感動デザイン課_機密書類", 12, ["実績"],        "BOX/実績行"],
    ["実績_感動デザイン課_機密書類", 15, ["昨年","前年"], "BOX/前年行"],

    ["実績_感動デザイン課_新規案件", 3, ["№","発見日"], "データ開始行"],

    ["実績_バース仙台港", 3,  ["目標"],       "一軸破砕機/目標行"],
    ["実績_バース仙台港", 4,  ["前年度実績"], "一軸破砕機/前年度実績行"],
    ["実績_バース仙台港", 5,  ["実績"],       "一軸破砕機/実績行"],
    ["実績_バース仙台港", 7,  ["稼働率"],     "一軸破砕機/稼働率行"],
    ["実績_バース仙台港", 10, ["目標"],       "機密破砕機/目標行"],
    ["実績_バース仙台港", 11, ["前年度実績"], "機密破砕機/前年度実績行"],
    ["実績_バース仙台港", 12, ["実績"],       "機密破砕機/実績行"],
    ["実績_バース仙台港", 14, ["稼働率"],     "機密破砕機/稼働率行"],
    ["実績_バース仙台港", 17, ["目標"],       "発泡溶融機/目標行"],
    ["実績_バース仙台港", 18, ["前年度実績"], "発泡溶融機/前年度実績行"],
    ["実績_バース仙台港", 19, ["実績"],       "発泡溶融機/実績行"],
    ["実績_バース仙台港", 21, ["稼働率"],     "発泡溶融機/稼働率行"],
    ["実績_バース仙台港", 24, ["目標"],       "缶リサイクル施設/目標行"],
    ["実績_バース仙台港", 25, ["前年度実績"], "缶リサイクル施設/前年度実績行"],
    ["実績_バース仙台港", 26, ["実績"],       "缶リサイクル施設/実績行"],
    ["実績_バース仙台港", 28, ["稼働率"],     "缶リサイクル施設/稼働率行"],
    ["実績_バース仙台港", 31, ["目標"],       "廃棄物/目標行"],
    ["実績_バース仙台港", 32, ["前年度実績"], "廃棄物/前年度実績行"],
    ["実績_バース仙台港", 33, ["実績"],       "廃棄物/実績行"],
    ["実績_バース仙台港", 35, ["稼働率"],     "廃棄物/稼働率行"],

    ["実績_バース仙台扇町", 3,  ["目標"],       "段ボール/目標行"],
    ["実績_バース仙台扇町", 4,  ["実績"],       "段ボール/実績行"],
    ["実績_バース仙台扇町", 7,  ["前年度実績"], "段ボール/前年度実績行"],
    ["実績_バース仙台扇町", 11, ["目標"],       "新聞/目標行"],
    ["実績_バース仙台扇町", 12, ["実績"],       "新聞/実績行"],
    ["実績_バース仙台扇町", 15, ["前年度実績"], "新聞/前年度実績行"],
    ["実績_バース仙台扇町", 19, ["目標"],       "雑誌/目標行"],
    ["実績_バース仙台扇町", 20, ["実績"],       "雑誌/実績行"],
    ["実績_バース仙台扇町", 23, ["前年度実績"], "雑誌/前年度実績行"],
    ["実績_バース仙台扇町", 27, ["目標"],       "チラシ/目標行"],
    ["実績_バース仙台扇町", 28, ["実績"],       "チラシ/実績行"],
    ["実績_バース仙台扇町", 31, ["前年度実績"], "チラシ/前年度実績行"],
    ["実績_バース仙台扇町", 35, ["目標"],       "その他古紙/目標行"],
    ["実績_バース仙台扇町", 36, ["実績"],       "その他古紙/実績行"],
    ["実績_バース仙台扇町", 39, ["前年度実績"], "その他古紙/前年度実績行"],
    ["実績_バース仙台扇町", 43, ["目標"],       "古紙合計/目標行"],
    ["実績_バース仙台扇町", 44, ["実績"],       "古紙合計/実績行"],
    ["実績_バース仙台扇町", 47, ["前年度実績"], "古紙合計/前年度実績行"],
    ["実績_バース仙台扇町", 51, ["実績"],       "代納/実績行"],
    ["実績_バース仙台扇町", 52, ["前年度実績"], "代納/前年度実績行"],
    ["実績_バース仙台扇町", 56, ["目標"],       "廃棄物/目標行"],
    ["実績_バース仙台扇町", 57, ["実績"],       "廃棄物/実績行"],
    ["実績_バース仙台扇町", 60, ["前年度実績"], "廃棄物/前年度実績行"],

    ["実績_バース仙台岩切", 3,  ["目標"],       "段ボール/目標行"],
    ["実績_バース仙台岩切", 4,  ["実績"],       "段ボール/実績行"],
    ["実績_バース仙台岩切", 7,  ["前年度実績"], "段ボール/前年度実績行"],
    ["実績_バース仙台岩切", 13, ["目標"],       "ペットボトル/目標行"],
    ["実績_バース仙台岩切", 14, ["実績"],       "ペットボトル/実績行"],
    ["実績_バース仙台岩切", 17, ["前年度実績"], "ペットボトル/前年度実績行"],

    ["実績_トータルメンテナンス課", 4,  ["年"], "車輌事故/当年度行"],
    ["実績_トータルメンテナンス課", 5,  ["年"], "車輌事故/前年度行"],
    ["実績_トータルメンテナンス課", 15, ["年"], "労働災害事故/当年度行"],
    ["実績_トータルメンテナンス課", 16, ["年"], "労働災害事故/前年度行"],
  ];

  const results = [];
  checks.forEach(function(c) {
    const sheetName = c[0], rowNum = c[1], keywords = c[2], label = c[3];
    const ws = ss.getSheetByName(sheetName);
    if (!ws) {
      results.push("❌ シートが見つかりません: " + sheetName);
      return;
    }
    const cellValue = String(ws.getRange(rowNum, 1).getValue() || "");
    const ok = keywords.some(function(k) { return cellValue.indexOf(k) > -1; });
    if (!ok) {
      results.push("⚠ 「" + sheetName + "」" + rowNum + "行目 [" + label + "]\n" +
        "　想定キーワード「" + keywords.join("/") + "」が見つかりません。実際の内容:「" + cellValue + "」");
    }
  });

  if (results.length === 0) {
    Logger.log("✅ シート行構成チェック：問題なし（" + checks.length + "項目チェック）");
  } else {
    Logger.log("⚠ シート行構成チェックで " + results.length + " 件の不一致：\n" + results.join("\n"));
  }

  return results;
}

// ===================================================================
// 【追加機能】年度切り替え
// ===================================================================
// FY_START（年度の起点）をスクリプトプロパティで管理することで、
// 毎年4月にこの関数を実行するだけで年度が切り替わり、
// コードの再デプロイが不要になる。
//
// ※この関数が自動で行うのは「年度番号の切り替え」のみ。
//   各部署シートの「実績→前年度実績への転記＆実績欄のクリア」や、
//   トータルメンテナンス課の事故シートへの新年度行追加は、
//   シートごとに形が異なり自動化のリスクが高いため、手動での対応をお願いします
//   （実行前の確認ダイアログにチェックリストを表示します）。
// ===================================================================
function switchFiscalYear_() {
  const ui = SpreadsheetApp.getUi();
  const current = getFyStart_();
  const next = current + 1;

  const resp = ui.alert(
    "年度切り替えの確認",
    "現在の設定：" + current + "年度（" + current + "年4月〜" + (current + 1) + "年3月）\n" +
    "　　　↓\n" +
    "切替後　：" + next + "年度（" + next + "年4月〜" + (next + 1) + "年3月）\n\n" +
    "【この操作の前に、以下を終えていますか？】\n" +
    "・各部署の実績シート：「実績」の値を「前年度実績」欄へ転記済み\n" +
    "・上記シートの「実績」欄を、新年度入力のために空にした\n" +
    "・トータルメンテナンス課の事故シートに、新しい年度の行を追加した\n\n" +
    "「はい」を押すと、スプレッドシート全体のバックアップを作成し、\n" +
    current + "年度の実績データを自動でアーカイブしてから年度を切り替えます。",
    ui.ButtonSet.YES_NO
  );

  if (resp !== ui.Button.YES) {
    ui.alert("キャンセルしました。年度は切り替わっていません。");
    return;
  }

  const backupFile = backupSpreadsheetNow_();
  const archivedCount = archiveCurrentYearToHistory_();

  PropertiesService.getScriptProperties().setProperty("FY_START", String(next));
  _fyStartCache = null; // 実行中のメモリキャッシュをクリア（次回呼び出しから新しい値を使う）

  ui.alert(
    "✅ バックアップを作成し、" + current + "年度のデータを " + archivedCount + " 件アーカイブしたうえで、" +
    next + "年度に切り替えました。\n\n" +
    "バックアップ：" + backupFile.getName() + "\n\n" +
    "続けて以下を実行してください：\n" +
    "1. Apps Scriptエディタから rebuildFlatLog を手動実行\n" +
    "2. ダッシュボードを再読み込みし、年月一覧が新年度分になっているか確認"
  );
}

// ===================================================================
// 【追加機能】年度別アーカイブの自動蓄積
// ===================================================================
// 年度切替のたびに、その時点の「フラットログ_実績」の内容を
// 「アーカイブ_実績_全年度」シートへコピーして積み上げていく。
// NotebookLM用CSVエクスポートは、このアーカイブ＋今年度分を結合して出力するため、
// 毎年これを実行しておくだけで、自動的に複数年データが蓄積されていく。
// ===================================================================
const ARCHIVE_SHEET = "アーカイブ_実績_全年度";

function archiveCurrentYearToHistory_() {
  const ss = getSpreadsheet_();
  const flatWs = ss.getSheetByName(FLAT_PERF_SHEET);
  if (!flatWs || flatWs.getLastRow() <= 1) return 0;

  var archiveWs = ss.getSheetByName(ARCHIVE_SHEET);
  if (!archiveWs) {
    archiveWs = ss.insertSheet(ARCHIVE_SHEET);
    archiveWs.getRange(1, 1, 1, FLAT_PERF_COLS.length).setValues([FLAT_PERF_COLS]);
  }

  const data = flatWs.getRange(2, 1, flatWs.getLastRow() - 1, FLAT_PERF_COLS.length).getValues();
  if (!data.length) return 0;

  const ymIdx = FLAT_PERF_COLS.indexOf("ym");
  const currentYms = [...new Set(data.map(function(row) { return normalizeYm_(row[ymIdx]); }))];

  // 同じ年月が既にアーカイブ済みなら、古い分を除いてから入れ直す
  // （同じ年度を誤って2回アーカイブしても、データが二重にならないようにするため）
  if (archiveWs.getLastRow() > 1) {
    const existing = archiveWs.getRange(2, 1, archiveWs.getLastRow() - 1, FLAT_PERF_COLS.length).getValues();
    const keepRows = existing.filter(function(row) {
      return currentYms.indexOf(normalizeYm_(row[ymIdx])) === -1;
    });
    archiveWs.getRange(2, 1, archiveWs.getLastRow() - 1, FLAT_PERF_COLS.length).clearContent();
    if (keepRows.length) {
      archiveWs.getRange(2, 1, keepRows.length, FLAT_PERF_COLS.length).setValues(keepRows);
    }
  }

  const startRow = archiveWs.getLastRow() + 1;
  archiveWs.getRange(startRow, 1, data.length, FLAT_PERF_COLS.length).setValues(data);

  // アーカイブ内容が変わったので、年度選択プルダウン用キャッシュを無効化する
  cacheRemove_('fiscalyears_v1');

  return data.length;
}

// ===================================================================
// 【追加機能】明示的なバックアップ
// ===================================================================
// スプレッドシート全体を、Googleドライブの専用フォルダにコピーとして保存する。
// ・メニューから手動実行できる（今すぐバックアップ）
// ・年度切り替え時にも自動実行される（重要な区切りのため）
// ===================================================================

function getOrCreateBackupFolder_() {
  const folderName = "SKグループ営業会議_バックアップ";
  const folders = DriveApp.getFoldersByName(folderName);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(folderName);
}

function backupSpreadsheetNow_() {
  const ss = getSpreadsheet_();
  const ssFile = DriveApp.getFileById(ss.getId());
  const folder = getOrCreateBackupFolder_();
  const timestamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "yyyyMMdd_HHmmss");
  const backupName = ss.getName() + "_バックアップ_" + timestamp;
  return ssFile.makeCopy(backupName, folder);
}

function backupSpreadsheetNowUI_() {
  const ui = SpreadsheetApp.getUi();
  try {
    const file = backupSpreadsheetNow_();
    ui.alert(
      "✅ バックアップを作成しました。\n\n" +
      "ファイル名：" + file.getName() + "\n" +
      "保存先：Googleドライブの「SKグループ営業会議_バックアップ」フォルダ\n\n" +
      "URL：" + file.getUrl()
    );
  } catch (err) {
    ui.alert("❌ バックアップに失敗しました。\n\n" + err.toString());
  }
}

// ===================================================================
// 【追加機能】定期自動バックアップ（毎日1回・直近BACKUP_RETENTION_DAYS日分を保持）
// ===================================================================
// scheduledBackup_ は時間主導トリガーから呼ばれる想定（setupMaintenanceTriggers_で登録）。
// バックアップ自体が失敗した場合は、doGetと同じ通知経路（notifyError_）でメール通知する。
// ===================================================================
function scheduledBackup_() {
  try {
    backupSpreadsheetNow_();
    cleanupOldBackups_();
  } catch (err) {
    Logger.log("定期バックアップでエラー: " + err.toString());
    notifyError_("定期バックアップ（scheduledBackup_）", err);
  }
}

// バックアップフォルダ内の、BACKUP_RETENTION_DAYS日より古いファイルを削除する
function cleanupOldBackups_() {
  const folder = getOrCreateBackupFolder_();
  const files = folder.getFiles();
  const cutoff = new Date(Date.now() - BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000);
  let deletedCount = 0;
  while (files.hasNext()) {
    const file = files.next();
    if (file.getDateCreated() < cutoff) {
      file.setTrashed(true);
      deletedCount++;
    }
  }
  Logger.log("古いバックアップを" + deletedCount + "件削除しました（" + BACKUP_RETENTION_DAYS + "日より古いもの）");
}

// ===================================================================
// 【追加機能】定期バックアップ・キャッシュウォームアップのトリガー設定（初回のみ手動実行）
// ===================================================================
// ・毎日1回（4時頃）：スプレッドシート全体を自動バックアップ（直近31日分を保持し、古いものは自動削除）
// ・1時間おき：ダッシュボード表示用キャッシュを自動更新（CACHE_EXPIRE_SEC=3600秒と揃えている）
//
// 【重要・手動でのお願い】
// このスクリプトからはトリガーの「実行失敗時通知」の設定を行えないため、
// 実行後にApps Scriptエディタ左メニューの「トリガー」画面を開き、
// 「scheduledBackup_」「warmUpCache」それぞれの鉛筆アイコン→通知設定を
// 「毎回通知」に変更してください（コード不要・チェックを入れるだけ）。
// ===================================================================
function setupMaintenanceTriggers_() {
  ['scheduledBackup_', 'warmUpCache'].forEach(function(fn) {
    ScriptApp.getProjectTriggers().forEach(function(t) {
      if (t.getHandlerFunction() === fn) ScriptApp.deleteTrigger(t);
    });
  });

  ScriptApp.newTrigger('scheduledBackup_')
    .timeBased()
    .everyDays(1)
    .atHour(4)
    .create();

  ScriptApp.newTrigger('warmUpCache')
    .timeBased()
    .everyHours(1)
    .create();

  SpreadsheetApp.getUi().alert(
    "✅ 定期バックアップとキャッシュウォームアップのトリガーを設定しました。\n\n" +
    "・毎日4時頃：スプレッドシート全体を自動バックアップ（直近" + BACKUP_RETENTION_DAYS + "日分を保持、古いものは自動削除）\n" +
    "・1時間おき：ダッシュボード表示用キャッシュを自動更新\n\n" +
    "【重要・お願い】\n" +
    "Apps Scriptエディタ左メニューの「トリガー」画面を開き、\n" +
    "「scheduledBackup_」と「warmUpCache」の2つのトリガーそれぞれで、\n" +
    "鉛筆アイコン→通知設定を「毎回通知」に変更してください。\n" +
    "これで、この2つの自動処理が失敗した際にGoogleから直接メールが届くようになります（追加コード不要）。\n\n" +
    "なお、ダッシュボードアクセス時（doGet）のエラーは、このトリガー設定とは別に、\n" +
    ERROR_NOTIFY_EMAIL + " 宛に自動でメール通知されます（1時間に1回まで）。"
  );
}
