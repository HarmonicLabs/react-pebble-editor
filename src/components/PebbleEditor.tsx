import React, { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { loadMonacoLoader } from '../utils/monaco-loader';

export interface PebbleEditorHandle {
  getValue(): string;
  layout(): void;
}

const PebbleEditor = forwardRef<PebbleEditorHandle, {
  value: string;
  theme?: string;
  onChange?: (v: string) => void;
}>(function PebbleEditor({ value, theme, onChange }, ref) {
  const outerRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<any>(null);

  useImperativeHandle(ref, () => ({
    getValue() {
      return editorRef.current?.getValue() ?? '';
    },
    layout() {
      doLayout();
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

  useEffect(() => {
    const outer = outerRef.current;
    if (!outer) return;

    let editor: any = null;

    const onResize = () => {
      requestAnimationFrame(() => doLayout());
    };

    loadMonacoLoader().then((require) => {
      require(['vs/editor/editor.main'], () => {
        const monaco = window.monaco;
        if (!outer) return;
        editor = monaco.editor.create(outer, {
          value,
          language: 'pebble',
          theme: theme || 'vs-dark',
        });
        editorRef.current = editor;

        editor.onDidChangeModelContent(() => {
          onChange?.(editor.getValue());
        });

        window.addEventListener('resize', onResize);
      });
    });

    return () => {
      window.removeEventListener('resize', onResize);
      editorRef.current?.dispose();
      editorRef.current = null;
    };
  }, [value]);

  return <div ref={outerRef} style={{ height: '100%', width: '100%' }} />;
});

export default PebbleEditor;
