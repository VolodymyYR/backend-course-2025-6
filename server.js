// server.js
const express = require('express');
const { program } = require('commander');
const fs = require('fs');
const path = require('path');
const multer = require('multer');
const swaggerUi = require('swagger-ui-express');
const swaggerDocument = require('./swagger.json'); // Буде створено пізніше

// --- 1. ОБРОБКА АРГУМЕНТІВ КОМАНДНОГО РЯДКА (COMMANDER.JS) ---
program
    .requiredOption('-h, --host <address>', 'адреса сервера')
    .requiredOption('-p, --port <number>', 'порт сервера', parseInt)
    .requiredOption('-c, --cache <path>', 'шлях до директорії кешу')
    .parse(process.argv);

const options = program.opts();
const { host, port, cache } = options;
const app = express();

const CACHE_DIR = path.resolve(cache);
const UPLOAD_DIR = path.join(CACHE_DIR, 'uploads');

// --- 2. СТВОРЕННЯ КЕШ/UPLOAD ДИРЕКТОРІЙ ---
try {
    if (!fs.existsSync(UPLOAD_DIR)) {
        fs.mkdirSync(UPLOAD_DIR, { recursive: true });
        console.log(`✅ Директорія завантажень створена: ${UPLOAD_DIR}`);
    }
} catch (error) {
    console.error('Помилка при створенні директорії:', error.message);
    process.exit(1);
}

// --- 3. IN-MEMORY БАЗА ДАНИХ ТА MULTER ---
let inventoryData = [];
let nextId = 1;

// Налаштування Multer для обробки multipart/form-data
const upload = multer({ 
    dest: UPLOAD_DIR,
    // Додатково: Обмеження розміру файлу, перевірка типу, тощо
});

// --- 4. МІДЛВЕРИ EXPRESS ---
// Для обробки JSON-тіл запитів (для PUT-оновлення)
app.use(express.json()); 
// Для обробки x-www-form-urlencoded тіл запитів (для форм)
app.use(express.urlencoded({ extended: true }));
// Дозвіл на доступ до файлів у кеш-директорії (для фото)
app.use('/cache', express.static(CACHE_DIR));


// --- 5. СТАТИЧНІ ФОРМИ ---
// Віддача HTML-сторінок RegisterForm.html та SearchForm.html
app.get('/', (req, res) => {
    // Просто перенаправляємо на форму реєстрації як головну
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

app.get('/RegisterForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'RegisterForm.html'));
});

app.get('/SearchForm.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'SearchForm.html'));
});

// --- 6. API РОУТИ (CRUD) ---

// 6.1. POST /register: Створення нового об'єкта
app.post('/register', upload.single('photo'), (req, res) => {
    const { inventory_name, description } = req.body;
    
    // Перевірка обов'язкового поля
    if (!inventory_name) {
        // Якщо ім'я не задано, видаляємо завантажений файл (якщо є) і повертаємо помилку 400
        if (req.file) {
            fs.unlinkSync(req.file.path);
        }
        return res.status(400).json({ success: false, message: 'Поле "Inventory Name" є обов\'язковим.' });
    }

    const newItem = {
        id: nextId++,
        inventory_name,
        description: description || 'No description provided',
        // Зберігаємо шлях до тимчасового файлу, щоб знайти його
        photo_filename: req.file ? req.file.filename : null, 
        // URL для отримання фото (для GET /inventory/:id/photo)
        photo_url: req.file ? `/inventory/${nextId-1}/photo` : null
    };
    
    inventoryData.push(newItem);
    
    // Повертаємо 201 Created з новим об'єктом
    res.status(201).json({ 
        success: true, 
        message: 'Пристрій успішно зареєстровано.', 
        data: newItem 
    });
});

app.get('/inventory', (req, res) => {
    // Повертаємо спрощений список для огляду
    const list = inventoryData.map(item => ({
        id: item.id,
        name: item.inventory_name,
        photo_url: item.photo_url || 'N/A'
    }));
    res.status(200).json({ success: true, count: list.length, data: list });
});

// 6.3. GET /inventory/:id: Отримати один об'єкт за ID
app.get('/inventory/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryData.find(i => i.id === id);

    if (!item) {
        // Повертаємо 404 Not Found
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` });
    }
    
    res.status(200).json({ success: true, data: item });
});

// 6.4. PUT /inventory/:id: Оновлення інформації про об'єкт
app.put('/inventory/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const { inventory_name, description } = req.body;
    const itemIndex = inventoryData.findIndex(i => i.id === id);

    if (itemIndex === -1) {
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` });
    }

    if (inventory_name) {
        inventoryData[itemIndex].inventory_name = inventory_name;
    }
    if (description) {
        inventoryData[itemIndex].description = description;
    }
    
    res.status(200).json({ success: true, message: 'Інформацію оновлено.', data: inventoryData[itemIndex] });
});

// 6.5. PUT /inventory/:id/photo: Оновлення фото
app.put('/inventory/:id/photo', upload.single('photo'), (req, res) => {
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
        const filePath = path.join(UPLOAD_DIR, deletedItem.photo_filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }
    }
    
    res.status(200).json({ success: true, message: `Об'єкт з ID ${id} успішно видалено.` });
});

// 6.7. GET /inventory/:id/photo: Отримання фото
app.get('/inventory/:id/photo', (req, res) => {
    const id = parseInt(req.params.id);
    const item = inventoryData.find(i => i.id === id);

    if (!item || !item.photo_filename) {
        return res.status(404).send('Фото не знайдено або відсутнє для цього об\'єкта.');
    }
    
    const filePath = path.join(UPLOAD_DIR, item.photo_filename);
    
    if (!fs.existsSync(filePath)) {
        return res.status(404).send('Файл не знайдено на сервері.');
    }

    // Встановлення Content-Type (image/jpeg є загальним, але Express може визначити краще)
    // Встановлюємо Content-Type для відповідності вимозі "image/jpeg"
    res.setHeader('Content-Type', 'image/jpeg');
    
    // res.sendFile автоматично встановлює інші заголовки та передає файл
    res.status(200).sendFile(filePath);
});

app.get('/search', (req, res) => {
    const id = parseInt(req.query.id);
    const includePhoto = req.query.includePhoto; // 'on' якщо відмічено

    if (isNaN(id)) {
        return res.status(400).json({ success: false, message: 'Необхідно вказати валідний ID.' });
    }
    
    const item = inventoryData.find(i => i.id === id);

    if (!item) {
        return res.status(404).json({ success: false, message: `Об'єкт з ID ${id} не знайдено.` });
    }

    const responseData = {
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

// --- 7. ДОКУМЕНТАЦІЯ SWAGGER ---
app.use('/docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument));

// --- 8. ОБРОБКА НЕІСНУЮЧИХ РОУТІВ (404) ---
app.use((req, res) => {
    res.status(404).json({ success: false, message: 'Неіснуючий маршрут.' });
});

// Додаткова вимога: Обробка невірних методів для /search
// Якщо хтось спробує DELETE, PUT і т.д.
app.all('/search', (req, res, next) => {
    if (req.method !== 'GET' && req.method !== 'HEAD') { // GET - дозволено
        res.status(405).send(`Method ${req.method} not allowed for /search.`); // 405 Method Not Allowed
    } else {
        next(); // Пропускаємо далі до GET-обробника
    }
});

// ----------------------------------------------------
// (РОУТИ API БУДУТЬ ТУТ)
// ----------------------------------------------------


// --- 9. ЗАПУСК СЕРВЕРА ---
app.listen(port, host, () => {
    console.log(`Сервіс запущено: http://${host}:${port}`);
    console.log(`Документація Swagger: http://${host}:${port}/docs`);
});