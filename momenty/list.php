<?php
// Skrypt zwraca listę plików graficznych dla gry "zdrapka" w formacie JSON.
header('Content-Type: application/json; charset=utf-8');

$imagesDir = __DIR__ . '/obrazy/zdrapki/';
$allowedExtensions = ['png', 'jpg', 'jpeg'];
$fileList = [];

// Sprawdzenie, czy katalog z obrazami istnieje.
if (is_dir($imagesDir)) {
    // Pobranie wszystkich elementów katalogu.
    $files = scandir($imagesDir);

    foreach ($files as $file) {
        $filePath = $imagesDir . $file;

        // Pomijamy katalogi oraz pliki bez dozwolonego rozszerzenia.
        if (!is_file($filePath)) {
            continue;
        }

        $extension = strtolower(pathinfo($file, PATHINFO_EXTENSION));
        if (!in_array($extension, $allowedExtensions, true)) {
            continue;
        }

        $fileList[] = $file;
    }

    // Sortujemy listę naturalnie, aby pliki 2.png były przed 10.png.
    sort($fileList, SORT_NATURAL | SORT_FLAG_CASE);
}

echo json_encode($fileList);
