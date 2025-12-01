# Analiza obciążenia procesów serwera

Zgłoszenie o wyczerpywaniu się procesów PHP/FPM można powiązać z pętlami odpytywania API, które działają we wszystkich grach. Każda otwarta karta (nawet pozostawiona w tle) utrzymuje cykliczne żądania do backendu, co przy większej liczbie graczy lub zapomnianych kart może zablokować pulę procesów.

## Q&A i tryb główny (`room.js`)
- Cykliczny polling stanu pokoju co 6 s oraz ping obecności co 30 s działają bez przerwy, dopóki karta się nie zamknie. Nawet nieaktywne sesje generują stałe żądania `state.php` i `presence.php`.
- `beforeunload` zatrzymuje timery tylko przy zamykaniu karty; w tle na urządzeniach mobilnych lub przy utracie zakładki pętle mogą działać dalej.

## Planszówka (`board-room.js`)
- Analogiczny polling stanu planszy co 6 s plus ping obecności co 30 s. Mechanizm zatrzymania opiera się jedynie o `beforeunload`, więc opuszczone karty nadal dociążają serwer.

## Tinder / „swipe” (`tinder-game.js`)
- Polling `tinder_state.php` co 5 s uruchamiany na starcie gry i zatrzymywany dopiero przy `beforeunload`. W praktyce otwarte w tle karty ciągle dociążają backend.

## Możliwe skutki
- Przy np. 200 zapomnianych kartach (po różnych grach) serwer odbiera ~2 000 zapytań na minutę wyłącznie z pollingów, co może wyczerpać ograniczoną pulę procesów PHP na hostingu współdzielonym.
- Każde żądanie inicjuje pełne `bootstrap.php` i otwarcie połączenia SQLite, więc obciążenie CPU/IO kumuluje się liniowo wraz z liczbą kart.

## Kierunki usprawnień
- Pauzowanie pollingów i pingów przy `visibilitychange`/`pagehide`, a nie tylko `beforeunload`.
- Zmniejszenie częstotliwości odpytywania lub łączenie wielu aktualizacji w jedno wywołanie.
- Wprowadzenie limitów czasu sesji po stronie frontendowej (auto-stop po X minutach bez interakcji) oraz agresywniejszego czyszczenia wygaszonych pokojów.
- Docelowo zastąpienie częstych pollingów WebSocketem lub SSE, aby utrzymać stałe, lekkie połączenie zamiast wielu krótkich requestów.
