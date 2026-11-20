# react-pebble-editor

A React component for editing [Pebble](https://github.com/HarmonicLabs/pebble) in the browser:
Monaco with Pebble's syntax highlighting and, from 0.6.0, the compiler's answers as you type.

- **diagnostics**: the errors and warnings of `pebble compile`, underlined where they are
- **hover**: the type of a name or an expression
- **go to definition** (Ctrl/Cmd+click, F12), **references** (Shift+F12) and highlights of a name
- **completion**: the names visible where you type, and the fields and methods of a value after `.`

They come from `Compiler.check()` of `@harmoniclabs/pebble` 0.6.0, run in the page; there is no
language server. The compiler is loaded with `import()` the first time an editor needs it.

## Install

```sh
npm install react-pebble-editor @harmoniclabs/pebble
```

`@harmoniclabs/pebble` (>= 0.6.0) is an optional peer dependency: without it, or with
`languageFeatures={false}`, the editor only highlights.

Monaco is loaded as an AMD module from `/vs` (`/vs/loader.js`): copy
`node_modules/@harmoniclabs/monaco-editor/out/monaco-editor/dev/vs` (or `min/vs`) to the `vs`
folder your site serves at its root.

## Use

```tsx
import { useState } from "react";
import { PebbleEditor, PebbleDiagnostic } from "react-pebble-editor";

export function Contract({ source }: { source: string }) {
  const [diagnostics, setDiagnostics] = useState<PebbleDiagnostic[]>([]);
  return (
    <div style={{ height: 400 }}>
      <PebbleEditor
        value={source}
        onChange={(text) => console.log(text)}
        onDiagnostics={setDiagnostics}
      />
    </div>
  );
}
```

| prop | type | |
| --- | --- | --- |
| `value` | `string` | the text the editor starts with (changing it creates the editor again) |
| `onChange` | `(text: string) => void` | every change |
| `theme` | `string` | a Monaco theme; default `pebble-dark` |
| `languageFeatures` | `boolean` | diagnostics, hover, definitions, references, completion; default `true` |
| `mode` | `"file" \| "script"` | `"file"` (default): a Pebble file, as `pebble compile` takes it. `"script"`: top-level statements, as `Compiler.run()` runs them |
| `files` | `Record<string, string>` | the other files of the project, for `import { … } from "./lib.pebble"` |
| `onDiagnostics` | `(d: PebbleDiagnostic[]) => void` | the diagnostics of every check (`severity`, `code`, `message`, `start` and `end` offsets) |
| `readOnly` | `boolean` | |

The ref (`PebbleEditorHandle`) has `getValue()`, `setValue(text)`, `layout()` and `getEditor()`
(the Monaco editor).

### Without React

`attachPebbleModel( monaco, model, options )` gives any Monaco model the same features, and
`analyze( text, { mode, files } )` the answers themselves (`diagnostics`, `hoverAt`,
`definitionAt`, `referencesAt`, `namesAt`, `membersAt`), for other editors.

## Develop

```sh
npm install
npm test        # the answers on real Pebble texts (node --test)
npm run build   # dist/: ES module, UMD and types
```
