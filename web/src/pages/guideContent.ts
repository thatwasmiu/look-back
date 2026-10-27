import type { Lang } from '../i18n';

// The usage guide in both languages. Button names are written as each language shows them in the app.
// img: web/public/guide/<img>.jpg (screenshots, src/dev/guide-shots.mjs).
export type Feature = { h: string; img?: string; p: string[] };
export type Section = { id: string; title: string; features: Feature[] };
export type Guide = { title: string; toc: string; back: string; albums: string; sections: Section[]; shortcutsTitle: string; shortcuts: [string, string][] };

const vi: Guide = {
  title: 'Hướng dẫn sử dụng', toc: 'Mục lục', back: '← Quay lại', albums: '← Album',
  sections: [
    { id: 'albums', title: '1. Danh sách album', features: [
      { h: 'Tạo album mới', img: 'new-album', p: [
        'Bấm một trong ba nút ở đầu trang: **＋ Scrapbook**, **＋ Manga** hoặc **＋ Photobooth**, nhập tên rồi **Tạo**. Đóng bằng **Huỷ**, ×, phím Esc hoặc bấm ra ngoài.',
        'Trong hộp vẫn đổi được loại album (chọn một lần khi tạo). Manga chọn thêm chiều đọc **Trái → phải** hoặc **Phải → trái**. Photobooth có mẫu riêng (2 3 con mực, Tiệc photobooth, Photobooth cưới, Đêm bạn bè), không có ✨ AI.',
        '**Mẫu**: **Album trống** chỉ có trang bìa; các mẫu dựng sẵn có nhiều trang, giấy, sticker, chữ, màu bàn và hiệu ứng nền.',
        '**Chép thiết kế của album (không kèm ảnh)**: tạo album giống hệt một album đã có, mọi khung để trống.'] },
      { h: 'Tạo album bằng AI', p: [
        'Chọn thẻ **✨ AI**, gõ mô tả ngắn (tối đa 200 ký tự), ví dụ “1 ngày đi làm — đi đường, thang máy, họp, về nhà”, rồi **Tạo**. AI chọn 4–10 trang từ các mẫu có sẵn, viết lời thoại, lời dẫn, chọn sticker và màu nền; khung ảnh để trống cho bạn.',
        'Cần Gemini key trong /manage (mục **AI (Gemini)**). Mất khoảng 20 giây.'] },
      { h: 'Mở, sửa, xoá album', img: 'albums', p: [
        'Bấm ảnh bìa để xem album, **Sửa** để trang trí.',
        'Ảnh bìa đặt bằng nút ★ trong khu ảnh của album. Chưa đặt thì thẻ album hiện thu nhỏ trang đầu.',
        '**Xoá** xoá vĩnh viễn album cùng toàn bộ ảnh và video (luôn hỏi trước).'] },
      { h: 'Ngôn ngữ và đăng xuất', p: ['Nút **EN / VI** ở góc trên đổi tiếng Anh / tiếng Việt (máy nhớ lựa chọn). **Biểu tượng cửa** ở cạnh đó để đăng xuất.'] },
    ] },
    { id: 'share', title: '2. Chia sẻ', features: [
      { h: 'Link xem', img: 'share', p: [
        'Bấm **Chia sẻ** dưới album → **Tạo link chia sẻ** → **Chép**. Người nhận mở link là xem được, không cần mật khẩu, không sửa được.',
        '**Dừng chia sẻ** làm link cũ hết hiệu lực ngay, kể cả ảnh và video.'] },
      { h: 'Chia sẻ lên mạng xã hội', p: [
        'Khi xem album, bấm **Chia sẻ** (cả người xem qua link cũng có): chọn khổ **Bài đăng 4:5** hoặc **Story / TikTok 9:16**, tick các trang.',
        '**Tạo ảnh**: mỗi trang một ảnh JPG. **Tạo video**: một video MP4, mỗi trang 3 giây, kèm nhạc của album. Rồi **Chia sẻ…** (mở bảng chia sẻ của điện thoại: Instagram, TikTok, Zalo…) hoặc **Tải về**.'] },
      { h: 'Link sửa (cho người khác cùng làm)', p: [
        'Trong hộp **Chia sẻ**, gõ **Số giờ** (1–168) rồi **Tạo link sửa** → **Chép**. Người nhận mở link là vào sửa được, không cần mật khẩu.',
        'Họ được: bỏ ảnh/video vào khung, thêm/sửa/xoá chữ, bong bóng thoại, sticker, băng dính, hiệu ứng, đổi giấy. Họ không được: thêm/xoá/chuyển/ẩn trang, thêm/xoá/kéo khung hay panel, đổi tên, nhạc, nền album.',
        'Link còn hạn: gõ số giờ mới rồi **Gia hạn**, hoặc **Thu hồi** để khoá ngay.',
        'Bạn đang mở màn sửa cùng lúc: quay lại tab là thấy trang và ảnh họ vừa thêm. Hai người sửa cùng một trang thì bản lưu sau bị từ chối và tải bản mới (“Trang vừa được người khác sửa”).'] },
      { h: 'Cài app từ link', p: [
        'Mở link xem hoặc link sửa rồi “Thêm vào màn hình chính”: app cài ra sẽ mở thẳng album đó.',
        'Đã lỡ cài app từ trang chủ? Ở màn đăng nhập, dán link vào ô **Link hoặc mã chia sẻ** → **Mở**; lần sau có nút **Mở album được chia sẻ lần trước**.'] },
    ] },
    { id: 'pages', title: '3. Trang', features: [
      { h: 'Thêm trang theo mẫu', img: 'templates', p: ['Bấm **+** trong thanh **Trang**, hoặc nút tròn **+** ở góc trang cuối, rồi chọn một mẫu trang.'] },
      { h: 'Chuyển trang', p: ['Nút tròn ← / → ở hai góc, phím ← / → khi không chọn vật nào, hoặc bấm ảnh nhỏ trong **Trang**.'] },
      { h: 'Sắp xếp, ẩn và xoá trang', img: 'pages', p: [
        'Dưới ảnh nhỏ của trang đang mở: ◀ / ▶ đổi vị trí, **Ẩn** / **Hiện**, ✕ xoá. Có thể kéo thả ảnh nhỏ để đổi thứ tự.',
        '**Ẩn** giữ trang trong màn sửa nhưng không hiện khi xem, chia sẻ hay in — không phải xoá.',
        'Bấm nhãn **Trang** để thu gọn / mở thanh trang (trên điện thoại mặc định thu gọn).'] },
      { h: 'Đổi tên album', p: ['Trong màn trang trí, bấm tên album ở góc trên (biểu tượng ✎). Enter để lưu, Esc để huỷ.'] },
    ] },
    { id: 'media', title: '4. Ảnh và video', features: [
      { h: 'Tải lên', img: 'editor', p: [
        'Bấm **Tải lên** trong khu ảnh. Hỗ trợ ảnh và video lớn; mạng chập chờn vẫn tải tiếp được.',
        'Trong lúc tải và xử lý, khung hiện ngay ảnh bạn vừa chọn kèm nhãn “đang tải…” / “đang xử lý…”.',
        'Trang có từ 2 khung trống trở lên: nút **＋ Thêm ảnh vào N khung trống** ở dưới trang — chọn nhiều ảnh một lần, ảnh lần lượt vào các khung trống theo thứ tự đọc; ảnh thừa nằm trong khu ảnh.'] },
      { h: 'Dán ảnh từ clipboard', p: ['Chụp màn hình hoặc “Copy image” rồi **Ctrl+V**. Đang chọn khung trống thì ảnh vào thẳng khung đó.'] },
      { h: 'Đưa ảnh vào khung', img: 'frame-menu', p: [
        'Bấm **+ thêm** trên khung trống → **Tải lên** hoặc chọn một ảnh đã có. Trên điện thoại có thêm **Chụp ảnh/quay video** (camera của máy).',
        '**Chụp theo khung** (điện thoại): camera trong app hiện đúng hình và tỉ lệ khung; chế độ **Ảnh**, **Photobooth** hoặc **Video**, **Đổi camera**, thanh **Zoom**, **⚡ Đèn** (nếu máy có), **⏱ Hẹn giờ** 3 / 5 / 10 giây (bấm nút chụp lần nữa để huỷ). Trong Zalo trên iPhone không dùng được — mở bằng Safari.',
        'Hoặc kéo ảnh từ khu ảnh thả vào khung.'] },
      { h: 'Cắt video', p: ['Chọn khung có video → **✂ Cắt video**: kéo điểm bắt đầu / kết thúc. Video gốc không bị cắt; **Cả video** để phát lại cả bài.'] },
      { h: 'Ảnh bìa và xoá ảnh', p: ['Trong khu ảnh: ★ đặt làm ảnh bìa; 🗑 xoá ảnh khỏi album (khung đang dùng sẽ trống lại).'] },
    ] },
    { id: 'decorate', title: '5. Trang trí', features: [
      { h: 'Nút ＋ Thêm', img: 'frames', p: [
        '**＋ Thêm** mở danh sách những thứ có thể thêm: **Khung**, **Sticker**, **Băng dính**, **Chữ**, **Hiệu ứng** (album manga: **Panel**, **Thoại**, **Lời dẫn**, **Tiếng động**, **Nét**, **Lưới chấm**, **Chữ**, **Hiệu ứng**).',
        'Chọn một loại có nhiều kiểu (khung, sticker, thoại…) thì danh sách kiểu của loại đó hiện ra.'] },
      { h: 'Khi chọn một vật', p: ['Hàng nút thứ hai hiện ra cho vật đang chọn: **Chữ & màu**, **Kiểu khung**, **Cắt ảnh**, **Gỡ ảnh**, **Nhân bản**, **Ghim**, ↑ ↓ 🗑…'] },
      { h: 'Cắt và chỉnh cỡ ảnh', img: 'crop', p: [
        'Chọn khung có ảnh → **Cắt ảnh** (hoặc nhấp đúp). Kéo để dịch ảnh tự do (cả ra ngoài mép khung), cuộn chuột / chụm hai ngón để phóng to.',
        '**Vừa** hiện trọn ảnh, **Đầy** phủ kín khung, **Gỡ ảnh** bỏ ảnh khỏi khung, **Xong** để kết thúc.'] },
      { h: 'Chữ', img: 'text', p: [
        '**＋ Thêm → Chữ**. Nhấp đúp vào chữ để sửa.',
        '**Chữ & màu**: kiểu chữ, cỡ (**A−** / **A+**), căn lề, giãn dòng, **Viền chữ**, màu chữ.'] },
      { h: 'Giấy và nền', img: 'background', p: [
        '**Giấy** đổi giấy của trang (scrapbook): kem, kraft, ô li, chấm bi, vở kẻ dòng, hồng, xanh trời, xanh bạc hà.',
        '**Nền** chọn màu bàn, hiệu ứng nền cả album, chiều đọc (manga) và nhạc nền (**Tải nhạc lên**, **▶ Phát** / **⏸ Dừng**, **Bỏ nhạc**).'] },
    ] },
    { id: 'items', title: '6. Thao tác với vật', features: [
      { h: 'Chọn, di chuyển, đổi cỡ, xoay', img: 'selected', p: ['Bấm để chọn, kéo để di chuyển, kéo các góc để đổi cỡ, nút tròn phía trên để xoay. Bấm chỗ trống để bỏ chọn.'] },
      { h: 'Ghim', p: ['**📌 Ghim** khoá vật tại chỗ; **📌 Bỏ ghim** để mở. **📌 Ghim hết** ghim mọi vật trên trang một lần.'] },
      { h: 'Đối xứng khi kéo', p: ['Khi kéo, vật tự căn vào giữa/mép trang và thẳng hàng với khung, chữ khác. Nút **Đối xứng** bật/tắt.'] },
      { h: 'Nhân bản, hoàn tác, phóng to', p: [
        '**⧉ Nhân bản** hoặc **Ctrl+C** / **Ctrl+V** (dán được sang trang khác).',
        '↶ / ↷ hoặc **Ctrl+Z** / **Ctrl+Shift+Z**. − / + phóng 100–300%, bấm số % để về vừa màn hình.'] },
      { h: 'Tự động lưu', p: ['Mọi thay đổi tự lưu (“Đã lưu”). Lưu lỗi thì hiện “Lưu lỗi” và nút **Lưu lại**.',
        'Hai người cùng sửa một trang (bạn và người có link sửa): ai lưu sau sẽ thấy “Trang vừa được người khác sửa — đã tải bản mới” thay vì ghi đè. Sửa trang khác nhau thì không sao.'] },
    ] },
    { id: 'view', title: '7. Xem album', features: [
      { h: 'Lật trang như sách', img: 'viewer', p: ['Vuốt, bấm hai bên hoặc phím ← / →. Màn hình rộng hiện hai trang. Trang đang ẩn không hiện.'] },
      { h: 'Video và nhạc', p: ['Video tự phát tắt tiếng khi tới trang; bấm để bật tiếng. Nhạc nền bắt đầu từ lần chạm đầu tiên; nút ♪ để dừng/phát.'] },
      { h: 'Sửa đúng trang, in PDF', p: ['**Sửa** mở đúng trang đang xem. **PDF**: mỗi trang một tờ, chọn “Lưu thành PDF” trong hộp thoại in.'] },
    ] },
    { id: 'phone', title: '8. Trên điện thoại', features: [
      { h: 'Công cụ dưới đáy', img: 'phone', p: ['Công cụ ở đáy màn hình; **Ẩn công cụ** để nhìn trang rộng hơn, **Hiện công cụ** để mở lại.'] },
      { h: 'Xem khi mất mạng', p: ['Album đã mở khi có mạng thì mất mạng vẫn xem lại được. Offline không tải lên, không lưu chỉnh sửa; video và nhạc cần mạng.'] },
    ] },
    { id: 'manga', title: '9. Manga', features: [
      { h: 'Panel và bố cục trang', img: 'manga-editor', p: [
        'Trang manga dùng giấy trắng và panel viền đen; **Thêm trang** có nhiều bố cục (lưới, xiên, 4-koma, hội thoại…).',
        'Chọn một panel: **Hình** (kéo từng góc), **Mực** (đen trắng), **Lưới** (chấm tram), **Không viền / Mảnh / Viền**.'] },
      { h: 'Thoại, lời dẫn, tiếng động', p: [
        '**＋ Thêm → Thoại** → **Lời nói**, **Hét**, **Suy nghĩ**. **Lời dẫn** là ô chữ nhật, **Tiếng động** là chữ lớn.',
        'Chọn bong bóng lời nói/suy nghĩ: nhóm **Đuôi** (↙ ↘ ↖ ↗ ∅) chọn hướng đuôi. Gõ xong bong bóng tự nở cho vừa chữ.'] },
      { h: 'Nét tốc độ và lưới chấm', p: ['**＋ Thêm → Nét** → **Nét tốc độ** / **Nét tập trung**; **Lưới chấm**. Đang chọn panel thì lớp mới phủ đúng panel đó.'] },
      { h: 'Đọc từ phải sang trái', p: ['Chọn khi tạo album, đổi sau trong **Nền → Chiều đọc**. Đọc phải sang trái: phím ← hoặc bấm mép trái là sang trang tiếp.'] },
    ] },
    { id: 'booth', title: '10. Photobooth', features: [
      { h: 'Album photobooth', p: [
        'Bấm **＋ Photobooth** ở danh sách album. Album trống bắt đầu bằng một trang dải ảnh; các mẫu có sẵn nhiều trang photobooth.',
        'Trang **Booth** (dải 3 / 4 kiểu, 1 lớn + 3, lưới 2 × 2, 3 + ô tiêu đề, tiêu đề + 2, 2 ảnh chồng) cũng có trong **+ trang** của mọi album scrapbook.'] },
      { h: 'Chụp bộ mới', p: [
        'Trong album photobooth bấm **📸 Chụp bộ mới** (hoặc **📸 Chụp** dưới album ở danh sách): chọn bố cục, app thêm trang mới rồi mở camera trước, chế độ **🎞 Photobooth**.',
        'Bấm ★ một lần: đếm ngược có tiếng bíp, chụp, chớp sáng, tự sang khung kế tiếp tới khung cuối. Xong thì ô ngày tự điền hôm nay và hỏi **Chụp bộ tiếp** / **Đổi bố cục** / **Xong**. **■** để dừng — các kiểu đã chụp vẫn giữ.',
        'Trang có sẵn khung trống: **+ thêm** → **Chụp theo khung** → **🎞 Photobooth** cũng chụp liền các khung trống.'] },
      { h: 'Bộ lọc', p: ['**Lọc** (album photobooth): **Đen trắng**, **Nâu cổ**, **Phim**, **Ấm** cho mọi ảnh trên trang. Ảnh gốc không đổi; chọn **Không lọc** để bỏ.'] },
      { h: 'Boomerang', p: ['Khi xem album photobooth, **Chia sẻ** → **🔁 Boomerang**: các kiểu trên trang đã chọn chạy tới rồi lùi, thành video ngắn (theo bộ lọc của trang) để đăng Story, TikTok, Zalo.'] },
      { h: 'Kiosk và mã QR cho buổi tiệc', p: [
        '**🖥 Kiosk** (cạnh **Chụp bộ mới**): toàn màn hình cho máy tính bảng/laptop đặt ở tiệc — khách chọn bố cục, **Chạm để chụp**, mỗi bộ thành một trang, hiện **Cảm ơn!** rồi quay lại. ✕ để thoát.',
        'Tạo **link sửa** cho album photobooth: hộp Chia sẻ hiện **mã QR**. Khách quét bằng điện thoại để tự chụp một bộ vào album (chỉ thêm được trang Booth, vào cuối album).'] },
    ] },
    { id: 'space', title: '11. Space', features: [
      { h: 'Một không gian, thật nhiều ảnh', p: [
        'Bấm **＋ Space**, chọn **Tường dọc** (cuộn xuống), **Dải ngang** (vuốt ngang), **Bảng tự do** (kéo đi mọi hướng, phóng to/thu nhỏ) hoặc **Vòng cầu** (ảnh dán quanh một quả cầu 3D). Album Space chỉ có một trang — một không gian lớn.',
        'Nút **＋ Thêm ảnh** ở dưới không gian: chọn nhiều ảnh một lần, ảnh được xếp thành lưới sau những gì đang có (vòng cầu: thêm vào quả cầu).',
        'Trong màn sửa, nút **🧩 Không gian**: **Dọc / Ngang / Tự do / Vòng cầu** đổi dạng (ảnh giữ chỗ trong từng đoạn), **Dài hơn / Ngắn hơn** (bảng: **Lớn hơn / Nhỏ hơn**, từ 2 × 2 tới 5 × 5; không bao giờ cắt mất vật đang có), **Xếp ảnh: lưới** hoặc **Xếp ảnh: rải** đặt mọi ảnh của album chưa có trên không gian vào sau những gì đang có.'] },
      { h: 'Vòng cầu', p: [
        'Ảnh được app tự rải đều quanh quả cầu; bạn chỉ chọn ảnh và thứ tự. **＋ Thêm ảnh** (ảnh mới) hoặc **🧩 Không gian → Thêm ảnh của album** (ảnh đã tải lên) đưa ảnh lên cầu; bên dưới quả cầu, ◀ ▶ đổi thứ tự, ✕ bỏ một ảnh.',
        'Khi xem: kéo để xoay (quả cầu trôi thêm một chút rồi tự quay chậm), chạm một ảnh để mở to. **Chia sẻ**: một ảnh quả cầu, hoặc **Tạo video** quả cầu quay một vòng (8 giây, kèm nhạc). **PDF** in các ảnh thành lưới.'] },
      { h: 'Xem và chia sẻ', p: [
        'Khi xem: cuộn dọc hoặc vuốt ngang; bảng tự do mở vừa màn hình — chụm hai ngón, Ctrl + cuộn chuột, nhấp đúp hoặc nút **＋ / −** để phóng to, kéo để đi khắp bảng. Chạm một ảnh để mở to, ← → hoặc vuốt để sang ảnh khác, × hoặc vuốt xuống để đóng.',
        '**Chia sẻ** cắt tường / dải thành các phần cỡ một trang (**Phần 1, 2…**) — đăng thành một bài nhiều ảnh (carousel); bảng tự do thành một ảnh cả bảng. **PDF** in mỗi phần một tờ (bảng: một tờ).'] },
    ] },
  ],
  shortcutsTitle: '12. Phím tắt',
  shortcuts: [['← / →', 'Chuyển trang (khi không chọn vật nào)'], ['Mũi tên', 'Dịch vật đang chọn'], ['Delete / Backspace', 'Xoá vật đang chọn'],
    ['Ctrl+C / Ctrl+V', 'Sao chép / dán vật; Ctrl+V cũng dán ảnh'], ['Ctrl+Z / Ctrl+Shift+Z', 'Hoàn tác / làm lại'], ['Ctrl + cuộn chuột', 'Phóng to / thu nhỏ trang'], ['Esc', 'Đóng bảng chọn, hộp thoại']],
};

const en: Guide = {
  title: 'User guide', toc: 'Contents', back: '← Back', albums: '← Albums',
  sections: [
    { id: 'albums', title: '1. Albums', features: [
      { h: 'New album', img: 'new-album', p: [
        'Tap one of the three buttons at the top: **＋ Scrapbook**, **＋ Manga** or **＋ Photobooth**, type a name, then **Create**. Close with **Cancel**, ×, Esc or a tap outside.',
        'The dialog can still switch the kind (chosen once, when creating). Manga also asks the reading direction: **Left → right** or **Right → left**. Photobooth has its own templates (2 3 con mực, Party booth, Wedding booth, Friends night) and no ✨ AI.',
        '**Template**: **Empty album** has just a cover; the ready-made ones come with pages, paper, stickers, text, desk colour and background effects.',
        "**Copy an album's design (without photos)**: a new album laid out like an existing one, with every frame empty."] },
      { h: 'AI album', p: [
        'Pick **✨ AI**, write a short description (up to 200 characters), e.g. “A workday — commute, lift, meeting, home”, then **Create**. The AI picks 4–10 pages from the templates and writes the bubbles, captions, stickers and colours; the frames are left for your photos.',
        'Needs a Gemini key in /manage (**AI (Gemini)**). Takes about 20 seconds.'] },
      { h: 'Open, edit, delete', img: 'albums', p: [
        'Tap a cover to view the album, **Edit** to decorate it.',
        "The cover is the photo starred with ★ in the album's photos; without one, the card shows the first page.",
        '**Delete** removes the album with all its photos and videos for good (it always asks first).'] },
      { h: 'Language and logging out', p: ['The **EN / VI** button at the top switches English / Vietnamese (remembered on this device). The **door icon** next to it logs out.'] },
    ] },
    { id: 'share', title: '2. Sharing', features: [
      { h: 'View link', img: 'share', p: [
        'Tap **Share** under an album → **Create share link** → **Copy**. Anyone with the link can view it — no password, no editing.',
        '**Stop sharing** kills the link at once, photos and videos included.'] },
      { h: 'Share to social media', p: [
        'While viewing an album, tap **Share** (people viewing through a link have it too): pick **Post 4:5** or **Story / TikTok 9:16** and tick the pages.',
        "**Make images**: one JPG per page. **Make video**: one MP4, 3 s per page, with the album's music. Then **Share…** (the phone's share menu: Instagram, TikTok, Zalo…) or **Download**."] },
      { h: 'Edit link (let others help)', p: [
        'In the **Share** box, type the **Hours** (1–168), then **Create edit link** → **Copy**. Whoever opens it can edit — no password.',
        "They can: put photos/videos into frames, add/change/delete text, bubbles, stickers, tape, effects, change the paper. They can't: add/delete/move/hide pages, add/delete/move frames or panels, or change the album's name, music or background.",
        'While it is valid: type new hours and **Extend**, or **Revoke** to lock it at once.',
        "Editing at the same time: come back to your tab and the pages and photos they added are there. Two people on one page: the later save is refused and the newer version loads (“Someone else just changed this page”)."] },
      { h: 'Installing from a link', p: [
        'Open a view or edit link and “Add to Home Screen”: the installed app opens straight on that album.',
        'Installed it from the home page instead? On the login screen paste the link into **Shared link or code** → **Open**; next time there is **Open the last shared album**.'] },
    ] },
    { id: 'pages', title: '3. Pages', features: [
      { h: 'Add a page', img: 'templates', p: ['Tap **+** in the **Pages** strip, or the round **+** on the last page, then pick a layout.'] },
      { h: 'Switch pages', p: ['The round ← / → buttons, the ← / → keys with nothing selected, or a thumbnail in **Pages**.'] },
      { h: 'Reorder, hide, delete', img: 'pages', p: [
        "Under the current page's thumbnail: ◀ / ▶ move it, **Hide** / **Show**, ✕ deletes it. Thumbnails can also be dragged.",
        "**Hide** keeps the page in the editor but leaves it out of viewing, sharing and printing — nothing is deleted.",
        'Tap the **Pages** label to fold the strip (folded on phones by default).'] },
      { h: 'Rename the album', p: ["In the editor, tap the album's name at the top (✎). Enter saves, Esc cancels."] },
    ] },
    { id: 'media', title: '4. Photos and videos', features: [
      { h: 'Upload', img: 'editor', p: [
        "Tap **Upload** in the photos area. Big photos and videos are fine; a shaky connection resumes.",
        'While uploading and processing, the frame already shows the picked photo with an “uploading…” / “processing…” label.',
        'A page with 2 or more empty frames shows **＋ Add photos to the N empty frames** below it: pick many at once and they fill the empty frames in reading order; the rest wait in the photos area.'] },
      { h: 'Paste from the clipboard', p: ['Take a screenshot or “Copy image”, then **Ctrl+V**. With an empty frame selected it goes straight into it.'] },
      { h: 'Photos into frames', img: 'frame-menu', p: [
        "Tap **+ add** on an empty frame → **Upload** or one of the album's photos. Phones also get **Take photo/video** (the phone's camera).",
        "**Shoot in the frame** (phones): the in-app camera shows the frame's exact shape; **Photo**, **Photobooth** or **Video**, **Switch camera**, **Zoom**, **⚡ Light** where available, **⏱ Self-timer** 3 / 5 / 10 s (tap the shutter again to cancel). Not inside Zalo on iPhone — open in Safari.",
        'Or drag a photo from the photos area onto a frame.'] },
      { h: 'Trimming videos', p: ['Select a frame with a video → **✂ Trim**: drag the start / end. The original stays whole; **Full video** plays all of it again.'] },
      { h: 'Cover and deleting', p: ["In the photos area: ★ makes it the cover; 🗑 deletes it from the album (frames using it become empty)."] },
    ] },
    { id: 'decorate', title: '5. Decorating', features: [
      { h: 'The ＋ Add button', img: 'frames', p: [
        '**＋ Add** lists what you can add: **Frame**, **Sticker**, **Tape**, **Text**, **Effect** (manga albums: **Panel**, **Bubble**, **Narration**, **Sound effect**, **Lines**, **Screentone**, **Text**, **Effect**).',
        "Kinds with several looks (frames, stickers, bubbles…) open that kind's list."] },
      { h: 'With something selected', p: ['A second row shows what the selected item can do: **Font**, **Frame style**, **Crop**, **Remove photo**, **Duplicate**, **Pin**, ↑ ↓ 🗑…'] },
      { h: 'Crop and size', img: 'crop', p: [
        'Select a frame with a photo → **Crop** (or double-tap it). Drag to move the photo freely (past the frame edges too), scroll / pinch to zoom.',
        '**Fit** shows the whole photo, **Fill** covers the frame, **Remove photo** empties it, **Done** finishes.'] },
      { h: 'Text', img: 'text', p: [
        '**＋ Add → Text**. Double-tap text to edit it.',
        '**Font**: typeface, size (**A−** / **A+**), alignment, line spacing, **Outline**, colour.'] },
      { h: 'Paper and background', img: 'background', p: [
        "**Paper** changes the page's paper (scrapbook): cream, kraft, grid, dots, lined notebook, pink, sky, mint.",
        "**Background** picks the desk colour, the album's background effect, the reading direction (manga) and the music (**Upload music**, **▶ Play** / **⏸ Pause**, **Remove music**)."] },
    ] },
    { id: 'items', title: '6. Working with items', features: [
      { h: 'Select, move, resize, rotate', img: 'selected', p: ['Tap to select, drag to move, drag the corners to resize, the round handle on top to rotate. Tap an empty spot to deselect.'] },
      { h: 'Pin', p: ['**📌 Pin** locks an item in place; **📌 Unpin** frees it. **📌 Pin all** pins everything on the page at once.'] },
      { h: 'Snap', p: ['While dragging, items snap to the page centre/edges and line up with frames and text. **Snap** turns it on/off.'] },
      { h: 'Duplicate, undo, zoom', p: [
        '**⧉ Duplicate** or **Ctrl+C** / **Ctrl+V** (works across pages).',
        '↶ / ↷ or **Ctrl+Z** / **Ctrl+Shift+Z**. − / + zoom 100–300%; tap the % to fit the page again.'] },
      { h: 'Autosave', p: ['Every change saves itself (“Saved”). If saving fails it says “Save failed” with a **Retry save** button.',
        'Two people on the same page (you and someone with the edit link): whoever saves second sees “Someone else just changed this page — their version is loaded” instead of overwriting it. Different pages never clash.'] },
    ] },
    { id: 'view', title: '7. Viewing', features: [
      { h: 'Flip like a book', img: 'viewer', p: ['Swipe, tap either side or use ← / →. Wide screens show two pages. Hidden pages are skipped.'] },
      { h: 'Video and music', p: ['Videos play muted when their page shows; tap for sound. Music starts on the first tap; ♪ pauses / plays it.'] },
      { h: 'Edit this page, print a PDF', p: ['**Edit** opens the page you are looking at. **PDF**: one page per sheet — choose “Save as PDF” in the print dialog.'] },
    ] },
    { id: 'phone', title: '8. On phones', features: [
      { h: 'Tools at the bottom', img: 'phone', p: ['The tools sit at the bottom; **Hide tools** gives the page more room, **Show tools** brings them back.'] },
      { h: 'Offline', p: ["Albums opened while online can be viewed again offline. Offline there's no uploading or saving; videos and music need a connection."] },
    ] },
    { id: 'manga', title: '9. Manga', features: [
      { h: 'Panels and layouts', img: 'manga-editor', p: [
        'Manga pages use white paper and black-bordered panels; **Add page** offers many layouts (grids, slants, 4-koma, dialogue…).',
        'With a panel selected: **Shape** (drag each corner), **Ink** (black & white), **Tone** (dots), **No border / Thin / Border**.'] },
      { h: 'Bubbles, narration, sound effects', p: [
        '**＋ Add → Bubble** → **Speech**, **Shout**, **Thought**. **Narration** is a caption box, **Sound effect** big lettering.',
        'With a speech or thought bubble selected, **Tail** (↙ ↘ ↖ ↗ ∅) points its tail. Bubbles grow to fit the words.'] },
      { h: 'Speed lines and screentone', p: ['**＋ Add → Lines** → **Speed lines** / **Focus lines**; **Screentone**. With a panel selected the new layer covers that panel.'] },
      { h: 'Right-to-left reading', p: ['Chosen when creating; change it later in **Background → Reading direction**. Right to left: ← or the left edge goes forward.'] },
    ] },
    { id: 'booth', title: '10. Photobooth', features: [
      { h: 'Photobooth albums', p: [
        'Tap **＋ Photobooth** on the album list. An empty one starts on a strips page; the templates come with several booth pages.',
        "The **Booth** pages (strips of 3 / 4, 1 big + 3, 2 × 2, 3 + title card, title + 2, 2 stacked) are also in every scrapbook album's **+ page**."] },
      { h: 'Shoot a new set', p: [
        'In a photobooth album tap **📸 Shoot a new set** (or **📸 Shoot** under the album on the list): pick a layout; a new page is added and the front camera opens in **🎞 Photobooth**.',
        "Tap ★ once: a beeping countdown, a shot, a flash, then on to the next frame until the last. Then the date box gets today's date and it asks **Shoot another set** / **Other layout** / **Done**. **■** stops — the shots taken are kept.",
        'A page with empty frames already: **+ add** → **Shoot in the frame** → **🎞 Photobooth** fills them in one go too.'] },
      { h: 'Filters', p: ["**Filter** (photobooth albums): **Black & white**, **Sepia**, **Film**, **Warm** for every photo on the page. The files stay as they are; **No filter** removes it."] },
      { h: 'Boomerang', p: ["While viewing a photobooth album, **Share** → **🔁 Boomerang**: the chosen pages' shots play forward and back as a short video (with the page's filter) for Stories, TikTok, Zalo."] },
      { h: 'Kiosk and QR code for a party', p: [
        '**🖥 Kiosk** (next to **Shoot a new set**): full screen for a tablet or laptop at a party — guests pick a layout, **Tap to shoot**, each set becomes a page, **Thank you!**, and back to the start. ✕ exits.',
        "Create an **edit link** for a photobooth album: the Share box shows a **QR code**. Guests scan it with their phones and shoot their own set into the album (Booth pages only, added at the end)."] },
    ] },
    { id: 'space', title: '11. Space', features: [
      { h: 'One space, lots of photos', p: [
        'Tap **＋ Space**, pick **Vertical wall** (scrolled down), **Horizontal strip** (swiped sideways), **Free board** (panned any way, zoomed in and out) or **Sphere** (photos round a 3D globe). A space album has one page — one big space.',
        '**＋ Add photos** below the space: pick many at once and they are laid out as a grid after what is there (a sphere: onto the globe).',
        "In the editor, **🧩 Space**: **Vertical / Horizontal / Free / Sphere** changes the shape (items keep their place in each part), **Longer / Shorter** (a board: **Bigger / Smaller**, 2 × 2 to 5 × 5; never cuts an item off), **Arrange: grid** or **Arrange: scatter** puts the album's photos that aren't on the space yet after what is there."] },
      { h: 'Sphere', p: [
        "The app spreads the photos evenly round the globe; you only pick them and their order. **＋ Add photos** (new ones) or **🧩 Space → Add the album's photos** (already uploaded) puts them on it; under the globe, ◀ ▶ reorder and ✕ takes one off.",
        'Viewing: drag to turn it (it drifts a little, then spins slowly), tap a photo to see it big. **Share**: a picture of the globe, or **Make video** of it turning once (8 s, with the music). **PDF** prints the photos as a grid.'] },
      { h: 'Viewing and sharing', p: [
        'Viewing: scroll down or swipe sideways; a free board opens whole on screen — pinch, Ctrl + wheel, double-tap or **＋ / −** to zoom, drag to move around it. Tap a photo to see it big, ← → or a swipe for the next, × or a swipe down to close.',
        '**Share** cuts a wall / strip into page-sized parts (**Part 1, 2…**) — one post with several slides (a carousel); a free board makes one picture of the whole board. **PDF** prints one part per sheet (a board: one sheet).'] },
    ] },
  ],
  shortcutsTitle: '12. Shortcuts',
  shortcuts: [['← / →', 'Switch pages (nothing selected)'], ['Arrows', 'Nudge the selected item'], ['Delete / Backspace', 'Delete the selected item'],
    ['Ctrl+C / Ctrl+V', 'Copy / paste an item; Ctrl+V also pastes photos'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl + scroll', 'Zoom the page'], ['Esc', 'Close lists and dialogs']],
};

export const GUIDE: Record<Lang, Guide> = { vi, en };
