/**
 * Cài đặt một lần. Chạy hàm caiDatApp() từ trình soạn thảo Apps Script.
 * Chạy lại nhiều lần vẫn an toàn: không ghi đè dữ liệu có sẵn.
 */

function caiDatApp() {
  var sheet = ss_();
  PropertiesService.getScriptProperties().setProperty('SHEET_ID', sheet.getId());
  nangCapSheet_();
  var token = taoMaApp_();
  Logger.log('XONG. Mã app của bạn (nhập vào app trên điện thoại):\n\n' + token + '\n');
  return token;
}

/** Hiện lại mã app nếu quên. */
function hienMaApp() {
  var t = PropertiesService.getScriptProperties().getProperty('APP_TOKEN');
  Logger.log(t ? 'Mã app: ' + t : 'Chưa có mã. Chạy caiDatApp() trước.');
}

/** Tạo mã mới (mã cũ sẽ không dùng được nữa). */
function doiMaApp() {
  var props = PropertiesService.getScriptProperties();
  props.deleteProperty('APP_TOKEN');
  var t = taoMaApp_();
  Logger.log('Mã app mới: ' + t);
}

function taoMaApp_() {
  var props = PropertiesService.getScriptProperties();
  var t = props.getProperty('APP_TOKEN');
  if (!t) {
    t = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').substr(0, 32);
    props.setProperty('APP_TOKEN', t);
  }
  return t;
}

function getOrCreateSheet_(name, headers, widths) {
  var s = ss_();
  var sh = s.getSheetByName(name);
  var created = false;
  if (!sh) {
    sh = s.insertSheet(name);
    created = true;
    sh.getRange(1, 1, 1, headers.length).setValues([headers])
      .setFontWeight('bold').setBackground('#e8eef7');
    sh.setFrozenRows(1);
    if (widths) widths.forEach(function (w, i) { sh.setColumnWidth(i + 1, w); });
  }
  return { sheet: sh, created: created };
}

function nangCapSheet_() {
  var s = ss_();

  // 1) GiaoDich: thêm 3 cột N, O, P (không đụng tới các cột có sẵn)
  var gd = s.getSheetByName(S.TXN);
  if (!gd) throw new Error('Không thấy tab GiaoDich');
  if (gd.getMaxColumns() < TXN_COLS) gd.insertColumnsAfter(gd.getMaxColumns(), TXN_COLS - gd.getMaxColumns());
  if (!gd.getRange('N2').getValue()) {
    gd.getRange('M1:M2').copyTo(gd.getRange('N1:P2'), SpreadsheetApp.CopyPasteType.PASTE_FORMAT, false);
    gd.getRange('N1').setValue('BỔ SUNG');
    gd.getRange('N2:P2').setValues([['Tỷ giá AUD→VND lúc ghi', 'Chuyến đi', 'Nguồn']]);
    gd.setColumnWidth(14, 120);
    gd.setColumnWidth(15, 140);
    gd.setColumnWidth(16, 80);
  }

  // 2) Quy tắc tự phân loại
  var r = getOrCreateSheet_(S.RULE, ['Từ khóa trong nội dung', 'Danh mục'], [240, 200]);
  if (r.created) {
    var rules = [
      ['woolworths', 'Ăn tại nhà'], ['coles', 'Ăn tại nhà'], ['aldi', 'Ăn tại nhà'], ['iga', 'Ăn tại nhà'],
      ['bách hóa', 'Ăn tại nhà'], ['winmart', 'Ăn tại nhà'], ['coopmart', 'Ăn tại nhà'],
      ['coffee', 'Ăn ngoài'], ['cafe', 'Ăn ngoài'], ['cà phê', 'Ăn ngoài'], ['trà sữa', 'Ăn ngoài'],
      ['phở', 'Ăn ngoài'], ['bún', 'Ăn ngoài'], ['cơm', 'Ăn ngoài'], ['mcdonald', 'Ăn ngoài'],
      ['kfc', 'Ăn ngoài'], ['highlands', 'Ăn ngoài'], ['restaurant', 'Ăn ngoài'],
      ['uber', 'Đi lại'], ['grab', 'Đi lại'], ['myki', 'Đi lại'], ['xăng', 'Đi lại'],
      ['petrol', 'Đi lại'], ['bp ', 'Đi lại'], ['shell', 'Đi lại'], ['ampol', 'Đi lại'],
      ['netflix', 'Giải trí'], ['spotify', 'Giải trí'], ['youtube', 'Giải trí'], ['disney', 'Giải trí'],
      ['chatgpt', 'Đăng ký'], ['openai', 'Đăng ký'], ['anthropic', 'Đăng ký'], ['claude', 'Đăng ký'],
      ['gemini', 'Đăng ký'], ['google one', 'Đăng ký'], ['icloud', 'Đăng ký'],
      ['shopee', 'Mua sắm'], ['lazada', 'Mua sắm'], ['amazon', 'Mua sắm'], ['kmart', 'Mua sắm'],
      ['chemist', 'Sức khỏe'], ['pharmacy', 'Sức khỏe'], ['nhà thuốc', 'Sức khỏe'], ['bệnh viện', 'Sức khỏe'],
      ['gym', 'Sở thích'], ['yoga', 'Sở thích'],
      ['lương', 'Lương'], ['salary', 'Lương']
    ];
    r.sheet.getRange(2, 1, rules.length, 2).setValues(rules);
  }

  // 3) Ngân sách tháng: Nhóm | Danh mục | Số tiền (Úc = AUD, Việt Nam = VND)
  getOrCreateSheet_(S.BUDGET, ['Nhóm (Úc / Việt Nam)', 'Danh mục', 'Ngân sách mỗi tháng (Úc = AUD, Việt Nam = VND)'], [180, 200, 320]);

  // 4) Chuyến đi
  var t = getOrCreateSheet_(S.TRIP, ['Tên chuyến đi', 'Từ ngày', 'Đến ngày'], [260, 110, 110]);
  if (t.created) {
    t.sheet.getRange(2, 1, 1, 3).setValues([['Về Việt Nam (đám cưới anh trai)', new Date(2027, 1, 7), new Date(2027, 1, 21)]]);
    t.sheet.getRange(2, 2, 1, 2).setNumberFormat('dd/MM/yyyy');
  }

  // 5) Chuyển tiền Úc → Việt Nam
  getOrCreateSheet_(S.XFER, ['Ngày', 'Nơi chuyển', 'Từ thẻ', 'Đến thẻ', 'AUD gửi', 'Phí (AUD)', 'VND nhận',
    'Tỷ giá thực tế', 'Tỷ giá thị trường lúc đó', 'Chênh lệch so với thị trường', 'Ghi chú'],
    [100, 120, 140, 140, 90, 90, 130, 120, 140, 160, 220]);

  // 6) Mục tiêu tiết kiệm
  getOrCreateSheet_(S.GOAL, ['Tên mục tiêu', 'Số tiền cần', 'Tiền tệ (AUD / VND)', 'Hạn', 'Đã có'], [260, 120, 140, 110, 120]);

  // 7) Cấu hình
  var c = getOrCreateSheet_(S.CFG, ['Khóa', 'Giá trị', 'Mô tả'], [220, 120, 420]);
  if (c.created) {
    c.sheet.getRange(2, 1, 2, 3).setValues([
      ['ACB_NGAY_SAO_KE', '', 'Ngày sao kê thẻ ACB hằng tháng (1-31), để trống nếu không cần nhắc'],
      ['ACB_NGAY_DEN_HAN', '', 'Ngày đến hạn thanh toán thẻ ACB hằng tháng (1-31)']
    ]);
  }
}
