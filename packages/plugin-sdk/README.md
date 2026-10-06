# NovaTerm plugin SDK

Zero-dependency JavaScript module and TypeScript definitions for the API that
NovaTerm injects into panel plugins. Requires the v1 English API host.

```ts
import { getNova } from '@diegolopez02081/novaterm-plugin-sdk';
const nova = getNova();
const text = await nova.terminal.read(100);
```

Bundle imports into a single JavaScript entry file with your bundler before
installing the plugin. The sandbox cannot fetch dependencies or contact the
network. Plain JavaScript plugins can use `globalThis.nova` directly.

Permissions are approved by the user and enforced by the host. The SDK does not
grant permissions. `terminal.write` can execute commands; `ai.complete` spends
the configured provider budget. Neither should run automatically on panel load.

Install from the public npm registry:

```sh
npm install @diegolopez02081/novaterm-plugin-sdk
```

Licensed under MIT, like NovaTerm.
See [plugin examples](https://github.com/DiegoLopez0208/novaterm/tree/master/examples/plugins)
and the [authoring guide](https://github.com/DiegoLopez0208/novaterm/blob/master/docs/PLUGIN-AUTHORING.md).
