const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

// --- Конфигурация ---
const CONFIG_PATH = path.join(__dirname, 'resize.config.json');

if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Ошибка: Файл resize.config.json не найден!');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));

// --- Логгер ---
const logsDir = path.join(__dirname, 'logs');
if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir);
}

function getNowISO() {
    return new Date().toISOString();
}

function getLogFileName() {
    const now = new Date();
    const pad = n => n.toString().padStart(2, '0');
    return `run_${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}_${pad(now.getHours())}-${pad(now.getMinutes())}-${pad(now.getSeconds())}.log`;
}

const logFilePath = path.join(logsDir, getLogFileName());

function logInfo(message) {
    fs.appendFileSync(logFilePath, `[${getNowISO()}] [INFO] ${message}\n`);
}

function logError(message) {
    fs.appendFileSync(logFilePath, `[${getNowISO()}] [ERROR] ${message}\n`);
}

// --- Рекурсивный обход директории ---
// Возвращает плоский массив всех файлов изображений во всех вложенных папках
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.bmp', '.tiff', '.avif']);

function collectImageFiles(dir) {
    const results = [];
    const entries = fs.readdirSync(dir, { withFileTypes: true });

    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectImageFiles(fullPath));
        } else if (entry.isFile()) {
            const ext = path.extname(entry.name).toLowerCase();
            if (IMAGE_EXTENSIONS.has(ext)) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

// --- Основной процесс ---
async function main() {
    const sourceDir = path.resolve(__dirname, config.source_dir);
    const width = config.width;
    const quality = config.quality;

    if (!fs.existsSync(sourceDir)) {
        console.error(`Директория ${sourceDir} не существует.`);
        logError(`Директория ${sourceDir} не существует.`);
        process.exit(1);
    }

    logInfo(`Старт обработки. Директория: ${sourceDir} | width: ${width}px | quality: ${quality}`);

    const files = collectImageFiles(sourceDir);

    if (files.length === 0) {
        console.log('Нет файлов для обработки.');
        logInfo('Нет подходящих файлов. Завершение.');
        return;
    }

    logInfo(`Найдено файлов: ${files.length}`);

    let successCount = 0;
    let errorCount = 0;
    let deletedCount = 0;

    for (const filePath of files) {
        const ext = path.extname(filePath).toLowerCase();
        const dir = path.dirname(filePath);
        const baseName = path.basename(filePath, ext);
        const outputPath = path.join(dir, `${baseName}.webp`);

        try {
            // Конвертируем и перезаписываем через временный буфер
            // (нельзя читать и писать одновременно в один файл через sharp)
            const buffer = await sharp(filePath)
                .resize({ width, withoutEnlargement: true })
                .webp({ quality })
                .toBuffer();

            fs.writeFileSync(outputPath, buffer);
            successCount++;
            logInfo(`[ОК] ${filePath} -> ${outputPath}`);

            // Удаляем оригинал только если расширение не .webp
            // (в случае .webp outputPath === filePath, файл уже перезаписан выше)
            if (ext !== '.webp') {
                fs.unlinkSync(filePath);
                deletedCount++;
                logInfo(`[УДАЛЕН] ${filePath}`);
            }
        } catch (err) {
            errorCount++;
            logError(`[ОШИБКА] ${filePath}: ${err.message}`);
        }
    }

    // Вывод в терминал
    console.log(`\n=== Обработка завершена ===`);
    console.log(`Директория:          ${sourceDir}`);
    console.log(`Всего найдено:       ${files.length}`);
    console.log(`Успешно обработано:  ${successCount}`);
    console.log(`Удалено оригиналов:  ${deletedCount}`);
    console.log(`Ошибок:              ${errorCount}`);
    console.log(`Лог:                 ${logFilePath}\n`);
}

main();
