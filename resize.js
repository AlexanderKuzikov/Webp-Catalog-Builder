const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const CONFIG_PATH = path.join(__dirname, 'resize.config.json');

if (!fs.existsSync(CONFIG_PATH)) {
    console.error('Ошибка: Файл resize.config.json не найден!');
    process.exit(1);
}

const config = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf-8'));
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tiff', '.avif']);

function collectImageFiles(dir) {
    const results = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            results.push(...collectImageFiles(fullPath));
        } else if (IMAGE_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
            results.push(fullPath);
        }
    }
    return results;
}

function renderProgress(current, total, errors) {
    const BAR_WIDTH = 30;
    const pct = current / total;
    const filled = Math.round(BAR_WIDTH * pct);
    const bar = '█'.repeat(filled) + '░'.repeat(BAR_WIDTH - filled);
    const percent = Math.round(pct * 100).toString().padStart(3, ' ');
    const errStr = errors > 0 ? ` | Ошибок: ${errors}` : '';
    process.stdout.write(`\r[${bar}] ${percent}% ${current}/${total}${errStr}`);
}

async function main() {
    const sourceDir = path.resolve(config.source_dir);
    const { width, quality } = config;

    if (!fs.existsSync(sourceDir)) {
        console.error(`Директория не существует: ${sourceDir}`);
        process.exit(1);
    }

    const files = collectImageFiles(sourceDir);
    if (files.length === 0) {
        console.log('Нет файлов для обработки.');
        return;
    }

    console.log(`Найдено файлов: ${files.length} | width: ${width}px | quality: ${quality}\n`);

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    for (let i = 0; i < files.length; i++) {
        const filePath = files[i];
        const ext = path.extname(filePath).toLowerCase();
        const outputPath = path.join(path.dirname(filePath), `${path.basename(filePath, ext)}.webp`);

        try {
            const buffer = await sharp(filePath)
                .resize({ width, withoutEnlargement: true })
                .webp({ quality })
                .toBuffer();

            if (ext !== '.webp') fs.unlinkSync(filePath);
            fs.writeFileSync(outputPath, buffer);
            successCount++;
        } catch (err) {
            errorCount++;
            errors.push({ file: filePath, error: err.message });
        }

        renderProgress(i + 1, files.length, errorCount);
    }

    process.stdout.write('\n\n');
    console.log(`=== Готово ===`);
    console.log(`Обработано: ${successCount} | Ошибок: ${errorCount}`);

    if (errors.length > 0) {
        console.log('\nПроблемные файлы:');
        for (const e of errors) {
            console.error(`  ${e.file}\n  ${e.error}`);
        }
    }
}

main();
