# Question catalog

One file per category. Each line is a two-character code, a space, and the question:

- First character: `F` fact, `O` opinion, `P` forecast
- Second character: `T` or `F` for a fact's settled answer, `-` otherwise

The settled answer is stored for internal use only and is never shown to voters.
`generate.ts` adds the large families of facts built from tables (primes, capitals, elements, dates).
Load everything with `npm run db:seed:questions`; it is safe to run again after edits.
