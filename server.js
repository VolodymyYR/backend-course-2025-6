// server.js (ОНОВЛЕНИЙ КОД)
const express = require('express'); // Фреймворк Express
const fs = require('fs'); // Файлова система
const path = require('path'); // Робота з шляхами
const multer = require('multer'); // Для обробки multipart/form-data (завантаження файлів)
const swaggerUi = require('swagger-ui-express'); // Swagger UI для документації
const swaggerDocument = require('./swagger.json');  // Імпорт Swagger документації

// --- 1. ПРЯМЕ ВИЗНАЧЕННЯ АРГУМЕНТІВ (Обхід Commander.js) ---
const host = '127.0.0.1'; // Локальний хост
const port = 8080; // Порт сервера
const cache = './cache'; // Шлях до директорії кешу

const app = express(); // Ініціалізація Express додатку

const CACHE_DIR = path.resolve(cache); // Абсолютний шлях до кеш-директорії
const UPLOAD_DIR = path.join(CACHE_DIR, 'uploads');  // Директорія для збереження завантажених файлів

// --- 2. СТВОРЕННЯ КЕШ/UPLOAD ДИРЕКТОРІЙ ---
try { 
    if (!fs.existsSync(UPLOAD_DIR)) { // Перевірка існування директорії
        fs.mkdirSync(UPLOAD_DIR, { recursive: true }); // Створення директорії (рекурсивно)
        console.log(`✅ Директорія завантажень створена: ${UPLOAD_DIR}`); // Лог успіху
    }
} catch (error) {
    console.error('Помилка при створенні директорії:', error.message);
    process.exit(1);
}

// --- 3. IN-MEMORY БАЗА ДАНИХ ТА MULTER ---
let inventoryData = []; // Масив для зберігання об'єктів інвентарю
let nextId = 1; // Лічильник для унікальних ID об'єктів

// Налаштування Multer для обробки multipart/form-data
const upload = multer({  // Конфігурація Multer
    dest: UPLOAD_DIR, // Директорія для збереження файлів
    // Додатково: Обмеження розміру файлу, перевірка типу, тощо
});

// --- 4. МІДЛВЕРИ EXPRESS ---
// Для обробки JSON-тіл запитів (для PUT-оновлення та POST-пошуку)
app.use(express.json()); 
// Для обробки x-www-form-urlencoded тіл запитів (для форм)
app.use(express.urlencoded({ extended: true }));
// Дозвіл на доступ до файлів у кеш-директорії (для фото)
app.use('/cache', express.static(CACHE_DIR));


// --- 5. СТАТИЧНІ ФОРМИ ---
// Віддача HTML-сторінок RegisterForm.html та SearchForm.html
app.get('/', (req, res) => { // Головна сторінка
    // Просто перенаправляємо на форму реєстрації як головну
    res.sendFile(path.join(__dirname, 'RegisterForm.html')); // Відправка файлу форми реєстрації
});

// Сторінки форм
app.get('/RegisterForm.html', (req, res) => { // Сторінка реєстрації
    res.sendFile(path.join(__dirname, 'RegisterForm.html')); // Відправка файлу форми реєстрації
});

// Сторінка пошуку
app.get('/SearchForm.html', (req, res) => { // Сторінка пошуку
    res.sendFile(path.join(__dirname, 'SearchForm.html')); // Відправка файлу форми пошуку
});

// --- 6. API РОУТИ (CRUD) ---

// 6.1. POST /register: Створення нового об'єкта
app.post('/register', upload.single('photo'), (req, res) => { // Обробка завантаження одного файлу з полем 'photo'
    const { inventory_name, description } = req.body; // Деструктуризація полів з тіла запиту
    
    // Перевірка обов'язкового поля
    if (!inventory_name) {
        // Якщо ім'я не задано, видаляємо завантажений файл (якщо є) і повертаємо помилку 400
        if (req.file) { // Якщо файл був завантажений
            fs.unlinkSync(req.file.path); // Видаляємо файл
        }
        return res.status(400).json({ success: false, message: 'Поле "Inventory Name" є обов\'язковим.' }); // Повертаємо 400 Bad Request
    }

    // Створення нового об'єкта інвентарю
    const newItem = { // Новий об'єкт
        id: nextId, // Використовуємо поточний nextId
        inventory_name, // Ім'я інвентарю
        description: description || 'No description provided', // Опис (за замовчуванням)
        // Зберігаємо шлях до тимчасового файлу, щоб знайти його пізніше
        photo_filename: req.file ? req.file.filename : null,
        photo_mimetype: req.file ? req.file.mimetype : null, 
        // URL для отримання фото пізніше
        photo_url: req.file ? `/inventory/${nextId}/photo` : null
    };
    
    // Додаємо новий об'єкт до "бази даних"
    inventoryData.push(newItem);
    nextId++; // Збільшуємо ID після використання
    
    // Повертаємо 201 Created з новим об'єктом
    res.status(201).json({  // HTTP 201 Created
        success: true,  //  Успіх
        message: 'Пристрій успішно зареєстровано.', 
        data: newItem  // Повертаємо створений об'єкт
    });
});

// 6.2. GET /inventory: Отримати список об'єктів
app.get('/inventory', (req, res) => { // Отримання списку всіх об'єктів
    // Повертаємо спрощений список для огляду
    const list = inventoryData.map(item => ({ // Мапінг для спрощеного представлення
        id: item.id, // ID об'єкта
        name: item.inventory_name, // Ім'я інвентарю
        photo_url: item.photo_url || 'N/A' // URL фото або 'N/A' якщо відсутнє
    }));
    res.status(200).json({ success: true, count: list.length, data: list }); // Повертаємо 200 OK з даними
});

// 6.3. GET /inventory/:id: Отримати один об'єкт за ID
app.get('/inventory/:id', (req, res) => { // Отримання об'єкта за ID
    const id = parseInt(req.params.id); // Парсимо ID з параметрів маршруту
    const item = inventoryData.find(i => i.id === id); // Знаходимо об'єкт за ID

    if (!item) {
        // Повертаємо 404 Not Found
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` });
    }
    
    res.status(200).json({ success: true, data: item });
});

// 6.4. PUT /inventory/:id: Оновлення інформації про об'єкт
app.put('/inventory/:id', (req, res) => {
    const id = parseInt(req.params.id);
    
    // --- КРИТИЧНЕ ВИПРАВЛЕННЯ ---
    // Якщо req.body не існує або порожнє
    if (!req.body || (Object.keys(req.body).length === 0)) {
        return res.status(400).json({ success: false, message: 'Тіло запиту (JSON) відсутнє або порожнє.' });
    }
    
    // Деструктуризація тепер безпечна
    const { inventory_name, description } = req.body; // Отримання полів для оновлення
    const itemIndex = inventoryData.findIndex(i => i.id === id); // Пошук індексу об'єкта за ID

    if (itemIndex === -1) { // Якщо не знайдено
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` }); // Повертаємо 404
    }

    // Оновлення полів, якщо вони надані
    if (inventory_name) {
        inventoryData[itemIndex].inventory_name = inventory_name; // Оновлення імені
    }
    if (description) {
        inventoryData[itemIndex].description = description; // Оновлення опису
    }
    
    res.status(200).json({ success: true, message: 'Інформацію оновлено.', data: inventoryData[itemIndex] });
});

// 6.5. PUT /inventory/:id/photo: Оновлення фото
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => { // Обробка завантаження одного файлу з полем 'photo'
    const id = parseInt(req.params.id);
    const itemIndex = inventoryData.findIndex(i => i.id === id);
    
    if (itemIndex === -1) {
        // Якщо не знайдено, видаляємо завантажений файл
        if (req.file) fs.unlinkSync(req.file.path);
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` });
    }
    
    if (!req.file) {
        return res.status(400).json({ success: false, message: 'Файл фото відсутній у запиті.' });
    }
    
    // Якщо вже було старе фото, його можна видалити, щоб не засмічувати кеш
    if (inventoryData[itemIndex].photo_filename) {
        const oldFilePath = path.join(UPLOAD_DIR, inventoryData[itemIndex].photo_filename);
        if (fs.existsSync(oldFilePath)) {
            fs.unlinkSync(oldFilePath);
        }
    }

    // Оновлюємо посилання
    inventoryData[itemIndex].photo_filename = req.file.filename;
    inventoryData[itemIndex].photo_mimetype = req.file.mimetype; 


    inventoryData[itemIndex].photo_url = `http://${host}:${port}/inventory/${id}/photo`;
    
    res.status(200).json({ success: true, message: 'Фото успішно оновлено.', data: inventoryData[itemIndex] });
});

// 6.6. DELETE /inventory/:id: Видалення об'єкта
app.delete('/inventory/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const itemIndex = inventoryData.findIndex(i => i.id === id);

    if (itemIndex === -1) {
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` });
    }

    const [deletedItem] = inventoryData.splice(itemIndex, 1);
    
    // Видалення файлу з диска
    if (deletedItem.photo_filename) {
        const filePath = path.join(UPLOAD_DIR, deletedItem.photo_filename); // Шлях до файлу
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath); // Видалення файлу
        }
    }
    
    res.status(200).json({ success: true, message: `Об'єкт з ID ${id} успішно видалено.` });
});

// 6.7. GET /inventory/:id/photo: Отримання фото
app.get('/inventory/:id/photo', (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryData.find(i => i.id === id);

    // Перевірка наявності об'єкта, імені файлу та MIME-типу
    if (!item || !item.photo_filename || !item.photo_mimetype) {
        return res.status(404).send('Фото не знайдено або відсутнє для цього об\'єкта.');
    }
    
    const filePath = path.join(UPLOAD_DIR, item.photo_filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Файл не знайдено на сервері.');
    }
    
    res.set('Content-Type', item.photo_mimetype); 

    // res.sendFile автоматично встановлює інші заголовки та передає файл
    // Тепер Express буде знати, як правильно відправити файл (як зображення)
    res.status(200).sendFile(filePath);
});

// 6.8. GET /search: Пошук за ID (використовується формою SearchForm.html)
app.get('/search', (req, res) => {
    const id = parseInt(req.query.id);
    const includePhoto = req.query.includePhoto; // 'on' якщо відмічено

    if (isNaN(id)) { // Перевірка валідності ID
        return res.status(400).json({ success: false, message: 'Необхідно вказати валідний ID.' });
    }
    
    const item = inventoryData.find(i => i.id === id);

    if (!item) {
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` });
    }

    const responseData = { // Базова відповідь 
        id: item.id,
        inventory_name: item.inventory_name,
        description: item.description,
    };

    // Додаємо URL фото, якщо прапорець встановлено
    if (includePhoto === 'on' && item.photo_url) {
        responseData.photo_url = item.photo_url;
    }

    res.status(200).json({ success: true, data: responseData });
});

// 6.9. POST /search: Пошук за описом, назвою або назвою фото
app.post('/search', (req, res) => {
    // Отримуємо критерії пошуку з тіла запиту (вони були описані в оновленому swagger.json)
    const { inventory_name, description, photo_name } = req.body;

    // Перевірка наявності хоча б одного критерію
    if (!inventory_name && !description && !photo_name) { // Якщо всі поля порожні
        return res.status(400).json({ success: false, message: 'Необхідно вказати хоча б один критерій для пошуку (ім\'я, опис або назву фото).' });
    }

    // Функція-фільтр
    const foundItems = inventoryData.filter(item => {
        // Пошук за ім'ям (нечутливий до регістру, якщо задано)
        const nameMatch = inventory_name && item.inventory_name.toLowerCase().includes(inventory_name.toLowerCase()); // Перевірка збігу імені
        
        // Пошук за описом (нечутливий до регістру, якщо задано)
        const descriptionMatch = description && item.description.toLowerCase().includes(description.toLowerCase());
        
        // Пошук за назвою файлу фото (нечутливий до регістру, якщо задано)
        const photoMatch = photo_name && item.photo_filename && item.photo_filename.toLowerCase().includes(photo_name.toLowerCase());

        // Об'єкт вважається знайденим, якщо відповідає хоча б одному критерію
        return nameMatch || descriptionMatch || photoMatch;
    });

    // Повертаємо знайдений список
    res.status(200).json({ 
        success: true,
        count: foundItems.length,
        data: foundItems.map(item => ({
            id: item.id,
            inventory_name: item.inventory_name,
            description: item.description,
            photo_url: item.photo_url || 'N/A'
        })) 
    });
});

// --- 7. ДОКУМЕНТАЦІЯ SWAGGER ---
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument)); // Роут для документації Swagger

// --- 8. ОБРОБКА НЕІСНУЮЧИХ РОУТІВ (404) ---
// Ловить усі запити, які не були оброблені попередніми роутами
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Неіснуючий маршрут.' });
});

// --- 9. ЗАПУСК СЕРВЕРА ---
app.listen(port, host, () => {
    console.log(`Сервіс запущено: http://${host}:${port}`);
    console.log(`Документація Swagger: http://${host}:${port}/docs`);
});