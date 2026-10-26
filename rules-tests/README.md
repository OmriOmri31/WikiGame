# Firestore rules tests

Tests for `../firestore.rules`, run against the Firestore emulator (needs Java 11+).

```
npm install
npm test
```

Each `*.test.mjs` file uses its own emulator project, and `run-all.mjs` prints the total.
