# TELIN — Private Drop

> **Creato da Boris Ivanov Bachev**

TELIN è un'applicazione web end-to-end criptata per la condivisione di messaggi privati che si autodistruggono dopo la lettura.

## Caratteristiche principali

- **Cifratura Client-Side**: AES-256-GCM eseguita direttamente nel browser tramite Web Crypto API. Il server riceve solo ciphertext.
- **Zero Knowledge**: La chiave di cifratura risiede unicamente nel frammento dell'URL (`#...`), che i browser non trasmettono mai al server.
- **Autodistruzione Atomica**: Lettura singola con eliminazione immediata dal database.
- **Protezione con Codice Segreto**: Derivazione tramite PBKDF2 (600.000 iterazioni). Dopo 5 tentativi errati il messaggio viene distrutto.
- **Massima Privacy**: Nessun account richiesto, nessun cookie, nessun sistema di tracciamento o analytics.

## Autore

- **Autore / Creatore:** Boris Ivanov Bachev
