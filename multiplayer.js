/* Multiplayer integration. The solo simulation remains independent. */
(function () {
  'use strict';
  const { RULES, TEAMS, move } = NeonShared;
  const net = { socket: null, me: null, room: null, online: false, opened: false, busy: false,
    seq: 0, history: new Map(), actors: new Map(), shots: [], self: null, lastMessage: 0,
    reload: false, dash: false, ping: 0, correctedX: 0, correctedY: 0, samplesAt: 0, inviteBase: null };
  const escapeText = value => String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
  const teamById = id => TEAMS.find(t => t.id === id);
  const mine = () => net.room?.players.find(p => p.id === net.me);
  const myTeam = () => teamById(mine()?.team);
  const modal = document.createElement('section');
  modal.className = 'modal mp-modal'; modal.id = 'multiplayerScreen'; modal.hidden = true;
  modal.setAttribute('aria-labelledby', 'mpTitle');
  modal.innerHTML = `
    <div class="mp-topline"><div class="eyebrow"><span></span> SQUAD OPERATIONS <span class="edition">04 ĐỘI / 12 NGƯỜI</span></div><button class="mp-link" id="mpExit" type="button">← TRỞ LẠI</button></div>
    <div id="mpEntry">
      <h2 id="mpTitle">CÙNG ĐỘI. <em>CÙNG CHIẾN TUYẾN.</em></h2>
      <p>Tạo phòng riêng và gửi mã cho bạn bè. Mọi người cần mở cùng địa chỉ máy chủ để tìm thấy nhau.</p>
      <div class="mp-entry-grid"><div>
        <label class="mp-field" for="mpName">TÊN NGƯỜI CHƠI<input id="mpName" autocomplete="nickname" maxlength="18" placeholder="Tên của bạn" required></label>
        <button id="mpCreate" class="primary-button" type="button"><span>TẠO PHÒNG MỚI</span><span class="button-arrow">+</span></button>
        <div class="mp-separator">ĐÃ CÓ MÃ MỜI?</div>
        <form id="mpJoinForm"><label class="mp-field" for="mpCode">MÃ PHÒNG</label><div class="mp-entry-actions"><label class="mp-field"><input id="mpCode" aria-label="Mã phòng 6 ký tự" maxlength="6" minlength="6" pattern="[A-Za-z2-9]{6}" autocomplete="off" spellcheck="false" placeholder="ABC123" required></label><button id="mpJoin" class="secondary-button" type="submit">VÀO PHÒNG →</button></div></form>
      </div><aside class="mp-brief"><div class="mp-hero">3 vs 3</div><h3>MỘT MÀU. MỘT ĐỘI.</h3><p>Mỗi đội tối đa 3 người, tối đa 4 đội.<br>Tên trên đầu chỉ hiện với đồng đội.<br>Không gây sát thương đồng đội.<br>20 điểm hạ gục hoặc 5 phút / trận.</p><div class="mp-palette">${TEAMS.map(t => `<span style="background:${t.color}"></span>`).join('')}</div></aside></div>
    </div>
    <div id="mpLobby" hidden>
      <h2>SẢNH <em>ĐẤU ĐỘI.</em></h2>
      <div class="mp-room-bar"><div><small>MÃ PHÒNG · GỬI CHO BẠN BÈ</small><strong class="mp-room-code" id="mpRoomCode"></strong></div><div class="mp-room-buttons"><button class="secondary-button" id="mpCopy" type="button">SAO CHÉP MÃ</button><button class="secondary-button" id="mpCopyLink" type="button">SAO CHÉP LINK</button></div></div>
      <div class="mp-room-heading"><strong>CHỌN ĐỘI CỦA BẠN</strong><span id="mpCount"></span></div>
      <div class="mp-teams" id="mpTeams"></div>
      <div class="mp-unassigned" id="mpUnassigned"></div>
      <div class="mp-lobby-footer"><p id="mpStartHint"></p><div class="mp-actions"><button class="secondary-button" id="mpReady" type="button">SẴN SÀNG</button><button class="primary-button" id="mpStart" type="button">BẮT ĐẦU TRẬN ↗</button></div></div>
    </div>
    <div id="mpResults" hidden><h2 id="mpResultTitle">TRẬN ĐẤU KẾT THÚC.</h2><p id="mpResultReason"></p><div id="mpResultScores" class="mp-results"></div><p class="mp-result-self" id="mpResultSelf"></p><button class="primary-button" id="mpBackLobby" type="button">VỀ SẢNH · CHƠI TIẾP →</button><p id="mpResultWait"></p></div>
    <p id="mpNotice" class="mp-notice" role="status" aria-live="polite"></p>`;
  ui.overlay.appendChild(modal);
  const matchHud = document.createElement('div');
  matchHud.className = 'mp-match-hud'; matchHud.hidden = true;
  matchHud.innerHTML = '<div id="mpMatchMeta" class="mp-match-meta"></div><div id="mpScoreboard" class="mp-scoreboard"></div>';
  stage.appendChild(matchHud);
  const respawnHud = document.createElement('div');
  respawnHud.className = 'mp-respawn'; respawnHud.hidden = true; respawnHud.setAttribute('role', 'status');
  stage.appendChild(respawnHud);
  const leaveButton = document.createElement('button');
  leaveButton.className = 'secondary-button'; leaveButton.textContent = 'RỜI PHÒNG'; leaveButton.hidden = true;
  ui.pauseScreen.appendChild(leaveButton);
  $('mpName').value = storageGet('neon-strike-name', '');
  const inviteCode = new URLSearchParams(location.search).get('room');
  if (inviteCode) $('mpCode').value = inviteCode.toUpperCase().replace(/[^A-Z2-9]/g, '').slice(0, 6);
  const solo = { update, updateHud, showScreen, startGame, shoot, startReload, dash, pauseGame, resumeGame };
  const pauseCopy = ui.pauseScreen.querySelector('.intro-copy').textContent;
  const pauseEyebrow = ui.pauseScreen.querySelector('.eyebrow');
  const setNotice = text => { $('mpNotice').textContent = text; };
  let busyTimer;
  function setBusy(value) {
    net.busy = value;
    for (const id of ['mpCreate', 'mpJoin']) $(id).disabled = value;
    clearTimeout(busyTimer);
    if (value) busyTimer = setTimeout(() => { setBusy(false); setNotice('Máy chủ chưa phản hồi. Hãy kiểm tra kết nối và thử lại.'); }, 20000);
  }
  showScreen = function (name) { solo.showScreen(name); modal.hidden = name !== 'multiplayer'; };
  function screen(name) {
    net.opened = true; state = 'menu'; stage.classList.remove('playing', 'paused');
    keys.clear(); clearPointer(); if (document.pointerLockElement) document.exitPointerLock();
    showScreen('multiplayer'); ui.pauseButton.disabled = true;
    $('mpEntry').hidden = name !== 'entry'; $('mpLobby').hidden = name !== 'lobby'; $('mpResults').hidden = name !== 'results';
    $('mpExit').textContent = net.room ? '← RỜI PHÒNG' : '← TRỞ LẠI';
    modal.scrollTop = 0;
    modal.setAttribute('aria-label', name === 'lobby' ? 'Sảnh phòng đấu đội' : name === 'results' ? 'Kết quả đấu đội' : 'Chơi cùng bạn bè');
    matchHud.hidden = true; respawnHud.hidden = true; ui.waveBanner.classList.remove('visible');
    updateHud();
  }
  function send(message) {
    if (net.socket?.readyState !== WebSocket.OPEN) return false;
    if (net.socket.bufferedAmount > 65536) { net.socket.close(); return false; }
    net.socket.send(JSON.stringify(message)); return true;
  }
  function command(message) {
    if (net.busy) return;
    setNotice(''); if (send(message)) setBusy(true); else setNotice('Mất kết nối máy chủ. Hãy vào lại phòng.');
  }
  function connectOnce() {
    return new Promise((resolve, reject) => {
      // The same URL works locally; Vercel rewrites /ws to the /api/ws Function.
      const endpoint = `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/ws`;
      const socket = new WebSocket(endpoint);
      net.socket = socket; net.me = null;
      let settled = false;
      const fail = () => {
        clearTimeout(timer);
        if (net.socket === socket) net.socket = null;
        socket.close(); reject(new Error(`Không thể mở kết nối đến ${new URL(endpoint).host}. Kiểm tra máy chủ đang chạy và mở đúng link mời.`));
      };
      const timer = setTimeout(fail, 4500);
      socket.addEventListener('message', event => {
        if (net.socket !== socket) return;
        let message; try { message = JSON.parse(event.data); } catch { return; }
        net.lastMessage = performance.now();
        if (message.type === 'hello') { net.me = message.id; net.inviteBase = message.inviteBase; settled = true; clearTimeout(timer); resolve(); }
        else receive(message);
      });
      socket.addEventListener('error', () => { if (!settled) fail(); });
      socket.addEventListener('close', () => {
        clearTimeout(timer);
        if (!settled) { fail(); return; }
        if (net.socket !== socket) return;
        const wasActive = net.room || net.opened;
        net.socket = null; resetNetwork();
        if (wasActive) { screen('entry'); setNotice('Phiên kết nối đã đóng hoặc hết hạn. Vào lại phòng nếu còn mã hợp lệ, hoặc tạo phòng mới.'); }
      });
    });
  }
  async function connect() {
    if (location.protocol === 'file:') throw new Error('Để chơi nhiều người, chạy npm start rồi mở http://localhost:3000.');
    if (net.socket?.readyState === WebSocket.OPEN && net.me) return;
    for (let attempt = 0; attempt < 3; attempt++) {
      try { await connectOnce(); return; }
      catch (error) {
        if (!net.opened || attempt === 2) throw error;
        setNotice(`Kết nối bị gián đoạn. Đang thử lại (${attempt + 2}/3)…`);
        await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)));
      }
    }
  }
  async function enter(type) {
    if (net.busy) return;
    const name = $('mpName').value.trim();
    if (!name) { setNotice('Nhập tên của bạn trước khi vào phòng.'); $('mpName').focus(); return; }
    setBusy(true); setNotice('Đang kết nối…'); storageSet('neon-strike-name', name);
    try {
      await connect();
      if (!net.opened) { setBusy(false); return; }
      send({ type, name, code: $('mpCode').value.trim().toUpperCase() });
    } catch (error) { setBusy(false); setNotice(error.message); }
  }
  function receive(message) {
    if (message.type === 'error') { setBusy(false); setNotice(message.message); return; }
    if (message.type === 'pong') { net.ping = Math.max(0, Math.round(performance.now() - message.at)); return; }
    if (message.type === 'left') return;
    if (message.type === 'room') {
      const previousPhase = net.room?.phase, previousHost = net.room?.host;
      net.room = message; setBusy(false); setNotice('');
      if (message.phase === 'lobby') { net.online = false; document.body.classList.remove('neon-online'); screen('lobby'); renderLobby(); }
      else if (message.phase === 'playing' && previousPhase !== 'playing') beginMatch();
      else if (message.phase === 'ended') endMatch();
      if (previousHost && previousHost !== message.host && message.host === net.me) {
        if (message.phase === 'playing') toast('BẠN ĐÃ TRỞ THÀNH CHỦ PHÒNG'); else setNotice('Chủ phòng đã rời đi. Bạn là chủ phòng mới.');
      }
    }
    if (message.type === 'snapshot' && net.online) applySnapshot(message);
  }
  function renderLobby() {
    const room = net.room, self = mine();
    $('mpRoomCode').textContent = room.code; $('mpCount').textContent = `${room.players.length} / ${RULES.maxPlayers} NGƯỜI`;
    $('mpTeams').innerHTML = room.teams.map(team => {
      const members = room.players.filter(p => p.team === team.id), isMine = self?.team === team.id;
      const slots = Array.from({ length: RULES.teamSize }, (_, i) => {
        const p = members[i];
        return p ? `<li class="mp-member"><span class="mp-avatar">${team.symbol}</span><span class="mp-member-name" title="${escapeText(p.name)}">${escapeText(p.name)}${p.id === net.me ? ' (bạn)' : ''}${p.id === room.host ? ' ♛' : ''}</span><span class="mp-member-tag">${p.ready ? '✓' : '…'}</span></li>` : '<li class="mp-member mp-empty"><span class="mp-avatar">+</span>Chờ đồng đội</li>';
      }).join('');
      return `<article class="mp-team${isMine ? ' is-mine' : ''}" style="--team-color:${team.color}"><div class="mp-team-title">${team.symbol} ${team.name}<small>${members.length} / 3</small></div><ul class="mp-members">${slots}</ul><button type="button" class="secondary-button" data-team="${team.id}" ${isMine || members.length === 3 ? 'disabled' : ''}>${isMine ? '✓ ĐỘI CỦA BẠN' : members.length === 3 ? 'ĐỘI ĐÃ ĐẦY' : 'VÀO ĐỘI →'}</button></article>`;
    }).join('') + (room.teams.length < RULES.maxTeams ? '<button class="mp-create-team" type="button" data-create-team><b>+</b>TẠO ĐỘI MỚI<small>Màu riêng · tối đa 3 người</small></button>' : '');
    const unassigned = room.players.filter(p => !p.team);
    $('mpUnassigned').textContent = unassigned.length ? 'Chưa chọn đội: ' + unassigned.map(p => p.name).join(', ') : '✓ Tất cả đã có đội. Màu áo và tên trên đầu giúp nhận ra đồng đội.';
    $('mpReady').disabled = !self?.team;
    $('mpReady').textContent = self?.ready ? '✓ ĐÃ SẴN SÀNG · HỦY' : 'SẴN SÀNG';
    $('mpReady').setAttribute('aria-pressed', String(!!self?.ready));
    const allReady = room.players.every(p => p.team && p.ready), enough = room.teams.length >= 2, host = room.host === net.me;
    $('mpStart').hidden = !host; $('mpStart').disabled = !allReady || !enough;
    $('mpStartHint').textContent = !enough ? 'Cần ít nhất 2 đội. Gửi mã phòng để mời bạn bè.' : !allReady ? 'Mọi người cần chọn đội và bấm SẴN SÀNG.' : host ? 'Tất cả đã sẵn sàng. Bắt đầu khi bạn muốn.' : 'Tất cả đã sẵn sàng. Đang chờ chủ phòng bắt đầu.';
  }
  function resetNetwork() {
    net.room = null; net.online = false; net.self = null; net.me = null; net.opened = false;
    net.actors.clear(); net.history.clear(); net.shots = []; net.reload = false; net.dash = false;
    setBusy(false); document.body.classList.remove('neon-online'); matchHud.hidden = true; respawnHud.hidden = true;
    leaveButton.hidden = true; $('restartPauseButton').hidden = false;
    ui.pauseScreen.querySelector('.intro-copy').textContent = pauseCopy;
    pauseEyebrow.innerHTML = '<span></span> TẠM DỪNG TRẬN ĐẤU';
    document.querySelector('.header-stats .score-stat .stat-label').textContent = 'ĐIỂM SỐ';
    ui.waveBanner.classList.remove('visible'); ui.toast.classList.remove('visible');
    player = createPlayer(); enemies = []; bullets = []; enemyBullets = []; spawnQueue = []; drops = [];
  }
  function leaveRoom() {
    send({ type: 'leave' }); const socket = net.socket; net.socket = null; socket?.close();
    resetNetwork(); screen('entry'); setNotice('');
  }
  function beginMatch() {
    net.online = true; net.opened = false; net.self = null; net.seq = 0;
    net.actors.clear(); net.history.clear(); net.shots = []; net.correctedX = net.correctedY = 0;
    player = createPlayer(); enemies = []; bullets = []; enemyBullets = []; drops = []; spawnQueue = [];
    particles = []; afterimages = []; floatTexts = []; score = kills = wave = elapsed = 0;
    bannerTimer = toastTimer = damageFlash = hitmarker = 0; rapidTimer = 0;
    keys.clear(); clearPointer(); state = 'playing';
    document.body.classList.add('neon-online'); stage.classList.add('playing'); stage.classList.remove('paused');
    leaveButton.hidden = false; $('restartPauseButton').hidden = true;
    ui.pauseScreen.querySelector('.intro-copy').textContent = 'Trận online vẫn tiếp tục khi mở menu. Nhân vật của bạn vẫn có thể bị tấn công.';
    pauseEyebrow.innerHTML = '<span></span> MENU TRẬN ONLINE';
    ui.pauseButton.disabled = false; showScreen(null); matchHud.hidden = false;
    document.querySelector('.header-stats .score-stat .stat-label').textContent = 'ĐIỂM ĐỘI';
    announce('ĐẤU ĐỘI', '20 ĐIỂM HẠ GỤC · 5 PHÚT · KHÔNG BẮN ĐỒNG ĐỘI', 4);
    canvas.focus({ preventScroll: true }); updateHud();
  }
  function endMatch() {
    net.online = false; net.shots = []; clearPointer(); document.body.classList.remove('neon-online');
    screen('results');
    const winner = teamById(net.room.result?.winner), host = net.room.host === net.me;
    $('mpResultTitle').textContent = winner ? `${winner.name} CHIẾN THẮNG!` : 'TRẬN ĐẤU HÒA!';
    $('mpResultTitle').style.color = winner?.color || PALETTE.gold;
    $('mpResultReason').textContent = net.room.result?.reason || 'Trận đấu kết thúc.';
    $('mpResultScores').innerHTML = [...net.room.teams].sort((a, b) => b.score - a.score).map(t => `<div class="mp-result-row" style="--team-color:${t.color}"><span>${t.symbol} ${t.name}${mine()?.team === t.id ? ' · ĐỘI CỦA BẠN' : ''}</span><strong>${t.score}</strong></div>`).join('');
    $('mpResultSelf').textContent = `CỦA BẠN · ${mine()?.kills || 0} hạ gục / ${mine()?.deaths || 0} lần bị hạ`;
    $('mpBackLobby').hidden = !host; $('mpResultWait').textContent = host ? 'Mọi người sẽ trở về sảnh và có thể đổi đội.' : 'Đang chờ chủ phòng đưa cả phòng về sảnh.';
    sfx('wave');
  }
  function applySnapshot(message) {
    const self = message.players.find(p => p.id === net.me); if (!self) return;
    const previous = net.self, wasDead = previous?.hp <= 0;
    const predicted = net.history.get(self.seq);
    if (!previous || (wasDead && self.hp > 0) || Math.hypot(player.x - self.x, player.y - self.y) > 180) {
      player.x = self.x; player.y = self.y; player.angle = self.angle; net.correctedX = net.correctedY = 0; net.history.clear();
    } else if (predicted) {
      // Compare positions at the acknowledged input, preserving newer local movement.
      net.correctedX += self.x - predicted.x; net.correctedY += self.y - predicted.y;
      for (const [seq, pos] of net.history) if (seq > self.seq) { pos.x += self.x - predicted.x; pos.y += self.y - predicted.y; }
    }
    for (const seq of net.history.keys()) if (seq <= self.seq) net.history.delete(seq);
    if (previous && self.hp < previous.hp) { damageFlash = .5; sfx('hurt'); }
    if (previous && self.ammo < previous.ammo) { player.muzzle = .085; sfx('shoot'); }
    if (previous && !previous.reload && self.reload > 0) sfx('reload');
    if (previous && !previous.dash && self.dash > 0) sfx('dash');
    for (const key of ['hp', 'ammo', 'reload', 'dash', 'dashX', 'dashY', 'dashCooldown', 'fireCooldown', 'invulnerable']) player[key] = self[key];
    net.self = self; elapsed = message.elapsed; net.room.teams = message.teams;
    kills = self.kills; score = message.teams.find(t => t.id === self.team)?.score || 0;
    const alive = new Set();
    for (const p of message.players) {
      if (p.id === net.me) continue; alive.add(p.id);
      const old = net.actors.get(p.id);
      const jump = old && Math.hypot(old.x - p.x, old.y - p.y) < 200 && old.hp > 0 && p.hp > 0;
      net.actors.set(p.id, { ...p, fromX: jump ? old.x : p.x, fromY: jump ? old.y : p.y, targetX: p.x, targetY: p.y, x: jump ? old.x : p.x, y: jump ? old.y : p.y });
    }
    for (const id of net.actors.keys()) if (!alive.has(id)) net.actors.delete(id);
    net.shots = message.bullets; net.samplesAt = performance.now();
    for (const event of message.events) {
      if (event.shooter === net.me) { hitmarker = .17; if (event.type === 'hit') sfx('hit'); if (event.type === 'kill') { sfx('kill'); toast('+1 ĐIỂM CHO ĐỘI'); } }
    }
    updateHud();
  }
  function transmit() {
    if (!net.online || !net.self) return;
    const active = state === 'playing' && player.hp > 0 && !document.hidden;
    const input = active ? movementInput() : { x: 0, y: 0 };
    const seq = ++net.seq;
    net.history.set(seq, { x: player.x + net.correctedX, y: player.y + net.correctedY });
    while (net.history.size > 120) net.history.delete(net.history.keys().next().value);
    send({ type: 'input', seq, ...input, angle: player.angle, fire: active && pointer.down,
      reload: active && net.reload, dash: active && net.dash });
    net.reload = false; net.dash = false;
  }
  setInterval(transmit, 1000 / 30);
  setInterval(() => {
    if (net.socket?.readyState === WebSocket.OPEN) {
      if (performance.now() - net.lastMessage > 9000) net.socket.close();
      else send({ type: 'ping', at: performance.now() });
    }
  }, 2000);
  update = function (dt) {
    if (!net.online) { solo.update(dt); return; }
    updateEffects(dt);
    if (bannerTimer > 0 && (bannerTimer -= dt) <= 0) ui.waveBanner.classList.remove('visible');
    if (toastTimer > 0 && (toastTimer -= dt) <= 0) ui.toast.classList.remove('visible');
    if (!net.self) return;
    const active = state === 'playing' && player.hp > 0;
    if (active) {
      player.angle += ((keys.has('ArrowRight') ? 1 : 0) - (keys.has('ArrowLeft') ? 1 : 0)) * dt * 1.9;
      const input = movementInput(); player.moving = Math.hypot(input.x, input.y); player.step += dt * player.moving * 15;
      if (player.dash > 0) { const duration = Math.min(dt, player.dash); move(player, player.dashX * CONFIG.dashSpeed * duration, player.dashY * CONFIG.dashSpeed * duration); player.dash = Math.max(0, player.dash - dt); }
      else move(player, input.x * CONFIG.playerSpeed * dt, input.y * CONFIG.playerSpeed * dt);
    }
    const correction = 1 - Math.exp(-14 * dt);
    move(player, net.correctedX * correction, net.correctedY * correction);
    net.correctedX *= 1 - correction; net.correctedY *= 1 - correction;
    player.muzzle = Math.max(0, player.muzzle - dt);
    const alpha = clamp((performance.now() - net.samplesAt) / 50, 0, 1);
    for (const p of net.actors.values()) { p.x = p.fromX + (p.targetX - p.fromX) * alpha; p.y = p.fromY + (p.targetY - p.fromY) * alpha; }
    for (const b of net.shots) { b.x += b.vx * dt; b.y += b.vy * dt; }
  };
  updateHud = function () {
    solo.updateHud(); if (!net.online) return;
    ui.timeValue.textContent = formatTime(Math.max(0, RULES.duration - elapsed));
    ui.scoreValue.textContent = `${score} / ${RULES.scoreLimit}`;
    const team = myTeam();
    $('mpMatchMeta').textContent = `PHÒNG ${net.room.code} · ${net.ping} ms`;
    $('mpScoreboard').innerHTML = net.room.teams.map(t => `<div class="mp-score-line${t.id === team?.id ? ' is-mine' : ''}" style="color:${t.color}"><b>${t.score}</b><span>${t.symbol} ${t.name}</span></div>`).join('');
    respawnHud.hidden = !net.self || net.self.hp > 0;
    if (!respawnHud.hidden) respawnHud.innerHTML = `<strong>HỒI SINH SAU ${Math.ceil(net.self.respawn)} GIÂY</strong><p>Quay lại cùng đội ${team?.name || ''}</p>`;
    if (net.self?.hp > 0 && net.self.invulnerable > 0) ui.weaponLabel.textContent = 'GIÁP HỒI SINH · BẮN ĐỂ HỦY';
  };
  shoot = function () { if (net.online) return; solo.shoot(); };
  startReload = function () { if (net.online) { net.reload = true; transmit(); } else solo.startReload(); };
  dash = function () { if (net.online) { net.dash = true; transmit(); } else solo.dash(); };
  pauseGame = function () { solo.pauseGame(); if (net.online) { net.reload = net.dash = false; transmit(); } };
  resumeGame = function () { solo.resumeGame(); if (net.online) transmit(); };
  startGame = function () { if (net.room || net.opened) return; solo.startGame(); };

  // Palette-coloured armour is generated once. The same sprites are used by all peers.
  const actorSprites = new Map(), shotSprites = new Map();
  for (const team of TEAMS) {
    const image = document.createElement('canvas'); image.width = 64; image.height = 104;
    const c = image.getContext('2d');
    const box = (x, y, w, h, color) => { c.fillStyle = '#07121b'; c.fillRect(x - 2, y - 2, w + 4, h + 4); c.fillStyle = color; c.fillRect(x, y, w, h); };
    box(17, 69, 12, 28, '#394f62'); box(36, 69, 12, 28, '#394f62');
    box(13, 94, 17, 6, team.color); box(35, 94, 17, 6, team.color);
    box(9, 34, 9, 28, team.color); box(47, 34, 9, 28, team.color);
    box(17, 31, 30, 34, team.color); box(23, 38, 18, 22, '#213543');
    box(21, 8, 23, 21, team.color); box(18, 18, 29, 7, '#11222e');
    c.fillStyle = '#ddffff'; c.fillRect(23, 20, 19, 2);
    box(43, 51, 12, 27, '#546c7c'); box(20, 64, 24, 5, '#8297a5');
    c.fillStyle = team.color; c.font = 'bold 16px Arial'; c.textAlign = 'center'; c.fillText(team.symbol, 32, 55);
    actorSprites.set(team.id, image);
    const shot = document.createElement('canvas'); shot.width = shot.height = 16;
    const sc = shot.getContext('2d'), gradient = sc.createRadialGradient(8, 8, 0, 8, 8, 8);
    gradient.addColorStop(0, '#ffffff'); gradient.addColorStop(.3, team.color); gradient.addColorStop(1, team.color + '00');
    sc.fillStyle = gradient; sc.fillRect(0, 0, 16, 16); shotSprites.set(team.id, shot);
  }
  window.NeonMultiplayer = Object.freeze({
    inLobby: () => net.opened,
    color: () => net.online ? myTeam()?.color : null,
    addSprites(add) {
      if (!net.online) return;
      for (const p of net.actors.values()) if (p.hp > 0) {
        const team = teamById(p.team), friendly = p.team === mine()?.team;
        add(p, actorSprites.get(p.team), 48, 100, 0, p.invulnerable > 0 ? .7 : 1, friendly ? `${team.symbol} ${p.name}` : '', team.color);
      }
      for (const b of net.shots) add(b, shotSprites.get(b.team), 10, 10, 49);
    },
    drawRadar(c, scale) {
      if (!net.online) return;
      for (const p of net.actors.values()) if (p.hp > 0 && p.team === mine()?.team) {
        c.fillStyle = teamById(p.team).color; c.beginPath(); c.arc(p.x * scale, p.y * scale, 3, 0, TAU); c.fill();
      }
    }
  });
  $('multiplayerButton').addEventListener('click', () => { screen('entry'); setNotice(''); $('mpName').focus(); });
  $('mpCreate').addEventListener('click', () => enter('create'));
  $('mpJoinForm').addEventListener('submit', event => { event.preventDefault(); enter('join'); });
  $('mpCode').addEventListener('input', () => { $('mpCode').value = $('mpCode').value.toUpperCase().replace(/[^A-Z2-9]/g, ''); });
  $('mpExit').addEventListener('click', () => {
    if (net.room) leaveRoom();
    else {
      const socket = net.socket; net.socket = null; socket?.close(); resetNetwork();
      state = 'menu'; stage.classList.remove('playing', 'paused'); showScreen('intro'); updateHud(); $('multiplayerButton').focus();
    }
  });
  leaveButton.addEventListener('click', leaveRoom);
  $('mpTeams').addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button || button.disabled) return;
    if (button.hasAttribute('data-create-team')) command({ type: 'createTeam' });
    else if (button.dataset.team) command({ type: 'joinTeam', team: button.dataset.team });
  });
  $('mpReady').addEventListener('click', () => command({ type: 'ready', ready: !mine()?.ready }));
  $('mpStart').addEventListener('click', () => { ensureAudio(); command({ type: 'start' }); });
  $('mpBackLobby').addEventListener('click', () => command({ type: 'back' }));
  async function copy(value, success) {
    try { await navigator.clipboard.writeText(value); setNotice(success); }
    catch { setNotice(`Sao chép thủ công: ${value}`); }
  }
  $('mpCopy').addEventListener('click', () => copy(net.room.code, 'Đã sao chép mã phòng. Gửi cho bạn bè để cùng vào đội.'));
  $('mpCopyLink').addEventListener('click', () => {
    const url = new URL(net.inviteBase || location.origin); url.search = ''; url.searchParams.set('room', net.room.code);
    copy(url.href, net.inviteBase?.startsWith('http://') ? 'Đã sao chép link mạng LAN. Gửi cho bạn bè dùng cùng Wi-Fi / mạng nội bộ.' : 'Đã sao chép link mời. Gửi link này cho bạn bè để vào cùng phòng.');
  });
  window.addEventListener('pagehide', () => { send({ type: 'leave' }); net.socket?.close(); });
  if (inviteCode) { screen('entry'); $('mpName').focus(); }
})();
