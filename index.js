const fs = require('fs');
const path = require('path');

// --- Конфигурация ---
const CONFIG_PATH = path.join(__dirname, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Ошибка: Файл config.json не найден!');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// --- Логгер ---
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

const logFileName = `run_${formatDate(new Date()).replace(/T/, '_').replace(/:/g, '-')}.log`;
const logFilePath = path.join(logsDir, logFileName);

function logInfo(message) {
    const time = new Date().toISOString();
    const logLine = `[${time}] [INFO] ${message}\n`;
    fs.appendFileSync(logFilePath, logLine);
}

function logError(message) {
    const time = new Date().toISOString();
    const logLine = `[${time}] [ERROR] ${message}\n`;
    fs.appendFileSync(logFilePath, logLine);
}

// --- Вспомогательные функции ---
function formatDate(date) {
    const pad = n => n.toString().padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function getPriceCategory(price) {
    if (price <= 2500) return "до 2500 руб.";
    if (price <= 5000) return "от 2500 до 5000 руб.";
    if (price <= 7500) return "от 5000 до 7500 руб.";
    return "свыше 7500 руб.";
}

function getWorkdays(startStr, endStr) {
    let current = new Date(startStr);
    const end = new Date(endStr);
    const days = [];

    while (current <= end) {
        const dayOfWeek = current.getDay();
        if (dayOfWeek !== 0 && dayOfWeek !== 6) { // Пропускаем выходные (0 = ВС, 6 = СБ)
            days.push(new Date(current));
        }
        current.setDate(current.getDate() + 1);
    }
    return days;
}

function generateSortedDates(count, configDates) {
    const workdays = getWorkdays(configDates.start, configDates.end);
    if (workdays.length === 0) {
        throw new Error("Не найдено рабочих дней в заданном диапазоне дат.");
    }

    const startHour = configDates.work_hours.start;
    const endHour = configDates.work_hours.end;
    const generatedDates = [];

    for (let i = 0; i < count; i++) {
        const randomDayIndex = Math.floor(Math.random() * workdays.length);
        const d = new Date(workdays[randomDayIndex]);
        
        const h = Math.floor(Math.random() * (endHour - startHour)) + startHour;
        const m = Math.floor(Math.random() * 60);
        const s = Math.floor(Math.random() * 60);
        
        d.setHours(h, m, s, 0);
        generatedDates.push(d);
    }

    // Хронологическая сортировка (самые старые даты первыми)
    return generatedDates.sort((a, b) => a - b);
}

// --- Основной процесс ---
function main() {
    const sourceDir = path.resolve(__dirname, config.source_dir);
    
    if (!fs.existsSync(sourceDir)) {
        console.error(`Директория ${sourceDir} не существует.`);
        logError(`Директория ${sourceDir} не существует.`);
        process.exit(1);
    }

    logInfo(`Старт обработки. Директория: ${sourceDir}`);

    const allFiles = fs.readdirSync(sourceDir);
    
    // Поиск файлов формата *__6200.webp
    const validFiles = allFiles.filter(file => {
        return file.toLowerCase().endsWith('.webp') && /__(\d+)\.webp$/i.test(file);
    });

    if (validFiles.length === 0) {
        console.log('Нет подходящих файлов для обработки.');
        logInfo('Нет подходящих файлов. Завершение.');
        return;
    }

    // Лексикографическая сортировка (хронология сохраняется за счет формата имени YYYY-MM-DD_HH-MM-SS)
    validFiles.sort();

    logInfo(`Найдено ${validFiles.length} файлов для переименования.`);

    let currentSku = config.start_sku;
    const catalogData = [];
    
    // Пул дат по количеству файлов
    const dates = generateSortedDates(validFiles.length, config.dates);

    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validFiles.length; i++) {
        const originalFile = validFiles[i];
        const match = originalFile.match(/__(\d+)\.webp$/i);
        
        if (!match) continue; // Safety check

        const price = parseInt(match[1], 10);
        const skuStr = currentSku.toString();
        
        // Отрезаем первый символ SKU (напр. '10001' -> '0001' -> 1)
        const nameSuffix = parseInt(skuStr.substring(1), 10);
        const nameLine1 = `Букет ${nameSuffix}`;

        const newFileName = `${skuStr}.webp`;
        const oldFilePath = path.join(sourceDir, originalFile);
        const newFilePath = path.join(sourceDir, newFileName);

        try {
            fs.renameSync(oldFilePath, newFilePath);
            successCount++;
            
            const productInfo = {
                sku: skuStr,
                name_line1: nameLine1,
                regular_price: price,
                category_price: getPriceCategory(price),
                category_size: config.category_size,
                date_created: formatDate(dates[i])
            };
            
            catalogData.push(productInfo);
            logInfo(`[ОК] ${originalFile} -> ${newFileName} | Цена: ${price}`);
            
            currentSku++;
        } catch (err) {
            errorCount++;
            logError(`[ОШИБКА] ${originalFile}: ${err.message}`);
        }
    }

    // Сохранение JSON в корень утилиты с именем директории
    const targetDirName = path.basename(sourceDir);
    const catalogFileName = `${targetDirName}.json`;
    const catalogPath = path.join(__dirname, catalogFileName);

    try {
        fs.writeFileSync(catalogPath, JSON.stringify(catalogData, null, 2), 'utf-8');
        logInfo(`Создан файл каталога: ${catalogPath}`);
    } catch (err) {
        logError(`Ошибка записи ${catalogFileName}: ${err.message}`);
    }

    // Вывод в терминал
    console.log(`\n=== Обработка завершена ===`);
    console.log(`Директория: ${sourceDir}`);
    console.log(`Всего валидных файлов: ${validFiles.length}`);
    console.log(`Успешно переименовано: ${successCount}`);
    console.log(`Ошибок: ${errorCount}`);
    console.log(`Файл каталога: ${catalogPath}`);
    console.log(`Лог: ${logFilePath}\n`);
}

main();
