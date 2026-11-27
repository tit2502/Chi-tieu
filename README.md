# Chi tiêu AUD / VND (bản cá nhân)

App PWA nhập chi tiêu nhanh trên iPhone, dữ liệu nằm trong Google Sheet của bạn.

- `apps-script/` – backend: dán vào Apps Script của sheet `QuanLyChiTieu`
- `docs/` – app (GitHub Pages phục vụ thư mục này)
- `tests/lib.test.js` – kiểm thử logic (`node tests/lib.test.js`)

## Cài đặt (làm một lần)

### 1. Apps Script
1. Mở Google Sheet, chọn **Tiện ích mở rộng > Apps Script**.
2. Nếu đã có hàm `doPost` (nhận dữ liệu từ Apple Shortcuts), **đổi tên nó thành `doPostLegacy_`**. Không sửa gì khác. Hàm `doPost` mới sẽ tự chuyển các yêu cầu cũ sang đó.
3. Tạo 2 file mới, dán nội dung `Code.gs` và `Setup.gs`.
4. **Cài đặt dự án > Hiện tệp kê khai appsscript.json**, rồi đối chiếu với `appsscript.json` ở đây (múi giờ `Australia/Melbourne`, runtime `V8`, web app chạy bằng tài khoản của bạn, truy cập `ANYONE_ANONYMOUS`).
5. Chọn hàm **`caiDatApp`** và bấm Chạy, cấp quyền. Hàm này thêm 3 cột vào GiaoDich (N, O, P) và tạo các tab `QuyTac`, `NganSach`, `ChuyenDi`, `ChuyenTien`, `MucTieu`, `CauHinh`. Không đụng dữ liệu hay công thức có sẵn. **Mã app** hiện trong Nhật ký thực thi.
6. **Triển khai > Quản lý bản triển khai > Chỉnh sửa (biểu tượng bút) > Phiên bản mới**, để giữ nguyên địa chỉ mà Shortcut đang dùng. Nếu chưa có bản triển khai nào, chọn Triển khai mới > Ứng dụng web, thực thi bằng **Tôi**, quyền truy cập **Bất kỳ ai**. Sao chép địa chỉ `.../exec`.

### 2. GitHub Pages
Repo > **Settings > Pages**, Source: *Deploy from a branch*, branch `main`, thư mục `/docs`. Địa chỉ app: `https://tit2502.github.io/chi-tieu/`.

### 3. iPhone
Mở địa chỉ app bằng Safari, **Chia sẻ > Thêm vào Màn hình chính**, mở app, dán địa chỉ `/exec` và mã app. Muốn xem thử trước, bấm "Dùng thử bản demo".

## Lưu ý
- Mã app là chìa khóa duy nhất bảo vệ dữ liệu. Không đưa vào repo. Quên thì chạy `hienMaApp`, muốn đổi thì chạy `doiMaApp`.
- Tỷ giá mỗi giao dịch được lưu ở cột N của GiaoDich. App dùng tỷ giá này để quy đổi. Các tab có sẵn trong sheet (TheoNgay, TongQuan...) vẫn dùng tỷ giá theo tháng như cũ.
- Hai tab Chuyển tiền: app ghi 2 dòng GiaoDich (loại Chuyển tiền, không tính vào thu/chi) và một dòng phí (Phát sinh).
