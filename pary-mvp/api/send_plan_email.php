<?php

declare(strict_types=1);

require __DIR__ . '/bootstrap.php';

$input = file_get_contents('php://input');
$data = json_decode($input ?? '', true);
if (!is_array($data)) {
    respond([
        'ok' => false,
        'error' => 'Niepoprawne dane wejściowe.',
    ]);
}

$partnerEmail = filter_var($data['email'] ?? '', FILTER_VALIDATE_EMAIL);
if ($partnerEmail === false) {
    respond([
        'ok' => false,
        'error' => 'Podaj poprawny adres e-mail partnera.',
    ]);
}

$mood = sanitizeLine($data['mood'] ?? '');
$closeness = sanitizeLine($data['closeness'] ?? '');
$energy = sanitizeLine($data['energy'] ?? '');
$energyContext = sanitizeParagraph($data['energyContext'] ?? '');
$subject = trim((string)($data['subject'] ?? 'Wieczór we dwoje – krótki plan 💛'));
if ($subject === '') {
    $subject = 'Wieczór we dwoje – krótki plan 💛';
}
$link = trim((string)($data['link'] ?? ''));
if ($link === '') {
    $link = 'https://momenty.pl/';
}

$extras = $data['extras'] ?? [];
if (!is_array($extras)) {
    $extras = [];
}
$extras = array_values(array_filter(array_map('sanitizeLine', $extras), static fn (string $value): bool => $value !== ''));
$extrasText = $extras ? implode(', ', $extras) : 'Brak dodatków';

$bodyLines = [
    'Twoja druga połówka zaprasza Cię dziś na wieczór pełen bliskości.',
    'Wybrała:',
    '– nastrój: ' . ($mood !== '' ? $mood : '—'),
    '– bliskość: ' . ($closeness !== '' ? $closeness : '—'),
    '– klimat: ' . $extrasText,
    '– energia: ' . ($energy !== '' ? $energy : '—'),
];

if ($energyContext !== '') {
    $bodyLines[] = '';
    $bodyLines[] = $energyContext;
}

$bodyLines[] = '';
$bodyLines[] = 'Kliknij, aby zobaczyć szczegóły.';
$bodyLines[] = $link;

$body = implode("\n", $bodyLines);

if (!sendPlanEmailMessage($partnerEmail, $subject, $body)) {
    respond([
        'ok' => false,
        'error' => 'Nie udało się wysłać wiadomości. Spróbuj ponownie później.',
    ]);
}

respond(['ok' => true]);

function sanitizeLine(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    return preg_replace('/\s+/', ' ', $text) ?? '';
}

function sanitizeParagraph(mixed $value): string
{
    $text = trim((string)($value ?? ''));
    $text = preg_replace('/\s+/', ' ', $text) ?? '';
    return $text;
}

function sendPlanEmailMessage(string $to, string $subject, string $body): bool
{
    $headers = [
        'Content-Type: text/plain; charset=utf-8',
        'From: Momenty <no-reply@momenty.pl>',
    ];

    $encodedSubject = '=?UTF-8?B?' . base64_encode($subject) . '?=';

    $sent = false;
    if (function_exists('mail')) {
        $sent = @mail($to, $encodedSubject, $body, implode("\r\n", $headers));
    }

    if ($sent) {
        return true;
    }

    $logDir = __DIR__ . '/../db';
    if (!is_dir($logDir)) {
        @mkdir($logDir, 0775, true);
    }

    $logEntry = sprintf("[%s]\nTo: %s\nSubject: %s\n%s\n\n", date('c'), $to, $subject, $body);
    return @file_put_contents($logDir . '/email.log', $logEntry, FILE_APPEND) !== false;
}
