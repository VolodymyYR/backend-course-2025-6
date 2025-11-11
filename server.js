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


// ----------------------------------------------------
// (РОУТИ API БУДУТЬ ТУТ)
// ----------------------------------------------------


// --- 9. ЗАПУСК СЕРВЕРА ---
app.listen(port, host, () => {
    console.log(`Сервіс запущено: http://${host}:${port}`);
    console.log(`Документація Swagger: http://${host}:${port}/docs`);
});