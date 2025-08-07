// src/App.tsx
import { useEffect, useState } from 'react';
import { PebbleEditor } from 'react-pebble-editor';

export default function App() {
  const [code, setCode] = useState<string | null>(null);

  useEffect(() => {
    // Fetch the contents of the example .pebble file to load into the editor
    fetch('/examples/sample.pebble')
      .then((res) => res.text())
      .then((text) => {
        setCode(text);
        console.log('Loaded Pebble file:', text);
      })
      .catch((e) => console.error('Failed to load Pebble file:', e));
  }, []);

  const onEditorChange = (val: string) => {
    console.log('Changed:', val)
  }
  return (
    <div>
      <h2>Monaco Pebble Editor</h2>
      <div style={{ height: 600, width: 800, border: '1px solid gray' }}>
        {code && (
          <PebbleEditor
            value={code}
            theme="light"
            onChange={onEditorChange}
          />
        )}
      </div>
    </div>
  );
}
