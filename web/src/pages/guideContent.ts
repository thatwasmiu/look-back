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
        'Bấm **Album mới**, nhập tên rồi **Tạo**. Đóng bằng **Huỷ**, ×, phím Esc hoặc bấm ra ngoài.',
        'Chọn **Scrapbook** hoặc **Manga** (chọn một lần khi tạo). Manga chọn thêm chiều đọc **Trái → phải** hoặc **Phải → trái**.',
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
      { h: 'Link sửa (cho người khác cùng làm)', p: [
        'Trong hộp **Chia sẻ**, gõ **Số giờ** (1–168) rồi **Tạo link sửa** → **Chép**. Người nhận mở link là vào sửa được, không cần mật khẩu.',
        'Họ được: bỏ ảnh/video vào khung, thêm/sửa/xoá chữ, bong bóng thoại, sticker, băng dính, hiệu ứng, đổi giấy. Họ không được: thêm/xoá/chuyển/ẩn trang, thêm/xoá/kéo khung hay panel, đổi tên, nhạc, nền album.',
        'Link còn hạn: gõ số giờ mới rồi **Gia hạn**, hoặc **Thu hồi** để khoá ngay.'] },
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
        'Trong lúc tải và xử lý, khung hiện ngay ảnh bạn vừa chọn kèm nhãn “đang tải…” / “đang xử lý…”.'] },
      { h: 'Dán ảnh từ clipboard', p: ['Chụp màn hình hoặc “Copy image” rồi **Ctrl+V**. Đang chọn khung trống thì ảnh vào thẳng khung đó.'] },
      { h: 'Đưa ảnh vào khung', img: 'frame-menu', p: [
        'Bấm **+ thêm** trên khung trống → **Tải lên** hoặc chọn một ảnh đã có. Trên điện thoại có thêm **Chụp ảnh/quay video** (camera của máy).',
        '**Chụp theo khung** (điện thoại): camera trong app hiện đúng hình và tỉ lệ khung; chế độ **Ảnh** hoặc **Video**, **Đổi camera**, thanh **Zoom**, **⚡ Đèn** (nếu máy có). Trong Zalo trên iPhone không dùng được — mở bằng Safari.',
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
        'Chọn khung có ảnh → **Cắt ảnh** (hoặc nhấp đúp). Kéo để dịch ảnh, cuộn chuột / chụm hai ngón để phóng to.',
        '**Vừa** hiện trọn ảnh, **Đầy** phủ kín khung, **Gỡ ảnh** bỏ ảnh khỏi khung, **Xong** để kết thúc.'] },
      { h: 'Chữ', img: 'text', p: [
        '**＋ Thêm → Chữ**. Nhấp đúp vào chữ để sửa.',
        '**Chữ & màu**: kiểu chữ, cỡ (**A−** / **A+**), căn lề, giãn dòng, **Viền chữ**, màu chữ.'] },
      { h: 'Giấy và nền', img: 'background', p: [
        '**Giấy** đổi giấy của trang (scrapbook).',
        '**Nền** chọn màu bàn, hiệu ứng nền cả album, chiều đọc (manga) và nhạc nền (**Tải nhạc lên**, **▶ Phát** / **⏸ Dừng**, **Bỏ nhạc**).'] },
    ] },
    { id: 'items', title: '6. Thao tác với vật', features: [
      { h: 'Chọn, di chuyển, đổi cỡ, xoay', img: 'selected', p: ['Bấm để chọn, kéo để di chuyển, kéo các góc để đổi cỡ, nút tròn phía trên để xoay. Bấm chỗ trống để bỏ chọn.'] },
      { h: 'Ghim', p: ['**📌 Ghim** khoá vật tại chỗ; **📌 Bỏ ghim** để mở. **📌 Ghim hết** ghim mọi vật trên trang một lần.'] },
      { h: 'Đối xứng khi kéo', p: ['Khi kéo, vật tự căn vào giữa/mép trang và thẳng hàng với khung, chữ khác. Nút **Đối xứng** bật/tắt.'] },
      { h: 'Nhân bản, hoàn tác, phóng to', p: [
        '**⧉ Nhân bản** hoặc **Ctrl+C** / **Ctrl+V** (dán được sang trang khác).',
        '↶ / ↷ hoặc **Ctrl+Z** / **Ctrl+Shift+Z**. − / + phóng 100–300%, bấm số % để về vừa màn hình.'] },
      { h: 'Tự động lưu', p: ['Mọi thay đổi tự lưu (“Đã lưu”). Lưu lỗi thì hiện “Lưu lỗi” và nút **Lưu lại**.'] },
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
  ],
  shortcutsTitle: '10. Phím tắt',
  shortcuts: [['← / →', 'Chuyển trang (khi không chọn vật nào)'], ['Mũi tên', 'Dịch vật đang chọn'], ['Delete / Backspace', 'Xoá vật đang chọn'],
    ['Ctrl+C / Ctrl+V', 'Sao chép / dán vật; Ctrl+V cũng dán ảnh'], ['Ctrl+Z / Ctrl+Shift+Z', 'Hoàn tác / làm lại'], ['Ctrl + cuộn chuột', 'Phóng to / thu nhỏ trang'], ['Esc', 'Đóng bảng chọn, hộp thoại']],
};

const en: Guide = {
  title: 'User guide', toc: 'Contents', back: '← Back', albums: '← Albums',
  sections: [
    { id: 'albums', title: '1. Albums', features: [
      { h: 'New album', img: 'new-album', p: [
        'Tap **New album**, type a name, then **Create**. Close with **Cancel**, ×, Esc or a tap outside.',
        'Pick **Scrapbook** or **Manga** (chosen once, when creating). Manga also asks the reading direction: **Left → right** or **Right → left**.',
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
      { h: 'Edit link (let others help)', p: [
        'In the **Share** box, type the **Hours** (1–168), then **Create edit link** → **Copy**. Whoever opens it can edit — no password.',
        "They can: put photos/videos into frames, add/change/delete text, bubbles, stickers, tape, effects, change the paper. They can't: add/delete/move/hide pages, add/delete/move frames or panels, or change the album's name, music or background.",
        'While it is valid: type new hours and **Extend**, or **Revoke** to lock it at once.'] },
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
        'While uploading and processing, the frame already shows the picked photo with an “uploading…” / “processing…” label.'] },
      { h: 'Paste from the clipboard', p: ['Take a screenshot or “Copy image”, then **Ctrl+V**. With an empty frame selected it goes straight into it.'] },
      { h: 'Photos into frames', img: 'frame-menu', p: [
        "Tap **+ add** on an empty frame → **Upload** or one of the album's photos. Phones also get **Take photo/video** (the phone's camera).",
        "**Shoot in the frame** (phones): the in-app camera shows the frame's exact shape; **Photo** or **Video**, **Switch camera**, **Zoom**, **⚡ Light** where available. Not inside Zalo on iPhone — open in Safari.",
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
        'Select a frame with a photo → **Crop** (or double-tap it). Drag to move the photo, scroll / pinch to zoom.',
        '**Fit** shows the whole photo, **Fill** covers the frame, **Remove photo** empties it, **Done** finishes.'] },
      { h: 'Text', img: 'text', p: [
        '**＋ Add → Text**. Double-tap text to edit it.',
        '**Font**: typeface, size (**A−** / **A+**), alignment, line spacing, **Outline**, colour.'] },
      { h: 'Paper and background', img: 'background', p: [
        "**Paper** changes the page's paper (scrapbook).",
        "**Background** picks the desk colour, the album's background effect, the reading direction (manga) and the music (**Upload music**, **▶ Play** / **⏸ Pause**, **Remove music**)."] },
    ] },
    { id: 'items', title: '6. Working with items', features: [
      { h: 'Select, move, resize, rotate', img: 'selected', p: ['Tap to select, drag to move, drag the corners to resize, the round handle on top to rotate. Tap an empty spot to deselect.'] },
      { h: 'Pin', p: ['**📌 Pin** locks an item in place; **📌 Unpin** frees it. **📌 Pin all** pins everything on the page at once.'] },
      { h: 'Snap', p: ['While dragging, items snap to the page centre/edges and line up with frames and text. **Snap** turns it on/off.'] },
      { h: 'Duplicate, undo, zoom', p: [
        '**⧉ Duplicate** or **Ctrl+C** / **Ctrl+V** (works across pages).',
        '↶ / ↷ or **Ctrl+Z** / **Ctrl+Shift+Z**. − / + zoom 100–300%; tap the % to fit the page again.'] },
      { h: 'Autosave', p: ['Every change saves itself (“Saved”). If saving fails it says “Save failed” with a **Retry save** button.'] },
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
  ],
  shortcutsTitle: '10. Shortcuts',
  shortcuts: [['← / →', 'Switch pages (nothing selected)'], ['Arrows', 'Nudge the selected item'], ['Delete / Backspace', 'Delete the selected item'],
    ['Ctrl+C / Ctrl+V', 'Copy / paste an item; Ctrl+V also pastes photos'], ['Ctrl+Z / Ctrl+Shift+Z', 'Undo / redo'], ['Ctrl + scroll', 'Zoom the page'], ['Esc', 'Close lists and dialogs']],
};

export const GUIDE: Record<Lang, Guide> = { vi, en };
