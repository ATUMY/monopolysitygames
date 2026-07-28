import { supabase } from './supabaseClient.js';
import { PROPERTIES, CHANCE_CARDS, TREASURY_CARDS } from './gameData.js';

const tg = window.Telegram?.WebApp;
if (tg) tg.ready();

let currentRoom = null;
let currentPlayer = null;

const nameInput = document.getElementById('player-name');
const codeInput = document.getElementById('room-code');

if (tg?.initDataUnsafe?.user?.first_name) {
  nameInput.value = tg.initDataUnsafe.user.first_name;
}

function haptic(type = 'impact', style = 'medium') {
  if (!tg?.HapticFeedback) return;
  if (type === 'impact') tg.HapticFeedback.impactOccurred(style);
  if (type === 'notification') tg.HapticFeedback.notificationOccurred(style);
}

document.getElementById('btn-create').addEventListener('click', async () => {
  haptic('impact', 'light');
  const code = Math.random().toString(36).substring(2, 7).toUpperCase();
  const { data: room, error } = await supabase.from('rooms').insert([{ code }]).select().single();
  if (error) return alert('Ошибка создания комнаты');
  await joinRoom(room.id, code);
});

document.getElementById('btn-join').addEventListener('click', async () => {
  haptic('impact', 'light');
  const code = codeInput.value.trim().toUpperCase();
  if (!code) return alert('Введите код комнаты');
  const { data: room, error } = await supabase.from('rooms').select().eq('code', code).single();
  if (error || !room) return alert('Комната не найдена');
  await joinRoom(room.id, code);
});

async function joinRoom(roomId, code) {
  const name = nameInput.value.trim() || 'Игрок';
  const tgId = tg?.initDataUnsafe?.user?.id || Math.floor(Math.random() * 1000000);

  const { data: player, error } = await supabase.from('room_players').insert([{
    room_id: roomId,
    telegram_id: tgId,
    name: name
  }]).select().single();

  if (error) return alert('Ошибка входа');

  currentRoom = roomId;
  currentPlayer = player;

  document.getElementById('auth-screen').classList.remove('active');
  document.getElementById('game-screen').classList.add('active');

  subscribeRealtime();
  addLog(`Вы вошли в комнату: ${code}`);
  updateUI();
}

function subscribeRealtime() {
  supabase.channel(`room:${currentRoom}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_players', filter: `room_id=eq.${currentRoom}` }, (payload) => {
      if (payload.new && payload.new.id === currentPlayer.id) currentPlayer = payload.new;
      updateUI();
    })
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'game_logs', filter: `room_id=eq.${currentRoom}` }, (payload) => {
      addLog(payload.new.message, false);
    })
    .subscribe();
}

async function addLog(message, saveToDb = true) {
  const box = document.getElementById('log-list');
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
  document.getElementById('ui-name').innerText = currentPlayer.name;
  document.getElementById('ui-balance').innerText = `$${currentPlayer.balance}`;
  document.getElementById('ui-turn').innerText = `Круг: ${currentPlayer.turn_count}/10`;
  document.getElementById('ui-credits').innerText = `Кредиты: ${currentPlayer.credits_taken}/3`;
}

document.getElementById('btn-turn').addEventListener('click', async () => {
  if (!currentPlayer || currentPlayer.is_bankrupt) return;
  haptic('impact', 'heavy');

  let turnCount = currentPlayer.turn_count + 1;
  let balance = currentPlayer.balance;

  if (turnCount >= 10) {
    turnCount = 0;
    balance += 200;
    haptic('notification', 'success');
    addLog(`🎉 ${currentPlayer.name} завершил круг и получил +$200!`);
  }

  const roll = Math.floor(Math.random() * PROPERTIES.length);
  const target = PROPERTIES[roll];

  addLog(`🎲 ${currentPlayer.name} сделала ход и выбила: ${target.name}`);

  await supabase.from('room_players').update({
    turn_count: turnCount,
    balance: balance
  }).eq('id', currentPlayer.id);
});

document.getElementById('btn-credit').addEventListener('click', async () => {
  if (!currentPlayer) return;
  if (currentPlayer.credits_taken >= 3) {
    haptic('notification', 'error');
    return alert('Достигнут лимит кредитов!');
  }

  haptic('notification', 'warning');
  await supabase.from('room_players').update({
    balance: currentPlayer.balance + 1000,
    credits_taken: currentPlayer.credits_taken + 1
  }).eq('id', currentPlayer.id);

  addLog(`🏦 ${currentPlayer.name} взял кредит $1000`);
});
