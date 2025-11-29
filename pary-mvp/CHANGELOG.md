# Changelog - Poprawki bezpieczeństwa i wydajności

## Wprowadzone zmiany

### 🔒 Bezpieczeństwo

1. **Weryfikacja hasła przeniesiona na backend**
   - Utworzono endpoint `api/verify_password.php` do weryfikacji hasła
   - Hasło nie jest już przechowywane w JavaScript
   - Używa sesji PHP do zarządzania autoryzacją
   - Endpoint `api/check_access.php` do sprawdzania statusu autoryzacji

2. **Autoryzacja dla importu pytań**
   - Endpoint `api/import_questions.php` wymaga teraz autoryzacji
   - Sprawdzanie autoryzacji przed importem w `import.js`
   - Sesja wygasa po 24 godzinach

3. **Rate Limiting**
   - Dodano funkcję `checkRateLimit()` i `requireRateLimit()` w `bootstrap.php`
   - Rate limiting dla kluczowych endpointów:
     - `create_or_join.php`: 20 żądań/minutę
     - `chat_send.php`: 30 wiadomości/minutę
     - `react.php`: 50 reakcji/minutę
     - `next_question.php`: 30 pytań/minutę
     - `import_questions.php`: 5 importów/5 minut

4. **Walidacja danych**
   - Maksymalna długość nazwy użytkownika: 50 znaków
   - Maksymalna długość wiadomości czatu: 1000 znaków (konfigurowalne)

### ⚡ Wydajność

1. **Indeksy w bazie danych**
   - Dodano indeksy dla często używanych kolumn:
     - `rooms.room_key`
     - `reactions.room_id`, `reactions.participant_id`, `reactions.question_id`
     - `participants.room_id`, `participants.status`
     - `session_questions.room_id`
     - `chat_messages.room_id`, `chat_messages.created_at`

2. **Cache pytań**
   - Funkcja `fetchQuestions()` używa teraz cache statycznego
   - Pytania są ładowane raz i przechowywane w pamięci

3. **Optymalizacja purgeExpiredRooms()**
   - Czyszczenie wygasłych pokoi uruchamiane maksymalnie raz na 5 minut
   - Używa bardziej wydajnego zapytania SQL z WHERE
   - Konfigurowalny interwał w `config.php`

4. **Bezpieczniejsze generowanie losowych liczb**
   - Zamieniono `mt_rand()` na `random_int()` w `next_question.php`
   - Poprawiono `randomTrioStartingSymbol()` w `bootstrap.php`

### ⚙️ Konfiguracja

1. **Plik konfiguracyjny `config.php`**
   - Wszystkie stałe przeniesione do jednego pliku
   - Możliwość ustawienia przez zmienne środowiskowe
   - Konfigurowalne limity rate limiting
   - Konfigurowalne limity długości danych

### 📝 Zmiany w plikach

**Nowe pliki:**
- `api/verify_password.php` - weryfikacja hasła
- `api/check_access.php` - sprawdzanie autoryzacji
- `config.php` - plik konfiguracyjny
- `CHANGELOG.md` - ten plik

**Zmodyfikowane pliki:**
- `api/bootstrap.php` - dodano funkcje rate limiting, cache, indeksy
- `api/import_questions.php` - dodano autoryzację i rate limiting
- `api/create_or_join.php` - dodano rate limiting i walidację
- `api/chat_send.php` - dodano rate limiting
- `api/react.php` - dodano rate limiting
- `api/next_question.php` - dodano rate limiting, zamieniono mt_rand
- `assets/js/app.js` - usunięto hasło z JS, używa API do weryfikacji
- `assets/js/import.js` - dodano sprawdzanie autoryzacji

### 🔄 Kompatybilność wsteczna

Wszystkie zmiany są wstecznie kompatybilne:
- Jeśli `config.php` nie istnieje, używane są domyślne wartości
- Wszystkie istniejące funkcjonalności działają tak samo
- Brak zmian w strukturze bazy danych (tylko dodane indeksy)

### 📋 Do zrobienia w przyszłości (opcjonalne)

- WebSockets/SSE zamiast polling (obecnie co 2 sekundy)
- Toast notifications zamiast alert()
- CSRF protection dla POST requestów
- Obsługa offline w PWA


