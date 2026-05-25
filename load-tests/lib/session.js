import { login } from './auth.js';

// Stan logowania współdzielony per-VU. k6 uruchamia skrypt w osobnym kontekście
// JS dla KAŻDEGO VU, więc ta zmienna jest izolowana per-VU — dokładnie to,
// czego chcemy: VU loguje się raz i reużywa swój cookie jar przez cały test
// (logowanie przy każdej iteracji byłoby nierealistyczne i zaniżało wynik).
let loggedIn = false;

// Gwarantuje aktywną sesję przed krokami scenariusza. Zwraca false, gdy
// logowanie zawiodło — scenariusz powinien wtedy przerwać iterację.
export function ensureLoggedIn() {
  if (!loggedIn) {
    loggedIn = login();
  }
  return loggedIn;
}
