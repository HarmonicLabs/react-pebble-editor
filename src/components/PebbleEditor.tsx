import React, { useEffect, useRef } from 'react';
import * as monaco from 'monaco-editor';
import { loadMonacoLoader } from '../utils/monaco-loader';

declare global {
    interface Window {
      monaco: typeof monaco;
    }
  }

export default function PebbleEditor({ value, theme, onChange }: {
  value: string;
  theme?: string;
  onChange?: (v: string) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let editor: any;
    loadMonacoLoader().then((require) => {
      require(['vs/editor/editor.main'], () => {
        const monaco = window.monaco;
        if (!containerRef.current) return; // Ensure containerRef.current is valid
        editor = monaco.editor.create(containerRef.current, {
          value,
          language: 'pebble',
          theme: theme || 'vs-dark',
        });

        editor.onDidChangeModelContent(() => {
          onChange?.(editor.getValue());
        });
      });
    });

    return () => {
      editor?.dispose();
    };
  }, []);

  return <div ref={containerRef} style={{ height: 400, width: '100%' }} />;
}
