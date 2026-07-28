const tg = window.Telegram?.WebApp;
if (tg) tg.ready();

// Фиксированный UUID единой комнаты
const SINGLE_ROOM_ID = "00000000-0000-0000-0000-000000000001";

let currentPlayer = null;
let roomPlayers = [];
let roomProperties = [];

document.addEventListener("DOMContentLoaded", () => {
  const input = document.getElementById('player-name-input');
  if (input && tg?.initDataUnsafe?.user?.first_name) {
    input.value = tg.initDataUnsafe.user.first_name;
  }
});

function haptic(type = 'impact', style = 'medium') {
  if (!tg?.HapticFeedback) return;
  if (type === 'impact') tg.HapticFeedback.impactOccurred(style);
  if (type === 'notification') tg.HapticFeedback.notificationOccurred(style);
}

// Быстрый вход
async function handleQuickStart() {
  haptic('impact', 'light');
  
  if (typeof supabaseClient === 'undefined' || !supabaseClient.from) {
    alert("ОШИБКА: supabaseClient не инициализирован! Проверьте supabaseClient.js");
    return;
  }

  const input = document.getElementById('player-name-input');
  const name = input?.value.trim() || tg?.initDataUnsafe?.user?.first_name || 'Игрок';
  const tgId = tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 10000000);

  try {
    // 0. Создаем или проверяем комнату
    let { data: room } = await supabaseClient
      .from('rooms')
      .select()
      .eq('id', SINGLE_ROOM_ID)
      .maybeSingle();

    if (!room) {
      await supabaseClient.from('rooms').insert([{ id: SINGLE_ROOM_ID, code: 'MAIN' }]);
    }

    // 1. Ищем игрока
    let { data: player, error: fetchError } = await supabaseClient
      .from('room_players')
      .select()
      .eq('telegram_id', tgId)
      .maybeSingle();

    if (fetchError) {
      alert("Ошибка загрузки игрока: " + fetchError.message);
      return;
    }

    // 2. Если нет — создаем
    if (!player) {
      const { data: newPlayer, error: createError } = await supabaseClient
        .from('room_players')
        .insert([{
          room_id: SINGLE_ROOM_ID,
          telegram_id: tgId,
          name: name,
          balance: 1500,
          turn_count: 0,
          credits_taken: 0,
          credit_timer: 0,
          in_jail: false,
          jail_cards: 0,
          is_bankrupt: false
        }])
        .select()
        .single();

      if (createError) {
        alert("Ошибка при создании игрока: " + createError.message);
        return;
      }
      player = newPlayer;
    }

    currentPlayer = player;

    // Переключаем экраны
    document.getElementById('join-screen').classList.remove('active');
    document.getElementById('game-screen').classList.add('active');

    subscribeRealtime();
    await loadGameState();
    await addLog(`🎮 ${currentPlayer.name} подключился к игре!`);

  } catch (err) {
    alert("Критическая ошибка при входе: " + err.message);
    console.error(err);
  }
}

function subscribeRealtime() {
  supabaseClient.channel(`room:${SINGLE_ROOM_ID}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players' }, () => loadGameState())
    .on('postgres_changes', { event: '*', schema: 'public', table: 'player_properties' }, () => loadGameState())
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_logs' }, (p) => addLog(p.new.message, false))
    .subscribe();
}

async function loadGameState() {
  try {
    const { data: players } = await supabaseClient.from('room_players').select();
    const { data: props } = await supabaseClient.from('player_properties').select();
    
    if (players) {
      roomPlayers = players;
      const found = players.find(p => p.id === currentPlayer?.id);
      if (found) currentPlayer = found;
    }
    if (props) roomProperties = props;

    updateUI();
    renderAssets();
    renderMarket();
  } catch (e) {
    console.error("Ошибка загрузки состояния:", e);
  }
}

async function addLog(message, saveToDb = true) {
  const box = document.getElementById('log-list');
  if (box) {
    const item = document.createElement('div');
    item.style.marginBottom = '6px';
    item.innerText = message;
    box.prepend(item);
  }

  if (saveToDb && typeof supabaseClient !== 'undefined') {
    await supabaseClient.from('game_logs').insert([{ room_id: SINGLE_ROOM_ID, message }]);
  }
}

function updateUI() {
  if (!currentPlayer) return;
  
  const statusText = currentPlayer.is_bankrupt ? ' (БАНКРОТ)' : (currentPlayer.in_jail ? ' (В ТЮРЬМЕ)' : '');
  document.getElementById('ui-name').innerText = currentPlayer.name + statusText;
  document.getElementById('ui-balance').innerText = `$${currentPlayer.balance}`;
  document.getElementById('ui-turn').innerText = `Круг: ${currentPlayer.turn_count || 0}/10`;
  document.getElementById('ui-credits').innerText = `Кредиты: ${currentPlayer.credits_taken || 0}/3 (${currentPlayer.credit_timer || 0}х)`;
  
  const btnTurn = document.getElementById('btn-turn');
  if (btnTurn) {
    btnTurn.disabled = currentPlayer.is_bankrupt;
  }
}

// ОСНОВНОЙ ИГРОВОЙ ХОД
async function handleTurn() {
  if (!currentPlayer || currentPlayer.is_bankrupt) {
    alert("Вы не можете ходить (банкрот)!");
    return;
  }
  
  haptic('impact', 'heavy');

  // Проверка на Тюрьму
  if (currentPlayer.in_jail) {
    if ((currentPlayer.jail_cards || 0) > 0) {
      currentPlayer.jail_cards--;
      currentPlayer.in_jail = false;
      alert("🚪 Вы использовали карточку и вышли из Тюрьмы!");
      await addLog(`🚪 ${currentPlayer.name} использовал карточку и вышел из Тюрьмы!`);
    } else {
      alert("🔒 Вы пропускаете ход, так как находитесь в Тюрьме!");
      currentPlayer.in_jail = false; // Освобождаем для следующего круга
      await addLog(`🔒 ${currentPlayer.name} отсидел ход и выходит из Тюрьмы.`);
      await updatePlayerState();
      return;
    }
  }

  // Расчет кругов и кредитов
  let turnCount = (currentPlayer.turn_count || 0) + 1;
  let balance = currentPlayer.balance;
  let creditTimer = currentPlayer.credit_timer || 0;

  if (creditTimer > 0) {
    creditTimer--;
    if (creditTimer === 0 && currentPlayer.credits_taken > 0) {
      balance -= 1000;
      await addLog(`⚠️ У ${currentPlayer.name} истек срок кредита! Списано $1000.`);
      if (balance < 0) checkBankrupt();
    }
  }

  if (turnCount >= 10) {
    turnCount = 0;
    balance += 200;
    haptic('notification', 'success');
    alert("🎉 Вы прошлый круг! Получено +$200 зарплаты.");
    await addLog(`🎉 ${currentPlayer.name} прошёл круг! +$200 зарплата.`);
  }

  currentPlayer.turn_count = turnCount;
  currentPlayer.balance = balance;
  currentPlayer.credit_timer = creditTimer;

  // Бросок костей (32 клетки)
  const roll = Math.floor(Math.random() * 32); 

  if (roll < 28) {
    if (typeof PROPERTIES !== 'undefined' && PROPERTIES[roll]) {
      const prop = PROPERTIES[roll];
      await handlePropertyLand(prop);
    } else {
      alert(`Выпала клетка #${roll + 1}`);
    }
  } else if (roll === 28 || roll === 29) {
    if (typeof CHANCE_CARDS !== 'undefined') {
      await handleCard(CHANCE_CARDS, "Шанс");
    }
  } else if (roll === 30) {
    if (typeof TREASURY_CARDS !== 'undefined') {
      await handleCard(TREASURY_CARDS, "Общественная Казна");
    }
  } else {
    currentPlayer.in_jail = true;
    haptic('notification', 'error');
    alert("🚔 ВЫ ПОПАЛИ В ТЮРЬМУ!");
    await addLog(`🚔 ${currentPlayer.name} попал в Тюрьму!`);
  }

  await updatePlayerState();
}

async function handlePropertyLand(prop) {
  const owned = roomProperties.find(p => p.property_id === prop.id);

  if (!owned) {
    const buy = confirm(`🎲 Вы попали на: ${prop.name}\nСтоимость: $${prop.price}\n\nКупить этот объект? (ОК - Купить, Cancel - Аукцион)`);
    if (buy) {
      if (currentPlayer.balance >= prop.price) {
        currentPlayer.balance -= prop.price;
        const { error } = await supabaseClient.from('player_properties').insert([{
          room_id: SINGLE_ROOM_ID, player_id: currentPlayer.id, property_id: prop.id, houses: 0
        }]);
        if (error) alert("Ошибка покупки: " + error.message);
        else await addLog(`🏠 ${currentPlayer.name} купил ${prop.name} за $${prop.price}`);
      } else {
        alert("Недостаточно денег для покупки!");
      }
    } else {
      await addLog(`📢 ${prop.name} отправлен на аукцион!`);
      await runAuction(prop);
    }
  } else if (owned.player_id !== currentPlayer.id && !owned.is_mortgaged) {
    let rentCost = (prop.rent && prop.rent[owned.houses]) ? prop.rent[owned.houses] : (prop.rent ? prop.rent[0] : 50);
    
    currentPlayer.balance -= rentCost;
    alert(`💸 Вы попали на чужую собственность (${prop.name})! Списано $${rentCost} аренды.`);
    await addLog(`💸 ${currentPlayer.name} заплатил $${rentCost} аренды за ${prop.name}`);

    const owner = roomPlayers.find(p => p.id === owned.player_id);
    if (owner) {
      await supabaseClient.from('room_players').update({ balance: owner.balance + rentCost }).eq('id', owner.id);
    }
    if (currentPlayer.balance < 0) checkBankrupt();
  } else {
    alert(`🏠 Вы встали на свой объект: ${prop.name}`);
  }
}

async function runAuction(prop) {
  let bid = 10;
  let winner = currentPlayer;
  
  const activePlayers = roomPlayers.filter(p => !p.is_bankrupt);
  for (let p of activePlayers) {
    if (p.balance >= bid + 10) {
      if (confirm(`🔨 Аукцион за ${prop.name}.\nТекущая ставка: $${bid}.\nИгрок ${p.name}, поднять до $${bid + 10}?`)) {
        bid += 10;
        winner = p;
      }
    }
  }

  if (winner && winner.balance >= bid) {
    await supabaseClient.from('room_players').update({ balance: winner.balance - bid }).eq('id', winner.id);
    await supabaseClient.from('player_properties').insert([{
      room_id: SINGLE_ROOM_ID, player_id: winner.id, property_id: prop.id, houses: 0
    }]);
    alert(`🔨 Аукцион завершен! Победитель: ${winner.name} ($${bid})`);
    await addLog(`🔨 ${winner.name} выиграл аукцион за ${prop.name} за $${bid}!`);
  }
}

async function handleCard(deck, name) {
  if (!deck || !deck.length) return;
  const card = deck[Math.floor(Math.random() * deck.length)];
  
  alert(`🎴 Карточка [${name}]:\n\n${card.text}`);
  await addLog(`🎴 ${currentPlayer.name} вытянул [${name}]: ${card.text}`);

  if (card.type === 'start') {
    currentPlayer.balance += (card.value || 200);
    currentPlayer.turn_count = 0;
  } else if (card.type === 'money') {
    currentPlayer.balance += (card.value || 100);
  } else if (card.type === 'go_jail') {
    currentPlayer.in_jail = true;
  } else if (card.type === 'jail_free') {
    currentPlayer.jail_cards = (currentPlayer.jail_cards || 0) + 1;
  } else if (card.type === 'pay_players') {
    const val = card.value || 50;
    roomPlayers.forEach(p => { if (p.id !== currentPlayer.id) currentPlayer.balance -= val; });
  } else if (card.type === 'collect_players') {
    const val = card.value || 50;
    roomPlayers.forEach(p => { if (p.id !== currentPlayer.id) currentPlayer.balance += val; });
  }

  if (currentPlayer.balance < 0) checkBankrupt();
}

async function handleTakeCredit() {
  if (!currentPlayer || (currentPlayer.credits_taken || 0) >= 3) {
    return alert('Лимит кредитов достигнут (максимум 3)!');
  }
  
  currentPlayer.balance += 1000;
  currentPlayer.credits_taken = (currentPlayer.credits_taken || 0) + 1;
  currentPlayer.credit_timer = 30;
  
  haptic('notification', 'warning');
  alert("🏦 Вы успешно взяли кредит $1000 на 30 ходов!");
  await addLog(`🏦 ${currentPlayer.name} взял кредит $1000 на 30 ходов`);
  await updatePlayerState();
}

function renderAssets() {
  const box = document.getElementById('my-assets-list');
  if (!box || !currentPlayer) return;
  box.innerHTML = '';
  
  const myProps = roomProperties.filter(p => p.player_id === currentPlayer.id);
  if (!myProps.length) { 
    box.innerText = 'У вас пока нет объектов'; 
    return; 
  }

  myProps.forEach(item => {
    const prop = (typeof PROPERTIES !== 'undefined') ? PROPERTIES.find(p => p.id === item.property_id) : null;
    const propName = prop ? prop.name : `Объект #${item.property_id}`;
    const housePrice = prop ? (prop.housePrice || 100) : 100;
    const price = prop ? prop.price : 200;

    const el = document.createElement('div');
    el.style.cssText = "margin-bottom:10px; padding:8px; border-bottom:1px solid rgba(255,255,255,0.1);";
    el.innerHTML = `
      <b>${propName}</b> (${item.is_mortgaged ? 'ЗАЛОЖЕН' : 'Домов: ' + (item.houses || 0)})<br>
      <button onclick="buildHouse('${item.id}', '${item.property_id}')" style="width:auto; padding:4px 8px; font-size:12px; margin-top:4px;">+ Дом ($${housePrice})</button>
      <button onclick="toggleMortgage('${item.id}', ${item.is_mortgaged}, ${price})" style="width:auto; padding:4px 8px; font-size:12px; background:#f43f5e; color:#fff; margin-top:4px;">
        ${item.is_mortgaged ? 'Выкупить' : 'Заложить ($' + price/2 + ')'}
      </button>
    `;
    box.appendChild(el);
  });
}

async function buildHouse(recordId, propId) {
  const prop = (typeof PROPERTIES !== 'undefined') ? PROPERTIES.find(p => p.id === Number(propId)) : null;
  const record = roomProperties.find(r => r.id === recordId);
  const housePrice = prop ? (prop.housePrice || 100) : 100;
  
  if (!record) return;
  if (record.houses >= 5) return alert('Максимум: Отель!');
  if (currentPlayer.balance < housePrice) return alert('Недостаточно средств!');

  currentPlayer.balance -= housePrice;
  await supabaseClient.from('player_properties').update({ houses: (record.houses || 0) + 1 }).eq('id', recordId);
  await updatePlayerState();
  await addLog(`🏗️ ${currentPlayer.name} построил дом/отель`);
}

async function toggleMortgage(recordId, isMortgaged, price) {
  if (!isMortgaged) {
    currentPlayer.balance += price / 2;
    await supabaseClient.from('player_properties').update({ is_mortgaged: true }).eq('id', recordId);
    await addLog(`🏦 ${currentPlayer.name} заложил объект`);
  } else {
    const unmortgageCost = (price / 2) * 1.1;
    if (currentPlayer.balance < unmortgageCost) return alert('Не хватает денег на выкуп!');
    currentPlayer.balance -= unmortgageCost;
    await supabaseClient.from('player_properties').update({ is_mortgaged: false }).eq('id', recordId);
    await addLog(`🔓 ${currentPlayer.name} выкупил объект`);
  }
  await updatePlayerState();
}

function renderMarket() {
  const box = document.getElementById('players-list');
  if (!box) return;
  box.innerHTML = '<h4>Игроки в комнате:</h4>';
  roomPlayers.forEach(p => {
    box.innerHTML += `<div style="margin-bottom:4px;"><b>${p.name}:</b> $${p.balance} ${p.is_bankrupt ? '❌ (Банкрот)' : ''}</div>`;
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
    alert('⚠️ Баланс отрицательный! Заложите ваши объекты во вкладке «Активы».');
  }
}

async function updatePlayerState() {
  if (!currentPlayer) return;
  
  const { error } = await supabaseClient.from('room_players').update({
    balance: currentPlayer.balance,
    turn_count: currentPlayer.turn_count,
    credits_taken: currentPlayer.credits_taken,
    credit_timer: currentPlayer.credit_timer,
    in_jail: currentPlayer.in_jail,
    jail_cards: currentPlayer.jail_cards,
    is_bankrupt: currentPlayer.is_bankrupt
  }).eq('id', currentPlayer.id);

  if (error) {
    console.error("Ошибка при сохранении хода:", error.message);
  }
  
  updateUI();
  await loadGameState();
}
