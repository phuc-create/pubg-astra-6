# NEON STRIKE — TPS đấu đội

Trò chơi bắn súng góc nhìn thứ ba (TPS) 3D chạy bằng JavaScript và Three.js/WebGL 2, với chế độ sinh tồn một người và đấu đội qua WebSocket.

## Duyên Hải — Trạm Điện

Bản đồ rộng **5.600 × 4.200**, gấp **2,51 lần diện tích** bản thung lũng trước. **154 cây** phân bố thành cụm thưa, 35 khối đá, đồi thoải và bờ biển phía đông. Khu nhà máy có tháp làm mát nguyên vẹn và tháp đổ nát, ống khói, nhà kho, container, trạm biến áp, cột điện và dây dẫn. **8 tuyến đường** nối nhà máy, hồ, cầu giàn thép và mỏ đất đỏ có lối dốc vào phía nam. Đất, gạch, bê tông và mái tôn dùng texture tạo trong mã; mây và nước dùng shader. Nước nông có thể lội qua với tốc độ 62%; qua cầu giữ nguyên tốc độ. Đồi và cây phía xa là cảnh quan ngoài ranh giới di chuyển.

**10 căn nhà có thể vào bên trong**, mỗi nhà có hai cửa mở, sàn, kệ đồ và vật phẩm. Tường, kệ chắn người và đạn; cửa sổ có cửa chớp đóng. Camera bám gần qua vai phải, đặt nhân vật ở phần dưới bên trái và tự thu gần khi gặp vật cản; mái nhà ẩn khi người chơi ở trong để nhìn rõ căn phòng. Nhân vật, bot và người chơi online được thu nhỏ còn **39,2%** kích thước gốc (giảm thêm 30% so với bản 56%): chiều cao thường 36,064 đơn vị, bán kính di chuyển 7,056; vùng trúng đạn, nòng súng và tầm mắt ngắm cùng dùng thông số `ACTOR` trong `shared.js`. Nhân vật mặc giáp xanh quân đội với mũ kín, kính tối, các tấm giáp rời và súng trường dài. Dải màu đội nằm trên vai, ngực và lưng. Camera thường lùi 1,75 lần chiều cao nhân vật ngoài trời (khoảng 63,11 đơn vị), 1,5 lần trong nhà (54,10 đơn vị), lệch sang vai phải 16% / 14% chiều cao nhân vật. Với góc nhìn ngang 80° trên màn hình 16:9, đầu nhân vật nằm khoảng 45% chiều rộng màn hình, đầu ở khoảng 55% chiều cao; khung hình cắt phần chân để tập trung vào lưng và vai. Khoảng cách camera tỉ lệ theo chiều cao nhân vật để việc đổi kích thước thế giới không làm lệch bố cục này. Bấm chuột phải bật kính ngắm điểm đỏ trên súng ở tầm mắt, với góc nhìn 58° và độ nhạy chuột thấp hơn; bấm lại để tắt ngắm. Camera ngắm giữ nguyên vị trí ngang của người chơi để không nhìn xuyên qua vật chắn. Chân chuyển động khi chạy, hai tay giữ súng và có thao tác thay đạn. Điểm ngắm nằm giữa màn hình; đường đạn từ nòng súng hội tụ vào điểm ngắm của camera. Nếu nòng súng bị chắn, hiện “VẬT CẢN” và đạn vẫn dừng ở vật chắn.

Súng trường bắn **600 phát/phút** (10 phát/giây), đạn bay **3.600 đơn vị/giây**, nhanh hơn khoảng 3,2 lần bản trước. Đầu đạn 3D màu đồng dài khoảng 4,65 đơn vị, đường kính 1,4 đơn vị, mũi nhọn và xoay đúng hướng bay; vệt đạn mảnh, chớp đầu nòng ngắn. Tầm đạn tối đa 2.160 đơn vị. Đây là thông số cân bằng cho game, không phải mô phỏng đạn đạo theo mét ngoài đời. Va chạm quét cả quãng đường mỗi khung hình để đạn nhanh không xuyên qua người hoặc tường mỏng. Bot vẫn bắn thưa hơn để người chơi có thời gian phản ứng.

**27 điểm vật phẩm** trong nhà và ngoài đường, dùng ở cả chơi đơn và đấu đội:

- **Hồi máu:** tự nhặt khi đến gần, hồi tối đa **35 HP**, không vượt 100. Máu đầy sẽ không tiêu hao vật phẩm.
- **Bắn nhanh:** tốc độ bắn **×1,75 trong 10 giây**; nhặt thêm làm mới thời gian, không cộng dồn tốc độ. Hiệu ứng mất khi bị hạ hoặc bắt đầu trận mới.
- Vật phẩm cố định xuất hiện lại sau **25 giây**. Không nhặt xuyên tường. Trong đấu đội, mô phỏng phòng quyết định ai nhặt được, đồng bộ cho mọi người và tránh nhặt trùng. Bot chơi đơn vẫn có thể rơi thêm đồ.

`forest3d.js` dựng môi trường và nhân vật; `industrial3d.js` dựng nhà máy, đường và thiết bị; bản đồ, nhà, vật phẩm, camera, điểm hồi sinh và va chạm dùng `shared.js`. Nhân vật di chuyển trên địa hình, chưa có nhảy. Ngắm lên/xuống thay đổi đường đạn 3D thật, đồng bộ ở cả chơi đơn và đấu đội; đạn va chạm theo độ cao của người, tường, mái nhà và địa hình. Three.js được đóng gói cùng trang, không tải từ CDN hay dịch vụ ngoài. Thiết bị thiếu WebGL 2 sẽ nhận thông báo và dùng góc nhìn từ trên xuống, không quay về góc nhìn thứ nhất.

**Deploy toàn bộ lên Vercel:** xem [DEPLOY.md](DEPLOY.md). Giao diện dùng file tĩnh, phần nhiều người dùng WebSocket của Vercel Functions tại `/api/ws`. Không cần máy chủ riêng hoặc database. Phòng lưu trong bộ nhớ từng instance và chịu thời hạn Function, nên phương án này chỉ phù hợp thử nghiệm nhóm nhỏ.

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

Dải giáp và biểu tượng dùng màu đội; đầu đạn giữ màu đồng tự nhiên. **Chỉ đồng đội thấy tên nhau phía trên đầu**, và tên không xuyên qua vật chắn. Radar chỉ hiển thị đồng đội. Tên trong sảnh vẫn hiện để chọn đội.

## Kết nối LAN và Internet

- **Cùng Wi-Fi/LAN:** bạn bè mở `http://<IP-LAN-của-máy-chủ>:3000`. Khi chủ phòng mở bằng localhost, link mời tự dùng một địa chỉ IPv4 LAN của máy chủ. Nếu máy có nhiều card mạng/VPN, kiểm tra link mời chọn đúng IP.
- `localhost` luôn chỉ chính thiết bị đang mở trình duyệt. Không gửi link localhost cho thiết bị khác.
- Giữ tiến trình `npm start` chạy và cho phép kết nối đến cổng 3000 trên mạng nội bộ.
- **Khác mạng/qua Internet:** deploy project lên Vercel theo [DEPLOY.md](DEPLOY.md), rồi mọi người mở cùng domain. Trình duyệt tự chọn WSS cho HTTPS. Không cần dựng máy chủ riêng; giới hạn phòng tạm và thời hạn Function được ghi trong hướng dẫn.
- Chỉ gửi mã phòng là chưa đủ nếu mọi người đang mở các server khác nhau.
- Chế độ nhiều người cần kết nối WebSocket. `npm start` tự đóng gói đồ họa; `npm run build` tạo đủ HTML, CSS, JavaScript và `forest3d.bundle.js` trong `dist/` để deploy lên Vercel.

Nếu báo lỗi kết nối, trò chơi tự thử mở lại tối đa 3 lần. Kiểm tra địa chỉ máy chủ và tải lại trang sau khi cập nhật code. Mất kết nối khi đang trong phòng sẽ đưa bạn về màn hình tham gia; bạn có thể nhập lại mã khi phòng ở sảnh. Phòng và điểm lưu trong bộ nhớ: khởi động lại server sẽ xóa các phòng đang có. Khi chủ phòng rời đi, quyền chủ phòng chuyển cho người còn lại; trận kết thúc nếu chỉ còn một đội.

## Điều khiển

WASD di chuyển; rê chuột xoay ngang và ngắm lên/xuống; bấm chuột phải bật/tắt kính ngắm điểm đỏ (khi tắt ngắm, camera trở lại qua vai phải với nhân vật ở dưới bên trái); chuột trái bắn (kể cả khi đang ngắm); R thay đạn; Space lướt; M radar; Esc mở menu. Tâm ngắm nằm giữa màn hình, hướng bắn theo camera. Nếu trình duyệt không cho khóa chuột, chỉ cần rê chuột trong đấu trường để xoay/ngắm. Menu online **không dừng trận đấu**. Bản TPS hiện thiết kế cho máy tính có bàn phím và chuột.

## Kiểm tra

```sh
npm run check
npm test
```

Kiểm thử gồm giới hạn phòng/đội, quyền chủ phòng, sẵn sàng, xác thực đầu vào, di chuyển/đạn va chạm, sát thương, hồi sinh, kết quả, trận tiếp theo, mất kết nối và ba máy khách WebSocket độc lập. Test tích hợp mở cổng tạm trên localhost. Có thêm kiểm thử đường vào nhà, va chạm camera, nhặt đồ qua tường, giới hạn hồi máu, tranh vật phẩm, thời gian hồi vật phẩm và tốc độ bắn nhanh.

`server.js` quyết định vị trí, tốc độ bắn, đạn, sát thương, hồi sinh và điểm số. Client gửi thao tác và nội suy hình ảnh; không gửi kết quả hạ gục hoặc tự quyết định máu. Server chạy mô phỏng 60 lần/giây và phát trạng thái 20 lần/giây. Quy tắc, vật chắn và màu đội dùng chung trong `shared.js`.
