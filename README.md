# NEON STRIKE — FPS đấu đội

Trò chơi FPS Canvas chạy bằng JavaScript. Chế độ sinh tồn một người vẫn có sẵn; chế độ nhiều người dùng máy chủ Node.js/WebSocket để đồng bộ các máy.

## Chạy trò chơi

Cần Node.js 22 trở lên. Tại thư mục dự án:

```sh
npm install
npm start
```

Mở **http://localhost:3000** trên máy chạy server. Có thể đổi cổng bằng `PORT=3001 npm start`.

## Chơi cùng bạn bè

1. Chọn **CHƠI CÙNG BẠN BÈ**, nhập tên, bấm **TẠO PHÒNG MỚI**.
2. Bấm **TẠO ĐỘI MỚI**. Đội tự nhận một màu và biểu tượng riêng.
3. Gửi mã 6 ký tự hoặc bấm **SAO CHÉP LINK** rồi gửi link cho bạn bè.
4. Bạn bè mở **cùng địa chỉ máy chủ**, nhập tên và mã phòng, chọn đội hoặc tạo đội khác.
5. Tất cả bấm **SẴN SÀNG**. Chủ phòng bắt đầu khi có ít nhất 2 đội.

Mỗi đội tối đa **3 người**, mỗi phòng tối đa **4 đội / 12 người**. Đội đạt **20 điểm hạ gục** trước sẽ thắng; sau **5 phút**, đội có điểm cao nhất thắng (bằng điểm thì hòa). Nhân vật hồi sinh sau 3 giây, được bảo vệ 1,5 giây và mất bảo vệ khi bắn. Không có sát thương đồng đội.

Áo giáp, biểu tượng và đạn dùng màu đội. **Chỉ đồng đội thấy tên nhau phía trên đầu**, và tên không xuyên qua vật chắn. Radar chỉ hiển thị đồng đội. Tên trong sảnh vẫn hiện để chọn đội.

## Kết nối LAN và Internet

- **Cùng Wi-Fi/LAN:** bạn bè mở `http://<IP-LAN-của-máy-chủ>:3000`. Khi chủ phòng mở bằng localhost, link mời tự dùng một địa chỉ IPv4 LAN của máy chủ. Nếu máy có nhiều card mạng/VPN, kiểm tra link mời chọn đúng IP.
- `localhost` luôn chỉ chính thiết bị đang mở trình duyệt. Không gửi link localhost cho thiết bị khác.
- Giữ tiến trình `npm start` chạy và cho phép kết nối đến cổng 3000 trên mạng nội bộ.
- **Khác mạng/qua Internet:** cần triển khai server Node.js trên máy chủ có địa chỉ truy cập chung, hỗ trợ WebSocket `/ws`. Dùng HTTPS; trình duyệt tự chọn WSS. Reverse proxy phải chuyển tiếp WebSocket Upgrade và giữ đúng Host. Có thể đặt `PUBLIC_URL=https://game.example.com` để dùng địa chỉ đó cho link mời. Dự án chưa được triển khai lên Internet.
- Chỉ gửi mã phòng là chưa đủ nếu mọi người đang mở các server khác nhau.
- Chế độ nhiều người cần server; mở file HTML trực tiếp chỉ dùng được chế độ chơi đơn. Giữ `shared.js`, `multiplayer.js`, `multiplayer.css` cùng thư mục HTML.

Nếu báo lỗi kết nối, trò chơi tự thử mở lại tối đa 3 lần. Kiểm tra địa chỉ máy chủ và tải lại trang sau khi cập nhật code. Mất kết nối khi đang trong phòng sẽ đưa bạn về màn hình tham gia; bạn có thể nhập lại mã khi phòng ở sảnh. Phòng và điểm lưu trong bộ nhớ: khởi động lại server sẽ xóa các phòng đang có. Khi chủ phòng rời đi, quyền chủ phòng chuyển cho người còn lại; trận kết thúc nếu chỉ còn một đội.

## Điều khiển

WASD di chuyển; chuột xoay/ngắm; chuột trái bắn; R thay đạn; Space lướt; M radar; Esc mở menu. Nếu trình duyệt không cho khóa chuột, giữ chuột phải để xoay. Menu online **không dừng trận đấu**. Bản FPS hiện thiết kế cho máy tính có bàn phím và chuột.

## Kiểm tra

```sh
npm run check
npm test
```

Kiểm thử gồm giới hạn phòng/đội, quyền chủ phòng, sẵn sàng, xác thực đầu vào, di chuyển/đạn va chạm, sát thương, hồi sinh, kết quả, trận tiếp theo, mất kết nối và ba máy khách WebSocket độc lập. Test tích hợp mở cổng tạm trên localhost.

`server.js` quyết định vị trí, tốc độ bắn, đạn, sát thương, hồi sinh và điểm số. Client gửi thao tác và nội suy hình ảnh; không gửi kết quả hạ gục hoặc tự quyết định máu. Server chạy mô phỏng 60 lần/giây và phát trạng thái 20 lần/giây. Quy tắc, vật chắn và màu đội dùng chung trong `shared.js`.
