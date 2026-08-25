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

There are two suites, split as vitest projects:

| suite | where | what |
| --- | --- | --- |
| `pnpm test` | `src/__tests__/*.test.{ts,tsx}` | jsdom, `firebase/firestore` mocked. Fast, no Java. |
| `pnpm test:integration` | `src/__tests__/integration/` | the real Firestore emulator |

`pnpm test:all` runs both. `pnpm test` is deliberately kept emulator-free so the
common loop stays fast and needs no JVM.

### Unit tests

The real Firestore never invokes an `onSnapshot` callback synchronously, and
`createListenerAsync` relies on that (it resolves its promise with the
`unsubscribe` handle the callback closes over). Mocks must defer the callback,
e.g. with `queueMicrotask`.

### Integration tests

These run against the Firestore emulator, which is a jar — you need a **JVM**
installed. `pnpm test:integration` wraps vitest in `firebase emulators:exec`, so
it starts and stops the emulator for you. To poke at it by hand:

```sh
pnpm firebase emulators:start --only firestore --project demo-swr-firestore
```

The project id is `demo-swr-firestore`; a `demo-` prefix never resolves to a
real Firebase project, so these tests cannot touch live resources.

Things worth knowing before adding a case here:

- **They run in the `node` environment, not jsdom, for everything that does not
  need React.** The firebase JS SDK has known failures against the emulator
  under jsdom ([firebase-js-sdk#8137](https://github.com/firebase/firebase-js-sdk/issues/8137),
  [#9267](https://github.com/firebase/firebase-js-sdk/issues/9267)). The hook
  tests do opt into jsdom, via a `// @vitest-environment jsdom` docblock, and
  have been stable — but that is the first place to look if they turn flaky.
- **Do not give `SWRConfig` a custom `provider`.** Listeners push updates
  through swr's global `mutate`, so a scoped cache never sees them and the
  realtime assertions hang. Tests isolate themselves with `uniquePath()`
  instead of a scoped cache.
- Files run serially (`fileParallelism: false`) since they share one emulator.

The point of this suite is to catch what a mock cannot: whether the query we
build is actually *accepted* by Firestore. For example, dropping the `orderBy`
constraint while keeping cursors passes every unit test and fails here.

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
