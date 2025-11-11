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



// ----------------------------------------------------
// (РОУТИ API БУДУТЬ ТУТ)
// ----------------------------------------------------


// --- 9. ЗАПУСК СЕРВЕРА ---
app.listen(port, host, () => {
    console.log(`Сервіс запущено: http://${host}:${port}`);
    console.log(`Документація Swagger: http://${host}:${port}/docs`);
});