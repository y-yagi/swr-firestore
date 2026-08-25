# Contributing

This is a maintenance fork of [nandorojo/swr-firestore](https://github.com/nandorojo/swr-firestore).
Changes are not sent upstream.

## Development workflow

The project uses [pnpm](https://pnpm.io) and Node 24.

```sh
pnpm install
```

Common tasks:

```sh
pnpm typecheck    # type-check with TypeScript
pnpm lint         # lint with ESLint
pnpm format       # format with Prettier
pnpm format:check # verify formatting (this is what CI runs)
pnpm test         # run unit tests with Vitest
pnpm test:watch   # run unit tests in watch mode
pnpm build        # emit lib/cjs, lib/esm and declarations
```

CI (`.github/workflows/ci.yml`) runs all of the above on every push and pull
request. Keep it green.

## Testing against a real app

`pnpm build` writes to `lib/`, which is what consumers load. To try a change in
another project before tagging a release, point that project at this directory:

```sh
pnpm add "@nandorojo/swr-firestore@file:/path/to/swr-firestore"
```

Note that a `file:` dependency links this directory as-is and does **not** run
`prepare`, so run `pnpm build` here after each change. Installing from a git URL
(`github:y-yagi/swr-firestore#<tag>`) does run `prepare` and builds on its own.

## Tests

Unit tests live in `src/__tests__`. The hook tests mock `firebase/firestore`
rather than talking to a real backend or emulator. When you touch the query
building or listener code, add a case there — the mocked SDK makes it cheap.

One thing to keep in mind: the real Firestore never invokes an `onSnapshot`
callback synchronously, and `createListenerAsync` relies on that (it resolves
its promise with the `unsubscribe` handle the callback closes over). Mocks must
defer the callback, e.g. with `queueMicrotask`.

## Releasing

The package is not published to npm. Consumers install it from GitHub by tag:

1. bump `version` in `package.json`
2. commit and tag (`git tag v1.1.0`)
3. push the tag, then update the consuming project's dependency to that tag

## Commit message convention

Commit messages follow [conventional commits](https://www.conventionalcommits.org/en/v1.0.0-beta.4/):

- `fix`: bug fixes, e.g. fix a crash due to deprecated method.
- `feat`: new features, e.g. add hitSlop for Touchable component.
- `refactor`: code refactor, e.g. new folder structure for components.
- `docs`: changes to documentation, e.g. add usage example for the module.
- `test`: adding or updating tests, e.g. add integration tests using detox.
- `chore`: tooling changes, e.g. change CI config.

## Code of conduct

Be kind. Assume good intent.
