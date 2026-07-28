export const PROPERTIES = [
  // Коричневая ($50)
  { id: 1, name: "Детройт", group: "brown", price: 60, housePrice: 50, rent: [2, 10, 30, 90, 160, 250] },
  { id: 2, name: "Кливленд", group: "brown", price: 60, housePrice: 50, rent: [4, 20, 60, 180, 320, 450] },
  // Голубая ($50)
  { id: 3, name: "Мемфис", group: "light_blue", price: 100, housePrice: 50, rent: [6, 30, 90, 270, 400, 550] },
  { id: 4, name: "Нэшвилл", group: "light_blue", price: 100, housePrice: 50, rent: [6, 30, 90, 270, 400, 550] },
  { id: 5, name: "Атланта", group: "light_blue", price: 120, housePrice: 50, rent: [8, 40, 100, 300, 450, 600] },
  // Розовая ($100)
  { id: 6, name: "Феникс", group: "pink", price: 140, housePrice: 100, rent: [10, 50, 150, 450, 625, 750] },
  { id: 7, name: "Денвер", group: "pink", price: 140, housePrice: 100, rent: [10, 50, 150, 450, 625, 750] },
  { id: 8, name: "Даллас", group: "pink", price: 160, housePrice: 100, rent: [12, 60, 180, 500, 700, 900] },
  // Оранжевая ($100)
  { id: 9, name: "Хьюстон", group: "orange", price: 180, housePrice: 100, rent: [14, 70, 200, 550, 750, 950] },
  { id: 10, name: "Сиэтл", group: "orange", price: 180, housePrice: 100, rent: [14, 70, 200, 550, 750, 950] },
  { id: 11, name: "Филадельфия", group: "orange", price: 200, housePrice: 100, rent: [16, 80, 220, 600, 800, 1000] },
  // Красная ($150)
  { id: 12, name: "Майами", group: "red", price: 220, housePrice: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 13, name: "Лас-Вегас", group: "red", price: 220, housePrice: 150, rent: [18, 90, 250, 700, 875, 1050] },
  { id: 14, name: "Чикаго", group: "red", price: 240, housePrice: 150, rent: [20, 100, 300, 750, 925, 1100] },
  // Желтая ($150)
  { id: 15, name: "Сан-Диего", group: "yellow", price: 260, housePrice: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 16, name: "Сан-Франциско", group: "yellow", price: 260, housePrice: 150, rent: [22, 110, 330, 800, 975, 1150] },
  { id: 17, name: "Бостон", group: "yellow", price: 280, housePrice: 150, rent: [24, 120, 360, 850, 1025, 1200] },
  // Зеленая ($200)
  { id: 18, name: "Вашингтон", group: "green", price: 300, housePrice: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 19, name: "Лос-Анджелес", group: "green", price: 300, housePrice: 200, rent: [26, 130, 390, 900, 1100, 1275] },
  { id: 20, name: "Беверли-Хиллз", group: "green", price: 320, housePrice: 200, rent: [28, 150, 450, 1000, 1200, 1400] },
  // Синяя ($200)
  { id: 21, name: "Манхэттен", group: "dark_blue", price: 350, housePrice: 200, rent: [35, 175, 500, 1100, 1300, 1500] },
  { id: 22, name: "Нью-Йорк", group: "dark_blue", price: 400, housePrice: 200, rent: [50, 200, 600, 1400, 1700, 2000] },
  // Инфраструктура
  { id: 23, name: 'Вокзал "Северный"', group: "station", price: 200, rent: [25, 50] },
  { id: 24, name: 'Вокзал "Южный"', group: "station", price: 200, rent: [25, 50] },
  { id: 25, name: 'Порт "Западный"', group: "station", price: 200, rent: [25, 50] },
  { id: 26, name: 'Порт "Восточный"', group: "station", price: 200, rent: [25, 50] }
];

export const CHANCE_CARDS = [
  { id: 1, text: "Продвижение до СТАРТа: Получите +$200.", type: "start", value: 200 },
  { id: 2, text: "Перелет в Нью-Йорк: Вы попадаете на Нью-Йорк +$200.", type: "teleport_property", propertyId: 22, salary: 200 },
  { id: 3, text: 'Переход на Вокзал "Северный".', type: "teleport_property", propertyId: 23 },
  { id: 4, text: "Инвестиции: Выплата дивидендов +$150.", type: "money", value: 150 },
  { id: 5, text: "Банковский выбор: Выплата +$50.", type: "money", value: 50 },
  { id: 6, text: "Бесплатный выход из Тюрьмы.", type: "jail_free" },
  { id: 7, text: "Штрафные 3 шага: Списание -$50.", type: "money", value: -50 },
  { id: 8, text: "Арест: Вы отправляетесь в Тюрьму.", type: "go_jail" },
  { id: 9, text: "Капитальный ремонт: Заплатить -$25 за дом, -$100 за отель.", type: "repairs", houseCost: 25, hotelCost: 100 },
  { id: 10, text: "Превышение скорости: Штраф -$15.", type: "money", value: -15 },
  { id: 11, text: "Оплата обучения: Штраф -$150.", type: "money", value: -150 },
  { id: 12, text: "Благотворительность: Выплатить каждому игроку по -$50.", type: "pay_players", value: 50 },
  { id: 13, text: "Лотерея: Выигрыш +$100.", type: "money", value: 100 }
];

export const TREASURY_CARDS = [
  { id: 1, text: "Продвижение до СТАРТа: Получите +$200.", type: "start", value: 200 },
  { id: 2, text: "Ошибка банка: Выплата +$200.", type: "money", value: 200 },
  { id: 3, text: "Оплата врача: Штраф -$50.", type: "money", value: -50 },
  { id: 4, text: "Продажа акций: Доход +$100.", type: "money", value: 100 },
  { id: 5, text: "Бесплатный выход из Тюрьмы.", type: "jail_free" },
  { id: 6, text: "Арест: Вы отправляетесь в Тюрьму.", type: "go_jail" },
  { id: 7, text: "Ежегодный бонус: Страховая выплата +$100.", type: "money", value: 100 },
  { id: 8, text: "Возврат налогов: Выплата +$20.", type: "money", value: 20 },
  { id: 9, text: "День рождения: Каждый игрок дарит вам по +$10.", type: "collect_players", value: 10 },
  { id: 10, text: "Наследство: Получение +$100.", type: "money", value: 100 },
  { id: 11, text: "Медицинская страховка: Списание -$100.", type: "money", value: -100 },
  { id: 12, text: "Оплата больницы: Списание -$50.", type: "money", value: -50 },
  { id: 13, text: "Налог на недвижимость: Заплатить -$40 за дом, -$115 за отель.", type: "repairs", houseCost: 40, hotelCost: 115 }
];
