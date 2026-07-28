import { supabase } from './supabaseClient.js';
import { PROPERTIES, CHANCE_CARDS, TREASURY_CARDS } from './gameData.js';

const tg = window.Telegram?.WebApp;
if (tg) tg.ready();

let currentRoom = null;
let currentPlayer = null;
let roomPlayers = [];
let roomProperties = [];

function getPlayerName() {
  const input = document.getElementById('player-name');
  return input?.value.trim() || tg?.initDataUnsafe?.user?.first_name || 'Игрок';
}

function haptic(type = 'impact', style = 'medium') {
  if (!tg?.HapticFeedback) return;
  if (type === 'impact') tg.HapticFeedback.impactOccurred(style);
  if (type === 'notification') tg.HapticFeedback.notificationOccurred(style);
}

// ЭКСПОРТ ФУНКЦИЙ ДЛЯ КНОПОК
window.handleCreateRoom = async function() {
  haptic('impact', 'light');
  try {
    const code = Math.random().toString(36).substring(2, 7).toUpperCase();
    const { data: room, error } = await supabase.from('rooms').insert([{ code }]).select().single();
    
    if (error) {
      alert('Ошибка Supabase: ' + error.message);
      console.error(error);
      return;
    }
    await joinRoom(room.id, code);
  } catch (err) {
    alert('Критическая ошибка при создании: ' + err.message);
  }
};

window.handleJoinRoom = async function() {
  haptic('impact', 'light');
  try {
    const codeInput = document.getElementById('room-code');
    const code = codeInput ? codeInput.value.trim().toUpperCase() : '';
    if (!code) return alert('Введите код комнаты!');
    
    const { data: room, error } = await supabase.from('rooms').select().eq('code', code).single();
    if (error || !room) {
      alert('Комната с таким кодом не найдена!');
      return;
    }
    await joinRoom(room.id, code);
  } catch (err) {
    alert('Ошибка при входе в комнату: ' + err.message);
  }
};

async function joinRoom(roomId, code) {
  const name = getPlayerName();
  const tgId = tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 1000000);

  const { data: player, error } = await supabase.from('room_players').insert([{
    room_id: roomId, telegram_id: tgId, name: name
  }]).select().single();

  if (error) {
    alert('Не удалось войти в комнату: ' + error.message);
    return;
  }

  currentRoom = roomId;
  currentPlayer = player;

  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  subscribeRealtime();
  await loadGameState();
  addLog(`🎮 ${name} вошел в комнату [${code}]`);
}

function subscribeRealtime() {
  supabase.channel(`room:${currentRoom}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${currentRoom}` }, () => loadGameState())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_properties', filter: `room_id=eq.${currentRoom}` }, () => loadGameState())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_logs', filter: `room_id=eq.${currentRoom}` }, (p) => addLog(p.new.message, false))
    .subscribe();
}

async function loadGameState() {
  const { data: players } = await supabase.from('room_players').select().eq('room_id', currentRoom);
  const { data: props } = await supabase.from('player_properties').select().eq('room_id', currentRoom);
  
  if (players) {
    roomPlayers = players;
    currentPlayer = players.find(p => p.id === currentPlayer.id) || currentPlayer;
  }
  if (props) roomProperties = props;

  updateUI();
  renderAssets();
  renderMarket();
}

async function addLog(message, saveToDb = true) {
  const box = document.getElementById('log-list');
  if (!box) return;
  const item = document.createElement('div');
  item.style.marginBottom = '6px';
  item.innerText = message;
  box.prepend(item);

  if (saveToDb && currentRoom) {
    await supabase.from('game_logs').insert([{ room_id: currentRoom, message }]);
  }
}

function updateUI() {
  if (!currentPlayer) return;
  document.getElementById('ui-name').innerText = currentPlayer.name + (currentPlayer.is_bankrupt ? ' (БАНКРОТ)' : '');
  document.getElementById('ui-balance').innerText = `$${currentPlayer.balance}`;
  document.getElementById('ui-turn').innerText = `Круг: ${currentPlayer.turn_count}/10`;
  document.getElementById('ui-credits').innerText = `Кредиты: ${currentPlayer.credits_taken}/3 (${currentPlayer.credit_timer}х)`;
  
  const btnTurn = document.getElementById('btn-turn');
  if (btnTurn) btnTurn.disabled = currentPlayer.is_bankrupt;
}

// ИГРОВЫЕ ДЕЙСТВИЯ
window.handleTurn = async function() {
  if (!currentPlayer || currentPlayer.is_bankrupt) return;
  haptic('impact', 'heavy');

  if (currentPlayer.in_jail) {
    if (currentPlayer.jail_cards > 0) {
      currentPlayer.jail_cards--;
      currentPlayer.in_jail = false;
      addLog(`🚪 ${currentPlayer.name} использовал карточку и вышел из Тюрьмы!`);
    } else {
      addLog(`🔒 ${currentPlayer.name} пропускает ход (в Тюрьме)`);
      await updatePlayerState();
      return;
    }
  }

  let turnCount = currentPlayer.turn_count + 1;
  let balance = currentPlayer.balance;
  let creditTimer = currentPlayer.credit_timer;

  if (creditTimer > 0) {
    creditTimer--;
    if (creditTimer === 0 && currentPlayer.credits_taken > 0) {
      balance -= 1000;
      addLog(`⚠️ У ${currentPlayer.name} истек срок кредита! Списано $1000.`);
      if (balance < 0) checkBankrupt();
    }
  }

  if (turnCount >= 10) {
    turnCount = 0;
    balance += 200;
    haptic('notification', 'success');
    addLog(`🎉 ${currentPlayer.name} прошёл круг! +$200 зарплата.`);
  }

  currentPlayer.turn_count = turnCount;
  currentPlayer.balance = balance;
  currentPlayer.credit_timer = creditTimer;

  const roll = Math.floor(Math.random() * 32); 

  if (roll < 28) {
    const prop = PROPERTIES.find(p => p.id === (roll + 1));
    await handlePropertyLand(prop);
  } else if (roll === 28 || roll === 29) {
    await handleCard(CHANCE_CARDS, "Шанс");
  } else if (roll === 30) {
    await handleCard(TREASURY_CARDS, "Общественная Казна");
  } else {
    currentPlayer.in_jail = true;
    haptic('notification', 'error');
    addLog(`🚔 ${currentPlayer.name} попал в Тюрьму!`);
  }

  await updatePlayerState();
};

async function handlePropertyLand(prop) {
  const owned = roomProperties.find(p => p.property_id === prop.id);

  if (!owned) {
    const buy = confirm(`Выпал: ${prop.name} (Цена: $${prop.price}). Купить?\nCancel = Отправить на аукцион.`);
    if (buy && currentPlayer.balance >= prop.price) {
      currentPlayer.balance -= prop.price;
      await supabase.from('player_properties').insert([{
        room_id: currentRoom, player_id: currentPlayer.id, property_id: prop.id
      }]);
      addLog(`🏠 ${currentPlayer.name} купил ${prop.name} за $${prop.price}`);
    } else {
      addLog(`📢 ${prop.name} отправлен на аукцион!`);
      runAuction(prop);
    }
  } else if (owned.player_id !== currentPlayer.id && !owned.is_mortgaged) {
    let rentCost = prop.rent[owned.houses] || prop.rent[0];
    
    if (prop.group !== 'station' && owned.houses === 0) {
      const groupProps = PROPERTIES.filter(p => p.group === prop.group);
      const ownerProps = roomProperties.filter(p => p.player_id === owned.player_id && groupProps.some(gp => gp.id === p.property_id));
      if (ownerProps.length === groupProps.length) rentCost *= 2;
    }

    currentPlayer.balance -= rentCost;
    addLog(`💸 ${currentPlayer.name} заплатил $${rentCost} аренды за ${prop.name}`);

    const owner = roomPlayers.find(p => p.id === owned.player_id);
    if (owner) {
      await supabase.from('room_players').update({ balance: owner.balance + rentCost }).eq('id', owner.id);
    }
    if (currentPlayer.balance < 0) checkBankrupt();
  }
}

async function runAuction(prop) {
  let bid = 10;
  let winner = currentPlayer;
  
  roomPlayers.filter(p => !p.is_bankrupt).forEach(p => {
    if (p.balance >= bid + 10) {
      if (confirm(`Аукцион за ${prop.name}. Игрок ${p.name}, поднять ставку до $${bid + 10}?`)) {
        bid += 10;
        winner = p;
      }
    }
  });

  if (winner.balance >= bid) {
    await supabase.from('room_players').update({ balance: winner.balance - bid }).eq('id', winner.id);
    await supabase.from('player_properties').insert([{
      room_id: currentRoom, player_id: winner.id, property_id: prop.id
    }]);
    addLog(`🔨 ${winner.name} выиграл аукцион за ${prop.name} за $${bid}!`);
  }
}

async function handleCard(deck, name) {
  const card = deck[Math.floor(Math.random() * deck.length)];
  addLog(`🎴 ${currentPlayer.name} тянет карту [${name}]: ${card.text}`);

  if (card.type === 'start') {
    currentPlayer.balance += card.value;
    currentPlayer.turn_count = 0;
  } else if (card.type === 'money') {
    currentPlayer.balance += card.value;
  } else if (card.type === 'go_jail') {
    currentPlayer.in_jail = true;
  } else if (card.type === 'jail_free') {
    currentPlayer.jail_cards = (currentPlayer.jail_cards || 0) + 1;
  } else if (card.type === 'pay_players') {
    roomPlayers.forEach(p => { if (p.id !== currentPlayer.id) currentPlayer.balance -= card.value; });
  } else if (card.type === 'collect_players') {
    roomPlayers.forEach(p => { if (p.id !== currentPlayer.id) currentPlayer.balance += card.value; });
  }

  if (currentPlayer.balance < 0) checkBankrupt();
}

window.handleTakeCredit = async function() {
  if (!currentPlayer || currentPlayer.credits_taken >= 3) return alert('Лимит кредитов достигнут (макс 3)!');
  
  currentPlayer.balance += 1000;
  currentPlayer.credits_taken += 1;
  currentPlayer.credit_timer = 30;
  
  haptic('notification', 'warning');
  addLog(`🏦 ${currentPlayer.name} взял кредит $1000 на 30 ходов`);
  await updatePlayerState();
};

function renderAssets() {
  const box = document.getElementById('my-assets-list');
  if (!box) return;
  box.innerHTML = '';
  const myProps = roomProperties.filter(p => p.player_id === currentPlayer.id);

  if (!myProps.length) { box.innerText = 'У вас нет объектов'; return; }

  myProps.forEach(item => {
    const prop = PROPERTIES.find(p => p.id === item.property_id);
    const el = document.createElement('div');
    el.style.cssText = "margin-bottom:10px; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);";
    el.innerHTML = `
      <b>${prop.name}</b> (${item.is_mortgaged ? 'ЗАЛОЖЕН' : 'Домов: ' + item.houses})<br>
      <button onclick="buildHouse('${item.id}', '${prop.id}')" style="width:auto; padding:4px 8px; font-size:12px;">+ Дом ($${prop.housePrice || 0})</button>
      <button onclick="toggleMortgage('${item.id}', ${item.is_mortgaged}, ${prop.price})" style="width:auto; padding:4px 8px; font-size:12px; background:#f43f5e; color:#fff;">
        ${item.is_mortgaged ? 'Выкупить' : 'Заложить ($' + prop.price/2 + ')'}
      </button>
    `;
    box.appendChild(el);
  });
}

window.buildHouse = async (recordId, propId) => {
  const prop = PROPERTIES.find(p => p.id === Number(propId));
  const record = roomProperties.find(r => r.id === recordId);
  
  if (record.houses >= 5) return alert('Максимум: Отель!');
  if (currentPlayer.balance < prop.housePrice) return alert('Недостаточно средств!');

  const groupProps = PROPERTIES.filter(p => p.group === prop.group);
  const myGroupRecords = roomProperties.filter(r => groupProps.some(gp => gp.id === r.property_id));
  
  if (myGroupRecords.length < groupProps.length) return alert('Соберите весь сет города!');
  const minHouses = Math.min(...myGroupRecords.map(r => r.houses));
  if (record.houses > minHouses) return alert('Стройте дома равномерно!');

  currentPlayer.balance -= prop.housePrice;
  await supabase.from('player_properties').update({ houses: record.houses + 1 }).eq('id', recordId);
  await updatePlayerState();
  addLog(`🏗️ ${currentPlayer.name} построил ${record.houses + 1 === 5 ? 'Отель' : 'дом'} на ${prop.name}`);
};

window.toggleMortgage = async (recordId, isMortgaged, price) => {
  if (!isMortgaged) {
    currentPlayer.balance += price / 2;
    await supabase.from('player_properties').update({ is_mortgaged: true }).eq('id', recordId);
    addLog(`🏦 ${currentPlayer.name} заложил объект за $${price / 2}`);
  } else {
    const unmortgageCost = (price / 2) * 1.1;
    if (currentPlayer.balance < unmortgageCost) return alert('Не хватает денег на выкуп (+10% комиссия)!');
    currentPlayer.balance -= unmortgageCost;
    await supabase.from('player_properties').update({ is_mortgaged: false }).eq('id', recordId);
    addLog(`🔓 ${currentPlayer.name} выкупил объект за $${unmortgageCost}`);
  }
  await updatePlayerState();
};

function renderMarket() {
  const box = document.getElementById('players-list');
  if (!box) return;
  box.innerHTML = '<h4>Игроки и Балансы:</h4>';
  roomPlayers.forEach(p => {
    box.innerHTML += `<div><b>${p.name}:</b> $${p.balance} ${p.is_bankrupt ? '❌ (Банкрот)' : ''}</div>`;
  });
}

function checkBankrupt() {
  const myProps = roomProperties.filter(p => p.player_id === currentPlayer.id && !p.is_mortgaged);
  if (myProps.length === 0) {
    currentPlayer.is_bankrupt = true;
    haptic('notification', 'error');
    alert('💥 ВЫ БАНКРОТ! Вы выбываете из игры.');
    addLog(`💥 Игрок ${currentPlayer.name} объявлен БАНКРОТОМ!`);
  } else {
    alert('⚠️ Баланс отрицательный! Заложите активы.');
  }
}

async function updatePlayerState() {
  await supabase.from('room_players').update({
    balance: currentPlayer.balance,
    turn_count: currentPlayer.turn_count,
    credits_taken: currentPlayer.credits_taken,
    credit_timer: currentPlayer.credit_timer,
    in_jail: currentPlayer.in_jail,
    jail_cards: currentPlayer.jail_cards,
    is_bankrupt: currentPlayer.is_bankrupt
  }).eq('id', currentPlayer.id);
  
  updateUI();
}
