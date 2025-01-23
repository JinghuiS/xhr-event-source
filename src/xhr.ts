import {
  EventSourceMessage,
  createEventStreamProcessor,
  getLines,
  getMessages,
} from './parse';

export const EventStreamContentType = 'text/event-stream';

const DefaultRetryInterval = 1000;
const LastEventId = 'last-event-id';

export interface XHREventSourceInit {
  headers?: Record<string, string>;
  onopen?: (response: XMLHttpRequest) => Promise<void>;
  onmessage?: (event: EventSourceMessage) => void;
  onerror?: (error: XMLHttpRequest) => void;
  onclose?: () => void;
  signal?: AbortSignal;
  method?: string;
  body?: any;
  responseType?: XMLHttpRequestResponseType;
  timeout?: number;
}

export function xhrEventSource(
  url: string | URL,
  {
    signal: inputSignal,
    headers: inputHeaders,
    onopen: inputOnOpen,
    onmessage,
    onclose,
    onerror,
    body,
    method = 'GET',
    responseType = 'text',
    timeout = 60000,
  }: XHREventSourceInit,
) {
  return new Promise<void>((resolve, reject) => {
    const headers = { ...inputHeaders };
    if (!headers.accept) {
      headers.accept = EventStreamContentType;
    }
    let curRequestController: AbortController = new AbortController();
    let retryInterval = DefaultRetryInterval;
    let retryTimer = 0;

    function dispose() {
      window.clearTimeout(retryTimer);
      curRequestController.abort();
    }

    inputSignal?.addEventListener('abort', () => {
      dispose();
      resolve();
    });

    const retry = (err: XMLHttpRequest) => {
      if (!curRequestController.signal.aborted) {
        try {
          const interval: any = onerror?.(err) ?? retryInterval;
          window.clearTimeout(retryTimer);
          retryTimer = window.setTimeout(create, interval);
        } catch (innerErr) {
          dispose();
          reject(innerErr);
        }
      }
    };

    async function create() {
      const xhr = new XMLHttpRequest();
      xhr.open(method.toUpperCase(), url, true);
      xhr.timeout = timeout;
      Object.entries(headers).forEach(([key, value]) => {
        xhr.setRequestHeader(key, value);
      });
      xhr.responseType = responseType;

      xhr.onreadystatechange = async () => {
        if (xhr.readyState === XMLHttpRequest.OPENED) {
          await inputOnOpen?.(xhr);
        }
      };

      xhr.onload = async () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          await onclose?.();
          done();
        } else {
          retry(xhr);
        }
      };
      xhr.onerror = () => {
        retry(xhr);
      };

      function onCanceled() {
        xhr.abort();
      }
      function done() {
        curRequestController.signal.removeEventListener('abort', onCanceled);
      }

      curRequestController.signal.addEventListener('abort', onCanceled);

      const processStream = createEventStreamProcessor();
      xhr.onprogress = () => {
        if (onmessage) {
          processStream(
            xhr.responseText,
            getLines(
              getMessages(
                (id) => {
                  if (id) {
                    // store the id and send it back on the next retry:
                    headers[LastEventId] = id;
                  } else {
                    // don't send the last-event-id header anymore:
                    delete headers[LastEventId];
                  }
                },
                (retry) => {
                  retryInterval = retry;
                },
                onmessage,
              ),
            ),
          );
        }
      };

      xhr.send(body);
    }

    create();
  });
}
