# Pebble examples in Monaco Browser Editor

This repo contains demonstrations of pebble language support in Monaco browser editor 

## Steps to Try it out

1. Create the `.pebble` file in `/examples` which you would like to load into Monaco
2. Edit `src/App.tsx`, to fetch your file

```
    // Fetch the contents of the example .pebble file to load into the editor
    fetch('/examples/<your-file-name-here>.pebble')
```