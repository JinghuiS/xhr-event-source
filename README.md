# Xhr Event Source

# Install

```bash
npm install --save xhr-event-source
```

# Usage
```ts
import { xhrEventSource, type XHREventSourceInit } from 'xhr-event-source';

xhrEventSource('/api/sse', {
  onmessage: (msg) => {
    console.log(msg);
  },
});
```