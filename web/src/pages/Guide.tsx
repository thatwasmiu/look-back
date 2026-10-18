import { Link } from 'react-router-dom';

// Usage guide: one section per area of the app, one heading per feature. Button names are the app's own (English).
type Feature = { h: string; img?: string; p: string[] }; // img: web/public/guide/<img>.jpg (src/dev/guide-shots.mjs)
type Section = { id: string; title: string; features: Feature[] };

const sections: Section[] = [
  {
    id: 'albums', title: '1. Danh sách album', features: [
      { h: 'Tạo album mới', img: 'new-album', p: ['Bấm **New album**, nhập tên rồi **Create**. Có thể đóng bằng **Cancel**, ×, phím Esc hoặc bấm ra ngoài.', '**Template**: bấm một thẻ để chọn cách bắt đầu. **Empty album** chỉ có trang bìa.', 'Mẫu có sẵn: **2 3 con mực** (nền biển, bong bóng, sticker bạch tuộc, mực; có sẵn nhạc nền nếu server có file nhạc của mẫu), **Trip**, **Birthday**, **Love story**, **Year in review**, **Look Back**. Mỗi mẫu có sẵn nhiều trang, giấy, sticker, chữ, màu bàn và hiệu ứng nền.', '**Chép thiết kế của album (không kèm ảnh)**: tạo album mới giống hệt một album đã có, nhưng mọi khung để trống, không chép ảnh/video.'] },
      { h: 'Mở, sửa, xóa album', img: 'albums', p: ['Bấm vào ảnh bìa để xem album. **Edit** để trang trí.', 'Ảnh bìa là ảnh được đặt bằng nút ★ trong **Photos**. Nếu chưa đặt, thẻ album hiện thu nhỏ trang đầu tiên.', '**Delete** xóa vĩnh viễn album cùng toàn bộ ảnh và video (luôn hỏi xác nhận trước).'] },
      { h: 'Album mẫu', p: ['“Look Back — a tribute” là album mẫu chỉ xem, luôn nằm cuối danh sách để tham khảo cách trang trí.'] },
    ],
  },
  {
    id: 'share', title: '2. Chia sẻ', features: [
      { h: 'Tạo link chia sẻ', img: 'share', p: ['Bấm **Share** dưới album → **Create share link** → **Copy**.', 'Người nhận mở link là xem được album, không cần mật khẩu, không sửa được.'] },
      { h: 'Ngừng chia sẻ', p: ['Mở lại **Shared** → **Stop sharing**. Link cũ hết hiệu lực ngay, kể cả ảnh và video trong album.'] },
    ],
  },
  {
    id: 'pages', title: '3. Trang', features: [
      { h: 'Thêm trang theo mẫu', img: 'templates', p: ['Bấm **+** trong thanh **Pages**, hoặc nút tròn **+** ở góc trang cuối. Chọn một trong các mẫu (Cover, Blank, One photo, Collage…).'] },
      { h: 'Chuyển trang', p: ['Nút tròn ← / → ở hai góc dưới, hoặc phím ← / → khi không chọn vật nào, hoặc bấm ảnh nhỏ trong **Pages**.'] },
      { h: 'Sắp xếp và xóa trang', img: 'pages', p: ['Trong **Pages**: ◀ / ▶ để đổi vị trí, nút xóa để xóa trang. Có thể kéo thả ảnh nhỏ để đổi thứ tự.', 'Bấm nhãn **Pages** để thu gọn / mở thanh trang (trên điện thoại mặc định thu gọn).'] },
      { h: 'Đổi tên album', p: ['Trong màn trang trí, bấm vào tên album ở góc trên (biểu tượng ✎). Enter để lưu, Esc để hủy.'] },
    ],
  },
  {
    id: 'media', title: '4. Ảnh và video', features: [
      { h: 'Tải lên', img: 'editor', p: ['Bấm **Upload** trong khu **Photos**. Hỗ trợ ảnh và video lớn; tải lên tiếp tục được nếu mạng chập chờn.', 'Ảnh được nén và tạo bản xem nhanh (mờ → nét); video được chuyển sang dạng phát mượt (HLS). Trong lúc tải và xử lý, ảnh hiện nhãn “đang tải…” / “đang xử lý…”; lỗi sẽ hiện “tải lên lỗi”.'] },
      { h: 'Dán ảnh từ clipboard', p: ['Chụp màn hình hoặc “Copy image” rồi nhấn **Ctrl+V** trong màn trang trí. Nếu đang chọn một khung trống, ảnh vào thẳng khung đó; nếu không, ảnh vào khu **Photos**.'] },
      { h: 'Đưa ảnh vào khung', img: 'frame-menu', p: ['Bấm **+ add** trên khung trống → chọn **Upload** (tải ảnh mới) hoặc chọn một ảnh đã tải.', 'Hoặc kéo ảnh từ **Photos** thả vào khung, hoặc chọn khung rồi bấm ảnh trong **Photos**.'] },
      { h: 'Ảnh bìa và xóa ảnh', p: ['Trong **Photos**: nút ★ đặt làm ảnh bìa album; nút xóa xóa ảnh khỏi album (các khung đang dùng ảnh đó sẽ trống lại).'] },
    ],
  },
  {
    id: 'decorate', title: '5. Trang trí', features: [
      { h: 'Khung ảnh (Frame)', img: 'frames', p: ['**Frame** thêm khung mới với 14 kiểu: Polaroid, Instant mini, Film strip, Stamp, Heart, Circle…', 'Chọn khung rồi bấm **Frame style** để đổi kiểu mà giữ nguyên ảnh.'] },
      { h: 'Cắt và chỉnh cỡ ảnh (Crop)', img: 'crop', p: ['Chọn khung có ảnh → **Crop** (hoặc nhấp đúp vào ảnh). Kéo để dịch ảnh, cuộn chuột / chụm hai ngón để phóng to.', '**Size**: chỉnh cỡ ảnh riêng với khung, có thể nhỏ hơn khung. **Fit**: hiện trọn ảnh. **Fill**: ảnh phủ kín khung. **Done** để xong.', '**Remove photo** gỡ ảnh khỏi khung (khung vẫn giữ lại).'] },
      { h: 'Sticker', img: 'stickers', p: ['**Sticker** mở bộ sticker vẽ tay: hoa, tim, trái cây, cầu vồng, bóng bay, quà, nhạc, ghim bản đồ, núi…', 'Bộ biển: bạch tuộc hồng và xanh, mực, bong bóng, rong biển, vỏ sò, sao biển, cá, mỏ neo. Thêm: tim vô cực, lon tăng lực, cơm nắm, sushi, nhẫn.'] },
      { h: 'Băng dính (Tape)', p: ['**Tape** thêm miếng băng dính giấy (vàng, hồng, mint, kraft) để “dán” ảnh lên trang.'] },
      { h: 'Chữ (Text)', img: 'text', p: ['**Text** thêm chữ. Nhấp đúp vào chữ để sửa nội dung.', 'Khi chọn chữ: **Font** đổi kiểu chữ, **Color** đổi màu (có bảng màu sẵn và ô chọn màu tùy ý).'] },
      { h: 'Giấy nền trang (Paper)', img: 'paper', p: ['**Paper** đổi giấy của trang: kem, kraft, kẻ ô, chấm bi.'] },
      { h: 'Hiệu ứng trang (Effect)', img: 'effects', p: ['**Effect** thêm hiệu ứng động trên trang: lấp lánh, tim, cánh hoa, confetti, bokeh, light leak, bong bóng. Hiệu ứng là một vật trên trang, di chuyển / chỉnh cỡ như các vật khác.'] },
      { h: 'Nền album (Background)', img: 'background', p: ['**Background** chọn màu bàn phía sau album và hiệu ứng nền cho cả album (tuyết, cánh hoa, đom đóm, sao, mưa, bong bóng).', 'Nhạc nền: ở cuối bảng **Background**, **Upload music** để chọn một file nhạc (mp3, m4a…). Sau khi xử lý xong, dòng nhạc hiện tên file và độ dài bài.', '**▶ Play** / **⏸ Pause** để nghe thử ngay trong lúc trang trí; đóng bảng thì nhạc vẫn phát, bấm nút ♪ trên thanh công cụ để tạm dừng.', '**Remove music** để bỏ nhạc; muốn đổi bài thì **Remove music** rồi **Upload music** bài mới.'] },
    ],
  },
  {
    id: 'items', title: '6. Thao tác với vật trên trang', features: [
      { h: 'Chọn, di chuyển, đổi cỡ, xoay', img: 'selected', p: ['Bấm vào vật để chọn. Giữ chuột và kéo để di chuyển (thả chuột là dừng). Kéo các góc để đổi cỡ, kéo nút tròn phía trên để xoay. Trên điện thoại có thể chụm / xoay hai ngón.', 'Bấm vào chỗ trống trên trang hoặc ra phần nền xung quanh để bỏ chọn.'] },
      { h: 'Lớp trên / dưới và xóa', p: ['↑ đưa lên trên, ↓ đưa xuống dưới, 🗑 xóa. Phím Delete / Backspace cũng xóa vật đang chọn.'] },
      { h: 'Ghim (Pin)', p: ['**📌 Pin** khóa vật tại chỗ: không kéo, đổi cỡ, xoay hay dịch bằng phím mũi tên được nữa. **📌 Unpin** để mở khóa.'] },
      { h: 'Nhân bản và sao chép', p: ['**⧉ Duplicate** tạo bản sao ngay cạnh. Hoặc **Ctrl+C** rồi **Ctrl+V**, kể cả dán sang trang khác.'] },
      { h: 'Hoàn tác', p: ['↶ / ↷ hoặc **Ctrl+Z** / **Ctrl+Shift+Z** (hoặc **Ctrl+Y**).'] },
      { h: 'Phóng to trang', p: ['− / + phóng từ 100% đến 300%, bấm số % để về vừa màn hình. **Ctrl + cuộn chuột** cũng phóng to.'] },
      { h: 'Tự động lưu', p: ['Mọi thay đổi tự lưu (trạng thái “Saved”). Nếu lưu lỗi, trạng thái chuyển thành “Lưu lỗi” và nút **Retry save** hiện ra để thử lại.'] },
    ],
  },
  {
    id: 'view', title: '7. Xem album', features: [
      { h: 'Lật trang như sách', img: 'viewer', p: ['Vuốt, bấm hai bên, hoặc phím ← / →. Màn hình rộng hiện hai trang cùng lúc.', 'Ảnh và video của các trang kế tiếp được tải trước nên lật trang không phải chờ.'] },
      { h: 'Video', p: ['Bấm ▶ trên khung video để phát.'] },
      { h: 'Nhạc nền', p: ['Album có nhạc nền thì nhạc bắt đầu từ lần chạm hoặc lật trang đầu tiên (trình duyệt không cho tự phát) và phát lặp lại. Nút ♪ trên thanh trên cùng để tạm dừng / phát tiếp.'] },
    ],
  },
  {
    id: 'phone', title: '8. Trên điện thoại', features: [
      { h: 'Thanh công cụ dưới đáy', img: 'phone', p: ['Công cụ nằm ở đáy màn hình cho dễ bấm; các bảng chọn mở lên phía trên.', '**Hide tools** ẩn bớt Photos, Pages và công cụ để nhìn trang rộng hơn; **Show tools** để hiện lại.'] },
    ],
  },
  {
    id: 'manga', title: '9. Manga', features: [
      { h: 'Tạo album manga', img: 'manga-new-album', p: ['Bấm **New album** → chọn **Manga** thay vì **Scrapbook**, rồi chọn hướng đọc **Left → right** hoặc **Right → left**. Chế độ chỉ chọn một lần khi tạo album, sau đó không đổi được.', 'Album manga mới có sẵn **trang bìa**: tên truyện ở trên, một khung tranh lớn và nhãn “Tập 1”. Nhấp đúp vào chữ để đổi. Mục chép thiết kế chỉ liệt kê album manga.'] },
      { h: 'Khung tranh (Panel) và bố cục trang', img: 'manga-editor', p: ['Trang manga dùng giấy trắng và khung tranh viền đen. **Add page** cho chọn 10 bố cục: Cover, Classic grid, Dynamic slants, Splash + insets, Tall + stacked, Two tall columns, Three horizontal strips, Diagonal split, Six-panel grid, Full-bleed single panel.', '**Panel** thêm một khung tranh mới. Đưa ảnh/video vào khung giống khung ảnh scrapbook: **+ add**, kéo từ **Photos**, hoặc dán.', 'Khi chọn một khung, nhóm **Shape · Ink · Tone** hiện ra: **Ink** chuyển ảnh sang đen trắng kiểu mực in, **Tone** phủ chấm tram lên khung. Các nút **No border / Thin / Border** đổi độ dày viền.'] },
      { h: 'Khung tranh tự do (Shape)', p: ['Chọn một khung → **Shape**: bốn góc hiện chấm tròn, kéo từng góc để tạo khung xiên, hình thang hay tứ giác bất kỳ. Trên PC có thể bấm vào một chấm rồi dùng phím mũi tên để chỉnh nhỏ từng chút.', '**Reset** đưa khung về hình chữ nhật, **Done** để lưu (một bước, hoàn tác được bằng ↶).'] },
      { h: 'Bong bóng thoại, lời dẫn, hiệu ứng âm thanh', p: ['**Bubble** → **Speech** (lời nói), **Shout** (hét), **Thought** (suy nghĩ). **Narration** là ô lời dẫn hình chữ nhật. **Sound effect** là chữ lớn kiểu tiếng động.', 'Khi chọn bong bóng Speech hoặc Thought: nhóm **Tail** (↙ ↘ ↖ ↗ ∅) chọn góc đặt đuôi bong bóng, hướng về nhân vật đang nói.', 'Nhấp đúp để sửa chữ; **Font** và **Color** đổi kiểu chữ và màu như chữ thường.'] },
      { h: 'Đường tốc độ, đường tập trung, tông chấm', p: ['**Lines** → **Speed lines** (đường tốc độ) hoặc **Focus lines** (đường tập trung về giữa). **Screentone** thêm lớp chấm tram.', 'Nếu đang chọn một khung, lớp mới phủ đúng khung đó; nếu không, lớp hiện ở giữa trang. Kéo, đổi cỡ hay xoay như các vật khác.'] },
      { h: 'Đọc từ phải sang trái', p: ['Khi tạo album manga, chọn **Left → right** hoặc **Right → left**. Đổi lại sau trong **Background** → **Reading direction**.', 'Đọc phải sang trái: phím ←, vuốt sang phải hoặc bấm mép trái là sang trang tiếp; trang bìa nằm bên trái và trang trước của mỗi cặp nằm bên phải.'] },
    ],
  },
];

const shortcuts: [string, string][] = [
  ['← / →', 'Chuyển trang (khi không chọn vật nào)'],
  ['Mũi tên', 'Dịch vật đang chọn'],
  ['Delete / Backspace', 'Xóa vật đang chọn'],
  ['Ctrl+C / Ctrl+V', 'Sao chép / dán vật; Ctrl+V cũng dán ảnh từ clipboard'],
  ['Ctrl+Z / Ctrl+Shift+Z', 'Hoàn tác / làm lại'],
  ['Ctrl + cuộn chuột', 'Phóng to / thu nhỏ trang'],
  ['Esc', 'Đóng bảng chọn, hộp thoại'],
];

// **bold** → <strong>, nothing else.
const rich = (s: string) => s.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : part));

export default function Guide() {
  return (
    <main className="guide">
      <header>
        <Link to="/">← Albums</Link>
        <h1>Hướng dẫn sử dụng</h1>
      </header>
      <nav className="guide-toc" aria-label="Mục lục">
        {sections.map((s) => <a key={s.id} href={`#${s.id}`}>{s.title}</a>)}
        <a href="#shortcuts">10. Phím tắt</a>
      </nav>
      {sections.map((s) => (
        <section key={s.id} id={s.id}>
          <h2>{s.title}</h2>
          {s.features.map((f) => (
            <article key={f.h}>
              <h3>{f.h}</h3>
              {f.p.map((t, i) => <p key={i}>{rich(t)}</p>)}
              {f.img && <img className={f.img === 'phone' ? 'guide-shot phone' : 'guide-shot'} src={`/guide/${f.img}.jpg`} alt={f.h} loading="lazy" />}
            </article>
          ))}
        </section>
      ))}
      <section id="shortcuts">
        <h2>10. Phím tắt</h2>
        <table>
          <tbody>{shortcuts.map(([k, v]) => <tr key={k}><th scope="row"><kbd>{k}</kbd></th><td>{v}</td></tr>)}</tbody>
        </table>
      </section>
    </main>
  );
}
