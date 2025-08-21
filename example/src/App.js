import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
// src/App.tsx
import { useEffect, useState } from 'react';
import { PebbleEditor } from 'react-pebble-editor';
export default function App() {
    const [code, setCode] = useState(null);
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
    const onEditorChange = (val) => {
        console.log('Changed:', val);
    };
    return (_jsxs("div", { children: [_jsx("h2", { children: "Monaco Pebble Editor" }), _jsx("div", { style: { height: 600, width: 800, border: '1px solid gray' }, children: code && (_jsx(PebbleEditor, { value: code, theme: "light", onChange: onEditorChange })) })] }));
}
