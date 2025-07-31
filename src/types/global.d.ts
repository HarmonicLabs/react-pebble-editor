import * as monaco from 'monaco-editor';
import type { Require } from 'requirejs';

declare global {
  interface Window {
    monaco: typeof monaco;
    require: {
      (modules: string[], callback: (...args: any[]) => void): void;
      config: (options: { paths: { [key: string]: string } }) => void;
    };
  }
}