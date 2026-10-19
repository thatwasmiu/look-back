# Tự động backup lên Google Drive

Look Back có thể tự đẩy **một bản backup đầy đủ** (database + mọi ảnh/video/nhạc, kể cả file nằm trên R2/B2) lên
Google Drive của bạn theo lịch (mặc định **mỗi tuần, Chủ nhật 3 giờ sáng giờ Việt Nam**). Drive luôn giữ bản mới nhất;
bản cũ chỉ bị xoá sau khi bản mới đã đẩy xong và kiểm tra khớp kích thước.

App chỉ xin quyền **`drive.file`**: chỉ thấy và quản lý những file do chính nó tạo, không đọc được file khác trong
Drive của bạn.

## 1. Tạo OAuth client trên Google Cloud (làm một lần, ~10 phút)

1. Vào <https://console.cloud.google.com/> → chọn **Select a project → New project**, đặt tên `look-back` → **Create**.
2. Menu **APIs & Services → Library** → tìm **Google Drive API** → **Enable**.
3. **APIs & Services → OAuth consent screen** (hoặc **Google Auth Platform → Branding/Audience**):
   - User type: **External** → điền App name `Look Back`, email hỗ trợ và email liên hệ là email của bạn.
   - **Data access / Scopes** → **Add or remove scopes** → chọn `.../auth/drive.file`, `openid`, `.../auth/userinfo.email`.
   - **Audience / Publishing status** → bấm **Publish app** để chuyển sang **In production**. (Với `drive.file` không
     cần Google xét duyệt. Nếu để "Testing", quyền sẽ tự hết hạn sau 7 ngày.)
4. **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**, tên tuỳ ý.
   - **Authorized redirect URIs** → thêm: `https://lookback.daste.io.vn/api/manage/drive/callback`
   - **Create** → chép **Client ID** và **Client secret**.

## 2. Khai báo trên VPS

Thêm vào `deploy/.env` trên VPS (thư mục chạy `docker compose`):

```
GOOGLE_CLIENT_ID=<Client ID>
GOOGLE_CLIENT_SECRET=<Client secret>
```

Rồi khởi động lại:

```bash
cd /root/project/lookback && docker compose -f compose.yml up -d
```

## 3. Kết nối trên app

1. Mở `https://lookback.daste.io.vn/manage` → mục **Backup Drive** → **Kết nối Google Drive**.
2. Đăng nhập Google, cho phép quyền. Google có thể báo "ứng dụng chưa được xác minh": bấm **Advanced → Go to Look Back**
   (app là của chính bạn).
3. Quay về `/manage`: thấy email của bạn và lịch **Hằng tuần**. Bấm **Backup ngay** để chạy thử lần đầu.
4. Trong Drive sẽ có thư mục **Look Back backup** chứa `lookback-backup-YYYY-MM-DD.tar`.

## Trạng thái và lỗi thường gặp

| Trên /manage | Ý nghĩa / cách xử lý |
|---|---|
| OK — lần gần nhất … | Bản mới nhất đã lên Drive. |
| Thiếu N file (nơi lưu đang lỗi) | Một nơi lưu (R2/B2) không đọc được; app giữ thêm bản đầy đủ trước đó. Sửa nơi lưu rồi **Backup ngay**. |
| Quyền truy cập Drive đã hết | Bạn đã gỡ quyền hoặc app còn ở chế độ "Testing" → bấm **Kết nối lại**. |
| Drive không đủ chỗ: cần khoảng X GB | Drive 15 GB dùng chung với Gmail/Photos; khi đẩy bản mới cần chỗ cho cả bản cũ lẫn bản mới. Dọn Drive rồi chạy lại. |

## Khôi phục từ bản trên Drive

1. Tải file `lookback-backup-….tar` từ thư mục **Look Back backup** về máy, rồi chép lên VPS (ví dụ bằng `scp`) vào
   `/root/project/lookback/lookback-backup.tar`.
2. Trên VPS (thao tác này **thay toàn bộ** album và file hiện có bằng nội dung bản backup):

```bash
cd /root/project/lookback
docker compose -f compose.yml run --rm -v "$PWD/lookback-backup.tar:/backup.tar:ro" api node server/dist/restore.js /backup.tar
```

Sau khi khôi phục, mọi file nằm trên VPS; vào `/manage` nhập lại khoá cho từng nơi lưu (R2/B2) và bấm **Kết nối lại**
Google Drive nếu cần.
