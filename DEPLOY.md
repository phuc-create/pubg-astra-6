# Deploy toàn bộ game và WebSocket lên Vercel

Không cần Render, VPS, Redis, database hay biến `GAME_SERVER_URL`. Giao diện và WebSocket đều dùng cùng domain Vercel.

## Các bước

1. Commit và push các thay đổi lên repo `phuc-create/pubg-astra-6`, nhánh `master` mà Vercel đang theo dõi.
2. Trong project Vercel, kiểm tra **Build & Deployment Settings**:

   | Thiết lập | Giá trị |
   | --- | --- |
   | Framework Preset | **Other** |
   | Build Command | `npm run build` |
   | Output Directory | `dist` |
   | Install Command | `npm ci` hoặc mặc định |

3. **Redeploy**. `vercel.json` đã chọn Other, khai báo build, bật Fluid Compute, đặt Function tối đa 300 giây và dùng một region `hkg1`. Không cấu hình Start Command trên Vercel. Không thêm rewrite toàn bộ website tới `server.js`.

## Kiểm tra bản deploy

- `/` tải trang game từ `dist/index.html`, không gọi Function để vẽ trang.
- Trình duyệt mở `wss://pubg-astra-6.vercel.app/ws`; Vercel rewrite tới Function `/api/ws`. Endpoint `/api/ws` cũng chấp nhận WebSocket trực tiếp.
- Nếu mở `/api/ws` như trang web bình thường, HTTP **426** cùng thông báo `WebSocket upgrade required` là đúng: endpoint này chờ kết nối WebSocket.
- Tạo phòng trên một trình duyệt rồi nhập mã ở trình duyệt thứ hai. Cần ít nhất hai đội và mọi người sẵn sàng để bắt đầu.
- Nếu vẫn còn lỗi 500, xem Runtime Logs của **`api/ws.mjs`**. Trang lỗi chung không có đủ thông tin để xác định exception; cần log cụ thể nếu lỗi tiếp tục xuất hiện.

## Phần đã sửa

Trước đây, Vercel có thể nhận diện `server.js` ở root làm entrypoint Node. File đó chỉ chạy `.listen()` khi được gọi bằng `npm start`, và export một object gồm các hàm nội bộ, không phải HTTP server/handler cho Vercel.

Nay `api/ws.mjs` tạo và **export default HTTP server** có WebSocket, đúng dạng entrypoint trong tài liệu Vercel. Vercel tự quản lý cổng và vòng đời; file này không tự gọi `.listen()`. Giao diện được build riêng thành file tĩnh. Mọi tài nguyên nằm trong cùng một project, không dùng hạ tầng ngoài Vercel.

## Giới hạn của phương án không database

Phòng, đội và điểm nằm trong RAM của **một Function instance**, không được lưu bền vững. Redeploy, restart hoặc Function bị hủy có thể làm mất phòng.

Vercel WebSocket đang ở beta và cần Fluid Compute. Một kết nối được giữ trên một instance, nhưng **các kết nối mới không được đảm bảo vào cùng instance**. Vì vậy khi Vercel mở nhiều instance, người nhập đúng mã vẫn có thể không tìm thấy phòng ở instance của họ. Dùng một region giúp giữ mọi người gần nhau, nhưng không ép tất cả vào một instance. Bản này dành cho thử nghiệm nhóm nhỏ, không đảm bảo phòng hoạt động đồng nhất khi tăng tải.

Vercel đóng kết nối khi Function đạt giới hạn thời gian. Cấu hình dùng **300 giây**, phù hợp giới hạn Hobby; thời gian chờ trong sảnh cũng tiêu hao thời gian kết nối. Một trận 5 phút có thể bị ngắt trước khi hết trận. Khi mất kết nối, trò chơi đưa người chơi về màn hình tham gia để vào lại hoặc tạo phòng mới, không giả vờ giữ được trạng thái đã mất. Không có cách bảo đảm phòng bền vững và đồng bộ nhiều instance chỉ bằng một `Map` trong bộ nhớ.

## Chạy local

```sh
npm install
npm start
```

Mở `http://localhost:3000`. Cùng mã game hỗ trợ `/api/ws` ở local và trên Vercel; `/ws` cũ vẫn hoạt động.

## Tài liệu chính thức

- [Vercel WebSockets: entrypoint, thời hạn và state giữa các instance](https://vercel.com/docs/functions/websockets)
- [Vercel: Node server zero configuration](https://vercel.com/changelog/deploy-node-servers-with-zero-configuration)
- [Vercel: cấu hình project](https://vercel.com/docs/project-configuration/vercel-json)
