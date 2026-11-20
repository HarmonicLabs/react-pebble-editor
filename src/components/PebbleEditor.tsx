import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { loadMonacoLoader } from '../utils/monaco-loader';
import { attachPebbleModel, addGoToDefinitionAction } from '../language/monacoPebble';
import type { PebbleDiagnostic, PebbleEditorMode } from '../language/analyze';

export interface PebbleEditorHandle {
  getValue(): string;
  setValue(value: string): void;
  layout(): void;
  /** the Monaco editor, once created */
  getEditor(): any;
}

export interface PebbleEditorProps {
  value: string;
  theme?: string;
  onChange?: (v: string) => void;
  /**
   * diagnostics, hover, go to definition, references and completion from the Pebble
   * compiler's `check()` (needs `@harmoniclabs/pebble` >= 0.6.0, loaded when first needed).
   * Default `true`.
   */
  languageFeatures?: boolean;
  /**
   * `"file"` (default): a Pebble file, as `pebble compile` takes it.
   * `"script"`: top-level statements, as `Compiler.run()` takes them.
   */
  mode?: PebbleEditorMode;
  /** other files of the project for imports, by path (`{ "lib.pebble": "…" }`) */
  files?: Record<string, string>;
  /** the diagnostics of every check */
  onDiagnostics?: (diagnostics: PebbleDiagnostic[]) => void;
  readOnly?: boolean;
}

const PebbleEditor = forwardRef<PebbleEditorHandle, PebbleEditorProps>(function PebbleEditor(
  { value, theme, onChange, languageFeatures = true, mode = 'file', files, onDiagnostics, readOnly },
  ref
) {
  const outerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);
  // the latest callbacks, without creating the editor again when they change
  const onChangeRef = useRef(onChange);
  const onDiagnosticsRef = useRef(onDiagnostics);
  onChangeRef.current = onChange;
  onDiagnosticsRef.current = onDiagnostics;

  useImperativeHandle(ref, () => ({
    getValue() {
      return editorRef.current?.getValue() ?? '';
    },
    setValue(v: string) {
      editorRef.current?.setValue(v);
    },
    layout() {
      doLayout();
    },
    getEditor() {
      return editorRef.current;
    }
  }));

  function doLayout() {
    const outer = outerRef.current;
    const editor = editorRef.current;
    if (!outer || !editor) return;
    // Read size from the outer div which is sized by CSS, not by Monaco
    const { width, height } = outer.getBoundingClientRect();
    editor.layout({ width, height });
  }

  const filesKey = files ? JSON.stringify(files) : '';

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    let editor: any = null;
    let detach: (() => void) | undefined;
    let cancelled = false;

    const onResize = () => {
      requestAnimationFrame(() => doLayout());
    };

    loadMonacoLoader().then((require) => {
      require(['vs/editor/editor.main'], () => {
        const monaco = window.monaco;
        if (cancelled || !outer) return;

        monaco.editor.defineTheme('pebble-dark', {
          base: 'vs-dark',
          inherit: true,
          rules: [
            { token: 'keyword.pebble',             foreground: '569CD6' },
            { token: 'keyword.control.pebble',     foreground: 'C586C0' },
            { token: 'identifier.pebble',           foreground: '9CDCFE' },
            { token: 'identifier.constant.pebble',  foreground: '4FC1FF' },
            { token: 'type.identifier.pebble',      foreground: '4EC9B0' },
            { token: 'entity.name.function.pebble', foreground: 'DCDCAA' },
            { token: 'number.pebble',               foreground: 'B5CEA8' },
            { token: 'number.float.pebble',         foreground: 'B5CEA8' },
            { token: 'number.hex.pebble',           foreground: 'B5CEA8' },
            { token: 'string.pebble',               foreground: 'CE9178' },
            { token: 'comment.pebble',              foreground: '6A9955' },
            { token: 'comment.doc.pebble',          foreground: '6A9955' },
            { token: 'delimiter.pebble',            foreground: 'D4D4D4' },
            { token: 'delimiter.bracket.pebble',    foreground: 'D4D4D4' },
          ],
          colors: {}
        });

        editor = monaco.editor.create(outer, {
          value,
          language: 'pebble',
          theme: theme || 'pebble-dark',
          readOnly: !!readOnly,
          // hovers and the completion list may be wider than a small editor
          fixedOverflowWidgets: true,
        });
        editorRef.current = editor;

        editor.onDidChangeModelContent(() => {
          onChangeRef.current?.(editor.getValue());
        });

        if (languageFeatures) {
          detach = attachPebbleModel(monaco, editor.getModel(), {
            mode,
            files,
            onDiagnostics: (d) => onDiagnosticsRef.current?.(d),
          });
          addGoToDefinitionAction(monaco, editor);
        }

        window.addEventListener('resize', onResize);
      });
    });

    return () => {
      cancelled = true;
      window.removeEventListener('resize', onResize);
      detach?.();
      editorRef.current?.dispose();
      editorRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, languageFeatures, mode, filesKey, readOnly]);

  return <div ref={outerRef} style={{ height: '100%', width: '100%' }} />;
});

export default PebbleEditor;
